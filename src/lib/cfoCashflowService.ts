import type { ManualCashflow, ManualCashflowInput } from "./cfoManualCashflow";
import type { ManualRevenue, ManualRevenueInput } from "./cfoManualRevenue";
import type { AnnualCostSchedule, AnnualCostInput } from "./cfoAnnualCosts";
import { supabase } from "./supabaseClient";
import type { CfoCostItem, CfoEmployeeCost } from "./cfoService";
import type { CashflowInvoice, CashflowSnapshot, CfoObligation } from "./cfoCashflow";

async function readAll<T>(table: string, select: string) {
  const data: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from(table).select(select).order("id").range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    const page = (result.data || []) as unknown as T[];
    data.push(...page);
    if (page.length < 500) return { data, error: null };
  }
}
export async function fetchCashflowSnapshot(): Promise<{ data: CashflowSnapshot | null; error: { message: string } | null }> {
  const [invoices, costs, obligations, annualSchedules, manualRevenues, employeeCosts, manualFlows] = await Promise.all([
    readAll<CashflowInvoice>("faktury", "id,numer,typ,kategoria,status,okres,klient_id,kontrahent_nazwa,data_wystawienia,termin_platnosci,data_zaplaty,kwota_brutto,waluta"),
    readAll<CfoCostItem>("cfo_koszty", "*"),
    readAll<CfoObligation>("cfo_zobowiazania", "id,okres,typ,kwota,termin_platnosci,data_zaplaty"),
    readAll<AnnualCostSchedule>("cfo_harmonogramy_roczne", "*"),
    readAll<ManualRevenue>("cfo_przychody_reczne", "id,opis,zrodlo,rodzaj,okres,data_dokumentu,numer_dokumentu,kwota_netto,kwota_brutto,termin_wplywu,data_wplywu"),
    readAll<CfoEmployeeCost>("cfo_koszty_pracownikow", "*"),
    readAll<ManualCashflow>("cfo_przeplywy_reczne", "id,opis,kierunek,kwota,termin,data_realizacji"),
  ]);
  const error = invoices.error || costs.error || obligations.error || annualSchedules.error || manualRevenues.error || manualFlows.error || employeeCosts.error;
  if (error) return { data: null, error };
  return { data: { invoices: (invoices.data || []).filter(i => i.typ === "sprzedaz" && i.kategoria !== "korekta" && !["szkic", "anulowana"].includes(i.status)),
    costs: costs.data || [], obligations: obligations.data || [], annualSchedules: annualSchedules.data || [], manualRevenues: manualRevenues.data || [], manualFlows: manualFlows.data || [], employeeCosts: employeeCosts.data || [] }, error: null };
}
export async function saveObligation(row: Omit<CfoObligation, "id"> & { id?: string }) {
  return supabase.from("cfo_zobowiazania").upsert(row, { onConflict: "okres,typ" })
    .select("id,okres,typ,kwota,termin_platnosci,data_zaplaty").single<CfoObligation>();
}

export async function saveAnnualSchedule(row: AnnualCostInput, sourceCostId?: string) {
  return supabase.rpc("save_cfo_annual_schedule", { p_schedule: row, p_source_cost_id: sourceCostId || null });
}

export async function saveManualRevenue(row: ManualRevenueInput) {
  const { id, ...payload } = row;
  const query = id ? supabase.from("cfo_przychody_reczne").update(payload).eq("id", id) : supabase.from("cfo_przychody_reczne").insert(payload);
  return query.select("id").single();
}
export async function deleteManualRevenue(id: string) {
  return supabase.from("cfo_przychody_reczne").delete().eq("id", id).select("id").single();
}

export async function saveManualCashflow(row: ManualCashflowInput) {
  const { id, ...payload } = row;
  const query = id ? supabase.from("cfo_przeplywy_reczne").update(payload).eq("id", id)
    : supabase.from("cfo_przeplywy_reczne").insert(payload);
  return query.select("id").single();
}
export async function deleteManualCashflow(id: string) {
  return supabase.from("cfo_przeplywy_reczne").delete().eq("id", id).select("id").single();
}
