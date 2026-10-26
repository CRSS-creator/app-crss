"use client";
import BudgetPaymentPlans from "@/components/BudgetPaymentPlans";
import { explicitPaymentMonth, plannedNetAmounts, unresolvedBudgetCosts, historyPaymentSuggestions, payrollPlanSuggestions, planKey, type BudgetPaymentPlan } from "@/lib/budgetPaymentPlan";
import { fetchBudgetPaymentPlans, saveBudgetPaymentPlan } from "@/lib/budgetPaymentPlanService";

import { manualCashflowForecast } from "@/lib/cfoManualCashflow";
import { manualRevenueCashflow } from "@/lib/cfoManualRevenue";


import { AppFormInput } from "@/components/AppFormControls";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Banknote, CalendarDays, RefreshCw, Save, TrendingUp, WalletCards } from "lucide-react";

import { colors, radius, shadow } from "@/app/design";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import {
  fetchCfoBudgetRevenueLinesRange,
  fetchCfoCostsRange,
  fetchCfoEmployeeCostsRange,
  type CfoBankTransaction,
  type CfoCostCategory,
  type CfoCostItem,
  type CfoEmployeeCost,
  type CfoInvoiceLine,
  type CfoRevenueCategory,
} from "@/lib/cfoService";
import {
  fetchCfoBudgetClientRevenues,
  fetchCfoBudgetCrmRevenues,
  fetchCfoBudgetOverrides,
  type CfoBudgetClientRevenue,
  type CfoBudgetCrmRevenue,
  type CfoBudgetOverride,
  type CfoBudgetOverrideType,
} from "@/lib/cfoBudgetService";

import { actualInvoicePayment, actualCostPayment, paymentAverage, businessDate, cashflowTransactions, obligationCashflow, emptyCashflow, OBLIGATION_TYPES, type CashflowSnapshot } from "@/lib/cfoCashflow";
import { annualCostForecast } from "@/lib/cfoAnnualCosts";
import { fetchCashflowSnapshot } from "@/lib/cfoCashflowService";

