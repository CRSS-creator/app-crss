import { supabase } from "./supabaseClient";
import type { CfoCostItem } from "./cfoService";
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
  const [invoices, costs, obligations] = await Promise.all([
    readAll<CashflowInvoice>("faktury", "id,numer,typ,kategoria,status,okres,klient_id,kontrahent_nazwa,data_wystawienia,termin_platnosci,data_zaplaty,kwota_brutto,waluta"),
    readAll<CfoCostItem>("cfo_koszty", "*"),
    readAll<CfoObligation>("cfo_zobowiazania", "id,okres,typ,kwota,termin_platnosci,data_zaplaty"),
  ]);
  const error = invoices.error || costs.error || obligations.error;
  if (error) return { data: null, error };
  return { data: { invoices: (invoices.data || []).filter(i => i.typ === "sprzedaz" && i.kategoria !== "korekta" && !["szkic", "anulowana"].includes(i.status)),
    costs: costs.data || [], obligations: obligations.data || [] }, error: null };
}
export async function saveObligation(row: Omit<CfoObligation, "id"> & { id?: string }) {
  return supabase.from("cfo_zobowiazania").upsert(row, { onConflict: "okres,typ" })
    .select("id,okres,typ,kwota,termin_platnosci,data_zaplaty").single<CfoObligation>();
}
