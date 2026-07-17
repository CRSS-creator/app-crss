import { supabase } from "@/lib/supabaseClient";

export type PayrollContractType = "umowa_o_prace" | "umowa_cywilnoprawna" | "student";

export type PayrollContract = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  imie: string;
  nazwisko: string;
  typ_umowy: PayrollContractType;
  numer_umowy: string | null;
  data_poczatku: string | null;
  data_konca: string | null;
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
  badania_lekarskie_wazne_do?: string | null;
  szkolenie_bhp_wazne_do?: string | null;
  legitymacja_studencka_wazna_do?: string | null;
};

export async function fetchPayrollContracts() {
  return supabase
    .from("kadry_umowy")
    .select("*")
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
