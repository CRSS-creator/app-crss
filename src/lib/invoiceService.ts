import { supabase } from "@/lib/supabaseClient";

export type InvoiceStatus = "szkic" | "wystawiona" | "wyslana" | "oplacona" | "anulowana";
export type InvoiceSource = "aplikacja" | "wfirma" | "import";
export type InvoiceSyncStatus = "nie_wyslano" | "w_kolejce" | "wyslano" | "blad" | "zaimportowano";
export type InvoiceType = "sprzedaz" | "korekta" | "proforma";
export type InvoiceCategory = "standardowa" | "dodatkowa";

export type Invoice = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string | null;
  numer: string | null;
  typ: InvoiceType;
  status: InvoiceStatus;
  kategoria: InvoiceCategory;
  zrodlo: InvoiceSource;
  data_wystawienia: string | null;
  data_sprzedazy: string | null;
  termin_platnosci: string | null;
  okres: string | null;
  automatyczna: boolean;
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
  faktury_pozycje?: InvoiceLine[] | null;
};

export type InvoiceLine = {
  id: string;
  faktura_id: string;
  source_key: string | null;
  nazwa: string;
  ilosc: number;
  jednostka: string;
  cena_netto: number;
  stawka_vat: string;
  kwota_netto: number;
  kwota_vat: number;
  kwota_brutto: number;
  sort_order: number;
};

export type InvoicePayload = {
  klient_id?: string | null;
  numer?: string | null;
  typ?: InvoiceType;
  status?: InvoiceStatus;
  kategoria?: InvoiceCategory;
  zrodlo?: InvoiceSource;
  data_wystawienia?: string | null;
  data_sprzedazy?: string | null;
  termin_platnosci?: string | null;
  okres?: string | null;
  automatyczna?: boolean;
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
  ),
  faktury_pozycje (
    id,
    faktura_id,
    source_key,
    nazwa,
    ilosc,
    jednostka,
    cena_netto,
    stawka_vat,
    kwota_netto,
    kwota_vat,
    kwota_brutto,
    sort_order
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

export async function ensureSubscriptionInvoices(invoiceMonth?: string) {
  return supabase.rpc("ensure_subscription_invoices", {
    public_invoice_month: invoiceMonth || undefined,
  });
}

export async function queueInvoicesForWfirma(invoiceIds: string[]) {
  if (invoiceIds.length === 0) {
    return { data: [] as Invoice[], error: null };
  }

  return supabase
    .from("faktury")
    .update({
      wfirma_sync_status: "w_kolejce" as InvoiceSyncStatus,
      wfirma_sync_error: null,
    })
    .in("id", invoiceIds)
    .in("wfirma_sync_status", ["nie_wyslano", "blad"])
    .neq("status", "anulowana")
    .select(INVOICE_SELECT);
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
