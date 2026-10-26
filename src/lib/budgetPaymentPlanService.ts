import { supabase } from "./supabaseClient";
import type { BudgetPaymentPlan, BudgetPaymentPlanInput } from "./budgetPaymentPlan";

export async function fetchBudgetPaymentPlans() {
  const rows: BudgetPaymentPlan[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from("cfo_budget_payment_plans").select("*").order("id").range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data as BudgetPaymentPlan[]);
    if (result.data.length < 500) return { data: rows, error: null };
  }
}
export async function saveBudgetPaymentPlan(input: BudgetPaymentPlanInput) {
  const { id, ...values } = input;
  const payload = { ...values, updated_at: new Date().toISOString() };
  const query = id
    ? supabase.from("cfo_budget_payment_plans").update(payload).eq("id", id)
    : supabase.from("cfo_budget_payment_plans").insert(payload);
  return query.select("*").single();
}
export async function archiveBudgetPaymentPlan(id: string) {
  return supabase.from("cfo_budget_payment_plans").update({ aktywny: false, updated_at: new Date().toISOString() }).eq("id", id).select("id").single();
}
