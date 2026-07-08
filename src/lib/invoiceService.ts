import { supabase } from "@/lib/supabaseClient";

export type InvoiceStatus = "szkic" | "wystawiona" | "wyslana" | "oplacona" | "anulowana";
export type InvoiceSource = "aplikacja" | "wfirma" | "import";
export type InvoiceSyncStatus = "nie_wyslano" | "w_kolejce" | "wyslano" | "blad" | "zaimportowano";
export type InvoiceType = "sprzedaz" | "korekta" | "proforma";

export type Invoice = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string | null;
  numer: string | null;
  typ: InvoiceType;
  status: InvoiceStatus;
  zrodlo: InvoiceSource;
  data_wystawienia: string | null;
  data_sprzedazy: string | null;
  termin_platnosci: string | null;
  kontrahent_nazwa: string;
  kontrahent_nip: string | null;
  kontrahent_email: string | null;
  waluta: string;
  kwota_netto: number;
  kwota_vat: number;
  kwota_brutto: number;
  opis: string | null;
  wfirma_id: string | null;
  wfirma_url: string | null;
  wfirma_synced_at: string | null;
  wfirma_sync_status: InvoiceSyncStatus;
  wfirma_sync_error: string | null;
  klienci?: {
    nazwa: string | null;
    nip: string | null;
    email: string | null;
  } | null;
};

export type InvoicePayload = {
  klient_id?: string | null;
  numer?: string | null;
  typ?: InvoiceType;
  status?: InvoiceStatus;
  zrodlo?: InvoiceSource;
  data_wystawienia?: string | null;
  data_sprzedazy?: string | null;
  termin_platnosci?: string | null;
  kontrahent_nazwa: string;
  kontrahent_nip?: string | null;
  kontrahent_email?: string | null;
  waluta?: string;
  kwota_netto?: number;
  kwota_vat?: number;
  kwota_brutto?: number;
  opis?: string | null;
  wfirma_id?: string | null;
  wfirma_url?: string | null;
  wfirma_sync_status?: InvoiceSyncStatus;
  wfirma_sync_error?: string | null;
};

const INVOICE_SELECT = `
  *,
  klienci (
    nazwa,
    nip,
    email
  )
`;

export async function fetchInvoices() {
  return supabase
    .from("faktury")
    .select(INVOICE_SELECT)
    .order("data_wystawienia", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
}

export async function createInvoice(payload: InvoicePayload) {
  return supabase
    .from("faktury")
    .insert(normalizeInvoicePayload(payload))
    .select(INVOICE_SELECT)
    .single<Invoice>();
}

export async function updateInvoice(invoiceId: string, payload: Partial<InvoicePayload>) {
  return supabase
    .from("faktury")
    .update(normalizeInvoicePayload(payload))
    .eq("id", invoiceId)
    .select(INVOICE_SELECT)
    .single<Invoice>();
}

function normalizeInvoicePayload<T extends Partial<InvoicePayload>>(payload: T) {
  return {
    ...payload,
    numer: emptyToNull(payload.numer),
    kontrahent_nip: emptyToNull(payload.kontrahent_nip),
    kontrahent_email: emptyToNull(payload.kontrahent_email),
    opis: emptyToNull(payload.opis),
    wfirma_id: emptyToNull(payload.wfirma_id),
    wfirma_url: emptyToNull(payload.wfirma_url),
    wfirma_sync_error: emptyToNull(payload.wfirma_sync_error),
    waluta: payload.waluta || "PLN",
  };
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
