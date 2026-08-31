import { supabase } from "@/lib/supabaseClient";
import type { CfoCostCategory, CfoRevenueCategory } from "@/lib/cfoService";

export type CfoBudgetOverrideType = "przychod" | "koszt";
export type CfoBudgetOverrideRepeat = "jednorazowo" | "od_miesiaca";

export type CfoBudgetOverride = {
  id: string;
  okres: string;
  typ: CfoBudgetOverrideType;
  kategoria: CfoRevenueCategory | CfoCostCategory;
  podkategoria: string | null;
  opis: string;
  kwota_plan: number;
  kwota_cashflow: number;
  powtarzanie: CfoBudgetOverrideRepeat;
  aktywne: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CfoBudgetOverrideInput = Omit<CfoBudgetOverride, "id" | "created_at" | "updated_at"> & { id?: string };

export type CfoBudgetClientRevenue = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  status_klienta: string | null;
  aktywny: boolean | null;
  abonament: number | null;
  model_fakturowania: string | null;
  pierwszy_okres_rozliczeniowy: string | null;
  ostatni_okres_rozliczeniowy: string | null;
};

export type CfoBudgetCrmRevenue = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  etap: string | null;
  status: string | null;
  szacowany_mrr: number | null;
  data_wyslania_oferty: string | null;
  etap_started_at: string | null;
  created_at: string | null;
};

const BUDGET_OVERRIDE_SELECT = "id,okres,typ,kategoria,podkategoria,opis,kwota_plan,kwota_cashflow,powtarzanie,aktywne,created_at,updated_at";

export async function fetchCfoBudgetOverrides(from: string, to: string) {
  return supabase
    .from("cfo_budget_overrides")
    .select(BUDGET_OVERRIDE_SELECT)
    .eq("aktywne", true)
    .or(`and(powtarzanie.eq.jednorazowo,okres.gte.${from},okres.lte.${to}),and(powtarzanie.eq.od_miesiaca,okres.lte.${to})`)
    .order("okres", { ascending: true })
    .order("created_at", { ascending: true });
}

export async function upsertCfoBudgetOverride(row: CfoBudgetOverrideInput) {
  const { id, ...payload } = row;
  const query = id
    ? supabase.from("cfo_budget_overrides").update(payload).eq("id", id)
    : supabase.from("cfo_budget_overrides").insert(payload);

  return query.select(BUDGET_OVERRIDE_SELECT).single();
}

export async function deleteCfoBudgetOverride(id: string) {
  return supabase
    .from("cfo_budget_overrides")
    .update({ aktywne: false })
    .eq("id", id);
}

export async function fetchCfoBudgetClientRevenues() {
  return supabase
    .from("klienci")
    .select("id,nazwa,nip,status_klienta,aktywny,abonament,model_fakturowania,pierwszy_okres_rozliczeniowy,ostatni_okres_rozliczeniowy")
    .or("aktywny.eq.true,status_klienta.ilike.onboarding")
    .gt("abonament", 0)
    .order("nazwa", { ascending: true });
}

export async function fetchCfoBudgetCrmRevenues() {
  return supabase
    .from("crm_szanse_sprzedazy")
    .select("id,nazwa,nip,etap,status,szacowany_mrr,data_wyslania_oferty,etap_started_at,created_at")
    .gt("szacowany_mrr", 0)
    .in("status", ["otwarta", "wygrana"])
    .order("updated_at", { ascending: false });
}
