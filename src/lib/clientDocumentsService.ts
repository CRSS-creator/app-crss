import { supabase } from "@/lib/supabaseClient";

const CLIENT_DOCUMENTS_BUCKET = "klienci-dokumenty";

export type ClientDocument = {
  id: string;
  klient_id: string;
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

export async function fetchClientDocuments(clientId: string) {
  return supabase
    .from("klienci_dokumenty")
    .select("*")
    .eq("klient_id", clientId)
    .order("created_at", { ascending: false });
}

export async function uploadClientDocument(clientId: string, file: File) {
  const filePath = `${clientId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const uploadResult = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadResult.error) {
    return { data: null, error: uploadResult.error };
  }

  return supabase
    .from("klienci_dokumenty")
    .insert({
      klient_id: clientId,
      nazwa: file.name,
      sciezka: filePath,
      rozmiar: file.size,
      typ: file.type || null,
    })
    .select("*")
    .single();
}

export async function createClientDocumentSignedUrl(path: string) {
  return supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60 * 10);
}

export async function deleteClientDocument(document: ClientDocument) {
  const removeResult = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .remove([document.sciezka]);

  if (removeResult.error) {
    return { error: removeResult.error };
  }

  return supabase
    .from("klienci_dokumenty")
    .delete()
    .eq("id", document.id);
}
