import { supabase } from "@/lib/supabaseClient";

export type TaskStatus = "do_zrobienia" | "w_trakcie" | "zrobione" | "anulowane";
export type TaskPriority = "niski" | "normalny" | "wysoki" | "pilne";

export type ProfileSummary = {
  id?: string;
  full_name: string | null;
  email: string | null;
  role?: string | null;
};

export type ClientSummary = {
  id?: string;
  nazwa: string | null;
  nip: string | null;
};

export type Task = {
  id: string;
  tytul: string;
  opis: string | null;
  status: TaskStatus;
  priorytet: TaskPriority;
  termin: string | null;
  osoba_id: string;
  klient_id: string | null;
  czy_wewnetrzne: boolean;
  notatki: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  profiles?: ProfileSummary | ProfileSummary[] | null;
  klienci?: ClientSummary | ClientSummary[] | null;
};

export type TimeEntry = {
  id: string;
  zadanie_id: string | null;
  zadanie_cykliczne_id: string | null;
  klient_id: string | null;
  osoba_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  miesiac_rozliczeniowy: string | null;
  opis: string | null;
  created_at: string;
  updated_at: string;
  profiles?: ProfileSummary | ProfileSummary[] | null;
};

export type TaskPayload = {
  tytul: string;
  opis?: string | null;
  status: TaskStatus;
  priorytet: TaskPriority;
  termin?: string | null;
  osoba_id: string;
  klient_id?: string | null;
  czy_wewnetrzne: boolean;
  notatki?: string | null;
};

const TASK_SELECT = `
  *,
  profiles!zadania_osoba_id_fkey (
    full_name,
    email,
    role
  ),
  klienci!zadania_klient_id_fkey (
    nazwa,
    nip
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

export async function fetchTaskAssignees() {
  return supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["owner", "manager", "admin", "accountant"])
    .order("full_name", { ascending: true });
}

export async function fetchTaskClients() {
  return supabase
    .from("klienci")
    .select("id, nazwa, nip, status_klienta")
    .order("nazwa", { ascending: true });
}

export async function fetchTasks() {
  return supabase
    .from("zadania")
    .select(TASK_SELECT)
    .order("termin", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
}

export async function createTask(payload: TaskPayload) {
  return supabase
    .from("zadania")
    .insert(payload)
    .select(TASK_SELECT)
    .single();
}

export async function updateTask(taskId: string, payload: Partial<TaskPayload>) {
  return supabase
    .from("zadania")
    .update(payload)
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();
}

export async function fetchTaskTimeEntries(taskId: string) {
  return supabase
    .from("czas_pracy")
    .select(TIME_ENTRY_SELECT)
    .eq("zadanie_id", taskId)
    .order("started_at", { ascending: false });
}

export async function fetchActiveTaskTimers(userId: string) {
  return supabase
    .from("czas_pracy")
    .select(TIME_ENTRY_SELECT)
    .eq("osoba_id", userId)
    .is("ended_at", null)
    .not("zadanie_id", "is", null)
    .order("started_at", { ascending: false });
}

export async function startTaskTimer(taskId: string, userId: string) {
  return supabase
    .from("czas_pracy")
    .insert({
      zadanie_id: taskId,
      osoba_id: userId,
      started_at: new Date().toISOString(),
    })
    .select(TIME_ENTRY_SELECT)
    .single();
}

export async function stopTaskTimer(timeEntryId: string, opis?: string | null) {
  return supabase
    .from("czas_pracy")
    .update({
      ended_at: new Date().toISOString(),
      opis: opis?.trim() || null,
    })
    .eq("id", timeEntryId)
    .select(TIME_ENTRY_SELECT)
    .single();
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  return updateTask(taskId, { status });
}