type BudgetMonth = {
  period: string;
  plannedRevenue: number;
  plannedInflows: number;
  plannedOutflows: number;
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
  source?: string;
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
  annualScheduleId?: string | null;
  id: string;
  vendorKey: string;
  category: CfoCostCategory;
  subcategory: string;
  documentDate: string | null;
  dueDate: string | null;
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

type BudgetCostPlanEntry = {
  vendorKey: string;
  category: CfoCostCategory;
  subcategory: string;
  amount: number;
  grossRatio?: number;
  issueDay?: number;
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
const BUDGET_FIRST_MONTH = "2026-11";
const EMPTY_SUBCATEGORY = "Bez podkategorii";
const OPENING_CASH_STORAGE_KEY = "crss_budget_opening_cash";
const SAFETY_THRESHOLD_STORAGE_KEY = "crss_budget_safety_threshold";

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
  const [openingCash, setOpeningCash] = useState(() => readStoredBudgetSetting(OPENING_CASH_STORAGE_KEY));
  const [safetyThreshold, setSafetyThreshold] = useState(() => readStoredBudgetSetting(SAFETY_THRESHOLD_STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revenueLines, setRevenueLines] = useState<CfoInvoiceLine[]>([]);
  const [costs, setCosts] = useState<CfoCostItem[]>([]);
  const [employeeCosts, setEmployeeCosts] = useState<CfoEmployeeCost[]>([]);
  const [cashflow, setCashflow] = useState<CashflowSnapshot>(emptyCashflow);
  const [dataError, setDataError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<CfoBudgetOverride[]>([]);
  const [clientRevenues, setClientRevenues] = useState<CfoBudgetClientRevenue[]>([]);
  const [crmRevenues, setCrmRevenues] = useState<CfoBudgetCrmRevenue[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<BudgetPaymentPlan[]>([]);
  const [includeCrmGrowth, setIncludeCrmGrowth] = useState(false);
  const [costEditDrafts, setCostEditDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMonth]);

  const budget = useMemo(
    () => buildBudgetMonths(startMonth, DEFAULT_HORIZON, revenueLines, costs, employeeCosts, cashflowTransactions(cashflow), overrides, clientRevenues, includeCrmGrowth ? crmRevenues : [], parsePolishNumber(openingCash), cashflow, paymentPlans),
    [startMonth, revenueLines, costs, employeeCosts, cashflow, overrides, clientRevenues, crmRevenues, openingCash, paymentPlans, includeCrmGrowth],
  );

  const selected = budget.find((month) => month.period === selectedMonth) || budget[0];
  const pendingSuggestions = [...historyPaymentSuggestions(costs,startMonth),...payrollPlanSuggestions(cashflow,startMonth)].filter(s=>!paymentPlans.some(p=>p.aktywny && p.rodzaj==="monthly" && planKey(p.kategoria,p.podkategoria)===planKey(s.category,s.subcategory)));
  const planIncomplete = !paymentPlans.some(p=>p.aktywny && p.rodzaj!=="target") || pendingSuggestions.length>0 || unresolvedBudgetCosts(cashflow,startMonth,paymentPlans).length>0
    || cashflow.obligations.some(o=>!o.data_zaplaty && Number(o.kwota)>0 && (!o.termin_platnosci || o.termin_platnosci<startMonth+"-01"));
  const firstShortfall = budget.find((month) => month.closingCash < parsePolishNumber(safetyThreshold));
  const selectedRevenueDiff = selected ? selected.actualRevenue - selected.plannedRevenue : 0;
  const selectedCostDiff = selected ? selected.plannedCosts - selected.actualCosts : 0;

  async function loadData() {
    setLoading(true);
    const historyStart = shiftMonth(startMonth, -6);
    const forecastEnd = shiftMonth(startMonth, DEFAULT_HORIZON - 1);
    const [revenueResult, costsResult, employeeResult, cashflowResult, overridesResult, clientRevenueResult, crmRevenueResult, paymentPlansResult] = await Promise.all([
      fetchCfoBudgetRevenueLinesRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCfoCostsRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCfoEmployeeCostsRange(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCashflowSnapshot(),
      fetchCfoBudgetOverrides(monthToDate(historyStart), monthEndDate(forecastEnd)),
      fetchCfoBudgetClientRevenues(),
      fetchCfoBudgetCrmRevenues(),
      fetchBudgetPaymentPlans(),
    ]);

    if (revenueResult.error) console.error("Błąd pobierania przychodów do budżetu:", revenueResult.error);
    if (costsResult.error) console.error("Błąd pobierania kosztów do budżetu:", costsResult.error);
    if (employeeResult.error) console.error("Błąd pobierania kosztów zespołu do budżetu:", employeeResult.error);

    if (overridesResult.error) console.error("Błąd pobierania korekt budżetu:", overridesResult.error);
    if (clientRevenueResult.error) console.error("Błąd pobierania abonamentów klientów do budżetu:", clientRevenueResult.error);
    if (crmRevenueResult.error) console.error("Błąd pobierania CRM do budżetu:", crmRevenueResult.error);

    const failed = [revenueResult, costsResult, employeeResult, cashflowResult, overridesResult, clientRevenueResult, crmRevenueResult, paymentPlansResult].some(result => result.error);
    setDataError(failed ? "Nie udało się pobrać kompletu danych. Prognoza jest niedostępna — odśwież budżet." : null);
    setRevenueLines((revenueResult.data || []) as unknown as CfoInvoiceLine[]);
    setCosts((costsResult.data || []) as CfoCostItem[]);
    setEmployeeCosts((employeeResult.data || []) as CfoEmployeeCost[]);
    setCashflow(cashflowResult.data || emptyCashflow());
    setOverrides((overridesResult.data || []) as CfoBudgetOverride[]);
    setClientRevenues((clientRevenueResult.data || []) as CfoBudgetClientRevenue[]);
    setCrmRevenues((crmRevenueResult.data || []) as CfoBudgetCrmRevenue[]);
    setPaymentPlans(paymentPlansResult.data || []);
    setCostEditDrafts({});
    setLoading(false);
  }

  function changeStartMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    const nextMonth = value < BUDGET_FIRST_MONTH ? BUDGET_FIRST_MONTH : value;
    setStartMonth(nextMonth);
    setSelectedMonth(nextMonth);
  }

  function changeOpeningCash(value: string) {
    setOpeningCash(value);
    writeStoredBudgetSetting(OPENING_CASH_STORAGE_KEY, value);
  }

  function changeSafetyThreshold(value: string) {
    setSafetyThreshold(value);
    writeStoredBudgetSetting(SAFETY_THRESHOLD_STORAGE_KEY, value);
  }

  async function saveCostPlan(category: CfoCostCategory, subcategory: string, plannedValue: number) {
    const editKey = costEditKey(selectedMonth, category, subcategory);
    if (saving) return;
    const raw = costEditDrafts[editKey] ?? formatPlainNumber(plannedValue);
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(raw.replace(/\s/g,""))) return alert("Podaj nieujemną kwotę z maksymalnie dwoma miejscami po przecinku.");
    const nextValue = parsePolishNumber(raw);
    if (!Number.isFinite(nextValue) || nextValue < 0) return alert("Plan wydatków nie może być ujemny.");
    const existing = paymentPlans.find(p => p.aktywny && p.rodzaj === "target" && p.pierwszy_miesiac.slice(0,7) === selectedMonth && p.kategoria === category && (p.podkategoria || EMPTY_SUBCATEGORY) === subcategory);
    setSaving(true);
    try {
    const result = await saveBudgetPaymentPlan({
      id: existing?.id,
      nazwa: `Cel miesiąca: ${subcategory}`, rodzaj: "target", kategoria: category,
      podkategoria: subcategory === EMPTY_SUBCATEGORY ? "" : subcategory,
      kwota_brutto: nextValue, kwota_netto: null,
      pierwszy_miesiac: monthToDate(selectedMonth), ostatni_miesiac: null, liczba_rat: null, koszt_id: null, aktywny: true,
    });
    setSaving(false);

    if (result.error) {
      console.error(result.error);
      return alert("Nie udało się zapisać planu kosztu.");
    }

    await loadData();
    } catch { alert("Nie udało się zapisać planu. Spróbuj ponownie."); }
    finally { setSaving(false); }
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

      {!loading && dataError ? <section role="alert" style={panelStyle}>{dataError}</section> : null}
      <section style={{ ...metricGridStyle, ...(dataError ? { display: "none" } : {}) }}>
        <Metric label="Wpływy plan" value={formatMoney(selected?.plannedInflows || 0)} />
        <Metric label="Wypływy plan" value={formatMoney(selected?.plannedOutflows || 0)} tone="bad" />
        <Metric label="Przychody plan" value={formatMoney(selected?.plannedRevenue || 0)} />
        <Metric label="Koszty plan" value={formatMoney(selected?.plannedCosts || 0)} tone="bad" />
        <Metric label="Cash flow plan" value={formatMoney(selected?.plannedCashFlow || 0)} tone={(selected?.plannedCashFlow || 0) >= 0 ? "good" : "bad"} />
        <Metric label="Gotówka po miesiącu" value={formatMoney(selected?.closingCash || 0)} tone={(selected?.closingCash || 0) < parsePolishNumber(safetyThreshold) ? "bad" : "good"} />
        <Metric label="Pierwszy alarm" value={planIncomplete ? "Plan niepełny" : firstShortfall ? formatMonthField(firstShortfall.period) : "Brak"} tone={firstShortfall ? "bad" : "good"} />
      </section>

      <section style={controlsPanelStyle}>
        <label style={fieldStyle}>
          <span>Gotówka na start</span>
          <input style={inputStyle} value={openingCash} onChange={(event) => changeOpeningCash(event.target.value)} />
        </label>
        <label style={fieldStyle}>
          <span>Próg bezpieczeństwa</span>
          <input style={inputStyle} value={safetyThreshold} onChange={(event) => changeSafetyThreshold(event.target.value)} />
        </label>
      </section>

      <section style={panelStyle}>
        <h2 style={panelTitleStyle}>Plan pieniędzy i plan wyniku</h2>
        <p>Płatności planujesz kwotami brutto. Wpisana kwota docelowa zastępuje prognozę, a zapisane zapłaty i zobowiązania z ustalonym terminem są jej minimum. Różnica może być ujemna, jeśli wykonanie przekroczy plan; sam plan wydatku nie jest ujemny.</p>
        <p>Historia kosztów służy wyłącznie jako podpowiedź do zatwierdzenia. Starsze dokumenty bez rozliczonej płatności wymagają wyjaśnienia. Raty wpływają na pieniądze, a koszt sprzętu pozostaje w miesiącu jego ujęcia.</p>
        <p>Saldo na start dotyczy początku {formatMonthField(startMonth)}. Uzupełnij wszystkie plany przed oceną prognozowanego salda.</p>
        <label><input type="checkbox" checked={includeCrmGrowth} onChange={event => setIncludeCrmGrowth(event.target.checked)} /> Uwzględnij dodatkowy wzrost przychodów z CRM (scenariusz)</label>
        {planIncomplete && <p role="status" style={{color:colors.warning}}><strong>Plan roboczy — prognoza salda jest niepełna.</strong> Uzupełnij harmonogram płatności i wyjaśnij dokumenty poniżej.</p>}
      </section>
      {loading ? <section style={panelStyle}>Ładowanie budżetu...</section> : null}

      {!loading && !dataError ? (
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
              <h2 style={panelTitleStyle}>Plan wyniku (netto)</h2>
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
            <h2 style={panelTitleStyle}>Koszty wyniku — netto</h2>
            <CategoryTable rows={selected?.costCategories || []} reverseDiff totalLabel="Suma kosztów netto" />
          </article>
          <article style={widePanelStyle}>
            <div style={panelHeaderStyle}>
              <Banknote size={21} style={panelIconStyle} />
              <h2 style={panelTitleStyle}>Plan wydatków — przepływy pieniężne</h2>
            </div>
            <p style={{ color: colors.muted, fontSize: "13px", margin: "0 0 16px" }}>Kwoty brutto. Zapisz docelową sumę płatności podkategorii w wybranym miesiącu. Zapis nie zmienia kosztu netto ani historii zapłat. Dla powtarzalnych opłat i rat użyj harmonogramu powyżej.</p>
            <CostCategoryEditor
              groups={selected?.costSubcategories || []}
              selectedMonth={selectedMonth}
              drafts={costEditDrafts}
              onDraftChange={(key, value) => setCostEditDrafts((current) => ({ ...current, [key]: value }))}
              onSave={saveCostPlan}
              disabled={saving}
            />
          </article>
          <article id="harmonogram" style={widePanelStyle}>
            <BudgetPaymentPlans plans={paymentPlans} snapshot={cashflow} costs={costs} month={selectedMonth} startMonth={startMonth} legacy={overrides} categories={COST_OPTIONS} onReload={loadData} />
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
  disabled = false,
}: {
  groups: BudgetCostGroup[];
  disabled?: boolean;
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
                <span>{row.label}{row.source && <small style={{display:"block",color:colors.muted,fontSize:11}}>{row.source}</small>}</span>
                <input aria-label={`Plan płatności: ${row.label}`} inputMode="decimal" style={smallInputStyle} value={value} onChange={(event) => onDraftChange(editKey, event.target.value)} />
                <span style={rightAlignedStyle}>{formatMoney(row.actual)}</span>
                <Diff value={row.planned - row.actual} />
                <button type="button" disabled={disabled} style={smallButtonStyle} onClick={() => void onSave(group.key, row.key, row.planned)}>
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
      <AppFormInput
        type="month"
        min={BUDGET_FIRST_MONTH}
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
  snapshot: CashflowSnapshot = emptyCashflow(),
  paymentPlans: BudgetPaymentPlan[] = [],
): BudgetMonth[] {
  // Legacy expense deltas remain available for review, but cannot modify the new plan.
  overrides = overrides.filter(row => row.typ !== "koszt");
  const months = monthsForRange(startMonth, horizon);
  const costHistoryMonths = monthsForRange(shiftMonth(startMonth, -3), 3);
  const revenueHistoryMonths = monthsForRange(shiftMonth(startMonth, -6), 6);
  const actualByMonth = buildActualMonthMap([...revenueHistoryMonths, ...months], revenueLines, costs, employees, bankTransactions);
  const planActualByMonth = buildActualMonthMap([...revenueHistoryMonths, ...months], revenueLines, costs.filter(cost => !cost.harmonogram_id), employees, bankTransactions);
  const baseline = buildBaseline(revenueHistoryMonths, costHistoryMonths, planActualByMonth, overrides);
  const crmForecast = buildCrmRevenueGrowthForecast(costHistoryMonths, months, crmRevenues);
  for (const entry of baseline.costPlanEntries) {
    const source = snapshot.costs.filter(cost => !cost.ignoruj && !cost.harmonogram_id && !cost.rozliczenie_wynagrodzen_okres && costHistoryMonths.includes(cost.okres_start.slice(0, 7)) && counterpartyKey(cost.kontrahent || cost.id) === entry.vendorKey && cost.kategoria === entry.category && (cost.podkategoria || EMPTY_SUBCATEGORY) === entry.subcategory);
    const net = sum(source.map(cost => Number(cost.kwota_netto_cfo)));
    const issueDays = source.filter(cost => cost.data_dokumentu).map(cost => Number(cost.data_dokumentu?.slice(8, 10)));
    entry.issueDay = issueDays.length ? Math.round(sum(issueDays) / issueDays.length) : 1;
    entry.grossRatio = net > 0 ? sum(source.map(cost => Number(cost.kwota_brutto ?? cost.kwota_netto_cfo))) / net : 1;
  }
  const asOf = startMonth < businessDate().slice(0, 7) ? monthToDate(startMonth) : businessDate();
  const budgetInvoices: BudgetInvoice[] = snapshot.invoices.filter(invoice => !invoice.waluta || invoice.waluta === "PLN").map(invoice => ({
    id: invoice.id, payerKey: counterpartyKey(invoice.klient_id || invoice.kontrahent_nazwa || invoice.id),
    servicePeriod: (invoice.okres || invoice.data_wystawienia || monthToDate(startMonth)).slice(0, 7),
    issueDate: invoice.data_wystawienia, dueDate: invoice.termin_platnosci, gross: Number(invoice.kwota_brutto || 0), ...actualInvoicePayment(invoice),
  }));
  const invoiceIssueProfile = buildInvoiceIssueProfile(revenueLines.filter(line => { const invoice = firstRelation(line.faktury); return invoice?.data_wystawienia && invoice.data_wystawienia <= asOf && invoice.data_wystawienia >= shiftMonth(asOf.slice(0,7), -6) + "-01"; }));
  const invoicePaymentProfile = buildInvoicePaymentProfile(budgetInvoices, asOf);
  invoicePaymentProfile.asOf = asOf > monthToDate(startMonth) ? asOf : monthToDate(startMonth);
  const budgetCostPayments = buildBudgetCostPayments(snapshot.costs);
  const costPaymentProfile = buildCostPaymentProfile(budgetCostPayments, asOf);
  costPaymentProfile.asOf = asOf > monthToDate(startMonth) ? asOf : monthToDate(startMonth);

  let cash = openingCash;

  return months.map((period) => {
    const actual = actualByMonth.get(period) || emptyActual();
    const monthOverrides = overrides.filter((override) => overrideApplies(override, period));
    const plannedRevenueEntries = plannedRevenueEntriesForMonth(period, baseline, clientRevenues, crmForecast);
    const plannedRevenueCategories = plannedRevenueForMonth(plannedRevenueEntries);
    const plannedCostSubcategories = cloneNestedMap((planActualByMonth.get(period) || emptyActual()).costBySubcategory);
    for (const entry of plannedNetAmounts(period, paymentPlans)) {
      setSubcategoryAmount(plannedCostSubcategories, entry.category, entry.subcategory, Math.max(entry.amount, plannedCostSubcategories.get(entry.category)?.get(entry.subcategory) || 0));
    }
    const explicitPayments = explicitPaymentMonth(period, startMonth, snapshot, paymentPlans, COST_OPTIONS);
    const annual = annualCostForecast(period, snapshot.annualSchedules || [], snapshot.costs, invoicePaymentProfile.asOf);
    for (const cost of snapshot.costs.filter(cost => !cost.ignoruj && cost.harmonogram_id)) {
      upsertSubcategoryAmount(plannedCostSubcategories, cost.kategoria, cost.podkategoria || EMPTY_SUBCATEGORY, costShareForMonth(cost, period));
    }
    for (const group of annual.groups) upsertSubcategoryAmount(plannedCostSubcategories, group.category, group.subcategory || EMPTY_SUBCATEGORY, group.net);
    const manualRevenueRows = (snapshot.manualRevenues || []).filter(row => row.okres.slice(0, 7) === period);
    const manualRevenueNet = sum(manualRevenueRows.map(row => Number(row.kwota_netto)));
    if (manualRevenueRows.length) {
      plannedRevenueCategories.set("pozostale", (plannedRevenueCategories.get("pozostale") || 0) + manualRevenueNet);
      actual.revenue += manualRevenueNet;
      actual.revenueByCategory.set("pozostale", (actual.revenueByCategory.get("pozostale") || 0) + manualRevenueNet);
    }
    const manualRevenueReceipts = manualRevenueCashflow(period, snapshot.manualRevenues || [], invoicePaymentProfile.asOf);
    const crmCumulativeRevenueGrowth = crmForecast.cumulativeRevenueGrowthByMonth.get(period) || 0;
    const invoiceCashFlow = plannedInvoiceCustomerCashFlowForMonth(period, budgetInvoices, invoicePaymentProfile);
    const plannedCustomerCashFlow = invoiceCashFlow.amount
      + plannedUnissuedRevenueCashFlowForMonth(period, months, baseline, clientRevenues, crmForecast, actualByMonth, invoiceIssueProfile, invoicePaymentProfile);
    let manualRevenueCashFlow = 0;
    let manualCostCashFlow = 0;

    monthOverrides.forEach((override) => {
      if (override.typ === "przychod") {
        plannedRevenueCategories.set(override.kategoria, (plannedRevenueCategories.get(override.kategoria) || 0) + Number(override.kwota_plan || 0));
        manualRevenueCashFlow += Number(override.kwota_cashflow || 0);
      } else {
        const subcategory = override.podkategoria || EMPTY_SUBCATEGORY;
        upsertSubcategoryAmount(plannedCostSubcategories, override.kategoria as CfoCostCategory, subcategory, Number(override.kwota_plan || 0));
        manualCostCashFlow += Number(override.kwota_cashflow || 0);
      }
    });

    const plannedCostCategories = categoryTotalsFromSubcategories(plannedCostSubcategories);
    const plannedRevenue = sum(Array.from(plannedRevenueCategories.values()));
    const plannedCosts = sum(Array.from(plannedCostCategories.values()));
    const plannedResult = plannedRevenue - plannedCosts;
    const extraFlow = manualCashflowForecast(period, snapshot.manualFlows || [], invoicePaymentProfile.asOf);
    const plannedInflows = plannedCustomerCashFlow + manualRevenueCashFlow + manualRevenueReceipts + Math.max(0, extraFlow);
    const plannedOutflows = explicitPayments.total + Math.max(0, -extraFlow);
    const plannedCashFlow = plannedInflows - plannedOutflows;
    cash += plannedCashFlow;

    return {
      period,
      plannedRevenue,
      plannedInflows,
      plannedOutflows,
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
      costSubcategories: explicitPayments.groups,
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
      if (isCostCashFlowForecastable(cost)) {
        const entryKey = costEntryKey(counterpartyKey(cost.kontrahent || cost.id), cost.kategoria, cost.podkategoria || EMPTY_SUBCATEGORY);
        current.costByVendorSubcategory.set(entryKey, (current.costByVendorSubcategory.get(entryKey) || 0) + amount);
      }
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
    const average = profile.averageDaysByCounterparty.get(invoice.payerKey);
    const expectedDate = invoice.dueDate || (average !== undefined ? addDays(baseDate, average) : addDays(baseDate, 14));
    if (expectedDate < profile.asOf) return;
    const expectedMonth = expectedDate.slice(0, 7);
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
  issueProfile: IssueDateProfile,
  profile: PaymentProfile,
) {
  return sum(forecastMonths.map((issuePeriod) => {
    const planned = plannedRevenueEntriesForMonth(issuePeriod, baseline, clientRevenues, crmForecast);
    const actual = actualByMonth.get(issuePeriod) || emptyActual();
    return sum(planned.map((entry) => {
      const issuedNet = actual.revenueByClientCategory.get(entry.payerKey)?.get(entry.category) || 0;
      const missingNet = Math.max(0, entry.amountNet - issuedNet);
      if (missingNet <= 0.01) return 0;

      const issueDate = issueDateForRevenueEntry(issuePeriod, entry, issueProfile);
      const expectedMonth = addDays(issueDate, averageDaysFor(profile, entry.payerKey)).slice(0, 7);
      return expectedMonth === cashFlowPeriod ? missingNet * 1.23 : 0;
    }));
  }));
}

function buildCostCashflowGroups(
  period: string, forecastMonths: string[], entries: BudgetCostPlanEntry[],
  actualByMonth: Map<string, ReturnType<typeof emptyActual>>, payments: BudgetCostPayment[],
  profile: PaymentProfile, snapshot: CashflowSnapshot, overrides: CfoBudgetOverride[], startMonth: string,
) {
  const planned = new Map<string, Map<string, number>>();
  const actual = new Map<string, Map<string, number>>();
  const keys = new Map<string, { category: CfoCostCategory; subcategory: string }>();
  const addKey = (category: CfoCostCategory, subcategory: string | null) => {
    const sub = subcategory || EMPTY_SUBCATEGORY;
    keys.set(JSON.stringify([category, sub]), { category, subcategory: sub });
  };
  entries.forEach(row => addKey(row.category, row.subcategory));
  payments.forEach(row => addKey(row.category, row.subcategory));
  (snapshot.annualSchedules || []).forEach(row => addKey(row.kategoria, row.podkategoria));
  overrides.filter(row => row.typ === "koszt").forEach(row => addKey(row.kategoria as CfoCostCategory, row.podkategoria));
  for (const { category, subcategory } of keys.values()) {
    const rows = payments.filter(row => row.category === category && row.subcategory === subcategory);
    const schedules = (snapshot.annualSchedules || []).filter(row => row.kategoria === category && (row.podkategoria || EMPTY_SUBCATEGORY) === subcategory);
    const forecast = plannedCostCashFlowForMonth(period, rows, profile).amount
      + plannedUnrecordedCostCashFlowForMonth(period, forecastMonths, entries.filter(row => row.category === category && row.subcategory === subcategory), actualByMonth, profile)
      + annualCostForecast(period, schedules, snapshot.costs, profile.asOf).cash
      + sum(overrides.filter(row => row.typ === "koszt" && row.kategoria === category && (row.podkategoria || EMPTY_SUBCATEGORY) === subcategory).map(row => Number(row.kwota_cashflow || 0)));
    upsertSubcategoryAmount(planned, category, subcategory, forecast);
    upsertSubcategoryAmount(actual, category, subcategory, sum(rows.filter(row => row.paymentDate?.slice(0, 7) === period).map(row => row.paidAmount)));
  }
  for (const kind of OBLIGATION_TYPES) {
    const category: CfoCostCategory = kind.value === "vat" || kind.value === "cit" ? "administracja_ogolne" : "koszty_zespolu";
    const rows = snapshot.obligations.filter(row => row.typ === kind.value);
    upsertSubcategoryAmount(planned, category, kind.label, obligationCashflow(period, rows, startMonth, profile.asOf));
    upsertSubcategoryAmount(actual, category, kind.label, sum(rows.filter(row => row.data_zaplaty?.slice(0, 7) === period).map(row => Number(row.kwota))));
  }
  return costGroupRows(planned, actual);
}

function buildBudgetCostPayments(costs: CfoCostItem[]): BudgetCostPayment[] {
  return costs
    .filter((cost) => !cost.ignoruj && !cost.rozliczenie_wynagrodzen_okres)
    .map((cost) => {
      const payment = costPaymentInfo(cost);
      return {
        id: cost.id,
        vendorKey: counterpartyKey(cost.kontrahent || cost.id),
        category: cost.kategoria,
        subcategory: cost.podkategoria || EMPTY_SUBCATEGORY,
        documentDate: cost.data_dokumentu,
        dueDate: cost.termin_platnosci || null,
        annualScheduleId: cost.harmonogram_id || null,
        servicePeriod: cost.okres_start.slice(0, 7),
        amount: Number(cost.kwota_brutto ?? cost.kwota_netto_cfo ?? 0),
        paidAmount: payment.paidAmount,
        paymentDate: payment.paymentDate,
      };
    })
    .filter((cost) => cost.amount > 0);
}

function costPaymentInfo(cost: CfoCostItem) { return actualCostPayment(cost); }

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
    const expectedDate = cost.annualScheduleId && cost.dueDate
      ? cost.dueDate
      : addDays(baseDate, averageDaysFor(profile, cost.vendorKey));
    const expectedMonth = (expectedDate < profile.asOf ? profile.asOf : expectedDate).slice(0, 7);
    if (expectedMonth !== period) return;

    amount += unpaidAmount;
    hasCostSignal = true;
  });

  return { amount, hasCostSignal };
}

function plannedUnrecordedCostCashFlowForMonth(
  cashFlowPeriod: string,
  forecastMonths: string[],
  baselineEntries: BudgetCostPlanEntry[],
  actualByMonth: Map<string, ReturnType<typeof emptyActual>>,
  profile: PaymentProfile,
) {
  return sum(forecastMonths.map((costPeriod) => {
    const actual = actualByMonth.get(costPeriod) || emptyActual();
    return sum(baselineEntries.map((entry) => {
      const issuedAmount = actual.costByVendorSubcategory.get(costEntryKey(entry.vendorKey, entry.category, entry.subcategory)) || 0;
      const missingAmount = Math.max(0, entry.amount - issuedAmount);
      if (missingAmount <= 0.01) return 0;

      const expectedMonth = addDays(dateInMonth(costPeriod, entry.issueDay ?? 1), averageDaysFor(profile, entry.vendorKey)).slice(0, 7);
      return expectedMonth === cashFlowPeriod ? missingAmount * (entry.grossRatio ?? 1) : 0;
    }));
  }));
}

type PaymentProfile = {
  asOf: string;
  globalAverageDays: number;
  averageDaysByCounterparty: Map<string, number>;
};

type IssueDateProfile = {
  globalIssueDay: number;
  issueDayByCounterparty: Map<string, number>;
  issueDayByCategory: Map<string, number>;
  issueDayByCounterpartyCategory: Map<string, number>;
};

function buildInvoiceIssueProfile(revenueLines: CfoInvoiceLine[]): IssueDateProfile {
  const samples = revenueLines
    .map((line) => {
      const invoice = firstRelation(line.faktury);
      if (!invoice?.data_wystawienia || invoice.typ !== "sprzedaz" || invoice.status === "anulowana" || invoice.kategoria === "korekta") return null;
      return {
        payerKey: counterpartyKey(invoice.klient_id || invoice.kontrahent_nazwa || invoice.id),
        category: line.cfo_przychod_kategoria || "pozostale",
        day: Number(invoice.data_wystawienia.slice(8, 10)),
      };
    })
    .filter((sample): sample is { payerKey: string; category: CfoRevenueCategory; day: number } => Boolean(sample && Number.isFinite(sample.day)));

  const globalIssueDay = samples.length > 0 ? clamp(Math.round(sum(samples.map((sample) => sample.day)) / samples.length), 1, 28) : 10;

  return {
    globalIssueDay,
    issueDayByCounterparty: averageIssueDayMap(samples.map((sample) => ({ key: sample.payerKey, day: sample.day }))),
    issueDayByCategory: averageIssueDayMap(samples.map((sample) => ({ key: sample.category, day: sample.day }))),
    issueDayByCounterpartyCategory: averageIssueDayMap(samples.map((sample) => ({ key: revenueIssueKey(sample.payerKey, sample.category), day: sample.day }))),
  };
}

function averageIssueDayMap(samples: { key: string; day: number }[]) {
  const grouped = new Map<string, number[]>();
  samples.forEach((sample) => {
    grouped.set(sample.key, [...(grouped.get(sample.key) || []), sample.day]);
  });

  return new Map(Array.from(grouped.entries()).map(([key, values]) => [
    key,
    clamp(Math.round(sum(values) / values.length), 1, 28),
  ]));
}

function buildInvoicePaymentProfile(invoices: BudgetInvoice[], asOf = businessDate()): PaymentProfile {
  const averages = paymentAverage(invoices.filter(i => i.paidAmount >= i.gross - 0.01 && i.gross > 0).map(i => ({ key: i.payerKey, issueDate: i.issueDate, paidDate: i.paymentDate })), asOf);
  return { globalAverageDays: 14, averageDaysByCounterparty: averages, asOf };
}
function buildCostPaymentProfile(costs: BudgetCostPayment[], asOf = businessDate()): PaymentProfile {
  const averages = paymentAverage(costs.filter(c => c.paidAmount >= c.amount - 0.01 && c.amount > 0).map(c => ({ key: c.vendorKey, issueDate: c.documentDate, paidDate: c.paymentDate })), asOf);
  return { globalAverageDays: 14, averageDaysByCounterparty: averages, asOf };
}

function averageDaysFor(profile: PaymentProfile, counterpartyKeyValue: string) {
  return profile.averageDaysByCounterparty.get(counterpartyKeyValue) ?? profile.globalAverageDays;
}

function issueDateForRevenueEntry(period: string, entry: BudgetRevenuePlanEntry, profile: IssueDateProfile) {
  const day = profile.issueDayByCounterpartyCategory.get(revenueIssueKey(entry.payerKey, entry.category))
    ?? profile.issueDayByCounterparty.get(entry.payerKey)
    ?? profile.issueDayByCategory.get(entry.category)
    ?? profile.globalIssueDay;
  return dateInMonth(period, day);
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
      const additionalServices = baseline.clientRevenueAverages.get(payerKey)?.get("uslugi_dodatkowe") || 0;

      if (abonament > 0) entries.push({ payerKey, category: "abonamenty", amountNet: abonament });
      if (payroll > 0) entries.push({ payerKey, category: "kadry_place", amountNet: payroll });
      if (additionalServices > 0) entries.push({ payerKey, category: "uslugi_dodatkowe", amountNet: additionalServices });
    });

  const crmSubscription = crmForecast.cumulativeRevenueGrowthByMonth.get(period) || 0;
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
  monthlyRevenueGrowthByMonth: Map<string, number>;
  cumulativeRevenueGrowthByMonth: Map<string, number>;
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

  const monthlyRevenueGrowthByMonth = new Map<string, number>();
  const cumulativeRevenueGrowthByMonth = new Map<string, number>();
  let cumulativeGrowth = 0;

  forecastMonths.forEach((month, index) => {
    const projectedGrowth = index === 0 ? 0 : rollingAveragePreviousMonths(month, wonRevenueByMonth, 3);
    cumulativeGrowth += projectedGrowth;
    monthlyRevenueGrowthByMonth.set(month, projectedGrowth);
    cumulativeRevenueGrowthByMonth.set(month, cumulativeGrowth);
    wonRevenueByMonth.set(month, projectedGrowth);
  });

  const monthlyRevenueGrowth = monthlyRevenueGrowthByMonth.get(forecastMonths[1]) || rollingAveragePreviousMonths(forecastMonths[0] || currentMonthInput(), wonRevenueByMonth, 3);
  return { monthlyRevenueGrowth, monthlyRevenueGrowthByMonth, cumulativeRevenueGrowthByMonth };
}

function rollingAveragePreviousMonths(month: string, valuesByMonth: Map<string, number>, windowSize: number) {
  const months = Array.from({ length: windowSize }, (_, index) => shiftMonth(month, index - windowSize));
  return sum(months.map((period) => valuesByMonth.get(period) || 0)) / windowSize;
}

function buildBaseline(
  revenueHistoryMonths: string[],
  costHistoryMonths: string[],
  actualByMonth: Map<string, ReturnType<typeof emptyActual>>,
  overrides: CfoBudgetOverride[],
) {
  const revenue = new Map<string, number>();
  const costs = new Map<string, number>();
  const costSubcategoryTotals = new Map<string, Map<string, number>>();
  const costSubcategoryCounts = new Map<string, Map<string, number>>();
  const costPlanEntryTotals = new Map<string, number>();
  const costPlanEntryCounts = new Map<string, number>();
  let cashFlow = 0;
  let revenueCashFlow = 0;

  revenue.set("kadry_place", 0);
  revenue.set("uslugi_dodatkowe", 0);
  revenue.set("pozostale", 0);
  revenue.set("wdrozenia", 0);
  const clientRevenueAverages = averageClientRevenueCategories([
    { category: "kadry_place", months: revenueHistoryMonths.slice(-3) },
    { category: "uslugi_dodatkowe", months: revenueHistoryMonths },
  ], actualByMonth);

  costHistoryMonths.forEach((month) => {
    const actual = actualByMonth.get(month) || emptyActual();
    const adjustedCostByCategory = new Map(actual.costByCategory);
    const adjustedCostBySubcategory = cloneNestedMap(actual.costBySubcategory);

    overrides
      .filter((override) => override.typ === "koszt" && overrideApplies(override, month))
      .forEach((override) => {
        const category = override.kategoria as CfoCostCategory;
        const subcategory = override.podkategoria || EMPTY_SUBCATEGORY;
        const amount = Number(override.kwota_plan || 0);
        adjustedCostByCategory.set(category, (adjustedCostByCategory.get(category) || 0) + amount);
        upsertSubcategoryAmount(adjustedCostBySubcategory, category, subcategory, amount);
      });

    COST_OPTIONS.forEach((option) => {
      costs.set(option.value, (costs.get(option.value) || 0) + Math.max(0, adjustedCostByCategory.get(option.value) || 0) / costHistoryMonths.length);
    });
    adjustedCostBySubcategory.forEach((subcategories, category) => {
      subcategories.forEach((value, subcategory) => {
        if (value <= 0) return;
        upsertSubcategoryAmount(costSubcategoryTotals, category as CfoCostCategory, subcategory, value);
        upsertSubcategoryAmount(costSubcategoryCounts, category as CfoCostCategory, subcategory, 1);
      });
    });
    actual.costByVendorSubcategory.forEach((value, key) => {
      if (value <= 0) return;
      costPlanEntryTotals.set(key, (costPlanEntryTotals.get(key) || 0) + value);
      costPlanEntryCounts.set(key, (costPlanEntryCounts.get(key) || 0) + 1);
    });
    cashFlow += actual.cashFlow / costHistoryMonths.length;
    revenueCashFlow += actual.revenueCashFlow / costHistoryMonths.length;
  });

  const costPlanEntries: BudgetCostPlanEntry[] = Array.from(costPlanEntryTotals.entries())
    .filter(([key]) => (costPlanEntryCounts.get(key) || 0) >= Math.min(2, costHistoryMonths.length))
    .map(([key, total]) => {
      const parsed = parseCostEntryKey(key);
      return {
        ...parsed,
        amount: total / (costPlanEntryCounts.get(key) || 1),
      };
    })
    .filter((entry): entry is BudgetCostPlanEntry => Boolean(entry.vendorKey && entry.category && entry.subcategory && entry.amount > 0));

  return {
    revenue,
    costs,
    costSubcategories: averageNestedMap(costSubcategoryTotals, costSubcategoryCounts),
    costPlanEntries,
    clientRevenueAverages,
    cashFlowWithoutRevenue: cashFlow - revenueCashFlow,
  };
}

function averageClientRevenueCategories(configs: { category: CfoRevenueCategory; months: string[] }[], actualByMonth: Map<string, ReturnType<typeof emptyActual>>) {
  const averages = new Map<string, Map<string, number>>();

  configs.forEach(({ category, months }) => {
    if (months.length === 0) return;
    const clientKeys = new Set<string>();
    months.forEach((month) => {
      actualByMonth.get(month)?.revenueByClientCategory.forEach((categories, clientKey) => {
        if ((categories.get(category) || 0) > 0) clientKeys.add(clientKey);
      });
    });

    clientKeys.forEach((clientKey) => {
      setSubcategoryAmount(averages, clientKey, category, sum(months.map((month) => actualByMonth.get(month)?.revenueByClientCategory.get(clientKey)?.get(category) || 0)) / months.length);
    });
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
    costByVendorSubcategory: new Map<string, number>(),
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

function costEntryKey(vendorKey: string, category: CfoCostCategory, subcategory: string) {
  return `${vendorKey}\u0001${category}\u0001${subcategory}`;
}

function revenueIssueKey(payerKey: string, category: CfoRevenueCategory) {
  return `${payerKey}\u0001${category}`;
}

function parseCostEntryKey(key: string) {
  const [vendorKey, category, subcategory] = key.split("\u0001");
  return {
    vendorKey,
    category: category as CfoCostCategory,
    subcategory,
  };
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

function isCostCashFlowForecastable(cost: CfoCostItem) {
  return !cost.rozliczenie_wynagrodzen_okres && cost.kategoria !== "jednorazowe_nadzwyczajne" && cost.ujecie_zarzadcze !== "rozliczenie_w_czasie";
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
  const month = businessDate().slice(0, 7);
  return month < BUDGET_FIRST_MONTH ? BUDGET_FIRST_MONTH : month;
}

function currentMonthInput() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function readStoredBudgetSetting(key: string) {
  if (typeof window === "undefined") return "0";
  return window.localStorage.getItem(key) || "0";
}

function writeStoredBudgetSetting(key: string, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
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

function dateInMonth(period: string, day: number) {
  const safeDay = clamp(Math.round(day), 1, Number(monthEndDate(period).slice(8, 10)));
  return `${period}-${String(safeDay).padStart(2, "0")}`;
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
