import { manualCashflowAmount, type ManualCashflow } from "./cfoManualCashflow";
import type { ManualRevenue } from "./cfoManualRevenue";
import type { AnnualCostSchedule } from "./cfoAnnualCosts";
import type { CfoBankTransaction, CfoCostItem, CfoEmployeeCost, CfoInvoiceParent } from "./cfoService";

export const OBLIGATION_TYPES = [
  { value: "wynagrodzenia_netto", label: "Wynagrodzenia netto" },
  { value: "wynagrodzenie_prezesa_netto", label: "Wynagrodzenie netto Prezesa" },
  { value: "potracenia", label: "Potrącenia" },
  { value: "ppk", label: "PPK" },
  { value: "zus", label: "ZUS" },
  { value: "pit4", label: "PIT-4 od wynagrodzeń" },
  { value: "vat", label: "VAT" },
  { value: "cit", label: "CIT" },
] as const;
export type ObligationType = typeof OBLIGATION_TYPES[number]["value"];
export type CfoObligation = {
  id: string;
  okres: string;
  typ: ObligationType;
  kwota: number;
  termin_platnosci: string | null;
  data_zaplaty: string | null;
};
export type CashflowInvoice = CfoInvoiceParent & { waluta?: string; data_zaplaty?: string | null };
export type CashflowSnapshot = { invoices: CashflowInvoice[]; costs: CfoCostItem[]; obligations: CfoObligation[]; annualSchedules?: AnnualCostSchedule[]; manualRevenues?: ManualRevenue[]; manualFlows?: ManualCashflow[]; employeeCosts?: CfoEmployeeCost[] };
export const emptyCashflow = (): CashflowSnapshot => ({ invoices: [], costs: [], obligations: [], annualSchedules: [], manualRevenues: [], manualFlows: [], employeeCosts: [] });

// PK is an accounting journal entry, not a customer invoice.
export function isCustomerInvoice(invoice: CashflowInvoice) {
  return invoice.typ === "sprzedaz" && invoice.kategoria !== "korekta"
    && !["szkic", "anulowana"].includes(invoice.status)
    && !/^PK(?:\s|$)/i.test((invoice.numer || "").trim());
}
export function outstandingReceivables(invoices: CashflowInvoice[]) {
  return invoices.filter(invoice => isCustomerInvoice(invoice) && invoice.status !== "oplacona"
    && (!invoice.waluta || invoice.waluta === "PLN"))
    .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.kwota_brutto || 0)), 0);
}

export function businessDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());
}
export function shiftDateMonth(date: string, delta: number) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + delta, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
export function actualInvoicePayment(invoice: CashflowInvoice | CfoInvoiceParent) {
  // A paid status settles the receivable, but is not evidence of the date of receipt.
  return {
    paidAmount: invoice.status === "oplacona" ? Number(invoice.kwota_brutto || 0) : 0,
    paymentDate: invoice.status === "oplacona" ? invoice.data_zaplaty || null : null,
  };
}
export function actualCostPayment(cost: CfoCostItem) {
  if (cost.rozliczenie_wynagrodzen_okres) return { paidAmount: 0, paymentDate: null };
  return { paidAmount: cost.data_zaplaty ? Number(cost.kwota_brutto ?? cost.kwota_netto_cfo ?? 0) : 0,
    paymentDate: cost.data_zaplaty || null };
}

export function payrollSettlement(snapshot: CashflowSnapshot, period: string) {
  const costs = snapshot.costs.filter(c => !c.ignoruj && c.rozliczenie_wynagrodzen_okres?.slice(0, 7) === period);
  const payments = snapshot.obligations.filter(o => o.okres.slice(0, 7) === period && ["wynagrodzenia_netto", "potracenia", "ppk", "zus", "pit4"].includes(o.typ));
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const costTotal = round(costs.reduce((sum, c) => sum + Number(c.kwota_brutto ?? c.kwota_netto_cfo), 0));
  const employees = (snapshot.employeeCosts || []).filter(employee => employee.okres.slice(0, 7) === period);
  const employeeTotal = round(employees.reduce((sum, employee) => sum
    + Number(employee.podstawa || 0) + Number(employee.zus_pracodawcy || 0)
    + Number(employee.benefity || 0) + Number(employee.premie || 0) + Number(employee.szkolenia || 0), 0));
  const total = round(costTotal + employeeTotal);
  const paymentTotal = round(payments.reduce((sum, p) => sum + Number(p.kwota), 0));
  return { costs, costTotal, employees, employeeTotal, total, paymentTotal, difference: round(total - paymentTotal),
    missing: OBLIGATION_TYPES.filter(kind => ["wynagrodzenia_netto", "zus", "pit4"].includes(kind.value)).filter(kind => !payments.some(p => p.typ === kind.value)).map(kind => kind.label) };
}
export function paymentAverage(samples: { key: string; issueDate: string | null; paidDate: string | null }[], asOf: string) {
  const cutoff = shiftDateMonth(asOf, -6);
  const groups = new Map<string, number[]>();
  for (const sample of samples) {
    if (!sample.issueDate || !sample.paidDate || sample.issueDate < cutoff || sample.issueDate > asOf || sample.paidDate > asOf) continue;
    const days = (Date.parse(sample.paidDate + "T00:00:00Z") - Date.parse(sample.issueDate + "T00:00:00Z")) / 86400000;
    if (!Number.isFinite(days) || days < 0) continue;
    groups.set(sample.key, [...(groups.get(sample.key) || []), days]);
  }
  return new Map([...groups].map(([key, days]) => [key, Math.round(days.reduce((a, b) => a + b, 0) / days.length)]));
}

