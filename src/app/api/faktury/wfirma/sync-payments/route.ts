import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import {
  downloadWfirmaInvoicePdf,
  extractWfirmaInvoices,
  findWfirmaInvoices,
  firstWfirmaInvoice,
  getWfirmaInvoice,
  getWfirmaConfig,
  type WfirmaInvoice,
} from "@/lib/wfirmaClient";

const ALLOWED_ROLES = new Set(["owner", "admin"]);
const INVOICE_PDF_BUCKET = "faktury-pdf";
const STATUSES_TO_CHECK = ["wystawiona", "wyslana", "przeterminowana"];
const MAX_INVOICES_PER_RUN = 80;
const PAID_VALUES = new Set([
  "1",
  "true",
  "yes",
  "paid",
  "paid_full",
  "fully_paid",
  "settled",
  "closed",
  "oplacona",
  "opłacona",
  "oplacono",
  "opłacono",
  "zaplacona",
  "zapłacona",
  "zaplacono",
  "zapłacono",
]);
const UNPAID_VALUES = new Set([
  "0",
  "false",
  "no",
  "unpaid",
  "not_paid",
  "unsettled",
  "open",
  "nieoplacona",
  "nieopłacona",
  "nieoplacono",
  "nieopłacono",
  "niezaplacona",
  "niezapłacona",
  "niezaplacono",
  "niezapłacono",
]);

type InvoiceRow = {
  id: string;
  numer: string | null;
  data_wystawienia: string | null;
  okres: string | null;
  kontrahent_nip: string | null;
  kwota_brutto: number | string | null;
  wfirma_id: string | null;
  wfirma_pdf_path: string | null;
  wfirma_pdf_name: string | null;
  status: string;
};

type PaidInvoice = {
  invoiceId: string;
  number: string | null;
  wfirmaId: string;
};

type FailedInvoice = PaidInvoice & {
  error: string;
};

type SyncPayload = {
  month?: string;
};

export async function GET(request: NextRequest) {
  return syncPayments(request);
}

export async function POST(request: NextRequest) {
  return syncPayments(request);
}

