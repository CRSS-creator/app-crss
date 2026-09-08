import { supabase } from "@/lib/supabaseClient";
import type { TimeEntry } from "@/lib/taskService";

export type TaskTimeCorrection = {
  id: string;
  zadanie_id: string | null;
  zadanie_cykliczne_id: string | null;
  klient_id: string | null;
  miesiac_rozliczeniowy: string | null;
  osoba_id: string;
  duration_seconds: number;
  created_at: string;
};

// These rows are used only in task totals; daily reports keep reading czas_pracy.
export function correctionAsTimeEntry(correction: TaskTimeCorrection): TimeEntry {
  return {
    ...correction,
    is_time_correction: true,
    started_at: correction.created_at,
    ended_at: correction.created_at,
    updated_at: correction.created_at,
    opis: "Korekta łącznego czasu zadania",
  };
}

export async function saveTaskTotalTime(
  taskId: string,
  totalSeconds: number,
  recurring = false,
  clientId: string | null = null,
  period: string | null = null
) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return { data: null, error: new Error("Nieprawidłowy czas zadania.") };
  }
  return supabase.rpc("set_task_total_time", {
    public_task_id: taskId,
    public_total_seconds: Math.floor(totalSeconds),
    public_recurring: recurring,
    public_client_id: clientId,
    public_period: period,
  });
}
