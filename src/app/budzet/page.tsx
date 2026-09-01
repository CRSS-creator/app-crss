"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Banknote, CalendarDays, RefreshCw, Save, TrendingUp, WalletCards } from "lucide-react";

import { colors, radius, shadow } from "@/app/design";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import {
  fetchCfoBankTransactionsRange,
  fetchCfoBudgetRevenueLinesRange,
  fetchCfoCostsRange,
  fetchCfoEmployeeCostsRange,
  type CfoBankTransaction,
  type CfoCostCategory,
  type CfoCostItem,
  type CfoEmployeeCost,
  type CfoInvoiceParent,
  type CfoInvoiceLine,
  type CfoRevenueCategory,
} from "@/lib/cfoService";
import {
  fetchCfoBudgetClientRevenues,
  fetchCfoBudgetCrmRevenues,
  fetchCfoBudgetOverrides,
  upsertCfoBudgetOverride,
  type CfoBudgetClientRevenue,
  type CfoBudgetCrmRevenue,
  type CfoBudgetOverride,
  type CfoBudgetOverrideType,
} from "@/lib/cfoBudgetService";

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
  crmMonthlyRevenueGrowth: number;
  crmCumulativeRevenueGrowth: number;
  overrides: CfoBudgetOverride[];
  revenueCategories: BudgetCategoryRow[];
  costCategories: BudgetCategoryRow[];
  costSubcategories: BudgetCostGroup[];
};

type BudgetCategoryRow = {
  key: string;
  label: string;
  planned: number;
  actual: number;
  diff: number;
};

type BudgetCostGroup = {
  key: CfoCostCategory;
  label: string;
  planned: number;
  actual: number;
  diff: number;
  children: BudgetCostSubcategoryRow[];
};

type BudgetCostSubcategoryRow = {
  key: string;
  label: string;
  planned: number;
  actual: number;
  diff: number;
};

type BudgetInvoice = {
  id: string;
  payerKey: string;
  servicePeriod: string;
  issueDate: string | null;
  dueDate: string | null;
  gross: number;
  paidAmount: number;
  paymentDate: string | null;
};

type BudgetCostPayment = {
  id: string;
  vendorKey: string;
  documentDate: string | null;
  servicePeriod: string;
  amount: number;
  paidAmount: number;
  paymentDate: string | null;
};