async function syncPayments(request: NextRequest) {
  const authError = await authorizeSync(request);
  if (authError) return authError;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const wfirma = getWfirmaConfig();
  if (wfirma.error || !wfirma.config) {
    return NextResponse.json({ error: wfirma.error }, { status: 500 });
  }

  const requestedMonth = await syncMonth(request);
  const requestedRange = requestedMonth ? monthRange(requestedMonth) : null;
  let query = admin
    .from("faktury")
    .select("id,numer,data_wystawienia,okres,kontrahent_nip,kwota_brutto,wfirma_id,wfirma_pdf_path,wfirma_pdf_name,status")
    .in("status", STATUSES_TO_CHECK)
    .not("wfirma_id", "is", null)
    .order("termin_platnosci", { ascending: true });

  if (requestedRange) {
    query = query.or(
      `and(data_wystawienia.gte.${requestedRange.dateFrom},data_wystawienia.lte.${requestedRange.dateTo}),and(okres.gte.${requestedRange.dateFrom},okres.lte.${requestedRange.dateTo})`
    );
  }

  const { data, error } = await query.limit(MAX_INVOICES_PER_RUN);

  if (error) {
    return NextResponse.json({ error: "Nie udało się pobrać faktur do sprawdzenia." }, { status: 500 });
  }

  const invoices = ((data || []) as InvoiceRow[]).filter((invoice) => stringify(invoice.wfirma_id));
  const wfirmaInvoicesById = await loadWfirmaInvoicesById(wfirma.config, invoices, requestedMonth);
  const paid: PaidInvoice[] = [];
  const failed: FailedInvoice[] = [];
  const refreshed: { invoiceId: string; number: string | null; pdf: boolean }[] = [];

  for (const invoice of invoices) {
    const wfirmaId = stringify(invoice.wfirma_id);
    const baseResult = { invoiceId: invoice.id, number: invoice.numer, wfirmaId };

    try {
      const wfirmaInvoice = wfirmaInvoicesById.get(wfirmaId);
      if (!wfirmaInvoice) throw new Error("wFirma nie zwróciła danych tej faktury.");

      const syncResult = await syncWfirmaInvoiceSnapshot(admin, wfirma.config, invoice, wfirmaInvoice);
      if (syncResult.updatedNumber || syncResult.savedPdf) {
        refreshed.push({ invoiceId: invoice.id, number: syncResult.invoiceNumber, pdf: syncResult.savedPdf });
      }

      if (!isPaidInvoice(wfirmaInvoice)) continue;

      const update = await admin
        .from("faktury")
        .update({
          status: "oplacona",
          wfirma_synced_at: new Date().toISOString(),
          wfirma_sync_error: null,
        })
        .eq("id", invoice.id)
        .neq("status", "anulowana")
        .select("id")
        .single();

      if (update.error || !update.data?.id) {
        throw new Error(update.error?.message || "Nie udało się zapisać statusu opłaconej faktury.");
      }

      paid.push(baseResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany błąd sprawdzania płatności.";
      failed.push({ ...baseResult, error: message });
      await admin
        .from("faktury")
        .update({
          wfirma_sync_error: `Błąd sprawdzania płatności w wFirmie: ${message}`,
        })
        .eq("id", invoice.id);
    }
  }

  return NextResponse.json({
    checked: invoices.length,
    markedPaid: paid.length,
    refreshed,
    paid,
    failed,
  });
}

async function loadWfirmaInvoicesById(
  config: Parameters<typeof findWfirmaInvoices>[0]["config"],
  invoices: InvoiceRow[],
  requestedMonth: string | null
) {
  const months = syncSearchMonths(invoices, requestedMonth);
  const invoicesById = new Map<string, WfirmaInvoice>();

  for (const month of months) {
    const range = monthRange(month);
    let page = 1;
    const limit = 100;

    while (page <= 20) {
      const response = await findWfirmaInvoices({
        config,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        page,
        limit,
      });
      const wfirmaInvoices = extractWfirmaInvoices(response);
      for (const invoice of wfirmaInvoices) {
        if (isCorrectionInvoice(invoice)) continue;
        const id = stringify(invoice.id);
        if (id) invoicesById.set(id, invoice);
      }
      if (wfirmaInvoices.length < limit) break;
      page += 1;
    }
  }

  for (const invoice of invoices) {
    const wfirmaId = stringify(invoice.wfirma_id);
    const currentMatch = invoicesById.get(wfirmaId);
    if (currentMatch && !isDraftInvoiceNumber(currentMatch)) continue;

    const replacement = findMatchingFinalWfirmaInvoice(invoice, Array.from(invoicesById.values()));
    if (replacement) invoicesById.set(wfirmaId, replacement);
  }

  const missingIds = invoices
    .map((invoice) => stringify(invoice.wfirma_id))
    .filter((wfirmaId) => wfirmaId && !invoicesById.has(wfirmaId));

  for (const wfirmaId of missingIds) {
    try {
      const response = await getWfirmaInvoice(config, wfirmaId);
      const invoice = firstWfirmaInvoice(response);
      const id = stringify(invoice?.id || wfirmaId);
      if (invoice && id) invoicesById.set(id, invoice);
    } catch {
      // The caller reports missing invoices in the regular failed list.
    }
  }

  return invoicesById;
}

function syncSearchMonths(invoices: InvoiceRow[], requestedMonth: string | null) {
  const months = new Set<string>();
  if (requestedMonth) {
    addMonthWithNeighbours(months, requestedMonth);
  }

  for (const invoice of invoices) {
    const issueMonth = dateOnly(invoice.data_wystawienia)?.slice(0, 7);
    const periodMonth = dateOnly(invoice.okres)?.slice(0, 7);
    if (issueMonth) addMonthWithNeighbours(months, issueMonth);
    if (periodMonth) addMonthWithNeighbours(months, periodMonth);
  }

  return [...months].filter(isValidMonth).slice(0, requestedMonth ? 6 : 8);
}

function addMonthWithNeighbours(months: Set<string>, month: string) {
  months.add(month);
  months.add(shiftMonth(month, -1));
  months.add(shiftMonth(month, 1));
}

function findMatchingFinalWfirmaInvoice(invoice: InvoiceRow, candidates: WfirmaInvoice[]) {
  const invoiceNip = normalizeNip(invoice.kontrahent_nip);
  const invoiceGross = numberValue(invoice.kwota_brutto);
  if (!invoiceNip || invoiceGross <= 0) return null;

  const matches = candidates.filter((candidate) => {
    const candidateNip = normalizeNip(wfirmaInvoiceContractorNip(candidate));
    const candidateGross = numberValue(candidate.total_composed ?? candidate.total);
    return candidateNip === invoiceNip && Math.abs(candidateGross - invoiceGross) < 0.02;
  });

  return matches.find((candidate) => !isDraftInvoiceNumber(candidate)) || matches[0] || null;
}

function isDraftInvoiceNumber(invoice: WfirmaInvoice) {
  const number = stringify(invoice.fullnumber || invoice.number).toUpperCase();
  return number.startsWith("WRF");
}

function isCorrectionInvoice(invoice: WfirmaInvoice) {
  const type = normalizeText(invoice.type);
  const number = stringify(invoice.fullnumber || invoice.number).toUpperCase();
  return type.includes("correction") || type.includes("korekt") || number.startsWith("FK");
}

function wfirmaInvoiceContractorNip(invoice: WfirmaInvoice) {
  const direct = stringify(invoice.contractor_nip || invoice.contractor_tax_id || invoice.contractor?.nip || invoice.contractor?.tax_id);
  if (direct) return direct;
  return firstNestedValue(invoice, /(^|_)(nip|tax_id)$/i);
}

function firstNestedValue(value: unknown, keyPattern: RegExp): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNestedValue(item, keyPattern);
      if (found) return found;
    }
    return "";
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keyPattern.test(key)) {
      const text = stringify(child);
      if (text) return text;
    }
    const nested = firstNestedValue(child, keyPattern);
    if (nested) return nested;
  }

  return "";
}

