import { supabase } from "@/lib/supabaseClient";

export type CrmOfferStatus = "draft" | "published" | "accepted" | "expired";

export type CrmOffer = {
  id: string;
  crm_id: string;
  public_token: string;
  status: CrmOfferStatus;
  tytul: string;
  przygotowana_dla: string | null;
  osoba_kontaktowa: string | null;
  podsumowanie_rozmowy: string | null;
  potrzeby_klienta: string | null;
  rekomendowany_pakiet: string;
  opis_pakietu: string | null;
  cena_standard: number | null;
  cena_premium: number | null;
  cena_wdrozenia: number | null;
  zakres: string | null;
  warunki: string | null;
  cta_label: string;
  cta_url: string | null;
  pdf_url: string | null;
  wazna_do: string | null;
  published_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmOfferEvent = {
  id: string;
  oferta_id: string;
  event_type: "open" | "section_time" | "cta_click" | "pdf_download" | "accept";
  section_key: string | null;
  visitor_id: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CrmOfferPayload = {
  crm_id: string;
  tytul: string;
  przygotowana_dla?: string | null;
  osoba_kontaktowa?: string | null;
  podsumowanie_rozmowy?: string | null;
  potrzeby_klienta?: string | null;
  rekomendowany_pakiet: string;
  opis_pakietu?: string | null;
  cena_standard?: number | null;
  cena_premium?: number | null;
  cena_wdrozenia?: number | null;
  zakres?: string | null;
  warunki?: string | null;
  cta_label: string;
  cta_url?: string | null;
  pdf_url?: string | null;
  wazna_do?: string | null;
};

export async function fetchCrmOffers(crmId: string) {
  return supabase
    .from("crm_oferty")
    .select("*")
    .eq("crm_id", crmId)
    .order("created_at", { ascending: false });
}

export async function fetchCrmOfferEvents(offerId: string) {
  return supabase
    .from("crm_oferta_events")
    .select("*")
    .eq("oferta_id", offerId)
    .order("created_at", { ascending: false });
}

export async function createCrmOffer(payload: CrmOfferPayload) {
  return supabase
    .from("crm_oferty")
    .insert(payload)
    .select("*")
    .single();
}

export async function updateCrmOffer(offerId: string, payload: Partial<CrmOfferPayload>) {
  return supabase
    .from("crm_oferty")
    .update(payload)
    .eq("id", offerId)
    .select("*")
    .single();
}

export async function publishCrmOffer(offerId: string) {
  return supabase
    .from("crm_oferty")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", offerId)
    .select("*")
    .single();
}

export async function markCrmOfferAccepted(offerId: string, visitorId?: string | null) {
  return supabase.rpc("accept_crm_offer", {
    public_offer_id: offerId,
    public_visitor_id: visitorId || null,
  });
}

export async function fetchPublicCrmOffer(token: string) {
  return supabase
    .from("crm_oferty")
    .select("*")
    .eq("public_token", token)
    .in("status", ["published", "accepted"])
    .single();
}

export async function trackCrmOfferEvent(payload: {
  oferta_id: string;
  event_type: CrmOfferEvent["event_type"];
  section_key?: string | null;
  visitor_id?: string | null;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown>;
}) {
  return supabase.from("crm_oferta_events").insert({
    oferta_id: payload.oferta_id,
    event_type: payload.event_type,
    section_key: payload.section_key || null,
    visitor_id: payload.visitor_id || null,
    duration_seconds: payload.duration_seconds ?? null,
    metadata: payload.metadata || {},
  });
}
