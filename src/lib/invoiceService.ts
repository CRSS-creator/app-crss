import { supabase } from "@/lib/supabaseClient";

export type InvoiceStatus = "szkic" | "wystawiona" | "wyslana" | "oplacona" | "przeterminowana" | "anulowana";
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
  wfirma_pdf_path: string | null;
  wfirma_pdf_name: string | null;
  wfirma_pdf_synced_at: string | null;
  wfirma_synced_at: string | null;
  wfirma_sync_status: InvoiceSyncStatus;
  wfirma_sync_error: string | null;
  klienci?: {
    nazwa: string | null;
    nip: string | null;
    email: string | null;
  } | null;
  faktury_pozycje?: InvoiceLine[] | null;
  faktury_email_history?: InvoiceEmailHistory[] | null;
};

export type InvoiceEmailHistory = {
  id: string;
  created_at: string;
  recipient_email: string;
  subject: string;
  status: "wyslane" | "blad";
  error: string | null;
  invoice_number: string | null;
  sent_by_name: string | null;
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
  wfirma_pdf_path?: string | null;
  wfirma_pdf_name?: string | null;
  wfirma_pdf_synced_at?: string | null;
  wfirma_sync_status?: InvoiceSyncStatus;
  wfirma_sync_error?: string | null;
};

export type WfirmaPaymentSyncResult = {
  checked: number;
  markedPaid: number;
  paid: { invoiceId: string; number: string | null; wfirmaId: string }[];
  failed: { invoiceId: string; number: string | null; wfirmaId: string; error: string }[];
};

const WFIRMA_PAYMENT_SYNC_STATUSES: InvoiceStatus[] = ["wystawiona", "wyslana", "przeterminowana"];

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
  ),
  faktury_email_history (
    id,
    created_at,
    recipient_email,
    subject,
    status,
    error,
    invoice_number,
    sent_by_name
  )
`;

export async function fetchInvoices() {
  await supabase.rpc("mark_overdue_invoices");

  return supabase
    .from("faktury")
    .select(INVOICE_SELECT)
    .order("data_wystawienia", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .range(0, 4999);
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

export async function importWfirmaInvoices(month: string) {
  return callWfirmaEndpoint<{
    imported: number;
    failed: { wfirmaId: string | null; error: string }[];
    dateFrom: string;
    dateTo: string;
  }>(
    "/api/faktury/wfirma/import",
    { month }
  );
}

export async function sendInvoicesToWfirma(invoiceIds: string[]) {
  return callWfirmaEndpoint<{ sent: number; failed: { invoiceId: string; error: string }[] }>(
    "/api/faktury/wfirma/send",
    { invoiceIds }
  );
}

export async function syncWfirmaPayments(month?: string): Promise<{ data: WfirmaPaymentSyncResult | null; error: Error | null }> {
  if (!month) {
    const monthsResult = await getWfirmaPaymentSyncMonths();
    if (monthsResult.error) return { data: null, error: monthsResult.error };

    const combined: WfirmaPaymentSyncResult = {
      checked: 0,
      markedPaid: 0,
      paid: [],
      failed: [],
    };

    for (const syncMonth of monthsResult.data) {
      const result = await syncWfirmaPayments(syncMonth);
      if (result.error) return result;
      if (!result.data) continue;

      combined.checked += result.data.checked;
      combined.markedPaid += result.data.markedPaid;
      combined.paid.push(...result.data.paid);
      combined.failed.push(...result.data.failed);
    }

    return { data: combined, error: null };
  }

  return callWfirmaEndpoint<WfirmaPaymentSyncResult>(
    "/api/faktury/wfirma/sync-payments",
    { month }
  );
}

export async function getInvoicePdfUrl(invoiceId: string) {
  return callWfirmaEndpoint<{ url: string; name: string }>(
    "/api/faktury/pdf-url",
    { invoiceId }
  );
}

export async function sendInvoiceMail(invoiceId: string) {
  return sendInvoiceMails([invoiceId]);
}

export async function sendInvoiceMails(invoiceIds: string[]) {
  return callWfirmaEndpoint<{
    ok: true;
    sent: number;
    failed: { invoiceId: string; error: string }[];
    recipients: { invoiceId: string; recipientEmail: string }[];
  }>(
    "/api/faktury/send-mail",
    { invoiceIds }
  );
}

export async function sendOverdueInvoiceReminders(invoiceIds: string[]) {
  return callWfirmaEndpoint<{
    ok: true;
    sent: number;
    failed: { invoiceId: string; error: string }[];
    recipients: { recipientEmail: string; invoiceIds: string[] }[];
  }>(
    "/api/faktury/overdue-reminder",
    { invoiceIds }
  );
}

async function getWfirmaPaymentSyncMonths(): Promise<{ data: string[]; error: Error | null }> {
  const result = await supabase
    .from("faktury")
    .select("data_wystawienia")
    .in("status", WFIRMA_PAYMENT_SYNC_STATUSES)
    .not("wfirma_id", "is", null)
    .not("data_wystawienia", "is", null)
    .order("data_wystawienia", { ascending: true });

  if (result.error) {
    return { data: [], error: new Error("Nie udało się pobrać miesięcy faktur do sprawdzenia.") };
  }

  const months = Array.from(
    new Set(
      (result.data || [])
        .map((invoice) => String(invoice.data_wystawienia || "").slice(0, 7))
        .filter((value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    )
  );

  return { data: months, error: null };
}

async function callWfirmaEndpoint<T>(url: string, payload: unknown): Promise<{ data: T | null; error: Error | null }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) {
    return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    const data = parseJson(text);
    if (!response.ok) {
      const details = data?.error || text.slice(0, 500) || `HTTP ${response.status}`;
      return { data: null, error: new Error(details) };
    }
    return { data: data as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Operacja wFirmy nie powiodła się.") };
  }
}

function parseJson(value: string) {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function normalizeInvoicePayload<T extends Partial<InvoicePayload>>(payload: T) {
  const normalized: Partial<InvoicePayload> = { ...payload };

  if ("numer" in payload) normalized.numer = emptyToNull(payload.numer);
  if ("kontrahent_nip" in payload) normalized.kontrahent_nip = emptyToNull(payload.kontrahent_nip);
  if ("kontrahent_email" in payload) normalized.kontrahent_email = emptyToNull(payload.kontrahent_email);
  if ("opis" in payload) normalized.opis = emptyToNull(payload.opis);
  if ("okres" in payload) normalized.okres = emptyToNull(payload.okres);
  if ("wfirma_id" in payload) normalized.wfirma_id = emptyToNull(payload.wfirma_id);
  if ("wfirma_url" in payload) normalized.wfirma_url = emptyToNull(payload.wfirma_url);
  if ("wfirma_pdf_path" in payload) normalized.wfirma_pdf_path = emptyToNull(payload.wfirma_pdf_path);
  if ("wfirma_pdf_name" in payload) normalized.wfirma_pdf_name = emptyToNull(payload.wfirma_pdf_name);
  if ("wfirma_pdf_synced_at" in payload) normalized.wfirma_pdf_synced_at = emptyToNull(payload.wfirma_pdf_synced_at);
  if ("wfirma_sync_error" in payload) normalized.wfirma_sync_error = emptyToNull(payload.wfirma_sync_error);
  if ("waluta" in payload) normalized.waluta = payload.waluta || "PLN";

  return normalized;
}

function emptyToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
