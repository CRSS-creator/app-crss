import { supabase } from "@/lib/supabaseClient";

export type CrmTaskStatus = "do_zrobienia" | "w_trakcie" | "zrobione";

const CRM_DOCUMENTS_BUCKET = "crm-dokumenty";
const CRM_OFFER_PDF_BUCKET = "crm-oferty-pdf";

export async function fetchCrmLeads() {
  return supabase
    .from("crm_szanse_sprzedazy")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function fetchCrmTasks() {
  return supabase
    .from("crm_zadania")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function updateCrmTaskStatus(
  taskId: string,
  status: CrmTaskStatus
) {
  return supabase
    .from("crm_zadania")
    .update({ status })
    .eq("id", taskId);
}

export async function createCrmTasks(
  tasks: {
    crm_id: string;
    etap: string;
    tytul: string;
    status: CrmTaskStatus;
    opis?: string | null;
    termin?: string | null;
  }[]
) {
  return supabase
    .from("crm_zadania")
    .insert(tasks)
    .select("*");
}

export async function updateCrmLeadStage(leadId: string, stage: string) {
  return supabase
    .from("crm_szanse_sprzedazy")
    .update({ etap: stage })
    .eq("id", leadId);
}

export async function deleteCrmLead(leadId: string) {
  const [documentsResult, offersResult] = await Promise.all([
    supabase.from("crm_dokumenty").select("sciezka").eq("crm_id", leadId),
    supabase.from("crm_oferty").select("pdf_storage_path").eq("crm_id", leadId),
  ]);

  if (documentsResult.error) return { error: documentsResult.error };
  if (offersResult.error) return { error: offersResult.error };

  const documentPaths = (documentsResult.data || [])
    .map((document) => document.sciezka)
    .filter(Boolean) as string[];
  const offerPdfPaths = (offersResult.data || [])
    .map((offer) => offer.pdf_storage_path)
    .filter(Boolean) as string[];

  if (documentPaths.length > 0) {
    const storageResult = await supabase.storage
      .from(CRM_DOCUMENTS_BUCKET)
      .remove(documentPaths);
    if (storageResult.error) return { error: storageResult.error };
  }

  if (offerPdfPaths.length > 0) {
    const storageResult = await supabase.storage
      .from(CRM_OFFER_PDF_BUCKET)
      .remove(offerPdfPaths);
    if (storageResult.error) return { error: storageResult.error };
  }

  return supabase.rpc("delete_crm_lead", {
    public_lead_id: leadId,
  });
}
