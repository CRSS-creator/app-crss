import { supabase } from "@/lib/supabaseClient";

export type TaxObligationType = "VAT" | "VAT-UE" | "VAT-9M" | "PIT" | "CIT" | "ZUS" | "PIT-4";
export type TaxFetchStatus = "do_pobrania" | "pobrane" | "blad";
export type TaxSendStatus = "niewyslane" | "wyslane" | "blad";

export type TaxObligation = {
  id: string;
  created_at: string;
  updated_at: string;
  rozliczenie_id: string;
  klient_id: string;
  okres: string;
  typ: TaxObligationType;
  nazwa: string;
  kwota: number | null;
  termin_platnosci: string | null;
  status_pobrania: TaxFetchStatus;
  status_email: TaxSendStatus;
  status_sms: TaxSendStatus;
  email_sent_at: string | null;
  email_sent_by: string | null;
  sms_sent_at: string | null;
  sms_sent_by: string | null;
  zrodlo: "wfirma" | "recznie";
  external_id: string | null;
  metadata: Record<string, unknown>;
};

export async function fetchTaxObligations(period: string) {
  return supabase
    .from("zobowiazania_podatkowe")
    .select("*")
    .eq("okres", period)
    .order("termin_platnosci", { ascending: true })
    .order("typ", { ascending: true });
}

export async function updateTaxObligation(id: string, payload: Partial<Pick<TaxObligation, "typ" | "nazwa" | "kwota" | "termin_platnosci">>) {
  return supabase
    .from("zobowiazania_podatkowe")
    .update({ ...payload, zrodlo: "recznie" })
    .eq("id", id)
    .select("*")
    .single();
}

export async function deleteTaxObligation(id: string) {
  return supabase
    .from("zobowiazania_podatkowe")
    .delete()
    .eq("id", id);
}

export async function sendTaxObligations(settlementId: string, channel: "email" | "sms", obligationIds?: string[]) {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  return fetch("/api/rozliczenia/tax-obligations/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ settlementId, channel, obligationIds }),
  });
}
