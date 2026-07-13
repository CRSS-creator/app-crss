import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { addWfirmaInvoice, downloadWfirmaInvoicePdf, firstWfirmaInvoice, getWfirmaConfig } from "@/lib/wfirmaClient";

const ALLOWED_ROLES = new Set(["owner", "admin"]);
const INVOICE_PDF_BUCKET = "faktury-pdf";

type SendPayload = {
  invoiceIds?: string[];
};

type InvoiceRow = {
  id: string;
  numer: string | null;
  data_wystawienia: string | null;
  data_sprzedazy: string | null;
  termin_platnosci: string | null;
  kontrahent_nazwa: string;
  kontrahent_nip: string | null;
  kontrahent_email: string | null;
  waluta: string | null;
  opis: string | null;
  wfirma_sync_status: string;
  faktury_pozycje?: InvoiceLineRow[] | null;
};

type InvoiceLineRow = {
  nazwa: string;
  ilosc: number | string | null;
  jednostka: string | null;
  cena_netto: number | string | null;
  stawka_vat: string | null;
  sort_order: number | null;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do integracji z wFirmą.");
  if (auth.error) return auth.error;

  const wfirma = getWfirmaConfig();
  if (wfirma.error || !wfirma.config) {
    return NextResponse.json({ error: wfirma.error }, { status: 500 });
  }

  let payload: SendPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki do wFirmy." }, { status: 400 });
  }

  const invoiceIds = Array.isArray(payload.invoiceIds) ? payload.invoiceIds.filter(Boolean) : [];
  if (invoiceIds.length === 0) {
    return NextResponse.json({ error: "Wybierz co najmniej jedną fakturę." }, { status: 400 });
  }

  const { data: invoices, error } = await auth.admin
    .from("faktury")
    .select(`
      id,
      numer,
      data_wystawienia,
      data_sprzedazy,
      termin_platnosci,
      kontrahent_nazwa,
      kontrahent_nip,
      kontrahent_email,
      waluta,
      opis,
      wfirma_sync_status,
      faktury_pozycje (
        nazwa,
        ilosc,
        jednostka,
        cena_netto,
        stawka_vat,
        sort_order
      )
    `)
    .in("id", invoiceIds)
    .in("wfirma_sync_status", ["nie_wyslano", "w_kolejce", "blad"]);

  if (error) {
    return NextResponse.json({ error: "Nie udało się pobrać faktur do wysyłki." }, { status: 500 });
  }

  const sent: string[] = [];
  const failed: { invoiceId: string; error: string }[] = [];

  for (const invoice of (invoices || []) as InvoiceRow[]) {
    try {
      const validationErrors = validateWfirmaInvoice(invoice);
      if (validationErrors.length > 0) throw new Error(`Brakuje danych do wFirmy: ${validationErrors.join(", ")}.`);

      const issueDate = invoice.data_wystawienia || new Date().toISOString().slice(0, 10);
      const defaultPaymentDate = addDays(issueDate, 7);
      const response = await addWfirmaInvoice(wfirma.config, buildWfirmaInvoicePayload(invoice, issueDate, defaultPaymentDate));
      const wfirmaInvoice = firstWfirmaInvoice(response);
      const wfirmaIssueDate = dateOnly(wfirmaInvoice?.date) || issueDate;
      const paymentDate = addDays(wfirmaIssueDate, 7);
      const wfirmaId = stringify(wfirmaInvoice?.id);
      const wfirmaNumber = stringify(wfirmaInvoice?.fullnumber || wfirmaInvoice?.number) || invoice.numer;
      const pdfResult = wfirmaId
        ? await saveWfirmaInvoicePdf({
            admin: auth.admin,
            invoiceId: invoice.id,
            invoiceNumber: wfirmaNumber,
            wfirmaId,
            config: wfirma.config,
          })
        : null;
      const pdfError = pdfResult?.error
        ? `Faktura wysłana, ale nie udało się pobrać PDF z wFirmy: ${pdfResult.error}`
        : null;

      await auth.admin
        .from("faktury")
        .update({
          numer: wfirmaNumber,
          status: "wystawiona",
          zrodlo: "wfirma",
          data_wystawienia: wfirmaIssueDate,
          data_sprzedazy: dateOnly(wfirmaInvoice?.disposaldate) || invoice.data_sprzedazy || wfirmaIssueDate,
          termin_platnosci: paymentDate,
          wfirma_id: wfirmaId || null,
          wfirma_url: wfirmaInvoice?.hash ? `https://wfirma.pl/faktury/podglad/${wfirmaInvoice.hash}` : null,
          wfirma_pdf_path: pdfResult?.path || null,
          wfirma_pdf_name: pdfResult?.name || null,
          wfirma_pdf_synced_at: pdfResult?.path ? new Date().toISOString() : null,
          wfirma_synced_at: new Date().toISOString(),
          wfirma_sync_status: "wyslano",
          wfirma_sync_error: pdfError,
        })
        .eq("id", invoice.id);
      sent.push(invoice.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany błąd wysyłki.";
      await auth.admin
        .from("faktury")
        .update({
          wfirma_sync_status: "blad",
          wfirma_sync_error: message,
        })
        .eq("id", invoice.id);
      failed.push({ invoiceId: invoice.id, error: message });
    }
  }

  return NextResponse.json({ sent: sent.length, failed });
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
    return { path: null, name: null, error: error instanceof Error ? error.message : "Nieznany błąd pobierania PDF." };
  }
}

