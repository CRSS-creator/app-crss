"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Banknote, CalendarDays, Plus, RefreshCw, Save, Trash2, TrendingUp, WalletCards } from "lucide-react";

import { colors, radius, shadow } from "@/app/design";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import AppSelect from "@/components/AppSelect";
import {
  fetchCfoBankTransactionsRange,
  fetchCfoCostsRange,
  fetchCfoEmployeeCostsRange,
  fetchCfoRevenueLinesRange,
  type CfoBankTransaction,
  type CfoCostCategory,
  type CfoCostItem,
  type CfoEmployeeCost,
  type CfoInvoiceLine,
  type CfoRevenueCategory,
} from "@/lib/cfoService";
import {
  deleteCfoBudgetOverride,
  fetchCfoBudgetClientRevenues,
  fetchCfoBudgetCrmRevenues,
  fetchCfoBudgetOverrides,
  upsertCfoBudgetOverride,
  type CfoBudgetClientRevenue,
  type CfoBudgetCrmRevenue,
  type CfoBudgetOverride,
  type CfoBudgetOverrideRepeat,
  type CfoBudgetOverrideType,
} from "@/lib/cfoBudgetService";

type BudgetDraft = {
  okres: string;
  typ: CfoBudgetOverrideType;
  kategoria: string;
  podkategoria: string;
  opis: string;
  kwota_plan: string;
  kwota_cashflow: string;
  powtarzanie: CfoBudgetOverrideRepeat;
};

type BudgetMonth = {
  period: string;
  plannedRevenue: number;
  actualRevenue: number;
  plannedCosts: number;
  actualCosts: number;
  plannedResult: number;
  actualResult: number;
  plannedCashFlow: number;
  actualCashFlow: number;
  closingCash: number;
  overrides: CfoBudgetOverride[];
  revenueCategories: BudgetCategoryRow[];
  costCategories: BudgetCategoryRow[];
};

type BudgetCategoryRow = {
  key: string;
  label: string;
  planned: number;
  actual: number;
  diff: number;
};

const REVENUE_OPTIONS: { value: CfoRevenueCategory; label: string }[] = [
  { value: "abonamenty", label: "Abonamenty / MRR" },
  { value: "kadry_place", label: "Kadry i płace" },
  { value: "uslugi_dodatkowe", label: "Usługi dodatkowe" },
  { value: "wdrozenia", label: "Wdrożenia" },
  { value: "pozostale", label: "Pozostałe" },
];

const COST_OPTIONS: { value: CfoCostCategory; label: string }[] = [
  { value: "koszty_zespolu", label: "Koszty zespołu" },
  { value: "lokal_infrastruktura", label: "Lokal i infrastruktura" },
  { value: "systemy_technologia", label: "Systemy i technologia" },
  { value: "marketing_sprzedaz", label: "Marketing i sprzedaż" },
  { value: "administracja_ogolne", label: "Administracja i ogólne" },
  { value: "zarzad_wlasciciel", label: "Zarząd / właściciel" },
  { value: "jednorazowe_nadzwyczajne", label: "Jednorazowe i nadzwyczajne" },
];

const TYPE_OPTIONS: { value: CfoBudgetOverrideType; label: string }[] = [
  { value: "koszt", label: "Koszt" },
  { value: "przychod", label: "Przychód" },
];

const REPEAT_OPTIONS: { value: CfoBudgetOverrideRepeat; label: string }[] = [
  { value: "od_miesiaca", label: "Od miesiąca" },
  { value: "jednorazowo", label: "Jednorazowo" },
];

const MONTH_LABELS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const DEFAULT_HORIZON = 12;

export default function BudgetPage() {
  return (
    <AppLayout activePage="budzet">
      <AccessGuard moduleName="budzet">
        <BudgetContent />
      </AccessGuard>
    </AppLayout>
  );
}

