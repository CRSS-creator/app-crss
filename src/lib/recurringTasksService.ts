import { supabase } from "@/lib/supabaseClient";
import type { TaskPriority } from "@/lib/taskService";

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
