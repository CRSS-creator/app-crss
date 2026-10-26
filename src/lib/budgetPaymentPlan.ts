import type { CfoCostCategory, CfoCostItem } from "./cfoService";
import { actualCostPayment, shiftDateMonth, type CashflowSnapshot } from "./cfoCashflow";

export type BudgetPaymentPlan = {
  id: string;
  nazwa: string;
  rodzaj: "monthly" | "installments" | "once" | "target";
  kategoria: CfoCostCategory;
  podkategoria: string;
  kwota_brutto: number;
  kwota_netto: number | null;
  pierwszy_miesiac: string;
  ostatni_miesiac: string | null;
  liczba_rat: number | null;
  koszt_id: string | null;
  aktywny: boolean;
  created_at?: string;
  cel_platnosci?: boolean;
  cel_wyniku_netto?: number | null;
};
export type BudgetPaymentPlanInput = Omit<BudgetPaymentPlan, "id" | "created_at"> & { id?: string };
export const EMPTY_BUDGET_SUBCATEGORY = "Bez podkategorii";
export function planKey(category: string, subcategory: string | null) {
  return JSON.stringify([category, subcategory || EMPTY_BUDGET_SUBCATEGORY]);
}
export function planApplies(plan: BudgetPaymentPlan, month: string) {
  if (!plan.aktywny || month < plan.pierwszy_miesiac.slice(0, 7)) return false;
  if (plan.rodzaj === "once" || plan.rodzaj === "target") return month === plan.pierwszy_miesiac.slice(0, 7);
  if (plan.ostatni_miesiac && month > plan.ostatni_miesiac.slice(0, 7)) return false;
  return plan.rodzaj !== "installments" || month < shiftDateMonth(plan.pierwszy_miesiac, Number(plan.liczba_rat)).slice(0, 7);
}
function positive(value: number | null | undefined) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
export function unresolvedBudgetCosts(snapshot: CashflowSnapshot, startMonth: string, plans: BudgetPaymentPlan[]) {
  const linked = new Set(plans.filter(p => p.aktywny && p.koszt_id).map(p => p.koszt_id));
  return snapshot.costs.filter(c => !c.ignoruj && !c.rozliczenie_wynagrodzen_okres && !c.data_zaplaty
    && !linked.has(c.id) && (!c.termin_platnosci || c.termin_platnosci < startMonth + "-01"));
}
export type BudgetPaymentGroup = {
  key: CfoCostCategory; label: string; planned: number; actual: number; diff: number;
  children: { key: string; label: string; planned: number; actual: number; diff: number; source: string }[];
};
export function explicitPaymentMonth(month: string, startMonth: string, snapshot: CashflowSnapshot,
  plans: BudgetPaymentPlan[], categories: { value: CfoCostCategory; label: string }[]) {
  const rows = new Map<string, { category: CfoCostCategory; subcategory: string; scheduled: number; known: number; actual: number; target: number | null; hasSchedule: boolean; sources: Set<string> }>();
  const get = (category: CfoCostCategory, subcategory: string | null) => {
    const key = planKey(category, subcategory);
    if (!rows.has(key)) rows.set(key, { category, subcategory: subcategory || EMPTY_BUDGET_SUBCATEGORY, scheduled: 0, known: 0, actual: 0, target: null, hasSchedule: false, sources: new Set() });
    return rows.get(key)!;
  };
  const active = plans.filter(p => p.aktywny);
  const linked = new Set(active.filter(p => p.koszt_id).map(p => p.koszt_id));
  for (const p of active.filter(p => planApplies(p, month))) {
    const row = get(p.kategoria, p.podkategoria);
    if (p.rodzaj === "target") {
      if (p.cel_platnosci === false) continue;
      row.target = positive(p.kwota_brutto);
    }
    else { row.scheduled += positive(p.kwota_brutto); row.hasSchedule = true; }
    row.sources.add(p.rodzaj === "target" ? "Kwota docelowa" : p.nazwa);
  }
  for (const c of snapshot.costs.filter(c => !c.ignoruj && !c.rozliczenie_wynagrodzen_okres)) {
    const row = get(c.kategoria, c.podkategoria);
    const payment = actualCostPayment(c);
    // A linked financed purchase is replaced by its schedule, never another full cash payment.
    if (linked.has(c.id)) continue;
    if (payment.paymentDate?.slice(0, 7) === month) {
      row.actual += positive(payment.paidAmount);
      row.known += positive(payment.paidAmount);
      row.sources.add("Zapisana zapłata");
    } else if (!payment.paymentDate && c.termin_platnosci && c.termin_platnosci >= startMonth + "-01" && c.termin_platnosci.slice(0, 7) === month) {
      row.known += positive(c.kwota_brutto ?? c.kwota_netto_cfo);
      row.sources.add("Termin faktury");
    }
  }
  for (const s of (snapshot.annualSchedules || []).filter(s => s.aktywny)) {
    for (let cycle = 0; cycle <= Math.max(0, Number(month.slice(0, 4)) - Number(s.pierwszy_okres.slice(0, 4)) + 1); cycle++) {
      const start = shiftDateMonth(s.pierwszy_okres, cycle * 12);
      const due = shiftDateMonth(s.termin_platnosci, cycle * 12);
      if (due >= startMonth + "-01" && due.slice(0, 7) === month && !snapshot.costs.some(c => !c.ignoruj && c.harmonogram_id === s.id && c.okres_start === start)) {
        const row = get(s.kategoria, s.podkategoria); row.known += positive(s.kwota_brutto); row.sources.add("Harmonogram roczny");
      }
    }
  }
  const obligationLabels: Record<string, string> = {
    wynagrodzenia_netto: "Wynagrodzenia netto", wynagrodzenie_prezesa_netto: "Wynagrodzenie netto Prezesa",
    potracenia: "Potrącenia", ppk: "PPK", zus: "ZUS", pit4: "PIT-4 od wynagrodzeń", vat: "VAT", cit: "CIT",
  };
  for (const o of snapshot.obligations) {
    const date = o.data_zaplaty || o.termin_platnosci;
    if (!date || date.slice(0, 7) !== month) continue;
    const row = get(o.typ === "vat" || o.typ === "cit" ? "administracja_ogolne" : "koszty_zespolu", obligationLabels[o.typ] || o.typ);
    row.known += positive(o.kwota);
    if (o.data_zaplaty) row.actual += positive(o.kwota);
    row.sources.add(o.data_zaplaty ? "Zapisana zapłata" : "Termin zobowiązania CFO");
  }
  const groups: BudgetPaymentGroup[] = categories.map(c => {
    const children = [...rows.values()].filter(r => r.category === c.value).map(r => {
      // An absolute budget cannot erase known actual payments or explicitly dated commitments.
      const planned = r.target ?? (r.hasSchedule ? r.scheduled : r.known);
      return { key: r.subcategory, label: r.subcategory, planned, actual: r.actual, diff: planned - r.actual,
        source: [...r.sources].join(" • ") + (r.target !== null && r.known > r.target ? " • Zapisane płatności przekraczają cel" : "") };
    }).filter(r => r.planned > 0 || r.actual > 0 || r.source);
    const planned = children.reduce((s,r) => s+r.planned,0), actual = children.reduce((s,r) => s+r.actual,0);
    return { key: c.value, label: c.label, planned, actual, diff: planned-actual, children };
  }).filter(g => g.children.length);
  return { groups, total: [...rows.values()].reduce((sum,row)=>sum+Math.max(row.known,row.target ?? row.scheduled),0) };
}
export function plannedNetAmounts(month: string, plans: BudgetPaymentPlan[]) {
  const result = new Map<string, { category: CfoCostCategory; subcategory: string; amount: number }>();
  for (const p of plans.filter(p => planApplies(p, month) && p.rodzaj !== "target" && p.rodzaj !== "installments" && p.kwota_netto !== null)) {
    const key = planKey(p.kategoria, p.podkategoria);
    const row = result.get(key) || { category: p.kategoria, subcategory: p.podkategoria || EMPTY_BUDGET_SUBCATEGORY, amount: 0 };
    row.amount += positive(p.kwota_netto); result.set(key, row);
  }
  return [...result.values()];
}
export function historyPaymentSuggestions(costs: CfoCostItem[], startMonth: string) {
  const from = shiftDateMonth(startMonth + "-01", -3);
  const grouped = new Map<string, { category: CfoCostCategory; subcategory: string; months: Map<string, { gross: number; net: number }> }>();
  for (const c of costs.filter(c => !c.ignoruj && !c.harmonogram_id && !c.rozliczenie_wynagrodzen_okres && c.czestotliwosc === "miesieczna" && c.okres_start >= from && c.okres_start < startMonth + "-01" && !/środków trwałych|srodkow trwalych/i.test(c.opis || ""))) {
    const key = planKey(c.kategoria, c.podkategoria), row = grouped.get(key) || { category: c.kategoria, subcategory: c.podkategoria || EMPTY_BUDGET_SUBCATEGORY, months: new Map() };
    const month = c.okres_start.slice(0,7), value = row.months.get(month) || { gross: 0, net: 0 };
    value.gross += positive(c.kwota_brutto ?? c.kwota_netto_cfo); value.net += positive(c.kwota_netto_cfo);
    row.months.set(month,value); grouped.set(key,row);
  }
  return [...grouped.values()].filter(r=>r.months.size>=2).map(r=>({ category:r.category, subcategory:r.subcategory,
    gross:[...r.months.values()].reduce((s,v)=>s+v.gross,0)/r.months.size, net:[...r.months.values()].reduce((s,v)=>s+v.net,0)/r.months.size }));
}

