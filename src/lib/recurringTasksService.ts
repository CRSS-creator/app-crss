import { supabase } from "@/lib/supabaseClient";
import type { TaskPriority, TimeEntry } from "@/lib/taskService";

export type RecurringTask = {
  id: string;
  klient_id: string | null;
  tytul: string;
  opis: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  formy_prawne: string[] | null;
  formy_opodatkowania: string[] | null;
  wymaga_czynnego_vat: boolean | null;
  wymaga_vat_ue: boolean | null;
  wymaga_obslugi_kadrowej: boolean | null;
  czestotliwosc: "miesieczne" | "roczne";
  miesiac_roczny: number | null;
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

export type RecurringTaskRealization = {
  id: string;
  zadanie_cykliczne_id: string;
  klient_id: string;
  rozliczenie_id: string | null;
  okres: string;
  termin: string | null;
  tytul: string;
  opis: string | null;
  status: "do_zrobienia" | "w_trakcie" | "zrobione";
  priorytet: TaskPriority;
  osoba_id: string | null;
  completed_at: string | null;
  uwagi: string | null;
  created_at: string;
  updated_at: string;
};

export type RecurringTaskPayload = {
  klient_id?: string | null;
  tytul: string;
  opis?: string | null;
  forma_prawna?: string | null;
  forma_opodatkowania?: string | null;
  formy_prawne?: string[] | null;
  formy_opodatkowania?: string[] | null;
  wymaga_czynnego_vat?: boolean | null;
  wymaga_vat_ue?: boolean | null;
  wymaga_obslugi_kadrowej?: boolean | null;
  czestotliwosc?: "miesieczne" | "roczne";
  miesiac_roczny?: number | null;
  dzien_miesiaca: number;
  osoba_id?: string | null;
  priorytet: TaskPriority;
  aktywne?: boolean;
};

export type RecurringTaskClientContext = {
  id?: string | null;
  forma_prawna?: string | null;
  forma_opodatkowania?: string | null;
  czynny_vat?: boolean | null;
  vat_ue?: boolean | null;
  obsluga_kadrowa?: boolean | null;
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
    .order("czestotliwosc", { ascending: true })
    .order("miesiac_roczny", { ascending: true, nullsFirst: true })
    .order("dzien_miesiaca", { ascending: true })
    .order("created_at", { ascending: false });
}

export async function fetchRecurringTaskTemplates() {
  return supabase
    .from("zadania_cykliczne")
    .select(RECURRING_TASK_SELECT)
    .order("aktywne", { ascending: false })
    .order("czestotliwosc", { ascending: true })
    .order("miesiac_roczny", { ascending: true, nullsFirst: true })
    .order("dzien_miesiaca", { ascending: true })
    .order("created_at", { ascending: false });
}

export async function fetchRecurringTaskRealizations(period: string) {
  return supabase
    .from("zadania_cykliczne_realizacje")
    .select("*")
    .eq("okres", period)
    .order("status", { ascending: true })
    .order("termin", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function createRecurringTask(payload: RecurringTaskPayload) {
  return supabase
    .from("zadania_cykliczne")
    .insert(payload)
    .select(RECURRING_TASK_SELECT)
    .single();
}

export async function createRecurringTasks(payload: RecurringTaskPayload[]) {
  return supabase
    .from("zadania_cykliczne")
    .insert(payload)
    .select(RECURRING_TASK_SELECT);
}

export async function updateRecurringTask(taskId: string, payload: Partial<RecurringTaskPayload>) {
  return supabase
    .from("zadania_cykliczne")
    .update(payload)
    .eq("id", taskId)
    .select(RECURRING_TASK_SELECT)
    .single();
}

export async function updateRecurringTaskRealizationStatus(realizationId: string, status: RecurringTaskRealization["status"]) {
  return supabase
    .from("zadania_cykliczne_realizacje")
    .update({
      status,
      completed_at: status === "zrobione" ? new Date().toISOString() : null,
    })
    .eq("id", realizationId)
    .select("*")
    .single<RecurringTaskRealization>();
}

export async function deleteRecurringTask(taskId: string) {
  return supabase
    .from("zadania_cykliczne")
    .delete()
    .eq("id", taskId);
}

export function recurringTaskMatchesClient(task: RecurringTask, client: RecurringTaskClientContext | null | undefined) {
  if (task.klient_id) return task.klient_id === client?.id;

  const legalForms = task.formy_prawne?.length ? task.formy_prawne : task.forma_prawna ? [task.forma_prawna] : [];
  const taxationForms = task.formy_opodatkowania?.length ? task.formy_opodatkowania : task.forma_opodatkowania ? [task.forma_opodatkowania] : [];
  const legalMatch = legalForms.length === 0 || legalForms.includes(client?.forma_prawna || "");
  const taxMatch = taxationForms.length === 0 || taxationForms.includes(client?.forma_opodatkowania || "");
  const vatMatch = task.wymaga_czynnego_vat === null || task.wymaga_czynnego_vat === undefined || task.wymaga_czynnego_vat === Boolean(client?.czynny_vat);
  const vatUeMatch = task.wymaga_vat_ue === null || task.wymaga_vat_ue === undefined || task.wymaga_vat_ue === Boolean(client?.vat_ue);
  const payrollMatch = task.wymaga_obslugi_kadrowej === null || task.wymaga_obslugi_kadrowej === undefined || task.wymaga_obslugi_kadrowej === Boolean(client?.obsluga_kadrowa);

  return legalMatch && taxMatch && vatMatch && payrollMatch && vatUeMatch;
}

export function recurringScopeLabel(task: RecurringTask) {
  if (task.klient_id) return "Zadanie klienta";
  const legalForms = task.formy_prawne?.length ? task.formy_prawne : task.forma_prawna ? [task.forma_prawna] : [];
  const taxationForms = task.formy_opodatkowania?.length ? task.formy_opodatkowania : task.forma_opodatkowania ? [task.forma_opodatkowania] : [];
  const vatLabel = task.wymaga_czynnego_vat === true ? "czynny VAT" : task.wymaga_czynnego_vat === false ? "bez VAT" : null;
  const vatUeLabel = task.wymaga_vat_ue === true ? "VAT-UE" : task.wymaga_vat_ue === false ? "bez VAT-UE" : null;
  const payrollLabel = task.wymaga_obslugi_kadrowej === true ? "kadry" : task.wymaga_obslugi_kadrowej === false ? "bez kadr" : null;
  return [
    legalForms.length ? legalForms.join(", ") : "każda forma",
    taxationForms.length ? taxationForms.join(", ") : "każde opodatkowanie",
    vatLabel,
    vatUeLabel,
    payrollLabel,
  ].filter(Boolean).join(" · ");
}

export function recurringFrequencyLabel(task: Pick<RecurringTask, "czestotliwosc" | "miesiac_roczny">) {
  if (task.czestotliwosc === "roczne") {
    return task.miesiac_roczny ? `Roczne · miesiąc ${task.miesiac_roczny}` : "Roczne";
  }
  return "Miesięczne";
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
