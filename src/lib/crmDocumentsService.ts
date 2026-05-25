import { supabase } from "@/lib/supabaseClient";

const CRM_DOCUMENTS_BUCKET = "crm-dokumenty";

export type CrmDocument = {
  id: string;
  crm_id: string;
  nazwa: string;
  sciezka: string;
  rozmiar: number | null;
  typ: string | null;
  created_at: string;
};

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export async function fetchCrmDocuments(crmId: string) {
  return supabase
    .from("crm_dokumenty")
    .select("*")
    .eq("crm_id", crmId)
    .order("created_at", { ascending: false });
}

export async function uploadCrmDocument(crmId: string, file: File) {
  const filePath = `${crmId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const uploadResult = await supabase.storage
    .from(CRM_DOCUMENTS_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadResult.error) {
    return { data: null, error: uploadResult.error };
  }

  return supabase
    .from("crm_dokumenty")
    .insert({
      crm_id: crmId,
      nazwa: file.name,
      sciezka: filePath,
      rozmiar: file.size,
      typ: file.type || null,
    })
    .select("*")
    .single();
}

export async function createCrmDocumentSignedUrl(path: string) {
  return supabase.storage
    .from(CRM_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60);
}

export async function deleteCrmDocument(document: CrmDocument) {
  const storageResult = await supabase.storage
    .from(CRM_DOCUMENTS_BUCKET)
    .remove([document.sciezka]);

  if (storageResult.error) {
    return { error: storageResult.error };
  }

  return supabase
    .from("crm_dokumenty")
    .delete()
    .eq("id", document.id);
}