function BudgetContent() {
  const [startMonth, setStartMonth] = useState(currentForecastStartInput());
  const [selectedMonth, setSelectedMonth] = useState(currentForecastStartInput());
  const [openingCash, setOpeningCash] = useState("0");
  const [safetyThreshold, setSafetyThreshold] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revenueLines, setRevenueLines] = useState<CfoInvoiceLine[]>([]);
  const [costs, setCosts] = useState<CfoCostItem[]>([]);
  const [employeeCosts, setEmployeeCosts] = useState<CfoEmployeeCost[]>([]);
  const [bankTransactions, setBankTransactions] = useState<CfoBankTransaction[]>([]);
  const [overrides, setOverrides] = useState<CfoBudgetOverride[]>([]);
  const [clientRevenues, setClientRevenues] = useState<CfoBudgetClientRevenue[]>([]);
  const [crmRevenues, setCrmRevenues] = useState<CfoBudgetCrmRevenue[]>([]);
  const [draft, setDraft] = useState<BudgetDraft>(() => emptyDraft(currentForecastStartInput()));

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMonth]);

  const budget = useMemo(
    () => buildBudgetMonths(startMonth, DEFAULT_HORIZON, revenueLines, costs, employeeCosts, bankTransactions, overrides, clientRevenues, crmRevenues, parsePolishNumber(openingCash)),
    [startMonth, revenueLines, costs, employeeCosts, bankTransactions, overrides, clientRevenues, crmRevenues, openingCash],
  );

  const selected = budget.find((month) => month.period === selectedMonth) || budget[0];
  const firstShortfall = budget.find((month) => month.closingCash < parsePolishNumber(safetyThreshold));

  async function loadData() {
    setLoading(true);
    const historyStart = shiftMonth(startMonth, -3);
    const forecastEnd = shiftMonth(startMonth, DEFAULT_HORIZON - 1);
    const [revenueResult, costsResult, employeeResult, bankResult, overridesResult, clientRevenueResult, crmRevenueResult] = await Promise.all([
      fetchCfoRevenueLinesRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCfoCostsRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCfoEmployeeCostsRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCfoBankTransactionsRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCfoBudgetOverrides(monthToDate(startMonth), monthEndDate(forecastEnd)),
      fetchCfoBudgetClientRevenues(),
      fetchCfoBudgetCrmRevenues(),
    ]);

    if (revenueResult.error) console.error("Błąd pobierania przychodów do budżetu:", revenueResult.error);
    if (costsResult.error) console.error("Błąd pobierania kosztów do budżetu:", costsResult.error);
    if (employeeResult.error) console.error("Błąd pobierania kosztów zespołu do budżetu:", employeeResult.error);
    if (bankResult.error) console.error("Błąd pobierania cash flow do budżetu:", bankResult.error);
    if (overridesResult.error) console.error("Błąd pobierania korekt budżetu:", overridesResult.error);
    if (clientRevenueResult.error) console.error("Błąd pobierania abonamentów klientów do budżetu:", clientRevenueResult.error);
    if (crmRevenueResult.error) console.error("Błąd pobierania CRM do budżetu:", crmRevenueResult.error);

    setRevenueLines((revenueResult.data || []) as unknown as CfoInvoiceLine[]);
    setCosts((costsResult.data || []) as CfoCostItem[]);
    setEmployeeCosts((employeeResult.data || []) as CfoEmployeeCost[]);
    setBankTransactions((bankResult.data || []) as CfoBankTransaction[]);
    setOverrides((overridesResult.data || []) as CfoBudgetOverride[]);
    setClientRevenues((clientRevenueResult.data || []) as CfoBudgetClientRevenue[]);
    setCrmRevenues((crmRevenueResult.data || []) as CfoBudgetCrmRevenue[]);
    setLoading(false);
  }

  function changeStartMonth(value: string) {
    setStartMonth(value);
    setSelectedMonth(value);
    setDraft((current) => ({ ...current, okres: monthToDate(value) }));
  }

  async function saveOverride() {
    if (!draft.opis.trim()) return alert("Podaj opis korekty.");
    if (!draft.kategoria) return alert("Wybierz kategorię CFO.");

    setSaving(true);
    const result = await upsertCfoBudgetOverride({
      okres: draft.okres,
      typ: draft.typ,
      kategoria: draft.kategoria as CfoRevenueCategory | CfoCostCategory,
      podkategoria: draft.podkategoria.trim() || null,
      opis: draft.opis.trim(),
      kwota_plan: parsePolishNumber(draft.kwota_plan),
      kwota_cashflow: parsePolishNumber(draft.kwota_cashflow || draft.kwota_plan),
      powtarzanie: draft.powtarzanie,
      aktywne: true,
    });
    setSaving(false);

    if (result.error) {
      console.error(result.error);
      return alert("Nie udało się zapisać korekty budżetu.");
    }

    setDraft(emptyDraft(selectedMonth));
    await loadData();
  }

  async function removeOverride(id: string) {
    if (!window.confirm("Usunąć tę korektę budżetu?")) return;
    setSaving(true);
    const result = await deleteCfoBudgetOverride(id);
    setSaving(false);
    if (result.error) return alert("Nie udało się usunąć korekty.");
    await loadData();
  }

  return (
    <main style={contentStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł zarządczy</p>
          <h1 style={titleStyle}>Budżet i cash flow</h1>
        </div>
        <div style={headerActionsStyle}>
          <MonthField value={startMonth} onChange={changeStartMonth} />
          <button type="button" style={secondaryButtonStyle} onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={17} />
            Odśwież
          </button>
        </div>
      </header>

      <section style={metricGridStyle}>
        <Metric label="Planowany wynik" value={formatMoney(sum(budget.map((month) => month.plannedResult)))} tone={sum(budget.map((month) => month.plannedResult)) >= 0 ? "good" : "bad"} />
        <Metric label="Planowany cash flow" value={formatMoney(sum(budget.map((month) => month.plannedCashFlow)))} tone={sum(budget.map((month) => month.plannedCashFlow)) >= 0 ? "good" : "bad"} />
        <Metric label="Najniższy stan gotówki" value={formatMoney(Math.min(...budget.map((month) => month.closingCash), parsePolishNumber(openingCash)))} tone={firstShortfall ? "bad" : "good"} />
        <Metric label="Pierwszy alarm" value={firstShortfall ? formatMonthField(firstShortfall.period) : "Brak"} tone={firstShortfall ? "bad" : "good"} />
      </section>

      <section style={controlsPanelStyle}>
        <label style={fieldStyle}>
          <span>Gotówka na start</span>
          <input style={inputStyle} value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} />
        </label>
        <label style={fieldStyle}>
          <span>Próg bezpieczeństwa</span>
          <input style={inputStyle} value={safetyThreshold} onChange={(event) => setSafetyThreshold(event.target.value)} />
        </label>
      </section>

      {loading ? <section style={panelStyle}>Ładowanie budżetu...</section> : null}

      {!loading ? (
        <section style={sectionGridStyle}>
          <article style={widePanelStyle}>
            <div style={panelHeaderStyle}>
              <WalletCards size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Plan kontra wykonanie</h2>
            </div>
            <div style={tableWrapperStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>Miesiąc</Th>
                    <Th align="right">Plan przych.</Th>
                    <Th align="right">Wykonanie</Th>
                    <Th align="right">Różnica</Th>
                    <Th align="right">Plan kosztów</Th>
                    <Th align="right">Wykonanie</Th>
                    <Th align="right">Różnica</Th>
                    <Th align="right">Wynik plan</Th>
                    <Th align="right">Cash flow</Th>
                    <Th align="right">Gotówka</Th>
                  </tr>
                </thead>
                <tbody>
                  {budget.map((month) => (
                    <tr key={month.period} style={selectedMonth === month.period ? selectedRowStyle : undefined} onClick={() => setSelectedMonth(month.period)}>
                      <Td><strong>{formatMonthField(month.period)}</strong></Td>
                      <Td align="right">{formatMoney(month.plannedRevenue)}</Td>
                      <Td align="right">{formatMoney(month.actualRevenue)}</Td>
                      <Td align="right"><Diff value={month.actualRevenue - month.plannedRevenue} /></Td>
                      <Td align="right">{formatMoney(month.plannedCosts)}</Td>
                      <Td align="right">{formatMoney(month.actualCosts)}</Td>
                      <Td align="right"><Diff value={month.plannedCosts - month.actualCosts} /></Td>
                      <Td align="right"><strong>{formatMoney(month.plannedResult)}</strong></Td>
                      <Td align="right"><Diff value={month.plannedCashFlow} plain /></Td>
                      <Td align="right"><strong style={month.closingCash < parsePolishNumber(safetyThreshold) ? dangerInlineStyle : undefined}>{formatMoney(month.closingCash)}</strong></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article style={panelStyle}>
            <div style={panelHeaderStyle}>
              <TrendingUp size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Kategorie przychodów</h2>
            </div>
            <CategoryTable rows={selected?.revenueCategories || []} />
          </article>

          <article style={panelStyle}>
            <div style={panelHeaderStyle}>
              <Banknote size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Kategorie kosztów</h2>
            </div>
            <CategoryTable rows={selected?.costCategories || []} reverseDiff />
          </article>

          <article style={widePanelStyle}>
            <div style={panelHeaderStyle}>
              <Plus size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Korekty planu</h2>
              <span style={badgeStyle}>{formatMonthField(selectedMonth)}</span>
            </div>
            <div style={draftGridStyle}>
              <Field label="Typ">
                <AppSelect value={draft.typ} options={TYPE_OPTIONS} onChange={(value) => setDraft((current) => ({ ...current, typ: value as CfoBudgetOverrideType, kategoria: "" }))} style={selectStyle} />
              </Field>
              <Field label="Kategoria CFO">
                <AppSelect value={draft.kategoria} options={[{ value: "", label: "Wybierz kategorię" }, ...(draft.typ === "przychod" ? REVENUE_OPTIONS : COST_OPTIONS)]} onChange={(value) => setDraft((current) => ({ ...current, kategoria: value }))} style={selectStyle} />
              </Field>
              <Field label="Podkategoria">
                <input style={inputStyle} value={draft.podkategoria} onChange={(event) => setDraft((current) => ({ ...current, podkategoria: event.target.value }))} />
              </Field>
              <Field label="Od miesiąca">
                <MonthField value={draft.okres.slice(0, 7)} onChange={(value) => setDraft((current) => ({ ...current, okres: monthToDate(value) }))} compact />
              </Field>
              <Field label="Kwota planu">
                <input style={inputStyle} value={draft.kwota_plan} onChange={(event) => setDraft((current) => ({ ...current, kwota_plan: event.target.value }))} />
              </Field>
              <Field label="Kwota cash flow">
                <input style={inputStyle} value={draft.kwota_cashflow} onChange={(event) => setDraft((current) => ({ ...current, kwota_cashflow: event.target.value }))} />
              </Field>
              <Field label="Powtarzanie">
                <AppSelect value={draft.powtarzanie} options={REPEAT_OPTIONS} onChange={(value) => setDraft((current) => ({ ...current, powtarzanie: value as CfoBudgetOverrideRepeat }))} style={selectStyle} />
              </Field>
              <Field label="Opis">
                <input style={inputStyle} value={draft.opis} onChange={(event) => setDraft((current) => ({ ...current, opis: event.target.value }))} placeholder="np. obniżka kosztu od listopada" />
              </Field>
              <button type="button" style={primaryButtonStyle} onClick={saveOverride} disabled={saving}>
                <Save size={17} />
                Zapisz korektę
              </button>
            </div>

            <div style={overrideListStyle}>
              {(selected?.overrides || []).length === 0 ? <div style={emptyStyle}>Brak korekt dla wybranego miesiąca.</div> : selected?.overrides.map((override) => (
                <div key={override.id} style={overrideRowStyle}>
                  <div>
                    <strong>{override.opis}</strong>
                    <small style={smallStyle}>
                      {override.typ === "przychod" ? "Przychód" : "Koszt"} · {categoryLabel(override.typ, override.kategoria)} · {override.powtarzanie === "od_miesiaca" ? "od miesiąca" : "jednorazowo"}
                    </small>
                  </div>
                  <strong>{formatMoney(override.kwota_plan)}</strong>
                  <button type="button" style={iconDangerButtonStyle} onClick={() => void removeOverride(override.id)} aria-label="Usuń korektę">
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <article style={metricStyle}>
      <span>{label}</span>
      <strong style={tone === "bad" ? badMetricValueStyle : tone === "good" ? goodMetricValueStyle : metricValueStyle}>{value}</strong>
    </article>
  );
}

function CategoryTable({ rows, reverseDiff = false }: { rows: BudgetCategoryRow[]; reverseDiff?: boolean }) {
  return (
    <div style={tableWrapperStyle}>
      <table style={tableStyle}>
        <thead><tr><Th>Kategoria</Th><Th align="right">Plan</Th><Th align="right">Wykonanie</Th><Th align="right">Różnica</Th></tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td style={tdStyle} colSpan={4}>Brak danych.</td></tr> : rows.map((row) => (
            <tr key={row.key}>
              <Td>{row.label}</Td>
              <Td align="right">{formatMoney(row.planned)}</Td>
              <Td align="right">{formatMoney(row.actual)}</Td>
              <Td align="right"><Diff value={reverseDiff ? row.planned - row.actual : row.actual - row.planned} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Diff({ value, plain = false }: { value: number; plain?: boolean }) {
  const style = value < -0.01 ? dangerInlineStyle : value > 0.01 ? successInlineStyle : undefined;
  return <strong style={plain ? style : style}>{value > 0 ? "+" : ""}{formatMoney(value)}</strong>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={fieldStyle}><span>{label}</span>{children}</label>;
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ ...thStyle, textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td style={{ ...tdStyle, textAlign: align }}>{children}</td>;
}

function MonthField({ value, onChange, compact = false }: { value: string; onChange: (value: string) => void; compact?: boolean }) {
  return (
    <label style={compact ? compactMonthFieldStyle : monthFieldStyle}>
      <CalendarDays size={17} style={monthIconStyle} />
      <input
        type="month"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={monthInputStyle}
      />
    </label>
  );
}

function buildBudgetMonths(
  startMonth: string,
  horizon: number,
  revenueLines: CfoInvoiceLine[],
  costs: CfoCostItem[],
  employees: CfoEmployeeCost[],
  bankTransactions: CfoBankTransaction[],
  overrides: CfoBudgetOverride[],
  clientRevenues: CfoBudgetClientRevenue[],
  crmRevenues: CfoBudgetCrmRevenue[],
  openingCash: number,
): BudgetMonth[] {
  const months = monthsForRange(startMonth, horizon);
  const historyMonths = monthsForRange(shiftMonth(startMonth, -3), 3);
  const actualByMonth = buildActualMonthMap([...historyMonths, ...months], revenueLines, costs, employees, bankTransactions);
  const baseline = buildBaseline(historyMonths, actualByMonth);
  let cash = openingCash;

  return months.map((period) => {
    const actual = actualByMonth.get(period) || emptyActual();
    const monthOverrides = overrides.filter((override) => overrideApplies(override, period));
    const plannedRevenueCategories = plannedRevenueForMonth(period, baseline.revenue, clientRevenues, crmRevenues);
    const plannedCostCategories = new Map(baseline.costs);
    let plannedCashFlow = baseline.cashFlowWithoutRevenue + plannedClientCashFlowForMonth(period, clientRevenues) + plannedCrmRevenueForMonth(period, crmRevenues, clientRevenues);

    monthOverrides.forEach((override) => {
      const current = override.typ === "przychod" ? plannedRevenueCategories : plannedCostCategories;
      current.set(override.kategoria, (current.get(override.kategoria) || 0) + Number(override.kwota_plan || 0));
      plannedCashFlow += override.typ === "przychod" ? Number(override.kwota_cashflow || 0) : -Math.abs(Number(override.kwota_cashflow || 0));
    });

    const plannedRevenue = sum(Array.from(plannedRevenueCategories.values()));
    const plannedCosts = sum(Array.from(plannedCostCategories.values()));
    const plannedResult = plannedRevenue - plannedCosts;
    cash += plannedCashFlow;

    return {
      period,
      plannedRevenue,
      actualRevenue: actual.revenue,
      plannedCosts,
      actualCosts: actual.costs,
      plannedResult,
      actualResult: actual.revenue - actual.costs,
      plannedCashFlow,
      actualCashFlow: actual.cashFlow,
      closingCash: cash,
      overrides: monthOverrides,
      revenueCategories: categoryRows("przychod", plannedRevenueCategories, actual.revenueByCategory),
      costCategories: categoryRows("koszt", plannedCostCategories, actual.costByCategory),
    };
  });
}

function buildActualMonthMap(months: string[], revenueLines: CfoInvoiceLine[], costs: CfoCostItem[], employees: CfoEmployeeCost[], bankTransactions: CfoBankTransaction[]) {
  const map = new Map(months.map((month) => [month, emptyActual()]));

  revenueLines.forEach((line) => {
    const period = revenueLineEffectivePeriod(line).slice(0, 7);
    const current = map.get(period);
    if (!current) return;
    const category = line.cfo_przychod_kategoria || "pozostale";
    const amount = Number(line.kwota_netto || 0);
    current.revenue += amount;
    current.revenueByCategory.set(category, (current.revenueByCategory.get(category) || 0) + amount);
  });

  costs.filter((cost) => !cost.ignoruj).forEach((cost) => {
    months.forEach((period) => {
      const current = map.get(period);
      if (!current) return;
      const amount = costShareForMonth(cost, period);
      if (amount <= 0) return;
      current.costs += amount;
      current.costByCategory.set(cost.kategoria, (current.costByCategory.get(cost.kategoria) || 0) + amount);
    });
  });

  employees.forEach((employee) => {
    const period = employee.okres.slice(0, 7);
    const current = map.get(period);
    if (!current) return;
    const category: CfoCostCategory = employee.zespol === "ksiegowy" ? "koszty_zespolu" : "marketing_sprzedaz";
    const amount = employeeCostTotal(employee);
    current.costs += amount;
    current.costByCategory.set(category, (current.costByCategory.get(category) || 0) + amount);
  });

  bankTransactions.forEach((transaction) => {
    if (transaction.ignoruj || transaction.typ === "transfer_wewnetrzny") return;
    const period = transaction.data_ksiegowania.slice(0, 7);
    const current = map.get(period);
    if (!current) return;
    const amount = Number(transaction.kwota || 0);
    current.cashFlow += amount;
    if (transaction.typ === "faktura_sprzedazowa" && amount > 0) current.revenueCashFlow += amount;
  });

  return map;
}

function plannedRevenueForMonth(
  period: string,
  baselineRevenue: Map<string, number>,
  clientRevenues: CfoBudgetClientRevenue[],
  crmRevenues: CfoBudgetCrmRevenue[],
) {
  const planned = new Map<string, number>();
  baselineRevenue.forEach((value, key) => {
    if (key !== "abonamenty") planned.set(key, value);
  });

  const clientSubscription = sum(clientRevenues
    .filter((client) => clientRevenueApplies(client, period))
    .map((client) => Number(client.abonament || 0)));

  const crmSubscription = plannedCrmRevenueForMonth(period, crmRevenues, clientRevenues);
  planned.set("abonamenty", clientSubscription + crmSubscription);

  return planned;
}

function clientRevenueApplies(client: CfoBudgetClientRevenue, period: string) {
  if (Number(client.abonament || 0) <= 0) return false;
  const firstPeriod = client.pierwszy_okres_rozliczeniowy?.slice(0, 7);
  const lastPeriod = client.ostatni_okres_rozliczeniowy?.slice(0, 7);
  if (firstPeriod && firstPeriod > period) return false;
  if (lastPeriod && lastPeriod < period) return false;
  return client.aktywny === true || String(client.status_klienta || "").toLowerCase() === "onboarding";
}

function plannedClientCashFlowForMonth(period: string, clientRevenues: CfoBudgetClientRevenue[]) {
  const possibleServicePeriods = [period, shiftMonth(period, -1)];
  return sum(clientRevenues.flatMap((client) => possibleServicePeriods
    .filter((servicePeriod) => clientRevenueApplies(client, servicePeriod))
    .filter((servicePeriod) => clientCashFlowMonth(client, servicePeriod) === period)
    .map(() => Number(client.abonament || 0) * 1.23)));
}

function clientCashFlowMonth(client: CfoBudgetClientRevenue, servicePeriod: string) {
  if (client.model_fakturowania === "z_gory") {
    const firstPeriod = client.pierwszy_okres_rozliczeniowy?.slice(0, 7);
    if (firstPeriod && firstPeriod === servicePeriod) return shiftMonth(servicePeriod, 1);
    return servicePeriod;
  }
  return shiftMonth(servicePeriod, 1);
}

function plannedCrmRevenueForMonth(period: string, crmRevenues: CfoBudgetCrmRevenue[], clientRevenues: CfoBudgetClientRevenue[] = []) {
  const clientNips = new Set(clientRevenues.map((client) => normalizeNip(client.nip)).filter(Boolean));
  return sum(crmRevenues
    .filter((lead) => !clientNips.has(normalizeNip(lead.nip)))
    .filter((lead) => crmRevenueApplies(lead, period))
    .map((lead) => Number(lead.szacowany_mrr || 0) * crmProbability(lead)));
}

function crmRevenueApplies(lead: CfoBudgetCrmRevenue, period: string) {
  if (Number(lead.szacowany_mrr || 0) <= 0) return false;
  if (lead.status === "przegrana") return false;
  const startPeriod = crmForecastStartMonth(lead);
  return startPeriod <= period;
}

function crmForecastStartMonth(lead: CfoBudgetCrmRevenue) {
  if (lead.status === "wygrana") return shiftMonth(timestampToMonth(lead.etap_started_at || lead.created_at), 1);
  if (lead.etap === "finalizacja_podpisanie_umowy") return shiftMonth(timestampToMonth(lead.etap_started_at || lead.data_wyslania_oferty || lead.created_at), 1);
  if (lead.etap === "decyzja") return shiftMonth(timestampToMonth(lead.etap_started_at || lead.data_wyslania_oferty || lead.created_at), 2);
  if (lead.etap === "propozycja_wspolpracy_wyslana") return shiftMonth(timestampToMonth(lead.data_wyslania_oferty || lead.etap_started_at || lead.created_at), 2);
  if (lead.etap === "rozmowa_online") return shiftMonth(timestampToMonth(lead.etap_started_at || lead.created_at), 3);
  return "9999-12";
}

function crmProbability(lead: CfoBudgetCrmRevenue) {
  if (lead.status === "wygrana") return 1;
  if (lead.etap === "finalizacja_podpisanie_umowy") return 0.8;
  if (lead.etap === "decyzja") return 0.5;
  if (lead.etap === "propozycja_wspolpracy_wyslana") return 0.3;
  if (lead.etap === "rozmowa_online") return 0.15;
  return 0;
}

function timestampToMonth(value: string | null | undefined) {
  return value?.slice(0, 7) || currentMonthInput();
}

function normalizeNip(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function buildBaseline(historyMonths: string[], actualByMonth: Map<string, ReturnType<typeof emptyActual>>) {
  const revenue = new Map<string, number>();
  const costs = new Map<string, number>();
  let cashFlow = 0;
  let revenueCashFlow = 0;

  historyMonths.forEach((month) => {
    const actual = actualByMonth.get(month) || emptyActual();
    REVENUE_OPTIONS.forEach((option) => {
      revenue.set(option.value, (revenue.get(option.value) || 0) + (actual.revenueByCategory.get(option.value) || 0) / historyMonths.length);
    });
    COST_OPTIONS.forEach((option) => {
      costs.set(option.value, (costs.get(option.value) || 0) + (actual.costByCategory.get(option.value) || 0) / historyMonths.length);
    });
    cashFlow += actual.cashFlow / historyMonths.length;
    revenueCashFlow += actual.revenueCashFlow / historyMonths.length;
  });

  return { revenue, costs, cashFlowWithoutRevenue: cashFlow - revenueCashFlow };
}

function emptyActual() {
  return {
    revenue: 0,
    costs: 0,
    cashFlow: 0,
    revenueCashFlow: 0,
    revenueByCategory: new Map<string, number>(),
    costByCategory: new Map<string, number>(),
  };
}

function categoryRows(type: CfoBudgetOverrideType, planned: Map<string, number>, actual: Map<string, number>): BudgetCategoryRow[] {
  const options = type === "przychod" ? REVENUE_OPTIONS : COST_OPTIONS;
  return options.map((option) => {
    const plannedValue = planned.get(option.value) || 0;
    const actualValue = actual.get(option.value) || 0;
    return {
      key: option.value,
      label: option.label,
      planned: plannedValue,
      actual: actualValue,
      diff: actualValue - plannedValue,
    };
  }).filter((row) => row.planned > 0 || row.actual > 0 || Math.abs(row.diff) > 0.01);
}

function overrideApplies(override: CfoBudgetOverride, period: string) {
  const overrideMonth = override.okres.slice(0, 7);
  if (override.powtarzanie === "od_miesiaca") return overrideMonth <= period;
  return overrideMonth === period;
}

function employeeCostTotal(employee: CfoEmployeeCost) {
  return Number(employee.podstawa || 0) + Number(employee.zus_pracodawcy || 0) + Number(employee.benefity || 0) + Number(employee.premie || 0) + Number(employee.szkolenia || 0);
}

function costShareForMonth(cost: CfoCostItem, period: string) {
  const monthStart = monthToDate(period);
  const monthEnd = monthEndDate(period);
  if (cost.okres_start > monthEnd || cost.okres_end < monthStart) return 0;
  const amount = Number(cost.kwota_netto_cfo || 0);
  const totalMonths = Math.max(1, monthsBetween(cost.okres_start, cost.okres_end));
  if (totalMonths === 1 && cost.ujecie_zarzadcze !== "rozliczenie_w_czasie") return amount;
  return amount / totalMonths;
}

function revenueLineEffectivePeriod(line: CfoInvoiceLine) {
  const fee = Array.isArray(line.rozliczenia_oplaty_dodatkowe) ? line.rozliczenia_oplaty_dodatkowe[0] : line.rozliczenia_oplaty_dodatkowe;
  const settlement = Array.isArray(fee?.rozliczenia_miesieczne) ? fee?.rozliczenia_miesieczne[0] : fee?.rozliczenia_miesieczne;
  if (settlement?.okres) return monthToDate(settlement.okres.slice(0, 7));

  const invoice = Array.isArray(line.faktury) ? line.faktury[0] : line.faktury;
  return invoice?.okres || monthToDate(currentMonthInput());
}

function categoryLabel(type: CfoBudgetOverrideType, value: string) {
  const options = type === "przychod" ? REVENUE_OPTIONS : COST_OPTIONS;
  return options.find((option) => option.value === value)?.label || value;
}

function emptyDraft(period: string): BudgetDraft {
  return {
    okres: monthToDate(period),
    typ: "koszt",
    kategoria: "",
    podkategoria: "",
    opis: "",
    kwota_plan: "0",
    kwota_cashflow: "0",
    powtarzanie: "od_miesiaca",
  };
}

function currentForecastStartInput() {
  return shiftMonth(currentMonthInput(), 1);
}

function currentMonthInput() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthsForRange(startMonth: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftMonth(startMonth, index));
}

function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = end.slice(0, 7).split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth + 1;
}

function monthToDate(value: string) {
  return `${value}-01`;
}

function monthEndDate(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthField(value: string) {
  const [year, month] = value.slice(0, 7).split("-").map(Number);
  return `${MONTH_LABELS[month - 1] || ""} ${year}`.trim();
}

function formatMoney(value: number | string | null | undefined) {
  return `${formatPlNumber(Number(value || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatPlNumber(value: number, options: Intl.NumberFormatOptions) {
  const normalized = value.toLocaleString("pl-PL", { useGrouping: false, ...options }).replace(/[\u00a0\u202f]/g, " ");
  const [integer, decimal] = normalized.split(",");
  const sign = integer.startsWith("-") ? "-" : "";
  const unsignedInteger = sign ? integer.slice(1) : integer;
  const grouped = unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped}${decimal === undefined ? "" : `,${decimal}`}`;
}

function parsePolishNumber(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

const contentStyle: CSSProperties = { padding: "32px", display: "grid", gap: "20px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", flexWrap: "wrap" };
const headerActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { color: colors.navy, fontSize: "42px", margin: 0, lineHeight: 1.05 };
const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "12px" };
const metricStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.input, boxShadow: shadow.soft, display: "grid", gap: "9px", padding: "16px", color: colors.muted, fontWeight: 800 };
const metricValueStyle: CSSProperties = { color: colors.navy, fontSize: "21px", lineHeight: 1.1 };
const goodMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.success };
const badMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.danger };
const panelStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, padding: "20px", minWidth: 0 };
const widePanelStyle: CSSProperties = { ...panelStyle, gridColumn: "1 / -1" };
const controlsPanelStyle: CSSProperties = { ...panelStyle, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 320px))", gap: "12px", alignItems: "end" };
const sectionGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "18px", alignItems: "start" };
const panelHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" };
const panelIconStyle: CSSProperties = { color: colors.red, display: "inline-flex" };
const panelTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "21px" };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "980px" };
const thStyle: CSSProperties = { color: colors.muted, borderBottom: `1px solid ${colors.border}`, padding: "11px 9px", fontSize: "12px", textTransform: "uppercase", letterSpacing: 0, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { color: colors.text, borderBottom: `1px solid ${colors.border}`, padding: "10px 9px", verticalAlign: "middle" };
const selectedRowStyle: CSSProperties = { background: "#e9eef7", cursor: "pointer" };
const fieldStyle: CSSProperties = { display: "grid", gap: "6px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontWeight: 750, width: "100%", boxSizing: "border-box" };
const selectStyle: CSSProperties = { minHeight: "42px", background: colors.white };
const monthFieldStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", width: "235px", display: "grid", gridTemplateColumns: "36px minmax(0, 1fr)", alignItems: "center", overflow: "hidden" };
const compactMonthFieldStyle: CSSProperties = { ...monthFieldStyle, width: "100%" };
const monthIconStyle: CSSProperties = { color: colors.navy, justifySelf: "center" };
const monthInputStyle: CSSProperties = { border: 0, outline: "none", background: "transparent", color: colors.text, minHeight: "40px", padding: "9px 10px 9px 0", fontWeight: 850, width: "100%", boxSizing: "border-box", fontSize: "15px" };
const draftGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr)) auto", gap: "10px", alignItems: "end" };
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.input, background: colors.red, color: colors.white, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" };
const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontSize: "12px", fontWeight: 900, marginLeft: "auto" };
const overrideListStyle: CSSProperties = { display: "grid", gap: "8px", marginTop: "16px" };
const overrideRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "12px", alignItems: "center", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "10px 12px" };
const smallStyle: CSSProperties = { display: "block", color: colors.muted, marginTop: "4px", fontSize: "12px", fontWeight: 650 };
const emptyStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.muted, padding: "12px", fontWeight: 800 };
const iconDangerButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: "12px", background: colors.white, color: colors.red, width: "38px", minWidth: "38px", height: "38px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const dangerInlineStyle: CSSProperties = { color: colors.danger, fontWeight: 900 };
const successInlineStyle: CSSProperties = { color: colors.success, fontWeight: 900 };
