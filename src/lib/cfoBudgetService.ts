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