async function authorizeSync(request: NextRequest) {
  const secretResult = validateSyncSecret(request);
  if (secretResult === true) return null;
  if (secretResult) return secretResult;

  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do sprawdzania płatności w wFirmie.");
  return auth.error;
}

async function syncWfirmaInvoiceSnapshot(
  admin: SupabaseClient,
  config: Parameters<typeof findWfirmaInvoices>[0]["config"],
  invoice: InvoiceRow,
  wfirmaInvoice: WfirmaInvoice
) {
  const wfirmaId = stringify(invoice.wfirma_id);
  const nextWfirmaId = stringify(wfirmaInvoice.id) || wfirmaId;
  const invoiceNumber = stringify(wfirmaInvoice.fullnumber || wfirmaInvoice.number) || invoice.numer;
  const issueDate = dateOnly(wfirmaInvoice.date);
  const saleDate = dateOnly(wfirmaInvoice.disposaldate);
  const paymentDate = dateOnly(wfirmaInvoice.payment_date);
  const updatedNumber = Boolean(invoiceNumber && invoiceNumber !== invoice.numer);
  let pdfResult: { path: string | null; name: string | null; error: string | null } | null = null;

  if (nextWfirmaId && shouldRefreshPdf(invoice, invoiceNumber)) {
    pdfResult = await saveWfirmaInvoicePdf({
      admin,
      invoiceId: invoice.id,
      invoiceNumber,
      wfirmaId: nextWfirmaId,
      config,
    });
  }

  const updatePayload: Record<string, unknown> = {
    wfirma_synced_at: new Date().toISOString(),
  };

  if (updatedNumber) updatePayload.numer = invoiceNumber;
  if (nextWfirmaId && nextWfirmaId !== wfirmaId) updatePayload.wfirma_id = nextWfirmaId;
  if (wfirmaInvoice.hash) updatePayload.wfirma_url = `https://wfirma.pl/faktury/podglad/${wfirmaInvoice.hash}`;
  if (issueDate) updatePayload.data_wystawienia = issueDate;
  if (saleDate) updatePayload.data_sprzedazy = saleDate;
  if (paymentDate) updatePayload.termin_platnosci = paymentDate;

  if (pdfResult?.path) {
    updatePayload.wfirma_pdf_path = pdfResult.path;
    updatePayload.wfirma_pdf_name = pdfResult.name;
    updatePayload.wfirma_pdf_synced_at = new Date().toISOString();
    updatePayload.wfirma_sync_error = null;
  } else if (pdfResult?.error) {
    updatePayload.wfirma_sync_error = `Faktura odĹ›wieĹĽona, ale nie udaĹ‚o siÄ™ pobraÄ‡ PDF z wFirmy: ${pdfResult.error}`;
  }

  const update = await admin
    .from("faktury")
    .update(updatePayload)
    .eq("id", invoice.id);

  if (update.error) {
    throw new Error(`Nie udaĹ‚o siÄ™ zapisaÄ‡ danych faktury z wFirmy: ${update.error.message}`);
  }

  return {
    invoiceNumber,
    updatedNumber,
    savedPdf: Boolean(pdfResult?.path),
  };
}

