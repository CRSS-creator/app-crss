import { supabase } from "@/lib/supabaseClient";

export type PayrollContractType = "umowa_o_prace" | "umowa_cywilnoprawna" | "student";

export type PayrollContract = {
  id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_reason: string | null;
  klient_id: string;
  imie: string;
  nazwisko: string;
  typ_umowy: PayrollContractType;
  numer_umowy: string | null;
  data_poczatku: string | null;
  data_konca: string | null;
  umowa_na_czas_nieokreslony: boolean;
  badania_lekarskie_wazne_do: string | null;
  szkolenie_bhp_wazne_do: string | null;
  legitymacja_studencka_wazna_do: string | null;
};

export type PayrollContractPayload = {
  klient_id: string;
  imie: string;
  nazwisko: string;
  typ_umowy: PayrollContractType;
  numer_umowy?: string | null;
  data_poczatku?: string | null;
  data_konca?: string | null;
  umowa_na_czas_nieokreslony?: boolean;
  badania_lekarskie_wazne_do?: string | null;
  szkolenie_bhp_wazne_do?: string | null;
  legitymacja_studencka_wazna_do?: string | null;
};

export async function fetchPayrollContracts() {
  return supabase
    .from("kadry_umowy")
    .select("*")
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("nazwisko", { ascending: true })
    .order("imie", { ascending: true });
}

export async function createPayrollContract(payload: PayrollContractPayload) {
  return supabase
    .from("kadry_umowy")
    .insert(payload)
    .select("*")
    .single();
}

export async function updatePayrollContract(id: string, payload: PayrollContractPayload) {
  return supabase
    .from("kadry_umowy")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
}

export async function archivePayrollContract(id: string, reason = "manual") {
  return supabase
    .from("kadry_umowy")
    .update({ archived_at: new Date().toISOString(), archived_reason: reason })
    .eq("id", id)
    .select("*")
    .single();
}

export async function autoArchiveEndedPayrollContracts() {
  const today = new Date().toISOString().slice(0, 10);

  return supabase
    .from("kadry_umowy")
    .update({ archived_at: new Date().toISOString(), archived_reason: "ended" })
    .lt("data_konca", today)
    .is("archived_at", null)
    .eq("umowa_na_czas_nieokreslony", false)
    .select("*");
}
