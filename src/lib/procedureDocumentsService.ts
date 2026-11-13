import { supabase } from "@/lib/supabaseClient";

export const PROCEDURES_BUCKET = "procedury-wzory";
export const MAX_PROCEDURE_FILE_SIZE = 25 * 1024 * 1024;

export type ProcedureDocument = {
  id: string;
  nazwa: string;
  nazwa_pliku: string;
  sciezka: string;
  rozmiar: number;
};

export async function fetchProcedureDocuments() {
  return supabase.from("procedury_wzory")
    .select("id, nazwa, nazwa_pliku, sciezka, rozmiar")
    .order("created_at", { ascending: false });
}

export async function uploadProcedureDocument(name: string, file: File) {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 200) throw new Error("Podaj nazwę materiału (do 200 znaków).");
  if (!file.size) throw new Error("Wybrany plik jest pusty.");
  if (file.size > MAX_PROCEDURE_FILE_SIZE) throw new Error("Plik może mieć maksymalnie 25 MB.");

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160) || "plik";
  const storagePath = `${data.user.id}/${crypto.randomUUID()}/${safeName}`;
  const uploaded = await supabase.storage.from(PROCEDURES_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type || "application/octet-stream" });
  if (uploaded.error) throw new Error("Nie udało się przesłać pliku. Sprawdź połączenie i uprawnienia.");

  try {
    const saved = await supabase.from("procedury_wzory").insert({
      nazwa: trimmedName, nazwa_pliku: file.name, sciezka: storagePath,
      rozmiar: file.size, created_by: data.user.id,
    }).select("id, nazwa, nazwa_pliku, sciezka, rozmiar").single();
    if (saved.error || !saved.data) throw new Error("Nie udało się zapisać materiału. Spróbuj ponownie.");
    return saved.data as ProcedureDocument;
  } catch (error) {
    try {
      const cleanup = await supabase.storage.from(PROCEDURES_BUCKET).remove([storagePath]);
      if (cleanup.error) console.error("Nie udało się usunąć nieopublikowanego pliku:", cleanup.error);
    } catch (cleanupError) {
      console.error("Nie udało się usunąć nieopublikowanego pliku:", cleanupError);
    }
    throw error;
  }
}

export async function downloadProcedureDocument(document: ProcedureDocument) {
  const result = await supabase.storage.from(PROCEDURES_BUCKET).download(document.sciezka);
  if (result.error || !result.data) throw new Error("Nie udało się pobrać pliku. Spróbuj ponownie.");
  return result.data;
}