export function payrollPlanSuggestions(snapshot: CashflowSnapshot, startMonth: string) {
  const names: Record<string,string> = { wynagrodzenia_netto:"Wynagrodzenia netto", wynagrodzenie_prezesa_netto:"Wynagrodzenie netto Prezesa", potracenia:"Potrącenia", ppk:"PPK", zus:"ZUS", pit4:"PIT-4 od wynagrodzeń", vat:"VAT", cit:"CIT" };
  const latest = new Map<string, typeof snapshot.obligations[number]>();
  for (const o of snapshot.obligations.filter(o=>o.okres<startMonth+"-01")) {
    const previous=latest.get(o.typ);
    if(!previous || previous.okres<o.okres)latest.set(o.typ,o);
  }
  const suggestions: {category:CfoCostCategory;subcategory:string;gross:number;net:number|null}[] = [...latest.values()].filter(o=>Number(o.kwota)>0).map(o=>({
    category:o.typ==="vat"||o.typ==="cit"?"administracja_ogolne":"koszty_zespolu",
    subcategory:names[o.typ]||o.typ,gross:Number(o.kwota),net:null,
  }));
  const employees=(snapshot.employeeCosts||[]).filter(e=>e.okres<startMonth+"-01");
  const month=employees.map(e=>e.okres.slice(0,7)).sort().at(-1);
  const byKey=new Map<string,{category:CfoCostCategory;subcategory:string;gross:number;net:number|null}>();
  for(const e of employees.filter(e=>e.okres.slice(0,7)===month)) {
    const category:CfoCostCategory=e.zespol==="ksiegowy"?"koszty_zespolu":"marketing_sprzedaz";
    const rows=e.zespol==="ksiegowy"
      ? [["Wynagrodzenie podstawowe",e.podstawa],["ZUS pracodawcy",e.zus_pracodawcy],["Benefity",e.benefity],["Premie",e.premie],["Szkolenia",e.szkolenia]] as const
      : [[e.zespol==="marketingowy"?"Koszt zespołu marketingowego":"Koszt zespołu sprzedażowego",
          Number(e.podstawa||0)+Number(e.zus_pracodawcy||0)+Number(e.benefity||0)+Number(e.premie||0)+Number(e.szkolenia||0)]] as const;
    for(const [subcategory,amount] of rows) {
      const key=planKey(category,subcategory),row=byKey.get(key)||{category,subcategory,gross:0,net:0};
      row.net=Number(row.net||0)+positive(amount);byKey.set(key,row);
    }
  }
  return [...suggestions,...[...byKey.values()].filter(r=>Number(r.net)>0)];
}
