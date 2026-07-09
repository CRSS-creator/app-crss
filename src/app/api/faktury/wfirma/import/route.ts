import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import {
  extractWfirmaInvoiceLines,
  extractWfirmaInvoices,
  findWfirmaInvoices,
  getWfirmaConfig,
  type WfirmaInvoice,
  type WfirmaInvoiceLine,
} from "@/lib/wfirmaClient";

const ALLOWED_ROLES = new Set(["owner", "admin"]);

type ImportPayload = {
  month?: string;
  year?: number;
};

type ClientMatch = {
  id: string;
  nazwa: string | null;
  nip: string | null;
};

type ContractorInfo = {
  name: string;
  nip: string;
  email: string;
};

type ScoredContractorInfo = ContractorInfo & {
  score: number;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do integracji z wFirmą.");
  if (auth.error) return auth.error;

  const wfirma = getWfirmaConfig();
  if (wfirma.error || !wfirma.config) {
    return NextResponse.json({ error: wfirma.error }, { status: 500 });
  }

  let payload: ImportPayload = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const range = importRange(payload);
  if (!range) return NextResponse.json({ error: "Nieprawidłowy miesiąc importu." }, { status: 400 });

  const clients = await loadClientMatches(auth.admin);
  const imported: string[] = [];
  const failed: { wfirmaId: string | null; error: string }[] = [];
  let page = 1;
  const limit = 25;
  const startedAt = Date.now();

  try {
    while (page <= 20) {
      if (Date.now() - startedAt > 20000) break;
      const response = await findWfirmaInvoices({
        config: wfirma.config,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        page,
        limit,
      });
      const invoices = extractWfirmaInvoices(response);
      if (invoices.length === 0) break;

      for (const invoice of invoices) {
        if (Date.now() - startedAt > 20000) break;
        try {
          if (!isInvoiceDateInRange(invoice, range.dateFrom, range.dateTo)) continue;
          const savedId = await saveImportedInvoice(auth.admin, invoice, clients);
          if (savedId) imported.push(savedId);
        } catch (error) {
          failed.push({
            wfirmaId: stringify(invoice.id),
            error: error instanceof Error ? error.message : "Nieznany błąd importu.",
          });
        }
      }

      if (invoices.length < limit) break;
      page += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się pobrać faktur z wFirmy.";
    if (message.includes("TOTAL REQUESTS LIMIT EXCEEDED")) {
      return NextResponse.json(
        {
          error:
            "wFirma odrzuciła import, bo został przekroczony limit zapytań API. Poczekaj na odnowienie limitu po stronie wFirmy i uruchom import ponownie.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }

  return NextResponse.json({
    imported: imported.length,
    failed,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
  });
}

function importRange(payload: ImportPayload) {
  const month = stringify(payload.month);
  if (/^\d{4}-\d{2}$/.test(month)) {
    const dateFrom = `${month}-01`;
    const nextMonth = new Date(`${dateFrom}T00:00:00.000Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const dateTo = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { dateFrom, dateTo };
  }

  const year = Number(payload.year || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}

async function loadClientMatches(admin: SupabaseClient) {
  const { data, error } = await admin.from("klienci").select("id,nazwa,nip").not("nip", "is", null);
  if (error) throw new Error("Nie udało się pobrać klientów do dopasowania po NIP.");
  return (data || []) as ClientMatch[];
}

async function saveImportedInvoice(
  admin: SupabaseClient,
  invoice: WfirmaInvoice,
  clients: ClientMatch[]
) {
  const wfirmaId = stringify(invoice.id);
  if (!wfirmaId) return null;

  const contractorInfo = resolveContractorInfo(invoice, clients);
  const contractorNip = contractorInfo.nip;
  const client = clients.find((item) => normalizeNip(item.nip) === normalizeNip(contractorNip));
  const paymentState = stringify(invoice.paymentstate);
  const gross = numberValue(invoice.total_composed ?? invoice.total);
  const net = numberValue(invoice.netto);
  const tax = numberValue(invoice.tax);

  const payload = {
    klient_id: client?.id || null,
    numer: stringify(invoice.fullnumber || invoice.number),
    typ: invoice.type === "correction" ? "korekta" : "sprzedaz",
    status: paymentState === "paid" ? "oplacona" : "wystawiona",
    kategoria: "standardowa",
    zrodlo: "wfirma",
    data_wystawienia: dateOnly(invoice.date),
    data_sprzedazy: dateOnly(invoice.disposaldate || invoice.date),
    termin_platnosci: dateOnly(invoice.payment_date),
    kontrahent_nazwa: contractorInfo.name || stringify(client?.nazwa) || "Kontrahent wFirma",
    kontrahent_nip: contractorNip || null,
    kontrahent_email: contractorInfo.email || null,
    waluta: stringify(invoice.currency) || "PLN",
    kwota_netto: net,
    kwota_vat: tax,
    kwota_brutto: gross || net + tax,
    opis: stringify(invoice.description) || null,
    wfirma_id: wfirmaId,
    wfirma_url: invoice.hash ? `https://wfirma.pl/faktury/podglad/${invoice.hash}` : null,
    wfirma_synced_at: new Date().toISOString(),
    wfirma_sync_status: "zaimportowano",
    wfirma_sync_error: null,
  };

  const { data: existing } = await admin
    .from("faktury")
    .select("id")
    .eq("wfirma_id", wfirmaId)
    .maybeSingle();

  const result = existing?.id
    ? await admin.from("faktury").update(payload).eq("id", existing.id).select("id").single()
    : await admin.from("faktury").insert(payload).select("id").single();

  if (result.error || !result.data?.id) {
    throw new Error(result.error?.message || "Nie udało się zapisać faktury z wFirmy.");
  }

  await replaceInvoiceLines(admin, result.data.id, extractWfirmaInvoiceLines(invoice));
  return result.data.id as string;
}

function resolveContractorInfo(invoice: WfirmaInvoice, clients: ClientMatch[]): ContractorInfo {
  const candidates = contractorCandidates(invoice);
  const matchingClient = candidates.find((candidate) =>
    clients.some((client) => normalizeNip(client.nip) === normalizeNip(candidate.nip))
  );
  const best = matchingClient || candidates[0] || { name: "", nip: "", email: "" };
  return best;
}

function contractorCandidates(value: unknown, path: string[] = []): ContractorInfo[] {
  return scoredContractorCandidates(value, path).map(({ score: _score, ...candidate }) => candidate);
}

function scoredContractorCandidates(value: unknown, path: string[] = []): ScoredContractorInfo[] {
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const ownCandidate = contractorFromRecord(record);
  const nested = Object.entries(record).flatMap(([key, child]) => scoredContractorCandidates(child, [...path, key]));
  if (!ownCandidate) return nested;

  const pathScore = path.some((key) => /contract|kontr|buyer|recipient|client/i.test(key)) ? 2 : 0;
  const dataScore = (ownCandidate.nip ? 2 : 0) + (ownCandidate.name ? 1 : 0) + (ownCandidate.email ? 1 : 0);
  return [{ ...ownCandidate, score: pathScore + dataScore }, ...nested].sort(
    (first, second) => second.score - first.score
  );
}

function contractorFromRecord(record: Record<string, unknown>) {
  const name = firstText(record, [
    "name",
    "company_name",
    "contractor_name",
    "contractor_company_name",
    "buyer_name",
    "recipient_name",
    "full_name",
  ]);
  const nip = firstText(record, [
    "nip",
    "tax_id",
    "contractor_nip",
    "contractor_tax_id",
    "tax_number",
    "vat_id",
    "vat_number",
  ]);
  const email = firstText(record, ["email", "contractor_email", "buyer_email", "recipient_email"]);
  if (!name && !nip && !email) return null;
  return { name, nip, email, score: 0 };
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringify(record[key]);
    if (value) return value;
  }
  return "";
}

async function replaceInvoiceLines(
  admin: SupabaseClient,
  invoiceId: string,
  lines: WfirmaInvoiceLine[]
) {
  await admin.from("faktury_pozycje").delete().eq("faktura_id", invoiceId);
  if (lines.length === 0) return;

  const records = lines.map((line, index) => {
    const net = numberValue(line.netto ?? line.price);
    const tax = numberValue(line.tax);
    const gross = numberValue(line.total) || net + tax;
    return {
      faktura_id: invoiceId,
      source_key: `wfirma:${stringify(line.id) || index + 1}`,
      nazwa: stringify(line.name) || "Pozycja faktury",
      ilosc: numberValue(line.count) || 1,
      jednostka: stringify(line.unit) || "szt.",
      cena_netto: numberValue(line.price) || net,
      stawka_vat: stringify(line.vat) || "23%",
      kwota_netto: net,
      kwota_vat: tax,
      kwota_brutto: gross,
      sort_order: index,
    };
  });

  const { error } = await admin.from("faktury_pozycje").insert(records);
  if (error) throw new Error("Nie udało się zapisać pozycji faktury z wFirmy.");
}

function normalizeNip(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function dateOnly(value: unknown) {
  const text = stringify(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function isInvoiceDateInRange(invoice: WfirmaInvoice, dateFrom: string, dateTo: string) {
  const invoiceDate = dateOnly(invoice.date);
  return Boolean(invoiceDate && invoiceDate >= dateFrom && invoiceDate <= dateTo);
}

function numberValue(value: unknown) {
  const parsed = Number(stringify(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}
