import { supabase } from "@/lib/supabaseClient";

export const PROCEDURES_BUCKET = "procedury-wzory";
export const MAX_PROCEDURE_FILE_SIZE = 25 * 1024 * 1024;

export type ProcedureCategory = "procedura" | "wzor";
export const PROCEDURE_CATEGORIES: { value: ProcedureCategory; label: string; heading: string }[] = [
  { value: "procedura", label: "Procedura", heading: "Procedury" },
  { value: "wzor", label: "Wzór", heading: "Wzory" },
];

export type ProcedureDocument = {
  id: string;
  kategoria: ProcedureCategory;
  nazwa: string;
  nazwa_pliku: string;
  sciezka: string;
  rozmiar: number;
};

export async function fetchProcedureDocuments() {
  return supabase.from("procedury_wzory")
    .select("id, nazwa, nazwa_pliku, sciezka, rozmiar, kategoria")
    .order("created_at", { ascending: false });
}

export async function uploadProcedureDocument(name: string, file: File, category: ProcedureCategory = "procedura") {
  if (!PROCEDURE_CATEGORIES.some(item => item.value === category)) throw new Error("Wybierz kategorię: Procedura lub Wzór.");
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
      kategoria: category, nazwa: trimmedName, nazwa_pliku: file.name, sciezka: storagePath,
      rozmiar: file.size, created_by: data.user.id,
    }).select("id, nazwa, nazwa_pliku, sciezka, rozmiar, kategoria").single();
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

export function getProcedureDownloadName(document: Pick<ProcedureDocument, "nazwa" | "nazwa_pliku">) {
  const extension = document.nazwa_pliku.match(/\.[a-z0-9]{1,16}$/i)?.[0] || "";
  const name = document.nazwa.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "") || "plik";
  return extension && !name.toLowerCase().endsWith(extension.toLowerCase()) ? name + extension : name;
}
