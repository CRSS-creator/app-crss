import { supabase } from "@/lib/supabaseClient";

const TASK_DOCUMENTS_BUCKET = "zadania-dokumenty";

export type TaskDocument = {
  id: string;
  zadanie_id: string;
  nazwa: string;
  sciezka: string;
  rozmiar: number | null;
  typ: string | null;
  uploaded_by: string | null;
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

export async function fetchTaskDocuments(taskId: string) {
  return supabase
    .from("zadania_dokumenty")
    .select("*")
    .eq("zadanie_id", taskId)
    .order("created_at", { ascending: false });
}

export async function uploadTaskDocument(taskId: string, file: File) {
  const filePath = `${taskId}/${Date.now()}-${sanitizeFileName(file.name)}`;

  const uploadResult = await supabase.storage
    .from(TASK_DOCUMENTS_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadResult.error) {
    return { data: null, error: uploadResult.error };
  }

  return supabase
    .from("zadania_dokumenty")
    .insert({
      zadanie_id: taskId,
      nazwa: file.name,
      sciezka: filePath,
      rozmiar: file.size,
      typ: file.type || null,
    })
    .select("*")
    .single();
}

export async function createTaskDocumentSignedUrl(path: string) {
  return supabase.storage
    .from(TASK_DOCUMENTS_BUCKET)
    .createSignedUrl(path, 60 * 10);
}

export async function deleteTaskDocument(document: TaskDocument) {
  const storageResult = await supabase.storage
    .from(TASK_DOCUMENTS_BUCKET)
    .remove([document.sciezka]);

  if (storageResult.error) {
    return { error: storageResult.error };
  }

  return supabase
    .from("zadania_dokumenty")
    .delete()
    .eq("id", document.id);
}