function shouldRefreshPdf(invoice: InvoiceRow, invoiceNumber: string | null) {
  if (!invoiceNumber) return !invoice.wfirma_pdf_path;
  const expectedName = buildInvoicePdfName(invoiceNumber, stringify(invoice.wfirma_id));
  return !invoice.wfirma_pdf_path || invoice.wfirma_pdf_name !== expectedName;
}

async function saveWfirmaInvoicePdf(params: {
  admin: SupabaseClient;
  invoiceId: string;
  invoiceNumber: string | null;
  wfirmaId: string;
  config: Parameters<typeof downloadWfirmaInvoicePdf>[0];
}) {
  try {
    const pdf = await downloadWfirmaInvoicePdf(params.config, params.wfirmaId);
    const name = buildInvoicePdfName(params.invoiceNumber, params.wfirmaId);
    const path = `${params.invoiceId}/${Date.now()}-${name}`;
    const upload = await params.admin.storage.from(INVOICE_PDF_BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (upload.error) throw upload.error;
    return { path, name, error: null as string | null };
  } catch (error) {
    return { path: null, name: null, error: error instanceof Error ? error.message : "Nieznany bĹ‚Ä…d pobierania PDF." };
  }
}

async function syncMonth(request: NextRequest) {
  const queryMonth = request.nextUrl.searchParams.get("month")?.trim();
  if (isValidMonth(queryMonth)) return queryMonth || null;

  try {
    const payload = (await request.json()) as SyncPayload;
    const bodyMonth = stringify(payload.month);
    return isValidMonth(bodyMonth) ? bodyMonth : null;
  } catch {
    return null;
  }
}

function isValidMonth(value: string | null | undefined) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
}

function validateSyncSecret(request: NextRequest) {
  const expected = process.env.WFIRMA_PAYMENT_SYNC_SECRET?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  const provided = headerSecret || querySecret;

  if (!provided) return null;

  if (!expected) {
    return NextResponse.json({ error: "Brak WFIRMA_PAYMENT_SYNC_SECRET w konfiguracji aplikacji." }, { status: 500 });
  }

  if (provided !== expected) {
    return NextResponse.json({ error: "Brak dostępu do nocnego sprawdzania płatności." }, { status: 401 });
  }

  return true;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isPaidInvoice(invoice: WfirmaInvoice) {
  const record = invoice as Record<string, unknown>;
  const values = [
    invoice.paymentstate,
    record.payment_state,
    record.paymentStatus,
    record.payment_status,
    record.paid,
    record.status,
    record.state,
    ...collectPaymentValues(invoice),
  ].map(normalizeText);

  if (values.some((value) => PAID_VALUES.has(value))) return true;
  if (values.some((value) => UNPAID_VALUES.has(value))) return false;

  return false;
}

function collectPaymentValues(value: unknown, path: string[] = []): unknown[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPaymentValues(item, [...path, String(index)]));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const currentPath = [...path, key];
    const normalizedPath = normalizeText(currentPath.join("_"));
    const direct = /payment|paid|platnosc|płatność|oplac|opłac|zaplac|zapłac|settle/.test(normalizedPath)
      ? [child]
      : [];
    return [...direct, ...collectPaymentValues(child, currentPath)];
  });
}

function normalizeText(value: unknown) {
  return stringify(value).toLowerCase();
}

function normalizeNip(value: unknown) {
  return stringify(value).replace(/\D/g, "");
}

function numberValue(value: unknown) {
  const parsed = Number(stringify(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: unknown) {
  const text = stringify(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function monthRange(month: string) {
  const dateFrom = `${month}-01`;
  const nextMonth = new Date(`${dateFrom}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const dateTo = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function buildInvoicePdfName(invoiceNumber: string | null, wfirmaId: string) {
  const base = sanitizeFileNamePart(invoiceNumber || `wfirma-${wfirmaId}`);
  return `${base || "faktura"}.pdf`;
}

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
