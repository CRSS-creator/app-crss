import { supabase } from "@/lib/supabaseClient";

export type CrmTaskStatus = "do_zrobienia" | "w_trakcie" | "zrobione";

export async function fetchCrmLeads() {
  return supabase
    .from("crm_szanse_sprzedazy")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function fetchCrmTasks() {
  return supabase
    .from("crm_zadania")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function updateCrmTaskStatus(
  taskId: string,
  status: CrmTaskStatus
) {
  return supabase
    .from("crm_zadania")
    .update({ status })
    .eq("id", taskId);
}

export async function createCrmTasks(
  tasks: {
    crm_id: string;
    etap: string;
    tytul: string;
    status: CrmTaskStatus;
  }[]
) {
  return supabase
    .from("crm_zadania")
    .insert(tasks)
    .select("*");
}

export async function updateCrmLeadStage(leadId: string, stage: string) {
  return supabase
    .from("crm_szanse_sprzedazy")
    .update({ etap: stage })
    .eq("id", leadId);
}