type BudgetRevenuePlanEntry = {
  payerKey: string;
  category: CfoRevenueCategory;
  amountNet: number;
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

const MONTH_LABELS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const DEFAULT_HORIZON = 12;
const EMPTY_SUBCATEGORY = "Bez podkategorii";

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
  const [costEditDrafts, setCostEditDrafts] = useState<Record<string, string>>({});

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
  const selectedRevenueDiff = selected ? selected.actualRevenue - selected.plannedRevenue : 0;
  const selectedCostDiff = selected ? selected.plannedCosts - selected.actualCosts : 0;

  async function loadData() {
    setLoading(true);
    const historyStart = shiftMonth(startMonth, -6);
    const forecastEnd = shiftMonth(startMonth, DEFAULT_HORIZON - 1);
    const [revenueResult, costsResult, employeeResult, bankResult, overridesResult, clientRevenueResult, crmRevenueResult] = await Promise.all([
      fetchCfoBudgetRevenueLinesRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
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
    setCostEditDrafts({});
    setLoading(false);
  }

  function changeStartMonth(value: string) {
    setStartMonth(value);
    setSelectedMonth(value);
  }

  async function saveCostPlan(category: CfoCostCategory, subcategory: string, plannedValue: number) {
    const editKey = costEditKey(selectedMonth, category, subcategory);
    const nextValue = parsePolishNumber(costEditDrafts[editKey] ?? String(plannedValue));
    setSaving(true);
    const result = await upsertCfoBudgetOverride({
      okres: monthToDate(selectedMonth),
      typ: "koszt",
      kategoria: category,
      podkategoria: subcategory === EMPTY_SUBCATEGORY ? null : subcategory,
      opis: `Korekta budżetu: ${categoryLabel("koszt", category)} / ${subcategory}`,
      kwota_plan: nextValue - plannedValue,
      kwota_cashflow: nextValue - plannedValue,
      powtarzanie: "jednorazowo",
      aktywne: true,
    });
    setSaving(false);

    if (result.error) {
      console.error(result.error);
      return alert("Nie udało się zapisać planu kosztu.");
    }

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
        <Metric label={`Wynik plan ${formatMonthField(selectedMonth)}`} value={formatMoney(selected?.plannedResult || 0)} tone={(selected?.plannedResult || 0) >= 0 ? "good" : "bad"} />
        <Metric label="Przychody plan" value={formatMoney(selected?.plannedRevenue || 0)} />
        <Metric label="Koszty plan" value={formatMoney(selected?.plannedCosts || 0)} tone="bad" />
        <Metric label="Cash flow plan" value={formatMoney(selected?.plannedCashFlow || 0)} tone={(selected?.plannedCashFlow || 0) >= 0 ? "good" : "bad"} />
        <Metric label="Gotówka po miesiącu" value={formatMoney(selected?.closingCash || 0)} tone={(selected?.closingCash || 0) < parsePolishNumber(safetyThreshold) ? "bad" : "good"} />
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
              <h2 style={panelTitleStyle}>Miesiące</h2>
            </div>
            <div style={monthTabsStyle}>
              {budget.map((month) => (
                <button key={month.period} type="button" style={selectedMonth === month.period ? activeMonthTabStyle : monthTabStyle} onClick={() => setSelectedMonth(month.period)}>
                  <strong>{formatMonthField(month.period)}</strong>
                  <small style={monthTabCaptionStyle}>Zysk / strata plan</small>
                  <span>{formatMoney(month.plannedResult)}</span>
                </button>
              ))}
            </div>
          </article>

          <article style={widePanelStyle}>
            <div style={panelHeaderStyle}>
              <WalletCards size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Plan miesiąca</h2>
              <span style={badgeStyle}>{formatMonthField(selectedMonth)}</span>
            </div>
            <div style={profitSummaryStyle}>
              <div style={profitResultBlockStyle}>
                <span>Podsumowanie zysku</span>
                <strong style={(selected?.plannedResult || 0) >= 0 ? successInlineStyle : dangerInlineStyle}>{formatMoney(selected?.plannedResult || 0)}</strong>
              </div>
              <div style={profitFormulaStyle}>
                <span>{formatMoney(selected?.plannedRevenue || 0)} przychodów</span>
                <span>-</span>
                <span>{formatMoney(selected?.plannedCosts || 0)} kosztów</span>
              </div>
            </div>
            <div style={monthSummaryGridStyle}>
              <SummaryBox label="Plan przychodów" value={formatMoney(selected?.plannedRevenue || 0)} />
              <SummaryBox label="Wykonanie przychodów" value={formatMoney(selected?.actualRevenue || 0)} />
              <SummaryBox label="Różnica przychodów" value={`${selectedRevenueDiff > 0 ? "+" : ""}${formatMoney(selectedRevenueDiff)}`} tone={selectedRevenueDiff >= 0 ? "good" : "bad"} />
              <SummaryBox label="Plan kosztów" value={formatMoney(selected?.plannedCosts || 0)} tone="bad" />
              <SummaryBox label="Wykonanie kosztów" value={formatMoney(selected?.actualCosts || 0)} />
              <SummaryBox label="Różnica kosztów" value={`${selectedCostDiff > 0 ? "+" : ""}${formatMoney(selectedCostDiff)}`} tone={selectedCostDiff >= 0 ? "good" : "bad"} />
              <SummaryBox label="CRM w planie" value={formatMoney(selected?.crmCumulativeRevenueGrowth || 0)} />
              <SummaryBox label="Cash flow" value={formatMoney(selected?.plannedCashFlow || 0)} tone={(selected?.plannedCashFlow || 0) >= 0 ? "good" : "bad"} />
            </div>
          </article>

          <article style={widePanelStyle}>
            <div style={panelHeaderStyle}>
              <TrendingUp size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Kategorie przychodów</h2>
            </div>
            <CategoryTable rows={selected?.revenueCategories || []} totalLabel="Suma przychodów" />
          </article>

          <article style={widePanelStyle}>
            <div style={panelHeaderStyle}>
              <Banknote size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Kategorie kosztów</h2>
            </div>
            <CostCategoryEditor
              groups={selected?.costSubcategories || []}
              selectedMonth={selectedMonth}
              drafts={costEditDrafts}
              onDraftChange={(key, value) => setCostEditDrafts((current) => ({ ...current, [key]: value }))}
              onSave={saveCostPlan}
            />
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

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div style={summaryBoxStyle}>
      <span>{label}</span>
      <strong style={tone === "bad" ? dangerInlineStyle : tone === "good" ? successInlineStyle : undefined}>{value}</strong>
    </div>
  );
}

function CategoryTable({ rows, reverseDiff = false, totalLabel }: { rows: BudgetCategoryRow[]; reverseDiff?: boolean; totalLabel?: string }) {
  const total = {
    planned: sum(rows.map((row) => row.planned)),
    actual: sum(rows.map((row) => row.actual)),
  };
  const totalDiff = reverseDiff ? total.planned - total.actual : total.actual - total.planned;

  return (
    <div style={tableWrapperStyle}>
      <table style={categoryTableStyle}>
        <thead>
          <tr>
            <Th>Kategoria</Th>
            <Th align="right">Plan</Th>
            <Th align="right">Wykonanie</Th>
            <Th align="right">Różnica</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><td style={tdStyle} colSpan={4}>Brak danych.</td></tr> : rows.map((row) => (
            <tr key={row.key}>
              <Td>{row.label}</Td>
              <Td align="right">{formatMoney(row.planned)}</Td>
              <Td align="right">{formatMoney(row.actual)}</Td>
              <Td align="right"><Diff value={reverseDiff ? row.planned - row.actual : row.actual - row.planned} /></Td>
            </tr>
          ))}
          {rows.length > 0 ? (
            <tr style={totalRowStyle}>
              <Td>{totalLabel || "Suma"}</Td>
              <Td align="right">{formatMoney(total.planned)}</Td>
              <Td align="right">{formatMoney(total.actual)}</Td>
              <Td align="right"><Diff value={totalDiff} /></Td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function CostCategoryEditor({
  groups,
  selectedMonth,
  drafts,
  onDraftChange,
  onSave,
}: {
  groups: BudgetCostGroup[];
  selectedMonth: string;
  drafts: Record<string, string>;
  onDraftChange: (key: string, value: string) => void;
  onSave: (category: CfoCostCategory, subcategory: string, plannedValue: number) => void | Promise<void>;
}) {
  return (
    <div style={costGroupListStyle}>
      {groups.length === 0 ? <div style={emptyStyle}>Brak kosztów w wybranym miesiącu.</div> : groups.map((group) => (
        <div key={group.key} style={costGroupStyle}>
          <div style={costGroupHeaderStyle}>
            <strong>{group.label}</strong>
            <span>{formatMoney(group.planned)}</span>
          </div>
          <div style={costSubcategoryHeaderStyle}>
            <span>Podkategoria</span>
            <span style={rightAlignedStyle}>Plan</span>
            <span style={rightAlignedStyle}>Wykonanie</span>
            <span style={rightAlignedStyle}>Różnica</span>
            <span style={rightAlignedStyle}>Akcja</span>
          </div>
          {group.children.map((row) => {
            const editKey = costEditKey(selectedMonth, group.key, row.key);
            const value = drafts[editKey] ?? formatPlainNumber(row.planned);
            return (
              <div key={row.key} style={costSubcategoryRowStyle}>
                <span>{row.label}</span>
                <input style={smallInputStyle} value={value} onChange={(event) => onDraftChange(editKey, event.target.value)} />
                <span style={rightAlignedStyle}>{formatMoney(row.actual)}</span>
                <Diff value={row.planned - row.actual} />
                <button type="button" style={smallButtonStyle} onClick={() => void onSave(group.key, row.key, row.planned)}>
                  <Save size={15} />
                  Zapisz
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Diff({ value, plain = false }: { value: number; plain?: boolean }) {
  const style = value < -0.01 ? dangerInlineStyle : value > 0.01 ? successInlineStyle : undefined;
  return <strong style={plain ? style : style}>{value > 0 ? "+" : ""}{formatMoney(value)}</strong>;
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
  const costHistoryMonths = monthsForRange(shiftMonth(startMonth, -3), 3);
  const revenueHistoryMonths = monthsForRange(shiftMonth(startMonth, -6), 6);
  const actualByMonth = buildActualMonthMap([...revenueHistoryMonths, ...months], revenueLines, costs, employees, bankTransactions);
  const baseline = buildBaseline(revenueHistoryMonths, costHistoryMonths, actualByMonth);
  const crmForecast = buildCrmRevenueGrowthForecast(costHistoryMonths, months, crmRevenues);
  const budgetInvoices = buildBudgetInvoices(revenueLines);
  const invoicePaymentProfile = buildInvoicePaymentProfile(budgetInvoices);
  const budgetCostPayments = buildBudgetCostPayments(costs);
  const costPaymentProfile = buildCostPaymentProfile(budgetCostPayments);
  const employeeCashFlowBaseline = buildEmployeeCashFlowBaseline(costHistoryMonths, employees);
  let cash = openingCash;

  return months.map((period) => {
    const actual = actualByMonth.get(period) || emptyActual();
    const monthOverrides = overrides.filter((override) => overrideApplies(override, period));
    const plannedRevenueEntries = plannedRevenueEntriesForMonth(period, baseline, clientRevenues, crmForecast);
    const plannedRevenueCategories = plannedRevenueForMonth(plannedRevenueEntries);
    const plannedCostSubcategories = plannedCostSubcategoriesForMonth(baseline.costSubcategories, actual.costBySubcategory);
    const crmCumulativeRevenueGrowth = crmForecast.revenueGrowthByMonth.get(period) || 0;
    const invoiceCashFlow = plannedInvoiceCustomerCashFlowForMonth(period, budgetInvoices, invoicePaymentProfile);
    const plannedCustomerCashFlow = invoiceCashFlow.amount
      + plannedUnissuedRevenueCashFlowForMonth(period, months, baseline, clientRevenues, crmForecast, actualByMonth, invoicePaymentProfile);
    let manualRevenueCashFlow = 0;

    monthOverrides.forEach((override) => {
      if (override.typ === "przychod") {
        plannedRevenueCategories.set(override.kategoria, (plannedRevenueCategories.get(override.kategoria) || 0) + Number(override.kwota_plan || 0));
        manualRevenueCashFlow += Number(override.kwota_cashflow || 0);
      } else {
        const subcategory = override.podkategoria || EMPTY_SUBCATEGORY;
        upsertSubcategoryAmount(plannedCostSubcategories, override.kategoria as CfoCostCategory, subcategory, Number(override.kwota_plan || 0));
      }
    });

    const plannedCostCategories = categoryTotalsFromSubcategories(plannedCostSubcategories);
    const plannedRevenue = sum(Array.from(plannedRevenueCategories.values()));
    const plannedCosts = sum(Array.from(plannedCostCategories.values()));
    const plannedResult = plannedRevenue - plannedCosts;
    const costCashFlow = plannedCostCashFlowForMonth(period, budgetCostPayments, costPaymentProfile);
    const plannedEmployeeCashFlow = employeeCashFlowForMonth(period, employees) || employeeCashFlowBaseline;
    const plannedOtherCostCashFlow = costCashFlow.amount;
    const plannedCostCashFlow = plannedEmployeeCashFlow + plannedOtherCostCashFlow;
    const plannedCashFlow = plannedCustomerCashFlow + manualRevenueCashFlow - plannedCostCashFlow;
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
      crmMonthlyRevenueGrowth: crmForecast.monthlyRevenueGrowth,
      crmCumulativeRevenueGrowth,
      overrides: monthOverrides,
      revenueCategories: categoryRows("przychod", plannedRevenueCategories, actual.revenueByCategory),
      costCategories: categoryRows("koszt", plannedCostCategories, actual.costByCategory),
      costSubcategories: costGroupRows(plannedCostSubcategories, actual.costBySubcategory),
    };
  });
}

function buildActualMonthMap(months: string[], revenueLines: CfoInvoiceLine[], costs: CfoCostItem[], employees: CfoEmployeeCost[], bankTransactions: CfoBankTransaction[]) {
  const map = new Map(months.map((month) => [month, emptyActual()]));

  revenueLines.forEach((line) => {
    const period = revenueLineIssuePeriod(line);
    const current = map.get(period);
    if (!current) return;
    const category = line.cfo_przychod_kategoria || "pozostale";
    const amount = Number(line.kwota_netto || 0);
    const invoice = firstRelation(line.faktury);
    const payerKey = counterpartyKey(invoice?.klient_id || invoice?.kontrahent_nazwa || "bez-kontrahenta");
    current.revenue += amount;
    current.revenueByCategory.set(category, (current.revenueByCategory.get(category) || 0) + amount);
    upsertSubcategoryAmount(current.revenueByClientCategory, payerKey, category, amount);
  });

  costs.filter((cost) => !cost.ignoruj).forEach((cost) => {
    months.forEach((period) => {
      const current = map.get(period);
      if (!current) return;
      const amount = costShareForMonth(cost, period);
      if (amount <= 0) return;
      current.costs += amount;
      current.costByCategory.set(cost.kategoria, (current.costByCategory.get(cost.kategoria) || 0) + amount);
      upsertSubcategoryAmount(current.costBySubcategory, cost.kategoria, cost.podkategoria || EMPTY_SUBCATEGORY, amount);
    });
  });

  employees.forEach((employee) => {
    const period = employee.okres.slice(0, 7);
    const current = map.get(period);
    if (!current) return;
    const category: CfoCostCategory = employee.zespol === "ksiegowy" ? "koszty_zespolu" : "marketing_sprzedaz";
    const rows = employee.zespol === "ksiegowy"
      ? [
        ["Wynagrodzenie podstawowe", Number(employee.podstawa || 0)],
        ["ZUS pracodawcy", Number(employee.zus_pracodawcy || 0)],
        ["Benefity", Number(employee.benefity || 0)],
        ["Premie", Number(employee.premie || 0)],
        ["Szkolenia", Number(employee.szkolenia || 0)],
      ] as const
      : [[employee.zespol === "marketingowy" ? "Koszt zespołu marketingowego" : "Koszt zespołu sprzedażowego", employeeCostTotal(employee)]] as const;

    rows.forEach(([subcategory, amount]) => {
      if (amount <= 0) return;
      current.costs += amount;
      current.costByCategory.set(category, (current.costByCategory.get(category) || 0) + amount);
      upsertSubcategoryAmount(current.costBySubcategory, category, subcategory, amount);
    });
  });

  bankTransactions.forEach((transaction) => {
    if (transaction.ignoruj || transaction.typ === "transfer_wewnetrzny") return;
    const period = transaction.data_ksiegowania.slice(0, 7);
    const current = map.get(period);
    if (!current) return;
    const amount = Number(transaction.kwota || 0);
    current.cashFlow += amount;
    current.revenueCashFlow += revenueCashFlowAmount(transaction);
  });

  return map;
}

function revenueCashFlowAmount(transaction: CfoBankTransaction) {
  const splits = transaction.cfo_rozbicia_platnosci || [];
  if (splits.length > 0) {
    return sum(splits
      .filter((split) => !split.poza_kosztem_cfo && split.typ === "faktura_sprzedazowa" && split.faktura_id)
      .map((split) => Math.max(0, Number(split.kwota || 0))));
  }
  const amount = Number(transaction.kwota || 0);
  return transaction.typ === "faktura_sprzedazowa" && amount > 0 ? amount : 0;
}

function buildBudgetInvoices(revenueLines: CfoInvoiceLine[]): BudgetInvoice[] {
  const invoices = new Map<string, BudgetInvoice & { fallbackGross: number }>();

  revenueLines.forEach((line) => {
    const invoice = firstRelation(line.faktury);
    if (!invoice || invoice.typ !== "sprzedaz" || invoice.status === "anulowana" || invoice.kategoria === "korekta") return;

    const payment = invoicePaymentInfo(invoice);
    const fallbackGross = Number(line.kwota_netto || 0) * 1.23;
    const current = invoices.get(invoice.id);

    if (current) {
      current.fallbackGross += fallbackGross;
      current.gross = Number(invoice.kwota_brutto || 0) > 0 ? Number(invoice.kwota_brutto || 0) : current.fallbackGross;
      current.paidAmount = payment.paidAmount;
      current.paymentDate = payment.paymentDate;
      return;
    }

    invoices.set(invoice.id, {
      id: invoice.id,
      payerKey: counterpartyKey(invoice.klient_id || invoice.kontrahent_nazwa || invoice.id),
      servicePeriod: revenueLineEffectivePeriod(line).slice(0, 7),
      issueDate: invoice.data_wystawienia,
      dueDate: invoice.termin_platnosci,
      gross: Number(invoice.kwota_brutto || 0) > 0 ? Number(invoice.kwota_brutto || 0) : fallbackGross,
      fallbackGross,
      paidAmount: payment.paidAmount,
      paymentDate: payment.paymentDate,
    });
  });

  return Array.from(invoices.values()).map(({ fallbackGross, ...invoice }) => ({
    ...invoice,
    gross: invoice.gross > 0 ? invoice.gross : fallbackGross,
  }));
}

function invoicePaymentInfo(invoice: CfoInvoiceParent) {
  const directPayments = (invoice.cfo_transakcje_bankowe || [])
    .filter((transaction) => !transaction.ignoruj && transaction.typ === "faktura_sprzedazowa" && Number(transaction.kwota || 0) > 0);
  const splitPayments = (invoice.cfo_rozbicia_platnosci || [])
    .filter((split) => !split.poza_kosztem_cfo && split.typ === "faktura_sprzedazowa")
    .filter((split) => {
      const transaction = firstRelation(split.cfo_transakcje_bankowe);
      return !transaction || !transaction.ignoruj;
    });

  const directAmount = sum(directPayments.map((transaction) => Math.max(0, Number(transaction.kwota || 0))));
  const splitAmount = sum(splitPayments.map((split) => Math.max(0, Number(split.kwota || 0))));
  const dates = [
    ...directPayments.map((transaction) => transaction.data_ksiegowania),
    ...splitPayments.map((split) => firstRelation(split.cfo_transakcje_bankowe)?.data_ksiegowania),
  ].filter(Boolean) as string[];

  dates.sort();
  const paidAmount = directAmount + splitAmount;
  if (paidAmount <= 0.01 && invoice.status === "oplacona") {
    return {
      paidAmount: Number(invoice.kwota_brutto || 0),
      paymentDate: invoice.termin_platnosci || invoice.data_wystawienia,
    };
  }

  return {
    paidAmount,
    paymentDate: dates.length > 0 ? dates[dates.length - 1] : null,
  };
}

function plannedInvoiceCustomerCashFlowForMonth(period: string, invoices: BudgetInvoice[], profile: PaymentProfile) {
  let amount = 0;
  let hasInvoiceSignal = false;

  invoices.forEach((invoice) => {
    const paidThisMonth = invoice.paymentDate?.slice(0, 7) === period;
    if (paidThisMonth) {
      amount += invoice.paidAmount;
      hasInvoiceSignal = true;
    }

    const unpaidAmount = Math.max(0, invoice.gross - invoice.paidAmount);
    if (unpaidAmount <= 0.01) return;

    const baseDate = invoice.issueDate || invoice.dueDate || monthEndDate(invoice.servicePeriod);
    const expectedMonth = addDays(baseDate, averageDaysFor(profile, invoice.payerKey)).slice(0, 7);
    if (expectedMonth !== period) return;

    amount += unpaidAmount;
    hasInvoiceSignal = true;
  });

  return { amount, hasInvoiceSignal };
}

function plannedUnissuedRevenueCashFlowForMonth(
  cashFlowPeriod: string,
  forecastMonths: string[],
  baseline: ReturnType<typeof buildBaseline>,
  clientRevenues: CfoBudgetClientRevenue[],
  crmForecast: CrmRevenueGrowthForecast,
  actualByMonth: Map<string, ReturnType<typeof emptyActual>>,
  profile: PaymentProfile,
) {
  return sum(forecastMonths.map((issuePeriod) => {
    const planned = plannedRevenueEntriesForMonth(issuePeriod, baseline, clientRevenues, crmForecast);
    const actual = actualByMonth.get(issuePeriod) || emptyActual();
    return sum(planned.map((entry) => {
      const issuedNet = actual.revenueByClientCategory.get(entry.payerKey)?.get(entry.category) || 0;
      const missingNet = Math.max(0, entry.amountNet - issuedNet);
      if (missingNet <= 0.01) return 0;

      const expectedMonth = addDays(monthToDate(issuePeriod), averageDaysFor(profile, entry.payerKey)).slice(0, 7);
      return expectedMonth === cashFlowPeriod ? missingNet * 1.23 : 0;
    }));
  }));
}

function buildBudgetCostPayments(costs: CfoCostItem[]): BudgetCostPayment[] {
  return costs
    .filter((cost) => !cost.ignoruj)
    .map((cost) => {
      const payment = costPaymentInfo(cost);
      return {
        id: cost.id,
        vendorKey: counterpartyKey(cost.kontrahent || cost.id),
        documentDate: cost.data_dokumentu,
        servicePeriod: cost.okres_start.slice(0, 7),
        amount: Number(cost.kwota_brutto ?? cost.kwota_netto_cfo ?? 0),
        paidAmount: payment.paidAmount,
        paymentDate: payment.paymentDate,
      };
    })
    .filter((cost) => cost.amount > 0);
}

function costPaymentInfo(cost: CfoCostItem) {
  const directPayments = (cost.cfo_transakcje_bankowe || [])
    .filter((transaction) => !transaction.ignoruj && Number(transaction.kwota || 0) < 0);
  const splitPayments = (cost.cfo_rozbicia_platnosci || [])
    .filter((split) => !split.poza_kosztem_cfo && split.typ !== "faktura_sprzedazowa")
    .filter((split) => {
      const transaction = firstRelation(split.cfo_transakcje_bankowe);
      return !transaction || !transaction.ignoruj;
    });

  const directAmount = sum(directPayments.map((transaction) => Math.abs(Number(transaction.kwota || 0))));
  const splitAmount = sum(splitPayments.map((split) => Math.abs(Number(split.kwota || 0))));
  const dates = [
    ...directPayments.map((transaction) => transaction.data_ksiegowania),
    ...splitPayments.map((split) => firstRelation(split.cfo_transakcje_bankowe)?.data_ksiegowania),
  ].filter(Boolean) as string[];

  dates.sort();
  return {
    paidAmount: directAmount + splitAmount,
    paymentDate: dates.length > 0 ? dates[dates.length - 1] : null,
  };
}

function plannedCostCashFlowForMonth(period: string, costs: BudgetCostPayment[], profile: PaymentProfile) {
  let amount = 0;
  let hasCostSignal = false;

  costs.forEach((cost) => {
    const paidThisMonth = cost.paymentDate?.slice(0, 7) === period;
    if (paidThisMonth) {
      amount += cost.paidAmount;
      hasCostSignal = true;
    }

    const unpaidAmount = Math.max(0, cost.amount - cost.paidAmount);
    if (unpaidAmount <= 0.01) return;

    const baseDate = cost.documentDate || monthEndDate(cost.servicePeriod);
    const expectedMonth = addDays(baseDate, averageDaysFor(profile, cost.vendorKey)).slice(0, 7);
    if (expectedMonth !== period) return;

    amount += unpaidAmount;
    hasCostSignal = true;
  });

  return { amount, hasCostSignal };
}

function buildEmployeeCashFlowBaseline(historyMonths: string[], employees: CfoEmployeeCost[]) {
  const totals = historyMonths.map((period) => employeeCashFlowForMonth(period, employees)).filter((value) => value > 0);
  return totals.length > 0 ? sum(totals) / totals.length : 0;
}

function employeeCashFlowForMonth(period: string, employees: CfoEmployeeCost[]) {
  return sum(employees
    .filter((employee) => employee.okres.slice(0, 7) === period)
    .map(employeeCostTotal));
}

type PaymentProfile = {
  globalAverageDays: number;
  averageDaysByCounterparty: Map<string, number>;
};

function buildInvoicePaymentProfile(invoices: BudgetInvoice[]): PaymentProfile {
  return buildPaymentProfile(invoices
    .filter((invoice) => invoice.paymentDate && invoice.issueDate && invoice.paidAmount >= invoice.gross * 0.8)
    .map((invoice) => ({
      key: invoice.payerKey,
      days: daysBetween(invoice.issueDate as string, invoice.paymentDate as string),
    })));
}

function buildCostPaymentProfile(costs: BudgetCostPayment[]): PaymentProfile {
  return buildPaymentProfile(costs
    .filter((cost) => cost.paymentDate && cost.documentDate && cost.paidAmount >= cost.amount * 0.8)
    .map((cost) => ({
      key: cost.vendorKey,
      days: daysBetween(cost.documentDate as string, cost.paymentDate as string),
    })));
}

function buildPaymentProfile(samples: { key: string; days: number }[]): PaymentProfile {
  const validSamples = samples.filter((sample) => Number.isFinite(sample.days));
  const globalAverageDays = validSamples.length > 0
    ? clamp(Math.round(sum(validSamples.map((sample) => sample.days)) / validSamples.length), 0, 60)
    : 14;
  const grouped = new Map<string, number[]>();

  validSamples.forEach((sample) => {
    grouped.set(sample.key, [...(grouped.get(sample.key) || []), sample.days]);
  });

  return {
    globalAverageDays,
    averageDaysByCounterparty: new Map(Array.from(grouped.entries()).map(([key, values]) => [
      key,
      clamp(Math.round(sum(values) / values.length), 0, 60),
    ])),
  };
}

function averageDaysFor(profile: PaymentProfile, counterpartyKeyValue: string) {
  return profile.averageDaysByCounterparty.get(counterpartyKeyValue) ?? profile.globalAverageDays;
}

function plannedRevenueEntriesForMonth(
  period: string,
  baseline: ReturnType<typeof buildBaseline>,
  clientRevenues: CfoBudgetClientRevenue[],
  crmForecast: CrmRevenueGrowthForecast,
): BudgetRevenuePlanEntry[] {
  const entries: BudgetRevenuePlanEntry[] = [];

  clientRevenues
    .filter((client) => clientRevenueApplies(client, period))
    .forEach((client) => {
      const payerKey = counterpartyKey(client.id);
      const abonament = Number(client.abonament || 0);
      const payroll = baseline.clientRevenueAverages.get(payerKey)?.get("kadry_place") || 0;

      if (abonament > 0) entries.push({ payerKey, category: "abonamenty", amountNet: abonament });
      if (payroll > 0) entries.push({ payerKey, category: "kadry_place", amountNet: payroll });
    });

  const servicesAdditional = baseline.revenue.get("uslugi_dodatkowe") || 0;
  if (servicesAdditional > 0) {
    entries.push({ payerKey: "__uslugi_dodatkowe__", category: "uslugi_dodatkowe", amountNet: servicesAdditional });
  }

  const crmSubscription = crmForecast.revenueGrowthByMonth.get(period) || 0;
  if (crmSubscription > 0) {
    entries.push({ payerKey: "__crm__", category: "abonamenty", amountNet: crmSubscription });
  }

  return entries;
}

function plannedRevenueForMonth(entries: BudgetRevenuePlanEntry[]) {
  const planned = new Map<string, number>();
  entries.forEach((entry) => {
    planned.set(entry.category, (planned.get(entry.category) || 0) + entry.amountNet);
  });

  return planned;
}

function plannedCostSubcategoriesForMonth(baselineCosts: Map<string, Map<string, number>>, knownCosts: Map<string, Map<string, number>>) {
  const planned = cloneNestedMap(baselineCosts);
  knownCosts.forEach((subcategories, category) => {
    subcategories.forEach((value, subcategory) => {
      const current = planned.get(category)?.get(subcategory) || 0;
      setSubcategoryAmount(planned, category as CfoCostCategory, subcategory, Math.max(current, value));
    });
  });
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

function timestampToMonth(value: string | null | undefined) {
  return value?.slice(0, 7) || currentMonthInput();
}

type CrmRevenueGrowthForecast = {
  monthlyRevenueGrowth: number;
  revenueGrowthByMonth: Map<string, number>;
};

function buildCrmRevenueGrowthForecast(historyMonths: string[], forecastMonths: string[], crmRevenues: CfoBudgetCrmRevenue[]): CrmRevenueGrowthForecast {
  const wonRevenueByMonth = new Map(historyMonths.map((month) => [month, 0]));

  crmRevenues
    .filter((lead) => lead.status === "wygrana")
    .forEach((lead) => {
      const wonMonth = timestampToMonth(lead.etap_started_at || lead.updated_at || lead.created_at);
      if (!wonRevenueByMonth.has(wonMonth)) return;
      wonRevenueByMonth.set(wonMonth, (wonRevenueByMonth.get(wonMonth) || 0) + Number(lead.szacowany_mrr || 0));
    });

  const revenueGrowthByMonth = new Map<string, number>();
  forecastMonths.forEach((month, index) => {
    const projectedGrowth = index === 0 ? 0 : rollingAveragePreviousMonths(month, wonRevenueByMonth, 3);
    revenueGrowthByMonth.set(month, projectedGrowth);
    wonRevenueByMonth.set(month, projectedGrowth);
  });

  const monthlyRevenueGrowth = revenueGrowthByMonth.get(forecastMonths[1]) || rollingAveragePreviousMonths(forecastMonths[0] || currentMonthInput(), wonRevenueByMonth, 3);
  return { monthlyRevenueGrowth, revenueGrowthByMonth };
}

function rollingAveragePreviousMonths(month: string, valuesByMonth: Map<string, number>, windowSize: number) {
  const months = Array.from({ length: windowSize }, (_, index) => shiftMonth(month, index - windowSize));
  return sum(months.map((period) => valuesByMonth.get(period) || 0)) / windowSize;
}

function buildBaseline(revenueHistoryMonths: string[], costHistoryMonths: string[], actualByMonth: Map<string, ReturnType<typeof emptyActual>>) {
  const revenue = new Map<string, number>();
  const costs = new Map<string, number>();
  const costSubcategoryTotals = new Map<string, Map<string, number>>();
  const costSubcategoryCounts = new Map<string, Map<string, number>>();
  let cashFlow = 0;
  let revenueCashFlow = 0;

  revenue.set("kadry_place", averageRevenueCategory(revenueHistoryMonths.slice(-3), actualByMonth, "kadry_place"));
  revenue.set("uslugi_dodatkowe", averageRevenueCategory(revenueHistoryMonths, actualByMonth, "uslugi_dodatkowe"));
  revenue.set("pozostale", 0);
  revenue.set("wdrozenia", 0);
  const clientRevenueAverages = averageClientRevenueCategory(revenueHistoryMonths.slice(-3), actualByMonth, "kadry_place");

  costHistoryMonths.forEach((month) => {
    const actual = actualByMonth.get(month) || emptyActual();
    COST_OPTIONS.forEach((option) => {
      costs.set(option.value, (costs.get(option.value) || 0) + (actual.costByCategory.get(option.value) || 0) / costHistoryMonths.length);
    });
    actual.costBySubcategory.forEach((subcategories, category) => {
      subcategories.forEach((value, subcategory) => {
        if (value <= 0) return;
        upsertSubcategoryAmount(costSubcategoryTotals, category as CfoCostCategory, subcategory, value);
        upsertSubcategoryAmount(costSubcategoryCounts, category as CfoCostCategory, subcategory, 1);
      });
    });
    cashFlow += actual.cashFlow / costHistoryMonths.length;
    revenueCashFlow += actual.revenueCashFlow / costHistoryMonths.length;
  });

  return {
    revenue,
    costs,
    costSubcategories: averageNestedMap(costSubcategoryTotals, costSubcategoryCounts),
    clientRevenueAverages,
    cashFlowWithoutRevenue: cashFlow - revenueCashFlow,
  };
}

function averageRevenueCategory(months: string[], actualByMonth: Map<string, ReturnType<typeof emptyActual>>, category: CfoRevenueCategory) {
  if (months.length === 0) return 0;
  return sum(months.map((month) => actualByMonth.get(month)?.revenueByCategory.get(category) || 0)) / months.length;
}

function averageClientRevenueCategory(months: string[], actualByMonth: Map<string, ReturnType<typeof emptyActual>>, category: CfoRevenueCategory) {
  const clientKeys = new Set<string>();
  months.forEach((month) => {
    actualByMonth.get(month)?.revenueByClientCategory.forEach((categories, clientKey) => {
      if ((categories.get(category) || 0) > 0) clientKeys.add(clientKey);
    });
  });

  const averages = new Map<string, Map<string, number>>();
  clientKeys.forEach((clientKey) => {
    setSubcategoryAmount(averages, clientKey, category, sum(months.map((month) => actualByMonth.get(month)?.revenueByClientCategory.get(clientKey)?.get(category) || 0)) / months.length);
  });

  return averages;
}

function emptyActual() {
  return {
    revenue: 0,
    costs: 0,
    cashFlow: 0,
    revenueCashFlow: 0,
    revenueByCategory: new Map<string, number>(),
    revenueByClientCategory: new Map<string, Map<string, number>>(),
    costByCategory: new Map<string, number>(),
    costBySubcategory: new Map<string, Map<string, number>>(),
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

function costGroupRows(planned: Map<string, Map<string, number>>, actual: Map<string, Map<string, number>>): BudgetCostGroup[] {
  return COST_OPTIONS.map((category) => {
    const plannedChildren = planned.get(category.value) || new Map<string, number>();
    const actualChildren = actual.get(category.value) || new Map<string, number>();
    const childKeys = Array.from(new Set([...plannedChildren.keys(), ...actualChildren.keys()]));
    const children = childKeys.map((key) => {
      const plannedValue = plannedChildren.get(key) || 0;
      const actualValue = actualChildren.get(key) || 0;
      return {
        key,
        label: key,
        planned: plannedValue,
        actual: actualValue,
        diff: actualValue - plannedValue,
      };
    }).filter((row) => row.planned > 0 || row.actual > 0 || Math.abs(row.diff) > 0.01);
    const plannedValue = sum(children.map((row) => row.planned));
    const actualValue = sum(children.map((row) => row.actual));
    return {
      key: category.value,
      label: category.label,
      planned: plannedValue,
      actual: actualValue,
      diff: actualValue - plannedValue,
      children,
    };
  }).filter((group) => group.children.length > 0 || group.planned > 0 || group.actual > 0);
}

function categoryTotalsFromSubcategories(source: Map<string, Map<string, number>>) {
  const totals = new Map<string, number>();
  source.forEach((subcategories, category) => {
    totals.set(category, sum(Array.from(subcategories.values())));
  });
  return totals;
}

function cloneNestedMap(source: Map<string, Map<string, number>>) {
  return new Map(Array.from(source.entries()).map(([key, value]) => [key, new Map(value)]));
}

function averageNestedMap(totals: Map<string, Map<string, number>>, counts: Map<string, Map<string, number>>) {
  const average = new Map<string, Map<string, number>>();
  totals.forEach((subcategories, category) => {
    subcategories.forEach((total, subcategory) => {
      const count = counts.get(category)?.get(subcategory) || 1;
      setSubcategoryAmount(average, category as CfoCostCategory, subcategory, total / count);
    });
  });
  return average;
}

function upsertSubcategoryAmount(source: Map<string, Map<string, number>>, category: CfoCostCategory | string, subcategory: string, amount: number) {
  setSubcategoryAmount(source, category, subcategory, (source.get(category)?.get(subcategory) || 0) + amount);
}

function setSubcategoryAmount(source: Map<string, Map<string, number>>, category: CfoCostCategory | string, subcategory: string, amount: number) {
  const current = source.get(category) || new Map<string, number>();
  current.set(subcategory, amount);
  source.set(category, current);
}

function costEditKey(month: string, category: CfoCostCategory, subcategory: string) {
  return `${month}:${category}:${subcategory}`;
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

function revenueLineIssuePeriod(line: CfoInvoiceLine) {
  const invoice = firstRelation(line.faktury);
  return (invoice?.data_wystawienia || revenueLineEffectivePeriod(line)).slice(0, 7);
}

function categoryLabel(type: CfoBudgetOverrideType, value: string) {
  const options = type === "przychod" ? REVENUE_OPTIONS : COST_OPTIONS;
  return options.find((option) => option.value === value)?.label || value;
}

function currentForecastStartInput() {
  return currentMonthInput();
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

function formatPlainNumber(value: number | string | null | undefined) {
  return formatPlNumber(Number(value || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function counterpartyKey(value: string) {
  return value.trim().toLowerCase();
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const fromDate = dateOnlyUtc(from);
  const toDate = dateOnlyUtc(to);
  return Math.round((toDate - fromDate) / 86400000);
}

function dateOnlyUtc(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
const profitSummaryStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: "#e9eef7", padding: "16px", marginBottom: "12px", display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap" };
const profitResultBlockStyle: CSSProperties = { display: "inline-flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" };
const profitFormulaStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", color: colors.muted, fontWeight: 850, flexWrap: "wrap" };
const monthSummaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" };
const summaryBoxStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "12px", display: "grid", gap: "6px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const panelStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, padding: "20px", minWidth: 0 };
const widePanelStyle: CSSProperties = { ...panelStyle, gridColumn: "1 / -1" };
const controlsPanelStyle: CSSProperties = { ...panelStyle, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 320px))", gap: "12px", alignItems: "end" };
const sectionGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "18px", alignItems: "start" };
const monthTabsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "8px" };
const monthTabStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "11px 12px", minHeight: "74px", display: "grid", gap: "4px", textAlign: "left", cursor: "pointer", fontWeight: 800 };
const activeMonthTabStyle: CSSProperties = { ...monthTabStyle, background: "#e9eef7", borderColor: colors.navy };
const monthTabCaptionStyle: CSSProperties = { color: colors.muted, fontSize: "11px", fontWeight: 850 };
const panelHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", flexWrap: "wrap" };
const panelIconStyle: CSSProperties = { color: colors.red, display: "inline-flex" };
const panelTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "21px" };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const categoryTableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: "620px" };
const thStyle: CSSProperties = { color: colors.muted, borderBottom: `1px solid ${colors.border}`, padding: "11px 9px", fontSize: "12px", textTransform: "uppercase", letterSpacing: 0, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { color: colors.text, borderBottom: `1px solid ${colors.border}`, padding: "10px 9px", verticalAlign: "middle" };
const totalRowStyle: CSSProperties = { background: "#f4f7fb", fontWeight: 900 };
const fieldStyle: CSSProperties = { display: "grid", gap: "6px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontWeight: 750, width: "100%", boxSizing: "border-box" };
const smallInputStyle: CSSProperties = { ...inputStyle, minHeight: "36px", maxWidth: "150px", textAlign: "right" };
const monthFieldStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", width: "235px", display: "grid", gridTemplateColumns: "36px minmax(0, 1fr)", alignItems: "center", overflow: "hidden" };
const compactMonthFieldStyle: CSSProperties = { ...monthFieldStyle, width: "100%" };
const monthIconStyle: CSSProperties = { color: colors.navy, justifySelf: "center" };
const monthInputStyle: CSSProperties = { border: 0, outline: "none", background: "transparent", color: colors.text, minHeight: "40px", padding: "9px 10px 9px 0", fontWeight: 850, width: "100%", boxSizing: "border-box", fontSize: "15px" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" };
const smallButtonStyle: CSSProperties = { ...secondaryButtonStyle, minHeight: "36px", padding: "7px 10px", width: "100%" };
const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontSize: "12px", fontWeight: 900, marginLeft: "auto" };
const costGroupListStyle: CSSProperties = { display: "grid", gap: "12px" };
const costGroupStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, overflow: "hidden", background: colors.white };
const costGroupHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", background: "#e9eef7", color: colors.navy, padding: "12px 14px", fontWeight: 900 };
const costColumns = "minmax(260px, 1fr) minmax(150px, 150px) minmax(130px, 130px) minmax(130px, 130px) minmax(110px, 110px)";
const costSubcategoryHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: costColumns, gap: "12px", alignItems: "center", padding: "9px 14px", borderTop: `1px solid ${colors.border}`, color: colors.muted, fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: 0 };
const costSubcategoryRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: costColumns, gap: "12px", alignItems: "center", padding: "10px 14px", borderTop: `1px solid ${colors.border}` };
const emptyStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.muted, padding: "12px", fontWeight: 800 };
const dangerInlineStyle: CSSProperties = { color: colors.danger, fontWeight: 900 };
const successInlineStyle: CSSProperties = { color: colors.success, fontWeight: 900 };
const rightAlignedStyle: CSSProperties = { textAlign: "right" };
