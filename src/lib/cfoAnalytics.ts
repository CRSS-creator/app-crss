import type { CfoBankAccount, CfoBankTransaction, CfoClientTimeEntry, CfoCostItem, CfoEmployeeCost } from "./cfoService";

export type ClientRevenue = { key: string; id: string | null; name: string; period: string; revenue: number; mrr: number };
export type ClientProfit = {
  key: string; id: string | null; name: string; revenue: number; mrr: number;
  hours: number; knownLaborCost: number; missingRateHours: number; overhead: number;
  laborCost: number | null; directResult: number | null; directMargin: number | null;
  fullResult: number | null; fullMargin: number | null; incomplete: boolean;
};
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const month = (s: string) => s.slice(0, 7);
export function workMonth(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" }).formatToParts(new Date(value));
  return parts.find(p => p.type === "year")!.value + "-" + parts.find(p => p.type === "month")!.value;
}
function months(from: string, to: string) {
  const result: string[] = [];
  let current = month(from);
  while (current <= month(to)) {
    result.push(current);
    const d = new Date(current + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + 1);
    current = d.toISOString().slice(0, 7);
  }
  return result;
}
export function payrollCost(e: CfoEmployeeCost) {
  return Number(e.podstawa || 0) + Number(e.zus_pracodawcy || 0) + Number(e.benefity || 0) + Number(e.premie || 0) + Number(e.szkolenia || 0);
}
export function capacityHours(e: CfoEmployeeCost) {
  const [year, m] = month(e.okres).split("-").map(Number);
  // Polish public holidays, including Easter Monday and Corpus Christi.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - c % 4) % 7;
  const correction = Math.floor((a + 11 * h + 22 * l) / 451);
  const easter = new Date(Date.UTC(year, Math.floor((h + l - 7 * correction + 114) / 31) - 1, (h + l - 7 * correction + 114) % 31 + 1));
  const holidays = new Set(["01-01", "01-06", "05-01", "05-03", "08-15", "11-01", "11-11", "12-25", "12-26", ...(year >= 2025 ? ["12-24"] : [])]);
  for (const offset of [1, 60]) {
    const d = new Date(easter); d.setUTCDate(d.getUTCDate() + offset);
    holidays.add(d.toISOString().slice(5, 10));
  }
  let days = 0;
  for (let d = new Date(Date.UTC(year, m - 1, 1)); d.getUTCMonth() === m - 1; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay(), holiday = holidays.has(d.toISOString().slice(5, 10));
    if (weekday !== 0 && weekday !== 6 && !holiday) days++;
    if (weekday === 6 && holiday) days--; // Statutory day off in the same monthly accounting period.
  }
  return Math.max(0, days * 8 * Number(e.wymiar_etatu || 0) - Number(e.nieobecnosci_godziny || 0) * 8 + Number(e.nadgodziny || 0));
}
function costInMonth(cost: CfoCostItem, period: string) {
  if (cost.ignoruj || month(cost.okres_start) > period || month(cost.okres_end) < period) return 0;
  return Number(cost.kwota_netto_cfo || 0) / months(cost.okres_start, cost.okres_end).length;
}