function validateWfirmaInvoice(invoice: InvoiceRow) {
  const errors: string[] = [];
  const lines = invoice.faktury_pozycje || [];

  if (!invoice.kontrahent_nazwa?.trim()) errors.push("nazwa kontrahenta");
  if (!invoice.kontrahent_nip?.trim()) errors.push("NIP kontrahenta");
  if (lines.length === 0) errors.push("pozycje faktury");

  lines.forEach((line, index) => {
    const label = `pozycja ${index + 1}`;
    if (!line.nazwa?.trim()) errors.push(`${label}: nazwa`);
    if (!line.jednostka?.trim()) errors.push(`${label}: jednostka`);
    if (!Number.isFinite(parseNumber(line.ilosc)) || parseNumber(line.ilosc) <= 0) errors.push(`${label}: ilość`);
    if (!Number.isFinite(parseNumber(line.cena_netto)) || parseNumber(line.cena_netto) <= 0) errors.push(`${label}: cena netto`);
    if (!normalizeVat(line.stawka_vat)) errors.push(`${label}: VAT`);
  });

  return errors;
}

function buildWfirmaInvoicePayload(invoice: InvoiceRow, issueDate: string, defaultPaymentDate: string) {
  const lines = [...(invoice.faktury_pozycje || [])].sort(
    (first, second) => Number(first.sort_order || 0) - Number(second.sort_order || 0)
  );
  const invoicecontent = Object.fromEntries(
    lines.map((line, index) => [
      String(index),
      {
        name: line.nazwa,
        count: decimal(line.ilosc || 1, 4),
        unit_count: decimal(line.ilosc || 1, 4),
        price: decimal(line.cena_netto || 0, 2),
        unit: line.jednostka || "szt.",
        vat: normalizeVat(line.stawka_vat),
      },
    ])
  );

  return {
    contractor: {
      name: invoice.kontrahent_nazwa,
      nip: invoice.kontrahent_nip || undefined,
      email: invoice.kontrahent_email || undefined,
    },
    type: "normal",
    date: issueDate,
    disposaldate: invoice.data_sprzedazy || issueDate,
    payment_date: defaultPaymentDate,
    paymentmethod: "transfer",
    paymentstate: "unpaid",
    currency: invoice.waluta || "PLN",
    price_type: "netto",
    description: invoice.opis || undefined,
    invoicecontents: {
      invoicecontent,
    },
  };
}

function normalizeVat(value: string | null) {
  const match = value?.match(/\d+/);
  return match?.[0] || "23";
}

function decimal(value: number | string, precision: number) {
  const parsed = parseNumber(value);
  return (Number.isFinite(parsed) ? parsed : 0).toFixed(precision);
}

function parseNumber(value: number | string | null | undefined) {
  return Number(String(value ?? "").replace(",", "."));
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function dateOnly(value: unknown) {
  const text = stringify(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
