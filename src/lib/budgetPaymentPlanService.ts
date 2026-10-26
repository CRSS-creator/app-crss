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

/** One request/transaction for all months; no partially saved future assumption. */
export async function saveBudgetAssumptions(rows: BudgetPaymentPlanInput[]) {
  if(!rows.length)return {data:[],error:null};
  const payload=rows.map(row=>({...row,id:row.id||crypto.randomUUID(),updated_at:new Date().toISOString()}));
  return supabase.from("cfo_budget_payment_plans").upsert(payload,{onConflict:"id"}).select("*");
}
export async function resetBudgetAssumptions(rows: BudgetPaymentPlanInput[]) {
  if(!rows.length)return {data:[],error:null};
  // Updating complete rows retains the assumption for the other dimension.
  return saveBudgetAssumptions(rows);
}