export function cashflowTransactions(snapshot: CashflowSnapshot): CfoBankTransaction[] {
  const result: CfoBankTransaction[] = [];
  const append = (id: string, date: string | null, amount: number, typ: CfoBankTransaction["typ"]) => {
    if (!date || date > businessDate()) return;
    result.push({ id, data_ksiegowania: date, kwota: amount, typ, ignoruj: false,
      rachunek_id: "", data_operacji: date, tytul: null, kontrahent: null, rachunek_kontrahenta: null,
      saldo_po: null, koszt_id: null, faktura_id: null, rozbita: false, dopasowanie_status: "dokument" });
  };
  snapshot.invoices.filter(i => !i.waluta || i.waluta === "PLN").forEach(i => {
    const payment = actualInvoicePayment(i);
    append("invoice:" + i.id, payment.paymentDate, payment.paidAmount, "faktura_sprzedazowa");
  });
  snapshot.costs.filter(c => !c.ignoruj).forEach(c => {
    const payment = actualCostPayment(c);
    append("cost:" + c.id, payment.paymentDate, -payment.paidAmount, "koszt");
  });
  snapshot.obligations.forEach(o => append("obligation:" + o.id, o.data_zaplaty, -Number(o.kwota), o.typ === "pit4" ? "pit" : o.typ === "wynagrodzenia_netto" || o.typ === "wynagrodzenie_prezesa_netto" ? "wynagrodzenie_netto" : o.typ === "potracenia" || o.typ === "ppk" ? "inne" : o.typ));
  (snapshot.manualRevenues || []).forEach(row => append("manual-revenue:" + row.id, row.data_wplywu, Number(row.kwota_brutto), "inne"));
  (snapshot.manualFlows || []).forEach(row => append("manual-flow:" + row.id, row.data_realizacji, manualCashflowAmount(row), "inne"));
  return result;
}

// Forecast each kind separately. Known months replace the recurring estimate.
export function obligationCashflow(period: string, rows: CfoObligation[], forecastStart: string, asOf: string) {
  const months = new Set<string>();
  for (let delta = -12; delta <= 1; delta++) months.add(shiftDateMonth(period + "-01", delta).slice(0, 7));
  let amount = 0;
  for (const kind of OBLIGATION_TYPES) {
    const known = rows.filter(r => r.typ === kind.value);
    for (const row of known) {
      const date = row.data_zaplaty || row.termin_platnosci;
      if (!date) continue;
      const effective = row.data_zaplaty ? date : date < asOf ? asOf : date;
      if (effective.slice(0, 7) === period) amount += Number(row.kwota);
    }
    for (const serviceMonth of months) {
      if (known.some(r => r.okres.slice(0, 7) === serviceMonth)) continue;
      const seed = known.filter(r => r.okres.slice(0, 7) < serviceMonth && r.okres <= asOf)
        .sort((a, b) => b.okres.localeCompare(a.okres))[0];
      if (!seed?.termin_platnosci) continue;
      const dueOffset = (Number(seed.termin_platnosci.slice(0, 4)) - Number(seed.okres.slice(0, 4))) * 12
        + Number(seed.termin_platnosci.slice(5, 7)) - Number(seed.okres.slice(5, 7));
      if (serviceMonth < shiftDateMonth(forecastStart + "-01", -Math.max(0, dueOffset)).slice(0, 7)) continue;
      const offset = (Number(serviceMonth.slice(0, 4)) - Number(seed.okres.slice(0, 4))) * 12 + Number(serviceMonth.slice(5, 7)) - Number(seed.okres.slice(5, 7));
      const date = shiftDateMonth(seed.termin_platnosci, offset);
      if ((date < asOf ? asOf : date).slice(0, 7) === period) amount += Number(seed.kwota);
    }
  }
  return amount;
}
