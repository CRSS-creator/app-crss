import { supabase } from "@/lib/supabaseClient";

export type CrmOfferStatus = "draft" | "published" | "accepted" | "discussion_requested" | "rejected" | "expired";
export type CrmOfferDecision = "accepted" | "discussion_requested" | "rejected";

export type CrmOffer = {
  id: string;
  crm_id: string;
  public_token: string;
  status: CrmOfferStatus;
  tytul: string;
  przygotowana_dla: string | null;
  osoba_kontaktowa: string | null;
  rekomendowany_pakiet: string;
  warunki: string | null;
  cta_label: string;
  cta_url: string | null;
  pdf_url: string | null;
  pdf_storage_path: string | null;
  pdf_file_name: string | null;
  pdf_file_size: number | null;
  n8n_webhook_url: string | null;
  email_recipient: string | null;
  email_subject: string | null;
  email_sent_at: string | null;
  wazna_do: string | null;
  published_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmOfferEvent = {
  id: string;
  oferta_id: string;
  event_type: "open" | "section_time" | "cta_click" | "pdf_download" | "accept" | "reject";
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
  rekomendowany_pakiet: string;
  status?: CrmOfferStatus;
  warunki?: string | null;
  cta_label: string;
  cta_url?: string | null;
  pdf_url?: string | null;
  pdf_storage_path?: string | null;
  pdf_file_name?: string | null;
  pdf_file_size?: number | null;
  n8n_webhook_url?: string | null;
  email_recipient?: string | null;
  email_subject?: string | null;
  email_sent_at?: string | null;
  wazna_do?: string | null;
};

export type CrmOfferLeadContext = {
  id?: string | null;
  nazwa?: string | null;
  email?: string | null;
  osoba_kontaktowa?: string | null;
};

const CRM_OFFER_PDF_BUCKET = "crm-oferty-pdf";

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

export async function uploadCrmOfferPdf(offerId: string, file: File) {
  const fileName = sanitizeFileName(file.name || "propozycja.pdf");
  const storagePath = `${offerId}/${Date.now()}-${fileName}`;
  const upload = await supabase.storage
    .from(CRM_OFFER_PDF_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });

  if (upload.error) return { data: null, error: upload.error };

  const { data: publicUrl } = supabase.storage
    .from(CRM_OFFER_PDF_BUCKET)
    .getPublicUrl(storagePath);

  return updateCrmOffer(offerId, {
    pdf_url: publicUrl.publicUrl,
    pdf_storage_path: storagePath,
    pdf_file_name: file.name || fileName,
    pdf_file_size: file.size,
  });
}

export async function removeCrmOfferPdf(offer: CrmOffer) {
  if (offer.pdf_storage_path) {
    const removal = await supabase.storage
      .from(CRM_OFFER_PDF_BUCKET)
      .remove([offer.pdf_storage_path]);

    if (removal.error) return { data: null, error: removal.error };
  }

  return supabase.rpc("reset_crm_offer_after_pdf_removal", {
    public_offer_id: offer.id,
  });
}

export async function publishCrmOffer(offerId: string) {
  return supabase
    .from("crm_oferty")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", offerId)
    .select("*")
    .single();
}

export async function expireCrmOffer(offerId: string) {
  return supabase
    .from("crm_oferty")
    .update({ status: "expired" })
    .eq("id", offerId)
    .select("*")
    .single();
}

export async function sendCrmOfferToN8n(offer: CrmOffer, lead?: CrmOfferLeadContext | null) {
  let offerToSend = offer;

  if (offer.status === "expired") {
    return { ok: false, error: "Link jest unieważniony. Najpierw opublikuj go ponownie." };
  }

  if (offer.status === "draft") {
    const { data, error } = await publishCrmOffer(offer.id);

    if (error || !data) {
      return { ok: false, error: "Nie udało się opublikować linku propozycji." };
    }

    offerToSend = data as CrmOffer;
  }

  const recipientEmail = offerToSend.email_recipient || lead?.email || null;

  if (!recipientEmail) {
    return { ok: false, error: "Uzupełnij adres e-mail odbiorcy." };
  }

  const publicUrl = typeof window === "undefined" ? `/oferta/${offerToSend.public_token}` : `${window.location.origin}/oferta/${offerToSend.public_token}`;
  const response = await fetch("/api/crm/oferty/send-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offerId: offerToSend.id,
      leadId: offerToSend.crm_id || lead?.id || null,
      recipientEmail,
      recipientName: offerToSend.osoba_kontaktowa || lead?.osoba_kontaktowa || null,
      companyName: offerToSend.przygotowana_dla || lead?.nazwa || null,
      subject: offerToSend.email_subject || `Propozycja współpracy CRSS dla ${offerToSend.przygotowana_dla || lead?.nazwa || "Państwa firmy"}`,
      proposalTitle: offerToSend.tytul,
      proposalUrl: publicUrl,
      validUntil: offerToSend.wazna_do,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    return { ok: false, error: data?.error || `Automatyzacja zwróciła status ${response.status}.` };
  }

  await updateCrmOffer(offerToSend.id, { email_sent_at: new Date().toISOString() });
  const followup = await supabase.rpc("schedule_crm_offer_followup", {
    public_offer_id: offerToSend.id,
  });

  if (followup.error) {
    console.error("Błąd tworzenia follow-upu po wysłaniu propozycji:", followup.error);
  }

  return { ok: true, error: null };
}

export async function recordCrmOfferDecision(
  offerId: string,
  decision: CrmOfferDecision,
  visitorId?: string | null,
  rejectionReason?: string | null
) {
  return supabase.rpc("record_crm_offer_decision", {
    public_offer_id: offerId,
    public_decision: decision,
    public_visitor_id: visitorId || null,
    public_rejection_reason: rejectionReason || null,
  });
}

export async function markCrmOfferAccepted(offerId: string, visitorId?: string | null) {
  return recordCrmOfferDecision(offerId, "accepted", visitorId);
}

export async function fetchPublicCrmOffer(token: string) {
  return supabase
    .from("crm_oferty")
    .select("*")
    .eq("public_token", token)
    .in("status", ["published", "accepted", "discussion_requested", "rejected"])
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

function sanitizeFileName(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "propozycja"}.pdf`;
}