export function clientProfitability(from: string, to: string, revenues: ClientRevenue[], costs: CfoCostItem[], employees: CfoEmployeeCost[], entries: CfoClientTimeEntry[]) {
  const periods = months(from, to), inRange = (p: string) => periods.includes(month(p));
  const wages = new Map<string, CfoEmployeeCost[]>();
  for (const employee of employees) {
    if (!employee.osoba_id) continue;
    const key = employee.osoba_id + ":" + month(employee.okres);
    wages.set(key, [...(wages.get(key) || []), employee]);
  }
  const rate = (entry: CfoClientTimeEntry) => {
    const rows = wages.get(entry.osoba_id + ":" + workMonth(entry.started_at));
    if (!rows || rows.length !== 1 || !rows[0].w_capacity) return null;
    const hours = capacityHours(rows[0]), cost = payrollCost(rows[0]);
    return hours > 0 && cost > 0 ? cost / hours : null;
  };
  const byClient = new Map<string, ClientProfit>();
  const byClientMonth = new Map<string, { revenue: number; hours: number }>();
  const get = (key: string, id: string | null, name: string) => {
    if (!byClient.has(key)) byClient.set(key, { key, id, name, revenue: 0, mrr: 0, hours: 0, knownLaborCost: 0, missingRateHours: 0, overhead: 0, laborCost: null, directResult: null, directMargin: null, fullResult: null, fullMargin: null, incomplete: false });
    return byClient.get(key)!;
  };
  for (const r of revenues.filter(r => inRange(r.period))) {
    const row = get(r.key, r.id, r.name);
    row.revenue += r.revenue; row.mrr += r.mrr;
    const key = r.key + ":" + month(r.period), item = byClientMonth.get(key) || { revenue: 0, hours: 0 };
    item.revenue += r.revenue; byClientMonth.set(key, item);
  }
  let internalHours = 0, internalCost = 0, performedClientCost = 0, unknownPeriodHours = 0, unknownPeriodCost = 0, missingWorkedRateHours = 0;
  let serviceCost = 0;
  const missingRateMonths = new Set<string>();
  for (const entry of entries) {
    if (!entry.ended_at) continue;
    const hours = Number(entry.duration_seconds || 0) / 3600;
    if (hours <= 0) continue;
    const hourly = rate(entry), cost = hourly === null ? 0 : hours * hourly;
    const internal = !entry.klient_id || entry.czy_wewnetrzne === true;
    if (hourly === null && (inRange(workMonth(entry.started_at)) || (!internal && entry.miesiac_rozliczeniowy && inRange(entry.miesiac_rozliczeniowy)))) missingRateMonths.add(workMonth(entry.started_at));
    if (inRange(workMonth(entry.started_at))) {
      if (hourly === null) missingWorkedRateHours += hours;
      if (internal) { internalHours += hours; internalCost += cost; }
      else if (!entry.miesiac_rozliczeniowy) { unknownPeriodHours += hours; unknownPeriodCost += cost; }
      else performedClientCost += cost;
    }
    if (internal || !entry.miesiac_rozliczeniowy || !inRange(entry.miesiac_rozliczeniowy)) continue;
    const client = Array.isArray(entry.klienci) ? entry.klienci[0] : entry.klienci;
    const row = get(entry.klient_id!, entry.klient_id!, client?.nazwa || "Klient bez nazwy");
    row.hours += hours; row.knownLaborCost += cost; serviceCost += cost;
    if (hourly === null) row.missingRateHours += hours;
    const key = row.key + ":" + month(entry.miesiac_rozliczeniowy), item = byClientMonth.get(key) || { revenue: 0, hours: 0 };
    item.hours += hours; byClientMonth.set(key, item);
  }
  let overheadTotal = 0, unallocatedOverhead = 0;
  for (const period of periods) {
    const pool = money(costs.reduce((sum, c) => sum + costInMonth(c, period), 0));
    overheadTotal += pool;
    const shares = Array.from(byClient.values()).map(row => ({ row, revenue: Math.max(0, byClientMonth.get(row.key + ":" + period)?.revenue || 0) })).filter(x => x.revenue > 0).sort((a,b) => a.row.key.localeCompare(b.row.key));
    const total = shares.reduce((s, x) => s + x.revenue, 0);
    if (total <= 0) { unallocatedOverhead += pool; continue; }
    const cents = Math.round(Math.abs(pool) * 100), sign = pool < 0 ? -1 : 1;
    const allocated = shares.map(({row, revenue}) => {
      const exact = cents * revenue / total;
      return { row, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
    }).sort((a,b) => b.remainder - a.remainder || a.row.key.localeCompare(b.row.key));
    const spare = cents - allocated.reduce((s,x) => s + x.cents, 0);
    allocated.forEach((x,i) => { x.row.overhead += sign * (x.cents + (i < spare ? 1 : 0)) / 100; });
  }
  for (const row of byClient.values()) {
    row.revenue = money(row.revenue); row.mrr = money(row.mrr); row.overhead = money(row.overhead);
    row.incomplete = row.missingRateHours > 0 || periods.some(p => {
      const item = byClientMonth.get(row.key + ":" + p);
      return item && item.revenue > 0 && item.hours <= 0;
    });
    if (!row.incomplete) {
      row.laborCost = money(row.knownLaborCost);
      row.directResult = money(row.revenue - row.laborCost);
      row.fullResult = money(row.directResult - row.overhead);
      row.directMargin = row.revenue > 0 ? row.directResult / row.revenue : null;
      row.fullMargin = row.revenue > 0 ? row.fullResult / row.revenue : null;
    }
  }
  const payroll = money(employees.filter(e => inRange(e.okres)).reduce((s,e) => s + payrollCost(e), 0));
  const unallocatedPayroll = money(payroll - performedClientCost - internalCost - unknownPeriodCost);
  return {
    clients: Array.from(byClient.values()).sort((a,b) => b.revenue - a.revenue),
    payroll, internalHours, internalCost: money(internalCost), unknownPeriodHours, unknownPeriodCost: money(unknownPeriodCost),
    unallocatedPayroll, missingWorkedRateHours, overheadTotal: money(overheadTotal), unallocatedOverhead: money(unallocatedOverhead),
    timingDifference: money(serviceCost - performedClientCost),
    missingPayrollMonths: periods.filter(p => !employees.some(e => month(e.okres) === p)),
    missingRateMonths: Array.from(missingRateMonths).sort(),
    revenueWithoutFullCost: money(Array.from(byClient.values()).filter(r => r.incomplete).reduce((s,r) => s+r.revenue,0)),
  };
}

export function closingCash(accounts: CfoBankAccount[], transactions: CfoBankTransaction[], to: string) {
  const rows = accounts.map(account => {
    const eligible = transactions.filter(t => t.rachunek_id === account.id && t.data_ksiegowania <= to);
    const lastDate = eligible.reduce((s,t) => t.data_ksiegowania > s ? t.data_ksiegowania : s, "");
    const day = eligible.filter(t => t.data_ksiegowania === lastDate).sort((a,b) => Number(a.lp) - Number(b.lp));
    let last: CfoBankTransaction | undefined;
    const complete = day.every(t => t.saldo_po !== null && Number.isFinite(Number(t.saldo_po)));
    if (complete && day.length === 1) last = day[0];
    if (complete && day.length > 1 && day.every(t => t.lp !== null && t.lp !== undefined) && new Set(day.map(t=>t.lp)).size === day.length) {
      const chained = (list: CfoBankTransaction[]) => list.slice(1).every((t,i) => Math.abs(Math.round(Number(t.saldo_po)*100) - Math.round((Number(list[i].saldo_po)+Number(t.kwota))*100)) <= 1);
      if (chained(day)) last = day[day.length-1];
      else if (chained([...day].reverse())) last = day[0];
    }
    const stale = !!lastDate && month(lastDate) < month(to);
    return { account, date: lastDate || null, balance: last ? Number(last.saldo_po) : null, stale, unknownOrder: day.length > 0 && !last };
  });
  const availableRows = rows.filter(r => r.account.rodzaj_srodkow === "operacyjne" && r.account.waluta === "PLN" && !r.stale && r.balance !== null);
  const vatRows = rows.filter(r => r.account.rodzaj_srodkow === "vat" && r.account.waluta === "PLN" && !r.stale && r.balance !== null);
  return { rows, available: money(availableRows.reduce((s,r)=>s+r.balance!,0)), vat: money(vatRows.reduce((s,r)=>s+r.balance!,0)),
    complete: rows.length > 0 && rows.every(r => r.account.rodzaj_srodkow && r.account.rodzaj_srodkow !== "nieokreslone" && r.account.waluta === "PLN" && r.balance !== null && !r.stale),
    availableAccounts: availableRows.length, vatAccounts: vatRows.length };
}

