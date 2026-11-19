import { supabase } from "@/lib/supabaseClient";
import type { TimeEntry } from "@/lib/taskService";
import { correctionAsTimeEntry } from "@/lib/taskTimeCorrections";

export type TaskTimeEntryEdit = { startedAt: string; endedAt: string; description: string } | { correctionSeconds: number };

export async function updateIndividualTaskTime(entry: TimeEntry, edit: TaskTimeEntryEdit): Promise<TimeEntry> {
  if (!entry.zadanie_id || !entry.ended_at) throw new Error("Najpierw zatrzymaj licznik tego zapisu.");
  const conflict = "Zapis został zmieniony lub nie masz uprawnień do jego edycji. Odśwież szczegóły zadania.";
  if (entry.is_time_correction) {
    if (!("correctionSeconds" in edit) || !Number.isSafeInteger(edit.correctionSeconds) || Math.abs(edit.correctionSeconds) > 2147483647)
      throw new Error("Podaj prawidłową korektę czasu.");
    const result = await supabase.from("korekty_czasu_zadan").update({ duration_seconds: edit.correctionSeconds })
      .eq("id", entry.id).eq("zadanie_id", entry.zadanie_id).eq("duration_seconds", entry.duration_seconds)
      .select("*").maybeSingle();
    if (result.error) throw new Error("Nie udało się zapisać korekty czasu.");
    if (!result.data) throw new Error(conflict);
    return correctionAsTimeEntry(result.data);
  }
  if (!("startedAt" in edit)) throw new Error("Podaj początek i koniec pracy.");
  const start = new Date(edit.startedAt), end = new Date(edit.endedAt);
  const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 2147483647) throw new Error("Koniec pracy musi przypadać po jej rozpoczęciu.");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" }).formatToParts(start);
  const period = parts.find(p => p.type === "year")!.value + "-" + parts.find(p => p.type === "month")!.value + "-01";
  const result = await supabase.from("czas_pracy").update({
    started_at: start.toISOString(), ended_at: end.toISOString(), opis: edit.description.trim() || null,
    miesiac_rozliczeniowy: period,
  }).eq("id", entry.id).eq("zadanie_id", entry.zadanie_id)
    .eq("started_at", entry.started_at).eq("ended_at", entry.ended_at).eq("updated_at", entry.updated_at)
    .select("*").maybeSingle();
  if (result.error) throw new Error("Nie udało się zapisać czasu pracy.");
  if (!result.data) throw new Error(conflict);
  return result.data as TimeEntry;
}
