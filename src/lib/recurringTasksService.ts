import { supabase } from "@/lib/supabaseClient";
import type { TaskPriority, TimeEntry } from "@/lib/taskService";

export type RecurringTask = {
  id: string;
  klient_id: string | null;
  tytul: string;
  opis: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  dzien_miesiaca: number;
  osoba_id: string | null;
  priorytet: TaskPriority;
  aktywne: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
  }[] | null;
};

export type RecurringTaskPayload = {
  klient_id?: string | null;
  tytul: string;
  opis?: string | null;
  forma_prawna?: string | null;
  forma_opodatkowania?: string | null;
  dzien_miesiaca: number;
  osoba_id?: string | null;
  priorytet: TaskPriority;
  aktywne?: boolean;
};

const RECURRING_TASK_SELECT = `
  *,
  profiles!zadania_cykliczne_osoba_id_fkey (
    full_name,
    email
  )
`;

const TIME_ENTRY_SELECT = `
  *,
  profiles!czas_pracy_osoba_id_fkey (
    full_name,
    email,
    role
  )
`;

export async function fetchRecurringTasks() {
  return supabase
    .from("zadania_cykliczne")
    .select(RECURRING_TASK_SELECT)
    .eq("aktywne", true)
    .order("dzien_miesiaca", { ascending: true })
    .order("created_at", { ascending: false });
}

export async function createRecurringTask(payload: RecurringTaskPayload) {
  return supabase
    .from("zadania_cykliczne")
    .insert(payload)
    .select(RECURRING_TASK_SELECT)
    .single();
}

export async function deleteRecurringTask(taskId: string) {
  return supabase
    .from("zadania_cykliczne")
    .delete()
    .eq("id", taskId);
}

export async function fetchActiveRecurringTaskTimers(userId: string) {
  return supabase
    .from("czas_pracy")
    .select(TIME_ENTRY_SELECT)
    .eq("osoba_id", userId)
    .is("ended_at", null)
    .not("zadanie_cykliczne_id", "is", null)
    .order("started_at", { ascending: false });
}

export async function startRecurringTaskTimer({
  taskId,
  clientId,
  userId,
  settlementMonth,
}: {
  taskId: string;
  clientId: string | null;
  userId: string;
  settlementMonth: string | null;
}) {
  return supabase
    .from("czas_pracy")
    .insert({
      zadanie_cykliczne_id: taskId,
      klient_id: clientId,
      osoba_id: userId,
      started_at: new Date().toISOString(),
      miesiac_rozliczeniowy: settlementMonth,
      czy_wewnetrzne: !clientId,
    })
    .select(TIME_ENTRY_SELECT)
    .single();
}

export async function stopRecurringTaskTimer(timeEntryId: string) {
  return supabase
    .from("czas_pracy")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", timeEntryId)
    .select(TIME_ENTRY_SELECT)
    .single<TimeEntry>();
}
