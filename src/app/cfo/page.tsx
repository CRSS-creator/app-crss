"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Banknote, BriefcaseBusiness, CalendarDays, FileSpreadsheet, LayoutDashboard, Plus, ReceiptText, RefreshCw, Save, Trash2, TrendingUp, Upload, Users } from "lucide-react";
import * as XLSX from "xlsx";

import { clientProfitability, workMonth, type ClientRevenue } from "@/lib/cfoAnalytics";
import { colors, radius, shadow } from "@/app/design";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import AppSelect from "@/components/AppSelect";
import {
  fetchCfoAnalysis,
  fetchCfoCosts,
  fetchCfoCostsRange,
  fetchCfoCostDuplicateCandidates,
  fetchCfoEmployeeCosts,
  fetchCfoEmployeeCostsRange,
  fetchCfoRevenueLinesRange,
  fetchCfoTeamMembers,
  deleteCfoCost,
  insertCfoCosts,
  updateCfoCost,
  updateInvoiceLineCfoCategory,
  upsertCfoEmployeeCost,
  type CfoBankTransaction,
  type CfoClientTimeEntry,
  type CfoCostCategory,
  type CfoCostDuplicateCandidate,
  type CfoCostImportRow,
  type CfoCostItem,
  type CfoEmployeeCost,
  type CfoInvoiceLine,
  type CfoRevenueCategory,
  type CfoTeamMember,
} from "@/lib/cfoService";

import CfoCashflowPanel from "@/components/CfoCashflowPanel";
import CfoDateField from "@/components/CfoDateField";
import * as cfoUi from "@/components/cfoStyles";
import { cashflowTransactions, emptyCashflow, actualCostPayment, type CashflowSnapshot } from "@/lib/cfoCashflow";
import { fetchCashflowSnapshot } from "@/lib/cfoCashflowService";

type CfoTab = "dashboard" | "przychody" | "koszty" | "cashflow" | "zespol" | "klienci";
type CfoViewMode = "month" | "year";
type EmployeeCostDraft = Omit<CfoEmployeeCost, "id"> & { id?: string };
type ManualCostDraft = Omit<CfoCostImportRow, "kategoria"> & { kategoria: CfoCostCategory | "" };

const TABS: { id: CfoTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "przychody", label: "Przychody", icon: TrendingUp },
  { id: "koszty", label: "Koszty", icon: ReceiptText },
  { id: "cashflow", label: "Cash flow", icon: Banknote },
  { id: "zespol", label: "Zespół", icon: Users },
  { id: "klienci", label: "Klienci", icon: BriefcaseBusiness },
];

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
const MANUAL_COST_OPTIONS: { value: string; label: string }[] = [{ value: "", label: "Wybierz kategorię" }, ...COST_OPTIONS];

const SUBCATEGORIES: Record<CfoCostCategory, string[]> = {
  koszty_zespolu: ["Wynagrodzenie podstawowe", "ZUS pracodawcy", "Benefity", "Premie", "Szkolenia"],
  lokal_infrastruktura: ["Czynsz", "Prąd", "Gaz", "Śmieci", "Woda", "Sprzątanie", "Wyposażenie", "Materiały gospodarcze"],
  systemy_technologia: ["wFirma", "Google Workspace", "MS Office", "OpenAI", "T-Mobile", "Inne"],
  marketing_sprzedaz: ["Meta ADS", "Google ADS", "Canva", "Koszt zespołu marketingowego", "Koszt zespołu sprzedażowego", "Pozostałe"],
  administracja_ogolne: ["Wynagrodzenie pracowników administracji - podstawa", "Wynagrodzenie pracowników administracji - ZUS pracodawcy", "Wynagrodzenie pracowników administracji - benefity", "Wynagrodzenie pracowników administracji - premie", "Wynagrodzenie pracowników administracji - szkolenia", "Artykuły biurowe / spożywcze", "Prawne / podatkowe", "OC", "Bank", "Poczta / kurier", "Reprezentacja", "Inne"],
  zarzad_wlasciciel: ["Wynagrodzenie netto Prezesa", "Premia netto Prezesa", "PIT od wynagrodzenia Prezesa", "ZUS od wynagrodzenia Prezesa", "Inne obciążenia wynagrodzenia Prezesa", "Samochód służbowy"],
  jednorazowe_nadzwyczajne: [],
};

const EMPTY_EMPLOYEE: Omit<CfoEmployeeCost, "id"> = {
  okres: currentMonthDate(),
  osoba_id: null,
  osoba_nazwa: "",
  zespol: "ksiegowy",
  w_capacity: true,
  wymiar_etatu: 1,
  podstawa: 0,
  zus_pracodawcy: 0,
  benefity: 0,
  premie: 0,
  szkolenia: 0,
  nieobecnosci_godziny: 0,
  nadgodziny: 0,
};

const OWNER_MONTHLY_PAYOUT = 15000;
const COMPANY_BUFFER_RATE = 0.1;
const MONTH_LABELS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];

export default function CfoPage() {
  return (
    <AppLayout activePage="cfo">
      <AccessGuard moduleName="cfo">
        <CfoContent />
      </AccessGuard>
    </AppLayout>
  );
}

function CfoContent() {
  const [activeTab, setActiveTab] = useState<CfoTab>("dashboard");
  const [period, setPeriod] = useState(currentMonthInput());
  const [viewMode, setViewMode] = useState<CfoViewMode>("month");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revenueLines, setRevenueLines] = useState<CfoInvoiceLine[]>([]);
  const [costs, setCosts] = useState<CfoCostItem[]>([]);
  const [cashflow, setCashflow] = useState<CashflowSnapshot>(emptyCashflow);
  const [cashflowError, setCashflowError] = useState<string | null>(null);
  const [employeeCosts, setEmployeeCosts] = useState<CfoEmployeeCost[]>([]);
  const bankTransactions = useMemo(() => {
    const range = cfoPeriodRange(period, viewMode);
    return cashflowTransactions(cashflow).filter(t => t.data_ksiegowania >= range.from && t.data_ksiegowania <= range.to);
  }, [cashflow, period, viewMode]);

  const [clientTimeEntries, setClientTimeEntries] = useState<CfoClientTimeEntry[]>([]);
  const [analysis, setAnalysis] = useState<NonNullable<Awaited<ReturnType<typeof fetchCfoAnalysis>>["data"]> | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const [teamMembers, setTeamMembers] = useState<CfoTeamMember[]>([]);
  const [manualCost, setManualCost] = useState<ManualCostDraft>(() => emptyManualCost(period));
  const [manualInterperiod, setManualInterperiod] = useState(false);
  const [expandedCostPeriods, setExpandedCostPeriods] = useState<Record<string, boolean>>({});
  const [employeeDrafts, setEmployeeDrafts] = useState<Record<string, EmployeeCostDraft>>({});
  const [costSearch, setCostSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");


  useEffect(() => {
    void loadData();
    // Dane CFO przeładowują się po zmianie okresu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, viewMode]);

  const view = useMemo(
    () => buildCfoView(period, viewMode, revenueLines, costs, employeeCosts, bankTransactions),
    [period, viewMode, revenueLines, costs, employeeCosts, bankTransactions],
  );

  const clientAnalysis = useMemo(() => {
    if (!analysis || analysisError) return null;
    const range = cfoPeriodRange(period, viewMode);
    const revenues: ClientRevenue[] = view.revenueLines.map(line => {
      const id = invoiceClientId(line), name = invoiceClientName(line);
      return { key: id || name, id, name, period: revenueLineEffectivePeriod(line),
        revenue: Number(line.kwota_netto || 0),
        mrr: line.cfo_przychod_kategoria === "abonamenty" ? Number(line.kwota_netto || 0) : 0 };
    });
    return clientProfitability(range.from, range.to, revenues, costs, analysis.employees, analysis.entries);
  }, [analysis, analysisError, period, viewMode, view.revenueLines, costs]);
  async function loadData() {
    const version = ++loadVersion.current;
    setLoading(true);
    setAnalysisError(null);
    const range = cfoPeriodRange(period, viewMode);
    const revenueRange = revenueFetchRange(range.from, range.to);
    const [revenueResult, costsResult, employeeResult, cashflowResult, teamResult, analysisResult] = await Promise.all([
      fetchCfoRevenueLinesRange(revenueRange.from, revenueRange.to),
      viewMode === "year" ? fetchCfoCostsRange(range.from, range.to) : fetchCfoCosts(range.from),
      viewMode === "year" ? fetchCfoEmployeeCostsRange(range.from, range.to) : fetchCfoEmployeeCosts(range.from),
      fetchCashflowSnapshot(),
      fetchCfoTeamMembers(),
      fetchCfoAnalysis(range.from, range.to, false).catch((error: Error) => ({ data: null, error })),
    ]);

    if (version !== loadVersion.current) return;
    const timeResult = {
      error: analysisResult.error,
      data: analysisResult.data?.entries.filter(entry => {
        const month = workMonth(entry.started_at);
        return month >= range.from.slice(0, 7) && month <= range.to.slice(0, 7);
      }) || [],
    };
    setAnalysis(analysisResult.data);
    const incomplete = analysisResult.error || revenueResult.error || costsResult.error || employeeResult.error;
    setAnalysisError(incomplete ? "Nie udało się pobrać kompletu danych do rentowności. Odśwież zakładkę." : null);

    if (revenueResult.error) console.error("Błąd pobierania przychodów CFO:", revenueResult.error);
    if (costsResult.error) console.error("Błąd pobierania kosztów CFO:", costsResult.error);
    if (employeeResult.error) console.error("Błąd pobierania kosztów pracowników CFO:", employeeResult.error);
    setCashflowError(cashflowResult.error ? "Nie udało się pobrać rozrachunków. Odśwież CFO." : null);
    if (teamResult.error) console.error("Błąd pobierania zespołu CFO:", teamResult.error);
    if (timeResult.error) console.error("Błąd pobierania czasu pracy klientów CFO:", timeResult.error);

    setRevenueLines((revenueResult.data || []) as unknown as CfoInvoiceLine[]);
    setCosts((costsResult.data || []) as CfoCostItem[]);
    setEmployeeCosts((employeeResult.data || []) as CfoEmployeeCost[]);
    const snapshot = cashflowResult.data || emptyCashflow();
    setCashflow(snapshot);
    setClientTimeEntries((timeResult.data || []) as CfoClientTimeEntry[]);
    setTeamMembers((teamResult.data || []) as CfoTeamMember[]);
    setManualCost(emptyManualCost(period));
    setManualInterperiod(false);
    setExpandedCostPeriods({});
    setEmployeeDrafts(buildEmployeeDrafts((teamResult.data || []) as CfoTeamMember[], (employeeResult.data || []) as CfoEmployeeCost[], period));
    setLoading(false);
  }

  async function changeRevenueCategory(line: CfoInvoiceLine, category: CfoRevenueCategory) {
    const result = await updateInvoiceLineCfoCategory(line.id, category);
    if (result.error) return alert("Nie udało się zapisać kategorii CFO pozycji faktury.");
    setRevenueLines((current) => current.map((item) => item.id === line.id ? ({ ...item, cfo_przychod_kategoria: category }) : item));
  }

  async function importCostsFile(file: File) {
    setSaving(true);
    try {
      const rows = await parseCostWorkbook(file, period);
      if (rows.length === 0) return alert("Nie znaleziono pozycji kosztowych w pliku.");
      const fileCheck = removeDuplicateCostsFromImport(rows);
      const duplicateResult = await fetchCfoCostDuplicateCandidates(fileCheck.rows);
      if (duplicateResult.error) {
        console.error(duplicateResult.error);
        return alert(`Nie udało się sprawdzić duplikatów kosztów: ${errorMessage(duplicateResult.error)}`);
      }

      const databaseCheck = removeExistingDuplicateCosts(fileCheck.rows, duplicateResult.data || []);
      if (databaseCheck.rows.length === 0) {
        await loadData();
        return alert(buildCostImportSummary(0, fileCheck.skipped.length, databaseCheck.skipped, rows.length));
      }

      const result = await insertCfoCosts(databaseCheck.rows);
      if (result.error) {
        console.error(result.error);
        return alert(`Nie udało się zaimportować kosztów: ${errorMessage(result.error)}`);
      }
      await loadData();
      alert(buildCostImportSummary(result.data?.length || 0, fileCheck.skipped.length, databaseCheck.skipped, rows.length));
    } finally {
      setSaving(false);
    }
  }

  async function addManualCost() {
    if (!manualCost.kontrahent.trim()) return alert("Podaj kontrahenta.");
    if (!manualCost.kategoria) return alert("Wybierz kategorię kosztu.");
    setSaving(true);
    const amount = Number(manualCost.kwota_netto_cfo || 0);
    const result = await insertCfoCosts([{ ...manualCost, kategoria: manualCost.kategoria, kwota_brutto: amount, import_key: `manual:${crypto.randomUUID()}`, zrodlo: "recznie" }]);
    setSaving(false);
    if (result.error) return alert("Nie udało się dodać kosztu.");
    await loadData();
  }

  async function copyPreviousTeamCosts() {
    const version = loadVersion.current;
    setSaving(true);
    try {
      const result = await fetchCfoEmployeeCosts(monthToDate(shiftMonth(period, -1)));
      if (version !== loadVersion.current) return;
      if (result.error) return alert("Nie udało się pobrać kosztów poprzedniego miesiąca.");
      const previous = new Map((result.data as CfoEmployeeCost[] || []).filter(row => row.osoba_id).map(row => [row.osoba_id, row]));
      if (!teamMembers.some(member => previous.has(member.id))) return alert("Brak kosztów zespołu z poprzedniego miesiąca do skopiowania.");
      setEmployeeDrafts(current => {
        const next = { ...current };
        for (const member of teamMembers) {
          const source = previous.get(member.id);
          if (!source) continue;
          next[member.id] = {
            ...(current[member.id] || defaultEmployeeDraft(member, period)),
            zespol: source.zespol, w_capacity: source.w_capacity,
            wymiar_etatu: source.wymiar_etatu, podstawa: source.podstawa,
            zus_pracodawcy: source.zus_pracodawcy, benefity: source.benefity,
            premie: source.premie, szkolenia: source.szkolenia,
            nieobecnosci_godziny: source.nieobecnosci_godziny, nadgodziny: source.nadgodziny,
          };
        }
        return next;
      });
    } catch {
      if (version === loadVersion.current) alert("Nie udało się pobrać kosztów poprzedniego miesiąca.");
    } finally {
      setSaving(false);
    }
  }

  async function saveTeamCosts() {
    setSaving(true);
    for (const row of Object.values(employeeDrafts)) {
      const result = await upsertCfoEmployeeCost(row);
      if (result.error) {
        setSaving(false);
        alert(`Nie udało się zapisać kosztu dla osoby: ${row.osoba_nazwa}.`);
        return;
      }
    }
    setSaving(false);
    await loadData();
  }

  return (
    <main style={contentStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł zarządczy</p>
          <h1 style={titleStyle}>CFO</h1>
        </div>
        <div style={headerActionsStyle}>
          <div style={viewModeToggleStyle} aria-label="Zakres CFO">
            <button type="button" style={viewMode === "month" ? viewModeActiveButtonStyle : viewModeButtonStyle} onClick={() => setViewMode("month")}>Miesiąc</button>
            <button type="button" style={viewMode === "year" ? viewModeActiveButtonStyle : viewModeButtonStyle} onClick={() => setViewMode("year")}>Rok</button>
          </div>
          <MonthField value={period} onChange={setPeriod} />
          <button type="button" style={secondaryButtonStyle} onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={17} />
            Odśwież
          </button>
        </div>
      </header>

      <section style={metricGridStyle}>
        <Metric label="Przychody" value={formatMoney(view.revenue)} />
        <Metric label="Koszty operacyjne" value={formatMoney(view.operatingCosts)} />
        <Metric label="Koszty zarządcze" value={formatMoney(view.managementCosts)} />
        <Metric label="Wynik operacyjny" value={formatMoney(view.operatingResult)} tone={view.operatingResult >= 0 ? "good" : "bad"} />
        <Metric label="Cash flow" value={cashflowError ? "Brak danych" : formatMoney(view.cashFlow)} tone={view.cashFlow >= 0 ? "good" : "bad"} />
        <Metric label="Cel właściciela" value={view.ownerGoalText} tone={view.ownerGoalGap <= 0 ? "good" : "bad"} />
      </section>

      {!loading && analysisError ? <section style={infoNoticeStyle}>{analysisError}</section> : null}
      {!loading && cashflowError ? <section role="alert" style={infoNoticeStyle}>{cashflowError}</section> : null}
      {!loading && !cashflowError && cashflow.invoices.some(invoice => invoice.status === "oplacona" && !invoice.data_zaplaty) ? <section role="status" style={infoNoticeStyle}>Część opłaconych faktur nie ma potwierdzonej daty zapłaty. Cash flow obejmuje tylko dokumenty z datą. Uzupełnij brakujące daty w Fakturach.</section> : null}

      <nav style={tabsStyle} aria-label="Sekcje CFO">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" style={activeTab === tab.id ? activeTabStyle : tabStyle} onClick={() => {
              setActiveTab(tab.id);
            }}>
              <Icon size={17} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {loading ? <section style={panelStyle}>Ładowanie danych CFO...</section> : null}
      {!loading && activeTab === "dashboard" ? renderDashboard(view, viewMode, period) : null}
      {!loading && activeTab === "przychody" ? renderRevenueSection(view.revenueLines, changeRevenueCategory) : null}
      {!loading && activeTab === "koszty" ? renderCostSection(period, costs, cost => setCashflow(current => ({ ...current, costs: current.costs.map(row => row.id === cost.id ? cost : row) })), setCosts, manualCost, setManualCost, manualInterperiod, setManualInterperiod, expandedCostPeriods, setExpandedCostPeriods, addManualCost, importCostsFile, saving, costSearch, setCostSearch) : null}
      {!loading && activeTab === "cashflow" && !cashflowError ? <CfoCashflowPanel key={period} snapshot={cashflow} period={period} onUpdated={loadData} /> : null}
      {!loading && activeTab === "zespol" ? renderTeamSectionTable(teamMembers, employeeDrafts, setEmployeeDrafts, saveTeamCosts, copyPreviousTeamCosts, saving, period, clientTimeEntries) : null}
      {!loading && activeTab === "klienci" ? clientAnalysis ? renderClientsSection(clientAnalysis, clientSearch, setClientSearch) : <section style={infoNoticeStyle}>Rentowność wymaga kompletu danych.</section> : null}
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const valueStyle = tone === "good" ? goodMetricValueStyle : tone === "bad" ? badMetricValueStyle : tone === "warn" ? warnMetricValueStyle : metricValueStyle;
  return (
    <article style={metricStyle}>
      <span>{label}</span>
      <strong style={valueStyle}>{value}</strong>
    </article>
  );
}

function renderDashboard(view: CfoView, viewMode: CfoViewMode, period: string) {
  return (
    <section style={dashboardGridStyle}>
      <article style={widePanelStyle}>
        <div style={panelHeaderStyle}>
          <TrendingUp size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Dashboard właścicielski</h2>
          <span style={dashboardScopeBadgeStyle}>{cfoPeriodLabel(period, viewMode)}</span>
        </div>
        <div style={recommendationStyle}>
          <strong>{view.ownerGoalGap <= 0 ? "Nadwyżka ponad ideał właścicielski" : "Brakuje do ideału właścicielskiego"}</strong>
          <span>
            {view.ownerGoalGap <= 0
              ? <><strong style={successInlineStyle}>Nadwyżka {formatMoney(view.ownerGoalSurplus)}</strong>. Wypłata netto właściciela i wymagany bufor są pokryte.</>
              : <><strong style={dangerInlineStyle}>Brakuje {formatMoney(view.ownerGoalGap)}</strong>. Poniżej widać, z czego składa się brakująca kwota.</>}
          </span>
          <div style={ownerGoalBreakdownStyle}>
            {view.ownerPayoutRecorded > 0 ? <><span>Wypłata netto Prezesa ujęta w kosztach</span><strong>{formatMoney(view.ownerPayoutRecorded)}</strong></> : null}
            <span>Brakująca wypłata netto</span><strong>{formatMoney(view.ownerPayoutRemaining)}</strong>
            {view.ownerPayrollBurden > 0 ? <><span>PIT/ZUS Prezesa ujęte w kosztach</span><strong>{formatMoney(view.ownerPayrollBurden)}</strong></> : null}
            <span>Brakuje do pokrycia straty</span><strong>{formatMoney(view.ownerLossCoverage)}</strong>
            <span>Wymagany bufor w spółce</span><strong>{formatMoney(view.companyBufferTarget)}</strong>
            {view.ownerPositiveResult > 0 ? <><span>Pokryte wynikiem po kosztach</span><strong>-{formatMoney(view.ownerPositiveResult)}</strong></> : null}
          </div>
        </div>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderWithTotalStyle}>
          <div style={panelTitleGroupStyle}>
            <ReceiptText size={21} style={panelIconStyle} />
            <h2 style={panelTitleStyle}>Struktura przychodów</h2>
          </div>
          <strong style={panelHeaderTotalStyle}>Przychody łącznie: {formatMoney(view.revenue)}</strong>
        </div>
        <Breakdown rows={view.revenueBreakdown} />
      </article>
      <article style={widePanelStyle}>
        <div style={panelHeaderStyle}>
          <FileSpreadsheet size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Struktura kosztów</h2>
        </div>
        <CostBreakdown rows={view.costBreakdown} />
      </article>
    </section>
  );
}

function renderRevenueSection(lines: CfoInvoiceLine[], onChange: (line: CfoInvoiceLine, category: CfoRevenueCategory) => void) {
  const groups = groupRevenueLinesByInvoice(lines);

  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <TrendingUp size={21} style={panelIconStyle} />
        <h2 style={panelTitleStyle}>Przychody z faktur</h2>
      </div>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Faktura / pozycja</Th><Th>Kategoria CFO</Th><Th align="right">Netto</Th></tr></thead>
          <tbody>
            {groups.length === 0 ? <EmptyRow colSpan={3} text="Brak pozycji faktur dla okresu." /> : groups.flatMap((group) => [
              <tr key={`${group.id}:header`}>
                <td style={invoiceGroupCellStyle} colSpan={2}>
                  <strong>{group.clientName}</strong>
                  <small style={smallStyle}>{group.number} · {formatDate(group.date)} · {group.lines.length} {polishCount(group.lines.length, "pozycja", "pozycje", "pozycji")}</small>
                </td>
                <td style={{ ...invoiceGroupCellStyle, textAlign: "right" }}><strong>{formatMoney(group.total)}</strong></td>
              </tr>,
              ...group.lines.map((line) => (
                <tr key={line.id}>
                  <Td>
                    <span style={invoiceLineIndentStyle}>{line.nazwa}</span>
                    {revenueLineEffectivePeriod(line).slice(0, 7) !== invoiceParent(line)?.okres?.slice(0, 7) ? (
                      <small style={invoiceLinePeriodStyle}>Okres usługi: {formatMonthField(revenueLineEffectivePeriod(line))}</small>
                    ) : null}
                  </Td>
                  <Td>
                    <AppSelect value={line.cfo_przychod_kategoria || "pozostale"} options={REVENUE_OPTIONS} onChange={(value) => onChange(line, value as CfoRevenueCategory)} style={compactSelectStyle} />
                  </Td>
                  <Td align="right">{formatMoney(line.kwota_netto)}</Td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DateField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatDateForField(value));
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromIso(value));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = dateFromIso(value);
  const days = calendarDays(visibleMonth);
  const fieldText = open ? text : formatDateForField(value);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  function commitText(nextText: string) {
    const parsed = parseDateFieldText(nextText);
    if (parsed) onChange(parsed);
    else setText(formatDateForField(value));
  }

  function pickDate(date: Date) {
    const iso = formatIsoDate(date);
    onChange(iso);
    setText(formatDateForField(iso));
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={dateFieldStyle}>
      <div style={dateControlStyle}>
        <input
          style={dateTextInputStyle}
          value={fieldText}
          placeholder="dd.mm.rrrr"
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseDateFieldText(event.target.value);
            if (parsed) onChange(parsed);
          }}
          onBlur={() => commitText(text)}
          onFocus={() => {
            setText(formatDateForField(value));
            setVisibleMonth(dateFromIso(value));
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              commitText(text);
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="button"
          style={dateIconButtonStyle}
          onClick={() => {
            setText(formatDateForField(value));
            setVisibleMonth(dateFromIso(value));
            setOpen((current) => !current);
          }}
          aria-label="Wybierz datę"
        >
          <CalendarDays size={17} />
        </button>
      </div>
      {open ? (
        <div style={datePickerStyle}>
          <div style={datePickerHeaderStyle}>
            <button type="button" style={dateNavButtonStyle} onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>‹</button>
            <strong>{MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}</strong>
            <button type="button" style={dateNavButtonStyle} onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>›</button>
          </div>
          <div style={dateWeekGridStyle}>
            {["pon", "wt", "śr", "czw", "pt", "sob", "nie"].map((day) => <span key={day} style={dateWeekdayStyle}>{day}</span>)}
            {days.map((day) => {
              const iso = formatIsoDate(day);
              const currentMonth = day.getMonth() === visibleMonth.getMonth();
              const selected = iso === formatIsoDate(selectedDate);
              return (
                <button
                  key={iso}
                  type="button"
                  style={{ ...dateDayStyle, ...(currentMonth ? null : dateMutedDayStyle), ...(selected ? dateSelectedDayStyle : null) }}
                  onClick={() => pickDate(day)}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <button type="button" style={todayButtonStyle} onClick={() => pickDate(new Date())}>Dzisiaj</button>
        </div>
      ) : null}
    </div>
  );
}

function MonthField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatMonthField(value));
  const [visibleYear, setVisibleYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedMonth = parseMonthValue(value);
  const fieldText = open ? text : formatMonthField(value);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [open]);

  function commitText(nextText: string) {
    const parsed = parseMonthFieldText(nextText);
    if (parsed) onChange(parsed);
    else setText(formatMonthField(value));
  }

  function pickMonth(monthIndex: number) {
    const nextValue = `${visibleYear}-${String(monthIndex + 1).padStart(2, "0")}`;
    onChange(nextValue);
    setText(formatMonthField(nextValue));
    setOpen(false);
  }

  return (
    <div ref={rootRef} style={monthFieldWrapperStyle}>
      <div style={monthControlStyle}>
        <CalendarDays size={17} style={monthIconStyle} />
        <input
          style={monthTextInputStyle}
          value={fieldText}
          placeholder="miesiąc rrrr"
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseMonthFieldText(event.target.value);
            if (parsed) onChange(parsed);
          }}
          onBlur={() => commitText(text)}
          onFocus={() => {
            setText(formatMonthField(value));
            setVisibleYear(Number(value.slice(0, 4)) || new Date().getFullYear());
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
              commitText(text);
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="button"
          style={dateIconButtonStyle}
          onClick={() => {
            setText(formatMonthField(value));
            setVisibleYear(Number(value.slice(0, 4)) || new Date().getFullYear());
            setOpen((current) => !current);
          }}
          aria-label="Wybierz miesiąc"
        >
          <CalendarDays size={17} />
        </button>
      </div>
      {open ? (
        <div style={monthPickerStyle}>
          <div style={datePickerHeaderStyle}>
            <button type="button" style={dateNavButtonStyle} onClick={() => setVisibleYear((year) => year - 1)}>‹</button>
            <strong>{visibleYear}</strong>
            <button type="button" style={dateNavButtonStyle} onClick={() => setVisibleYear((year) => year + 1)}>›</button>
          </div>
          <div style={monthGridStyle}>
            {MONTH_LABELS.map((label, index) => {
              const selected = selectedMonth.year === visibleYear && selectedMonth.month === index + 1;
              return (
                <button
                  key={label}
                  type="button"
                  style={{ ...monthButtonStyle, ...(selected ? monthSelectedButtonStyle : null) }}
                  onClick={() => pickMonth(index)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <button type="button" style={todayButtonStyle} onClick={() => {
            const today = new Date();
            const nextValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
            onChange(nextValue);
            setText(formatMonthField(nextValue));
            setOpen(false);
          }}>Bieżący miesiąc</button>
        </div>
      ) : null}
    </div>
  );
}

function renderCostSection(
  period: string,
  costs: CfoCostItem[],
  onCostChanged: (cost: CfoCostItem) => void,
  setCosts: (next: CfoCostItem[] | ((current: CfoCostItem[]) => CfoCostItem[])) => void,
  manualCost: ManualCostDraft,
  setManualCost: (next: ManualCostDraft | ((current: ManualCostDraft) => ManualCostDraft)) => void,
  manualInterperiod: boolean,
  setManualInterperiod: (next: boolean) => void,
  expandedCostPeriods: Record<string, boolean>,
  setExpandedCostPeriods: (next: Record<string, boolean> | ((current: Record<string, boolean>) => Record<string, boolean>)) => void,
  addManualCost: () => void,
  importCostsFile: (file: File) => void,
  saving: boolean,
  search: string,
  setSearch: (value: string) => void,
) {
  const subcategoryOptions = manualCost.kategoria ? SUBCATEGORIES[manualCost.kategoria].map((item) => ({ value: item, label: item })) : [];
  const hasSubcategories = subcategoryOptions.length > 0;
  const visibleCosts = filterCosts(costs, search);

  async function changeCost(cost: CfoCostItem, payload: Partial<CfoCostItem>) {
    const result = await updateCfoCost(cost.id, payload);
    if (result.error) return alert("Nie udało się zapisać kosztu: " + result.error.message);
    const updated = (result.data || { ...cost, ...payload }) as CfoCostItem;
    setCosts((current) => current.map((item) => item.id === cost.id ? updated : item));
    onCostChanged(updated);
  }

  async function removeCost(cost: CfoCostItem, paid: number) {
    const label = cost.numer_dokumentu || cost.kontrahent || "pozycję kosztową";
    const message = paid > 0
      ? `Usunąć koszt ${label}? Ta pozycja jest oznaczona jako zapłacona na ${formatMoney(paid)}.`
      : `Usunąć koszt ${label}?`;
    if (!confirm(message)) return;
    const result = await deleteCfoCost(cost.id);
    if (result.error) {
      console.error(result.error);
      alert("Nie udało się usunąć kosztu.");
      return;
    }
    setCosts((current) => current.filter((item) => item.id !== cost.id));
  }
  function toggleManualInterperiod(enabled: boolean) {
    setManualInterperiod(enabled);
    if (!enabled) {
      setManualCost((current) => ({ ...current, okres_start: monthToDate(period), okres_end: monthEndDate(period) }));
    }
  }

  function toggleCostInterperiod(cost: CfoCostItem, enabled: boolean) {
    setExpandedCostPeriods((current) => ({ ...current, [cost.id]: enabled }));
    if (!enabled) void changeCost(cost, { okres_start: monthToDate(period), okres_end: monthEndDate(period) });
  }

  return (
    <section style={sectionStackStyle}>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <Upload size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Import i ręczne koszty</h2>
        </div>
        <label style={uploadBoxStyle}>
          <FileSpreadsheet size={22} />
          <strong>Wczytaj Excel kosztów</strong>
          <span>Numer dokumentu, kontrahent, netto, VAT, brutto i opis. Kwotę netto CFO możesz później poprawić.</span>
          <input type="file" accept=".xlsx,.xls,.csv,.txt" hidden onChange={(event) => event.target.files?.[0] && importCostsFile(event.target.files[0])} />
        </label>
        <div style={manualFormStyle}>
          <div style={manualTopRowStyle}>
            <input style={inputStyle} placeholder="Kontrahent" value={manualCost.kontrahent} onChange={(event) => setManualCost((current) => ({ ...current, kontrahent: event.target.value }))} />
            <input style={inputStyle} placeholder="Numer dokumentu" value={manualCost.numer_dokumentu || ""} onChange={(event) => setManualCost((current) => ({ ...current, numer_dokumentu: documentNumberOrNull(event.target.value) }))} />
            <MoneyTextInput
              style={inputStyle}
              placeholder="Kwota netto CFO"
              value={manualCost.kwota_netto_cfo}
              onValueChange={(value) => setManualCost((current) => ({ ...current, kwota_netto_cfo: value, kwota_netto_import: value }))}
            />
          </div>
          <div style={manualBottomRowStyle}>
            <AppSelect value={manualCost.kategoria} options={MANUAL_COST_OPTIONS} onChange={(value) => setManualCost((current) => ({ ...current, kategoria: value as CfoCostCategory | "", podkategoria: null }))} />
            {hasSubcategories ? <AppSelect value={manualCost.podkategoria || ""} options={[{ value: "", label: "Wybierz podkategorię" }, ...subcategoryOptions]} onChange={(value) => setManualCost((current) => ({ ...current, podkategoria: emptyToNull(value) }))} /> : null}
            <div style={manualPeriodStyle}>
              <label style={checkboxLabelStyle}>
                <input type="checkbox" checked={manualInterperiod} onChange={(event) => toggleManualInterperiod(event.target.checked)} />
                Międzyokresowe
              </label>
              {manualInterperiod ? (
                <div style={dateRangeStyle}>
                  <DateField value={manualCost.okres_start} onChange={(value) => setManualCost((current) => ({ ...current, okres_start: value }))} />
                  <DateField value={manualCost.okres_end} onChange={(value) => setManualCost((current) => ({ ...current, okres_end: value }))} />
                </div>
              ) : <span style={periodMonthBadgeStyle}>{formatMonthField(period)}</span>}
            </div>
            <button type="button" style={primaryButtonStyle} onClick={addManualCost} disabled={saving}><Plus size={17} />Dodaj</button>
          </div>
        </div>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <ReceiptText size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Koszty CFO</h2>
        </div>
        <SearchField value={search} onChange={setSearch} placeholder="Szukaj kosztu po dokumencie, kontrahencie, kategorii albo kwocie..." />
        <div style={tableWrapperStyle}>
          <table style={wideCostTableStyle}>
            <colgroup>
              <col style={{ width: "11%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead><tr><Th>Dokument</Th><Th>Kontrahent</Th><Th>Kategoria</Th><Th>Podkategoria</Th><Th>Okres</Th><Th align="right">Netto CFO</Th><Th align="right">Brutto cash flow</Th><Th>Płatność</Th><Th align="right"><span aria-hidden="true"> </span></Th></tr></thead>
            <tbody>
              {visibleCosts.length === 0 ? <EmptyRow colSpan={9} text={costs.length === 0 ? "Brak kosztów w tym okresie." : "Brak kosztów pasujących do wyszukiwania."} /> : visibleCosts.map((cost) => {
                const rowSubcategoryOptions = SUBCATEGORIES[cost.kategoria].map((item) => ({ value: item, label: item }));
                const isInterperiod = expandedCostPeriods[cost.id] || !isFullMonthPeriod(cost.okres_start, cost.okres_end);
                const paid = actualCostPayment(cost).paidAmount;
                const paymentState = costPaymentState(cost, paid);
                const settlementStyle = paymentState === "settled" ? settledTextStyle : paymentState === "overpaid" ? overpaidTextStyle : null;
                const settlementSmallStyle = paymentState === "settled" ? settledSmallStyle : paymentState === "overpaid" ? overpaidSmallStyle : smallStyle;
                return (
                  <tr key={cost.id} style={cost.ignoruj ? mutedRowStyle : undefined}>
                    <Td style={{ ...documentCostCellStyle, ...settlementStyle }}>{cost.numer_dokumentu || "Brak numeru"}<small style={settlementSmallStyle}>{formatDate(cost.data_dokumentu)}</small></Td>
                    <Td style={{ ...contractorCostCellStyle, ...settlementStyle }}>{cost.kontrahent}</Td>
                    <Td><AppSelect value={cost.kategoria} options={COST_OPTIONS} onChange={(value) => void changeCost(cost, { kategoria: value as CfoCostCategory, podkategoria: null })} style={costSelectStyle} /></Td>
                    <Td>
                      {rowSubcategoryOptions.length > 0 ? (
                        <AppSelect
                          value={cost.podkategoria || ""}
                          options={[{ value: "", label: "Wybierz podkategorię" }, ...rowSubcategoryOptions]}
                          onChange={(value) => void changeCost(cost, { podkategoria: emptyToNull(value) })}
                          style={costSelectStyle}
                        />
                      ) : <span style={smallStyle}>Bez podkategorii</span>}
                    </Td>
                    <Td>
                      <div style={costPeriodCellStyle}>
                        <label style={{ ...checkboxLabelStyle, fontSize: "11px" }}>
                          <input type="checkbox" checked={isInterperiod} onChange={(event) => toggleCostInterperiod(cost, event.target.checked)} />
                          Międzyokresowe
                        </label>
                        {isInterperiod ? (
                          <div style={costDateRangeStyle}>
                            <DateField value={cost.okres_start} onChange={(value) => void changeCost(cost, { okres_start: value })} />
                            <DateField value={cost.okres_end} onChange={(value) => void changeCost(cost, { okres_end: value })} />
                          </div>
                        ) : <span style={{ ...periodMonthBadgeStyle, fontSize: "12px", minHeight: "32px", padding: "6px 8px" }}>{formatCostPeriod(cost.okres_start, cost.okres_end)}</span>}
                      </div>
                    </Td>
                    <Td align="right">
                      <span style={costMoneyEditStyle}>
                        <MoneyTextInput
                          style={costMoneyInputStyle}
                          value={cost.kwota_netto_cfo}
                          onValueChange={(value) => setCosts((current) => current.map((item) => item.id === cost.id ? { ...item, kwota_netto_cfo: value } : item))}
                          onCommit={(value) => void updateCost(cost.id, { kwota_netto_cfo: value })}
                        />
                        zł
                      </span>
                    </Td>
                    <Td align="right">
                      <span style={{ ...costMoneyEditStyle, ...settlementStyle }}>
                        <MoneyTextInput
                          style={costMoneyInputStyle}
                          value={costGrossValue(cost)}
                          onValueChange={(value) => setCosts((current) => current.map((item) => item.id === cost.id ? { ...item, kwota_brutto: value } : item))}
                          onCommit={(value) => void updateCost(cost.id, { kwota_brutto: value })}
                        />
                        zł
                      </span>
                    </Td>
                    <Td>
                      <div style={costPaymentCellStyle}>
                        <CostPaymentStatus cost={cost} paid={paid} compact />
                        <label style={costPaymentLabelStyle}>
                          Data zapłaty
                          <CfoDateField ariaLabel={"Zapłata " + (cost.numer_dokumentu || cost.kontrahent)} compact max={new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" })} value={cost.data_zaplaty || ""} onChange={value => void changeCost(cost, { data_zaplaty: value || null })} style={costPaymentInputStyle} />
                        </label>
                      </div>
                    </Td>
                    <Td align="right" style={{ padding: "8px 4px" }}>
                      <button type="button" style={{ ...iconDangerButtonStyle, width: "32px", minWidth: "32px", height: "32px", borderRadius: "9px" }} onClick={() => void removeCost(cost, paid)} title="Usuń koszt" aria-label="Usuń koszt">
                        <Trash2 size={15} />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function renderTeamSectionTable(
  teamMembers: CfoTeamMember[],
  employeeDrafts: Record<string, EmployeeCostDraft>,
  setEmployeeDrafts: (next: Record<string, EmployeeCostDraft> | ((current: Record<string, EmployeeCostDraft>) => Record<string, EmployeeCostDraft>)) => void,
  saveTeamCosts: () => void,
  copyPreviousTeamCosts: () => void,
  saving: boolean,
  period: string,
  timeEntries: CfoClientTimeEntry[],
) {
  function updateDraft(member: CfoTeamMember, field: keyof EmployeeCostDraft, value: string | number | boolean | null) {
    setEmployeeDrafts((current) => {
      const draft = current[member.id] || defaultEmployeeDraft(member, period);
      return { ...current, [member.id]: { ...draft, [field]: value } };
    });
  }

  const drafts = teamMembers.map((member) => employeeDrafts[member.id] || defaultEmployeeDraft(member, period));
  const workTimeByPerson = buildTeamWorkTime(timeEntries);
  const hasAnyWorkTime = timeEntries.some((entry) => Number(entry.duration_seconds || 0) > 0);

  return (
    <section style={sectionStackStyle}>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <Users size={21} style={panelIconStyle} />
          <h2 style={{ ...panelTitleStyle, flex: 1 }}>Koszty zespołu</h2><button type="button" style={secondaryButtonStyle} onClick={copyPreviousTeamCosts} disabled={saving || teamMembers.length === 0}>Kopiuj z poprzedniego miesiąca</button>
        </div>
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Osoba</Th>
                <Th>Zespół</Th>
                <Th align="right">Wymiar etatu</Th>
                <Th align="right">Podstawa</Th>
                <Th align="right">ZUS pracodawcy</Th>
                <Th align="right">Benefity</Th>
                <Th align="right">Premie</Th>
                <Th align="right">Szkolenia</Th>
                <Th align="right">Nieobecności dni</Th>
                <Th align="right">Nadgodziny</Th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.length === 0 ? <EmptyRow colSpan={10} text="Brak aktywnych użytkowników zespołu." /> : teamMembers.map((member) => {
                const draft = employeeDrafts[member.id] || defaultEmployeeDraft(member, period);
                return (
                  <tr key={member.id}>
                    <Td>
                      <strong>{teamMemberName(member)}</strong>
                      <small style={smallStyle}>{roleLabel(member.role)}</small>
                    </Td>
                    <Td>
                      <AppSelect
                        value={draft.zespol}
                        options={[{ value: "ksiegowy", label: "Księgowy" }, { value: "marketingowy", label: "Marketing" }, { value: "sprzedazowy", label: "Sprzedaż" }]}
                        onChange={(value) => updateDraft(member, "zespol", value as CfoEmployeeCost["zespol"])}
                        style={compactSelectStyle}
                      />
                    </Td>
                    <TeamInput value={draft.wymiar_etatu} onChange={(value) => updateDraft(member, "wymiar_etatu", value)} />
                    <TeamInput value={draft.podstawa} onChange={(value) => updateDraft(member, "podstawa", value)} />
                    <TeamInput value={draft.zus_pracodawcy} onChange={(value) => updateDraft(member, "zus_pracodawcy", value)} />
                    <TeamInput value={draft.benefity} onChange={(value) => updateDraft(member, "benefity", value)} />
                    <TeamInput value={draft.premie} onChange={(value) => updateDraft(member, "premie", value)} />
                    <TeamInput value={draft.szkolenia} onChange={(value) => updateDraft(member, "szkolenia", value)} />
                    <TeamInput value={draft.nieobecnosci_godziny} onChange={(value) => updateDraft(member, "nieobecnosci_godziny", value)} />
                    <TeamInput value={draft.nadgodziny} onChange={(value) => updateDraft(member, "nadgodziny", value)} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={formFooterStyle}>
          <span style={smallStyle}>Norma dzienna: 8 h. Nieobecności wpisuj w dniach, każdy dzień zmniejsza dostępność o 8 h. Po skopiowaniu sprawdź premie, szkolenia, nieobecności i nadgodziny, następnie zapisz zespół.</span>
          <button type="button" style={primaryButtonStyle} onClick={saveTeamCosts} disabled={saving || teamMembers.length === 0}><Save size={17} />Zapisz zespół</button>
        </div>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <CalendarDays size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Dostępne godziny w miesiącu</h2>
        </div>
        <div style={miniListStyle}>
          {!hasAnyWorkTime ? <div style={infoNoticeStyle}>W tym miesiącu nie ma zaznaczonego czasu pracy.</div> : null}
          {drafts.length === 0 ? <span style={smallStyle}>Brak aktywnych użytkowników zespołu.</span> : drafts.map((employee) => {
            const hours = availableHours(employee as CfoEmployeeCost, period);
            const hourly = hours > 0 ? (Number(employee.podstawa || 0) + Number(employee.zus_pracodawcy || 0) + Number(employee.benefity || 0)) / hours : 0;
            const workTime = employee.osoba_id ? workTimeByPerson.get(employee.osoba_id) || EMPTY_WORK_TIME : EMPTY_WORK_TIME;
            const utilization = hours > 0 ? workTime.total / hours : null;
            return (
              <div key={employee.osoba_id || employee.osoba_nazwa} style={teamCapacityItemStyle}>
                <div><strong>{employee.osoba_nazwa}</strong><small style={smallStyle}>{employee.zespol === "ksiegowy" ? "Zespół księgowy" : employee.zespol === "marketingowy" ? "Marketing" : "Sprzedaż"}</small></div>
                <span>Dostępne: <strong>{formatHours(hours)}</strong></span>
                <span>Przepracowane: <strong>{formatHours(workTime.total)}</strong></span>
                <span>Klientowe: <strong>{formatHours(workTime.client)}</strong></span>
                <span>Wykorzystanie: <strong>{utilization === null ? "brak capacity" : formatPercent(utilization)}</strong></span>
                <span>{formatMoney(hourly)} / h</span>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function renderClientsSection(report: ReturnType<typeof clientProfitability>, search: string, setSearch: (value: string) => void) {
  const query = normalizeSearchValue(search);
  const clients = report.clients.filter(client => normalizeSearchValue(client.name).includes(query));
  const cashValue = (value: number | null) => value === null ? "—" : formatMoney(value);
  return (
    <section style={{ ...sectionStackStyle, minWidth: 0 }}>
      <style>{`
        .cfo-client-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: clamp(9px, .8vw, 12px); }
        .cfo-client-table th, .cfo-client-table td { padding: 9px 4px !important; white-space: normal !important; overflow-wrap: anywhere; font-size: inherit !important; }
        .cfo-client-table th { font-size: .9em !important; line-height: 1.3; }
      `}</style>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}><BriefcaseBusiness size={21} style={panelIconStyle} /><h2 style={panelTitleStyle}>Rentowność klientów</h2></div>
        <SearchField value={search} onChange={setSearch} placeholder="Szukaj klienta po nazwie…" />
        <div style={{ width: "100%", minWidth: 0 }}>
          <table className="cfo-client-table">
            <colgroup>{[23, 10, 9, 6, 10, 10, 6, 10, 10, 6].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
            <thead><tr><Th>Klient</Th><Th align="right">Przychód</Th><Th align="right">MRR</Th><Th align="right">Godziny</Th><Th align="right">Koszt zespołu</Th><Th align="right">Wynik po zespole</Th><Th align="right">Marża zespołu</Th><Th align="right">Koszty wspólne</Th><Th align="right">Wynik pełny</Th><Th align="right">Marża pełna</Th></tr></thead>
            <tbody>{clients.length === 0 ? <EmptyRow colSpan={10} text={query ? "Nie znaleziono klienta dla podanej nazwy." : "Brak przychodów i pracy klientów dla tego okresu."} /> : clients.map(client => {
              return <tr key={client.key}>
                <Td>{client.name}</Td><Td align="right">{formatMoney(client.revenue)}</Td><Td align="right">{formatMoney(client.mrr)}</Td>
                <Td align="right">{formatHours(client.hours)}</Td>
                <Td align="right">{formatMoney(client.knownLaborCost)}</Td>
                <Td align="right" style={{ color: client.directResult === null || client.directResult === 0 ? colors.text : client.directResult < 0 ? colors.danger : colors.success }}><strong>{cashValue(client.directResult)}</strong></Td><Td align="right" style={{ color: client.directMargin === null || client.directMargin === 0 ? colors.text : client.directMargin < 0 ? colors.danger : colors.success, fontWeight: 700 }}>{client.directMargin === null ? "—" : formatPercent(client.directMargin)}</Td>
                <Td align="right">{formatMoney(client.overhead)}</Td><Td align="right" style={{ color: client.fullResult === null || client.fullResult === 0 ? colors.text : client.fullResult < 0 ? colors.danger : colors.success }}><strong>{cashValue(client.fullResult)}</strong></Td><Td align="right" style={{ color: client.fullMargin === null || client.fullMargin === 0 ? colors.text : client.fullMargin < 0 ? colors.danger : colors.success, fontWeight: 700 }}>{client.fullMargin === null ? "—" : formatPercent(client.fullMargin)}</Td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </article>
      <article style={panelStyle}>
        <h2 style={panelTitleStyle}>Na co przypada koszt zespołu w tym miesiącu?</h2>
        <p style={smallStyle}>To podział wynagrodzeń za wybrany miesiąc według pracy wykonanej w tym miesiącu — także przy rozliczeniach innych miesięcy. Tabela klientów powyżej grupuje pracę według miesiąca rozliczenia.</p>
        <div style={miniListStyle}>
          <div style={miniItemStyle}><span>Pełny zapisany koszt zespołu</span><strong>{formatMoney(report.payroll)}</strong></div>
          <div style={miniItemStyle}><span>Praca dla klientów wykonana w miesiącu</span><strong>{formatMoney(report.payroll - report.internalCost - report.unknownPeriodCost - report.unallocatedPayroll)}</strong></div>
          <div style={miniItemStyle}><span>Praca wewnętrzna — bez klienta</span><span>{formatHours(report.internalHours)}</span><strong>{formatMoney(report.internalCost)}</strong></div>
          <div style={miniItemStyle}><span>Praca klientowa bez miesiąca rozliczenia</span><span>{formatHours(report.unknownPeriodHours)}</span><strong>{formatMoney(report.unknownPeriodCost)}</strong></div>
          <div style={miniItemStyle}><span>{report.unallocatedPayroll >= 0 ? "Koszt bez pokrycia w wycenionych godzinach (np. brak wpisów lub stawek)" : "Przekroczenie kosztu wynagrodzeń przez wycenę godzin — wymaga sprawdzenia"}</span><strong>{formatMoney(report.unallocatedPayroll)}</strong></div>
          <div style={miniItemStyle}><span>Koszty wspólne nierozdzielone z powodu braku przychodów w miesiącu</span><strong>{formatMoney(report.unallocatedOverhead)}</strong></div>
        </div>
        {report.missingWorkedRateHours > 0 ? <p style={infoNoticeStyle}>{formatHours(report.missingWorkedRateHours)} pracy wykonanej w okresie nie ma historycznej stawki kosztowej. Powyższe kwoty pracy i podział wynagrodzeń są niepełne.</p> : null}
        <p style={smallStyle}>Dostępność: etat × miesięczna norma czasu pracy, minus wpisane dni nieobecności, plus nadgodziny. Norma uwzględnia polskie święta; zakłada miesięczny okres rozliczeniowy. Zmiany historycznych kosztów lub czasu przeliczają raport.</p>
      </article>
    </section>
  );
}

function TeamInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <Td align="right">
      <input style={teamInputStyle} type="number" value={value} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </Td>
  );
}

function MoneyTextInput({
  value,
  onValueChange,
  onCommit,
  placeholder,
  style,
}: {
  value: number;
  onValueChange: (value: number) => void;
  onCommit?: (value: number) => void;
  placeholder?: string;
  style?: CSSProperties;
}) {
  const [text, setText] = useState(formatNumberInput(value));

  function commit(nextText: string) {
    const parsed = parsePolishNumber(nextText);
    onValueChange(parsed);
    onCommit?.(parsed);
    setText(formatNumberInput(parsed));
  }

  return (
    <input
      style={style || inputStyle}
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
      }}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div style={searchFieldWrapStyle}>
      <input
        style={searchFieldStyle}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value ? <button type="button" style={searchClearButtonStyle} onClick={() => onChange("")}>Wyczyść</button> : null}
    </div>
  );
}

function Breakdown({ rows }: { rows: { label: string; value: number }[] }) {
  if (rows.length === 0) return <span style={smallStyle}>Brak danych w tym okresie.</span>;
  return <div style={miniListStyle}>{rows.map((row) => <div key={row.label} style={miniItemStyle}><span>{row.label}</span><strong>{formatMoney(row.value)}</strong></div>)}</div>;
}

function CostBreakdown({ rows }: { rows: CfoCostBreakdownRow[] }) {
  if (rows.length === 0) return <span style={smallStyle}>Brak danych w tym okresie.</span>;

  return (
    <div style={costBreakdownGridStyle}>
      {rows.map((row) => (
        <div key={row.label} style={costBreakdownItemStyle}>
          <div style={costBreakdownHeaderStyle}>
            <strong>{row.label}</strong>
            <strong style={costBreakdownAmountStyle}>{formatMoney(row.value)}</strong>
          </div>
          <div style={costSubListStyle}>
            {row.children.length === 0 ? <small style={smallStyle}>Brak podkategorii</small> : row.children.map((child) => (
              <div key={child.label} style={costSubItemStyle}>
                <span>{child.label}</span>
                <strong style={costBreakdownAmountStyle}>{formatMoney(child.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CostPaymentStatus({ cost, paid, compact = false }: { cost: CfoCostItem | null; paid: number; compact?: boolean }) {
  if (!cost) return <span style={smallStyle}>Nie przypisano</span>;

  const gross = costGrossValue(cost);
  const remaining = gross - paid;
  const state = costPaymentState(cost, paid);
  const remainingStyle = state === "settled" ? successInlineStyle : state === "overpaid" ? warningInlineStyle : dangerInlineStyle;

  if (compact) {
    const label = state === "settled" ? "Zapłacono" : paid <= 0 ? "Brak daty zapłaty" : (remaining >= 0 ? "Pozostało: " : "Nadpłata: ") + formatMoney(Math.abs(remaining));
    return <span style={{ ...costPaymentStatusStyle, ...(paid > 0 ? remainingStyle : { color: colors.muted }), fontSize: "11px", fontWeight: 650 }}>{label}</span>;
  }

  return (
    <div style={costPaymentStatusStyle}>
      {compact ? null : <span>Brutto: <strong>{formatMoney(gross)}</strong></span>}
      <span>Zapłacono: <strong>{formatMoney(paid)}</strong></span>
      <span style={remainingStyle}>
        {remaining >= 0 ? "Zostało" : "Nadpłata"}: <strong>{formatMoney(Math.abs(remaining))}</strong>
      </span>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ ...thStyle, textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left", style, colSpan }: { children: React.ReactNode; align?: "left" | "right"; style?: CSSProperties; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ ...tdStyle, textAlign: align, ...style }}>{children}</td>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td style={tdStyle} colSpan={colSpan}>{text}</td></tr>;
}

async function updateCost(costId: string, payload: Partial<CfoCostItem>) {
  const result = await updateCfoCost(costId, payload);
  if (result.error) alert("Nie udało się zapisać kosztu.");
}

type CfoClientRow = { key: string; id: string | null; name: string; revenue: number; mrr: number };
type CfoCostBreakdownRow = { label: string; value: number; children: { label: string; value: number }[] };
type CfoRevenueInvoiceGroup = { id: string; number: string; date: string | null; clientName: string; total: number; lines: CfoInvoiceLine[] };
type CfoTeamWorkTime = { total: number; client: number };
const EMPTY_WORK_TIME: CfoTeamWorkTime = { total: 0, client: 0 };
type CfoView = ReturnType<typeof buildCfoView>;

function groupRevenueLinesByInvoice(lines: CfoInvoiceLine[]): CfoRevenueInvoiceGroup[] {
  const groups = new Map<string, CfoRevenueInvoiceGroup>();

  lines.forEach((line) => {
    const invoice = invoiceParent(line);
    const id = invoice?.id || `no-invoice:${line.id}`;
    const current = groups.get(id) || {
      id,
      number: invoice?.numer || "Faktura bez numeru",
      date: invoice?.data_wystawienia || null,
      clientName: invoiceClientName(line),
      total: 0,
      lines: [],
    };
    current.total += Number(line.kwota_netto || 0);
    current.lines.push(line);
    groups.set(id, current);
  });

  return Array.from(groups.values()).sort((a, b) => {
    const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCompare !== 0) return dateCompare;
    const numberCompare = invoiceNumberSortValue(b.number) - invoiceNumberSortValue(a.number);
    if (numberCompare !== 0) return numberCompare;
    return b.number.localeCompare(a.number, "pl", { numeric: true });
  });
}

function filterRevenueLinesForRange(lines: CfoInvoiceLine[], from: string, to: string) {
  return lines.filter((line) => {
    const effectivePeriod = revenueLineEffectivePeriod(line);
    return effectivePeriod >= from && effectivePeriod <= to;
  });
}

function revenueLineEffectivePeriod(line: CfoInvoiceLine) {
  const settlementPeriod = revenueLineSettlementPeriod(line);
  if (settlementPeriod) return monthToDate(settlementPeriod);
  if (line.source_key === "dodatkowe_dokumenty") {
    const periodFromName = revenueLinePeriodFromName(line.nazwa);
    if (periodFromName) return monthToDate(periodFromName);
  }
  return invoiceParent(line)?.okres || monthToDate(currentMonthInput());
}

function revenueLineSettlementPeriod(line: CfoInvoiceLine) {
  const fee = Array.isArray(line.rozliczenia_oplaty_dodatkowe) ? line.rozliczenia_oplaty_dodatkowe[0] : line.rozliczenia_oplaty_dodatkowe;
  const settlement = Array.isArray(fee?.rozliczenia_miesieczne) ? fee?.rozliczenia_miesieczne[0] : fee?.rozliczenia_miesieczne;
  return settlement?.okres?.slice(0, 7) || null;
}

function revenueLinePeriodFromName(name: string) {
  const normalized = normalizePolishText(name.toLowerCase());
  const numericMatch = /(?:^|\D)(0?[1-9]|1[0-2])\s*[./-]\s*(20\d{2})(?:\D|$)/.exec(normalized);
  if (numericMatch) return validMonthValue(Number(numericMatch[2]), Number(numericMatch[1]));

  for (let index = 0; index < MONTH_LABELS.length; index += 1) {
    const monthName = normalizePolishText(MONTH_LABELS[index]);
    const match = new RegExp(`${monthName}\\w*\\s+(20\\d{2})`).exec(normalized);
    if (match) return validMonthValue(Number(match[1]), index + 1);
  }

  return null;
}

function invoiceNumberSortValue(value: string) {
  const match = value.match(/(\d+)\s*\/\s*\d{4}/);
  return match ? Number(match[1]) : 0;
}

function buildEmployeeDrafts(teamMembers: CfoTeamMember[], employeeCosts: CfoEmployeeCost[], period: string): Record<string, EmployeeCostDraft> {
  const existingByPerson = new Map(employeeCosts.filter((employee) => employee.osoba_id).map((employee) => [employee.osoba_id as string, employee]));
  return teamMembers.reduce<Record<string, EmployeeCostDraft>>((drafts, member) => {
    const existing = existingByPerson.get(member.id);
    drafts[member.id] = existing ? { ...existing } : defaultEmployeeDraft(member, period);
    return drafts;
  }, {});
}

function defaultEmployeeDraft(member: CfoTeamMember, period: string): EmployeeCostDraft {
  return {
    ...EMPTY_EMPLOYEE,
    okres: monthToDate(period),
    osoba_id: member.id,
    osoba_nazwa: teamMemberName(member),
    zespol: member.role === "manager" ? "ksiegowy" : "ksiegowy",
  };
}

function buildTeamWorkTime(timeEntries: CfoClientTimeEntry[]) {
  const byPerson = new Map<string, CfoTeamWorkTime>();
  timeEntries.forEach((entry) => {
    const hours = Number(entry.duration_seconds || 0) / 3600;
    if (!entry.osoba_id || hours <= 0) return;
    const current = byPerson.get(entry.osoba_id) || { ...EMPTY_WORK_TIME };
    current.total += hours;
    if (entry.klient_id) current.client += hours;
    byPerson.set(entry.osoba_id, current);
  });
  return byPerson;
}

function costPaymentState(cost: CfoCostItem, paid: number): "none" | "partial" | "settled" | "overpaid" {
  const gross = costGrossValue(cost);
  if (gross <= 0 || paid <= 0) return "none";
  const remaining = gross - paid;
  if (Math.abs(remaining) <= 0.01) return "settled";
  return remaining < 0 ? "overpaid" : "partial";
}

function filterCosts(costs: CfoCostItem[], search: string) {
  const query = normalizeSearchValue(search);
  if (!query) return costs;
  return costs.filter((cost) => normalizeSearchValue([
    cost.numer_dokumentu,
    cost.kontrahent,
    cost.opis,
    costLabel(cost.kategoria),
    cost.podkategoria,
    formatDate(cost.data_dokumentu),
    formatCostPeriod(cost.okres_start, cost.okres_end),
    formatMoney(cost.kwota_netto_cfo),
    formatMoney(costGrossValue(cost)),
  ].filter(Boolean).join(" ")).includes(query));
}

function normalizeSearchValue(value: string | number | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/\s+/g, " ")
    .trim();
}

function costGrossValue(cost: CfoCostItem) {
  const gross = Number(cost.kwota_brutto || 0);
  if (gross > 0) return gross;
  return Number(cost.kwota_netto_cfo || 0);
}

function buildCfoView(period: string, viewMode: CfoViewMode, revenueLines: CfoInvoiceLine[], costs: CfoCostItem[], employees: CfoEmployeeCost[], bank: CfoBankTransaction[]) {
  const range = cfoPeriodRange(period, viewMode);
  const periodMonths = monthsBetween(range.from, range.to);
  const activeRevenueLines = filterRevenueLinesForRange(revenueLines, range.from, range.to);
  const ownerPayoutTarget = OWNER_MONTHLY_PAYOUT * periodMonths;
  const revenue = sum(activeRevenueLines.map((line) => Number(line.kwota_netto || 0)));
  const mrr = sum(activeRevenueLines.filter((line) => line.cfo_przychod_kategoria === "abonamenty").map((line) => Number(line.kwota_netto || 0)));
  const employeeBase = sum(employees.map((employee) => Number(employee.podstawa || 0) + Number(employee.zus_pracodawcy || 0) + Number(employee.benefity || 0) + Number(employee.premie || 0) + Number(employee.szkolenia || 0)));
  const activeCosts = costs.filter((cost) => !cost.ignoruj);
  const costValue = (cost: CfoCostItem) => costShareForRange(cost, range.from, range.to);
  const managementCosts = sum(activeCosts.filter((cost) => cost.kategoria === "zarzad_wlasciciel").map(costValue));
  const ownerPayoutRecorded = Math.min(ownerPayoutTarget, sum(activeCosts.filter(isOwnerPayoutCost).map(costValue)));
  const ownerPayrollBurden = sum(activeCosts.filter(isOwnerPayrollBurdenCost).map(costValue));
  const ownerPayoutRemaining = Math.max(0, ownerPayoutTarget - ownerPayoutRecorded);
  const operatingCosts = sum(activeCosts.filter((cost) => cost.kategoria !== "zarzad_wlasciciel").map(costValue)) + employeeBase;
  const operatingResult = revenue - operatingCosts - managementCosts;
  const cashFlow = sum(bank.filter((transaction) => !transaction.ignoruj && transaction.typ !== "transfer_wewnetrzny").map((transaction) => Number(transaction.kwota || 0)));
  const companyBufferTarget = revenue * COMPANY_BUFFER_RATE;
  const ownerGoalTarget = ownerPayoutRemaining + companyBufferTarget;
  const ownerLossCoverage = Math.max(0, -operatingResult);
  const ownerPositiveResult = Math.max(0, operatingResult);
  const retainedProfitAfterOwner = operatingResult - ownerPayoutRemaining;
  const retainedProfitMargin = revenue > 0 ? retainedProfitAfterOwner / revenue : null;
  const ownerGoalGap = Math.max(0, ownerGoalTarget - operatingResult);
  const ownerGoalSurplus = Math.max(0, operatingResult - ownerGoalTarget);
  const clientsByName = new Map<string, CfoClientRow>();
  const revenueByCategory = new Map<string, number>();
  const costsByCategory = new Map<string, { value: number; children: Map<string, number> }>();

  activeRevenueLines.forEach((line) => {
    const category = revenueLabel(line.cfo_przychod_kategoria || "pozostale");
    revenueByCategory.set(category, (revenueByCategory.get(category) || 0) + Number(line.kwota_netto || 0));
    const name = invoiceClientName(line);
    const clientId = invoiceClientId(line);
    const key = clientId || name;
    const current = clientsByName.get(key) || { key, id: clientId, name, revenue: 0, mrr: 0 };
    current.revenue += Number(line.kwota_netto || 0);
    if (line.cfo_przychod_kategoria === "abonamenty") current.mrr += Number(line.kwota_netto || 0);
    clientsByName.set(key, current);
  });

  costs.forEach((cost) => {
    const label = costLabel(cost.kategoria);
    const value = costValue(cost);
    const current = costsByCategory.get(label) || { value: 0, children: new Map<string, number>() };
    const subcategory = cost.podkategoria || "Bez podkategorii";
    current.value += value;
    current.children.set(subcategory, (current.children.get(subcategory) || 0) + value);
    costsByCategory.set(label, current);
  });

  employees.forEach((employee) => {
    addEmployeeCostBreakdown(costsByCategory, employee);
  });

  return {
    revenue,
    mrr,
    operatingCosts,
    managementCosts,
    operatingResult,
    cashFlow,
    companyBufferTarget,
    ownerPayoutTarget,
    ownerGoalTarget,
    ownerPayoutRecorded,
    ownerPayrollBurden,
    ownerPayoutRemaining,
    ownerLossCoverage,
    ownerPositiveResult,
    retainedProfitAfterOwner,
    retainedProfitMargin,
    ownerGoalGap,
    ownerGoalSurplus,
    ownerGoalText: ownerGoalGap <= 0 ? `+${formatMoney(ownerGoalSurplus)}` : `-${formatMoney(ownerGoalGap)}`,
    revenueLines: activeRevenueLines,
    clients: Array.from(clientsByName.values()).sort((a, b) => b.revenue - a.revenue),
    revenueBreakdown: Array.from(revenueByCategory, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    costBreakdown: Array.from(costsByCategory, ([label, entry]) => ({
      label,
      value: entry.value,
      children: Array.from(entry.children, ([childLabel, childValue]) => ({ label: childLabel, value: childValue })).sort((a, b) => b.value - a.value),
    })).sort((a, b) => b.value - a.value),
  };
}

function addEmployeeCostBreakdown(costsByCategory: Map<string, { value: number; children: Map<string, number> }>, employee: CfoEmployeeCost) {
  const label = employeeCostCategoryLabel(employee.zespol);
  const current = costsByCategory.get(label) || { value: 0, children: new Map<string, number>() };
  const rows = [
    { label: `${employeeCostPrefix(employee.zespol)} - podstawa`, value: Number(employee.podstawa || 0) },
    { label: `${employeeCostPrefix(employee.zespol)} - ZUS pracodawcy`, value: Number(employee.zus_pracodawcy || 0) },
    { label: `${employeeCostPrefix(employee.zespol)} - benefity`, value: Number(employee.benefity || 0) },
    { label: `${employeeCostPrefix(employee.zespol)} - premie`, value: Number(employee.premie || 0) },
    { label: `${employeeCostPrefix(employee.zespol)} - szkolenia`, value: Number(employee.szkolenia || 0) },
  ];

  rows.forEach((row) => {
    if (row.value <= 0) return;
    current.value += row.value;
    current.children.set(row.label, (current.children.get(row.label) || 0) + row.value);
  });
  if (current.value > 0) costsByCategory.set(label, current);
}

function employeeCostCategoryLabel(team: CfoEmployeeCost["zespol"]) {
  if (team === "marketingowy") return "Marketing i sprzedaż";
  if (team === "sprzedazowy") return "Marketing i sprzedaż";
  return "Koszty zespołu";
}

function employeeCostPrefix(team: CfoEmployeeCost["zespol"]) {
  if (team === "marketingowy") return "Koszt zespołu marketingowego";
  if (team === "sprzedazowy") return "Koszt zespołu sprzedażowego";
  return "Zespół księgowy";
}

async function parseCostWorkbook(file: File, period: string): Promise<CfoCostImportRow[]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    return buildCostImportRows(rows, file.name, period);
  }

  const rows = parseDelimitedTable(await file.text());
  return buildCostImportRows(rows, file.name, period);
}

function buildCostImportRows(rows: Record<string, unknown>[], _fileName: string, period: string): CfoCostImportRow[] {
  return rows.map((row) => {
    const documentNumber = stringValue(row["Nr dokumentu"] ?? row["Numer dokumentu"]);
    const contractor = stringValue(row["Kontrahent"]) || "Brak kontrahenta";
    const description = stringValue(row["Opis"]);
    const net = numberValue(row["Kwota netto"]);
    const vat = numberValue(row["Kwota VAT"]);
    const gross = numberValue(row["Razem"] ?? row["Kwota brutto"]);
    const documentDate = dateValue(row["Data wystawienia"]);
    const category = classifyCost(contractor, description);
    return {
      import_key: buildCostImportKey(documentNumber, contractor, description, documentDate, net, gross),
      data_dokumentu: documentDate,
      numer_dokumentu: documentNumber,
      kontrahent: contractor,
      opis: description,
      kwota_netto_import: net,
      kwota_netto_cfo: net,
      kwota_vat: vat,
      kwota_brutto: gross,
      kategoria: category.category,
      podkategoria: category.subcategory,
      okres_start: monthToDate(period),
      okres_end: monthEndDate(period),
      zrodlo: "import" as const,
    };
  }).filter((row) => row.kontrahent || row.kwota_netto_cfo);
}

function removeDuplicateCostsFromImport(rows: CfoCostImportRow[]) {
  const seen = new Set<string>();
  const skipped: CfoCostImportRow[] = [];
  const uniqueRows: CfoCostImportRow[] = [];

  rows.forEach((row) => {
    const key = costDuplicateKey(row);
    if (seen.has(key)) {
      skipped.push(row);
      return;
    }
    seen.add(key);
    uniqueRows.push(row);
  });

  return { rows: uniqueRows, skipped };
}

function removeExistingDuplicateCosts(rows: CfoCostImportRow[], existingCosts: CfoCostDuplicateCandidate[]) {
  const existingImportKeys = new Set(existingCosts.map((cost) => cost.import_key).filter(Boolean));
  const existingNaturalKeys = new Set(existingCosts.map(costDuplicateKey));
  const skipped: CfoCostImportRow[] = [];
  const uniqueRows = rows.filter((row) => {
    const duplicate = existingImportKeys.has(row.import_key) || existingNaturalKeys.has(costDuplicateKey(row));
    if (duplicate) skipped.push(row);
    return !duplicate;
  });

  return { rows: uniqueRows, skipped };
}

function buildCostImportSummary(importedCount: number, skippedInFileCount: number, skippedExisting: CfoCostImportRow[], totalCount: number) {
  const skippedCount = skippedInFileCount + skippedExisting.length;
  const parts = [`Zaimportowano pozycje kosztowe: ${importedCount} z ${totalCount}.`];
  if (skippedCount > 0) {
    parts.push(`Pominięto duplikaty: ${skippedCount} (${skippedInFileCount} w pliku, ${skippedExisting.length} już w CFO).`);
    const examples = skippedExisting.slice(0, 5).map(costImportLabel);
    if (examples.length > 0) parts.push(`Przykłady pominiętych: ${examples.join("; ")}.`);
  }
  return parts.join("\n");
}

function buildCostImportKey(documentNumber: string | null, contractor: string, description: string, documentDate: string | null, net: number, gross: number | null) {
  return [
    "cost",
    normalizeDuplicatePart(documentNumber || description || "bez-dokumentu"),
    normalizeDuplicatePart(contractor),
    documentDate || "bez-daty",
    duplicateAmount(gross ?? net),
  ].join(":");
}

function costDuplicateKey(row: CfoCostImportRow | CfoCostDuplicateCandidate) {
  return [
    normalizeDuplicatePart(row.numer_dokumentu || row.import_key || "bez-dokumentu"),
    normalizeDuplicatePart(row.kontrahent),
    row.data_dokumentu || "bez-daty",
    duplicateAmount(row.kwota_brutto ?? row.kwota_netto_import ?? row.kwota_netto_cfo),
  ].join("|");
}

function costImportLabel(row: CfoCostImportRow) {
  return [row.numer_dokumentu || "bez numeru", row.kontrahent, formatMoney(row.kwota_brutto ?? row.kwota_netto_cfo)].join(" / ");
}

function normalizeDuplicatePart(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    || "brak";
}

function duplicateAmount(value: number | null | undefined) {
  return Number(value || 0).toFixed(2);
}

function parseDelimitedTable(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const [headers = [], ...rows] = parseDelimited(text, delimiter);
  return rows.map((row) => headers.reduce<Record<string, unknown>>((acc, header, index) => {
    acc[header.trim()] = row[index] ?? null;
    return acc;
  }, {}));
}

function parseDelimited(text: string, delimiter: "," | ";") {
  const result: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) result.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) result.push(row);
  return result;
}

function classifyCost(contractor: string, description: string | null): { category: CfoCostCategory; subcategory: string | null } {
  const value = `${contractor} ${description || ""}`.toLowerCase();
  if (value.includes("google workspace")) return { category: "systemy_technologia", subcategory: "Google Workspace" };
  if (value.includes("openai")) return { category: "systemy_technologia", subcategory: "OpenAI" };
  if (value.includes("t-mobile") || value.includes("telekom")) return { category: "systemy_technologia", subcategory: "T-Mobile" };
  if (value.includes("wfirma") || value.includes("wfirm")) return { category: "systemy_technologia", subcategory: "wFirma" };
  if (value.includes("office") || value.includes("microsoft")) return { category: "systemy_technologia", subcategory: "MS Office" };
  if (value.includes("google ads")) return { category: "marketing_sprzedaz", subcategory: "Google ADS" };
  if (value.includes("facebook") || value.includes("facebk") || value.includes("meta")) return { category: "marketing_sprzedaz", subcategory: "Meta ADS" };
  if (value.includes("canva")) return { category: "marketing_sprzedaz", subcategory: "Canva" };
  if (value.includes("najem") || value.includes("czynsz")) return { category: "lokal_infrastruktura", subcategory: "Czynsz" };
  if (value.includes("gaz")) return { category: "lokal_infrastruktura", subcategory: "Gaz" };
  if (value.includes("woda")) return { category: "lokal_infrastruktura", subcategory: "Woda" };
  if (value.includes("smiec") || value.includes("śmie")) return { category: "lokal_infrastruktura", subcategory: "Śmieci" };
  if (value.includes("gospodarcze")) return { category: "lokal_infrastruktura", subcategory: "Materiały gospodarcze" };
  if (value.includes("kurier") || value.includes("furgonetka")) return { category: "administracja_ogolne", subcategory: "Poczta / kurier" };
  if (value.includes("biurow") || value.includes("papier")) return { category: "administracja_ogolne", subcategory: "Artykuły biurowe / spożywcze" };
  if (value.includes("siłown") || value.includes("silown") || value.includes("benefit")) return { category: "koszty_zespolu", subcategory: "Benefity" };
  return { category: "administracja_ogolne", subcategory: "Inne" };
}

function costShareForRange(cost: CfoCostItem, rangeStart: string, rangeEnd: string) {
  const amount = Number(cost.kwota_netto_cfo || 0);
  const totalMonths = Math.max(1, monthsBetween(cost.okres_start, cost.okres_end));
  const overlapStart = cost.okres_start > rangeStart ? cost.okres_start : rangeStart;
  const overlapEnd = cost.okres_end < rangeEnd ? cost.okres_end : rangeEnd;
  if (overlapStart > overlapEnd) return 0;
  const overlapMonths = Math.max(1, monthsBetween(overlapStart, overlapEnd));
  if (totalMonths === 1 && cost.ujecie_zarzadcze !== "rozliczenie_w_czasie") return amount;
  return (amount / totalMonths) * overlapMonths;
}

function isOwnerPayoutCost(cost: CfoCostItem) {
  return cost.kategoria === "zarzad_wlasciciel" && ["Wynagrodzenie netto Prezesa", "Premia netto Prezesa", "Wynagrodzenie podstawowe Prezesa", "Premia Prezesa"].includes(cost.podkategoria || "");
}

function isOwnerPayrollBurdenCost(cost: CfoCostItem) {
  return cost.kategoria === "zarzad_wlasciciel" && ["PIT od wynagrodzenia Prezesa", "ZUS od wynagrodzenia Prezesa", "Inne obciążenia wynagrodzenia Prezesa"].includes(cost.podkategoria || "");
}

function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = end.slice(0, 7).split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth + 1;
}

function availableHours(employee: CfoEmployeeCost, period: string) {
  return businessDaysInMonth(period) * 8 * Number(employee.wymiar_etatu || 0) - Number(employee.nieobecnosci_godziny || 0) * 8 + Number(employee.nadgodziny || 0);
}

function businessDaysInMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  let days = 0;
  while (date.getMonth() === month - 1) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) days += 1;
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function invoiceClientName(line: CfoInvoiceLine) {
  const invoice = invoiceParent(line);
  const client = Array.isArray(invoice?.klienci) ? invoice?.klienci[0] : invoice?.klienci;
  return client?.nazwa || invoice?.kontrahent_nazwa || "Klient bez nazwy";
}

function invoiceClientId(line: CfoInvoiceLine) {
  const invoice = invoiceParent(line);
  return invoice?.klient_id || null;
}

function invoiceParent(line: CfoInvoiceLine) {
  return Array.isArray(line.faktury) ? line.faktury[0] : line.faktury;
}

function teamMemberName(member: CfoTeamMember) {
  return member.full_name || member.email || "Użytkownik";
}

function roleLabel(role: string | null) {
  if (role === "manager") return "Manager";
  if (role === "opiekun_ksiegowy") return "Opiekun księgowy";
  if (role === "accountant" || role === "ksiegowy") return "Księgowy";
  return "Zespół";
}

function revenueLabel(category: CfoRevenueCategory) {
  return REVENUE_OPTIONS.find((option) => option.value === category)?.label || "Pozostałe";
}

function costLabel(category: CfoCostCategory) {
  return COST_OPTIONS.find((option) => option.value === category)?.label || "Inne";
}

function emptyManualCost(period: string): ManualCostDraft {
  return {
    import_key: "",
    data_dokumentu: null,
    numer_dokumentu: null,
    kontrahent: "",
    opis: null,
    kwota_netto_import: 0,
    kwota_netto_cfo: 0,
    kwota_vat: null,
    kwota_brutto: null,
    kategoria: "",
    podkategoria: null,
    okres_start: monthToDate(period),
    okres_end: monthEndDate(period),
    zrodlo: "recznie",
  };
}

function currentMonthInput() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function currentMonthDate() {
  return `${currentMonthInput()}-01`;
}

function cfoPeriodRange(period: string, viewMode: CfoViewMode) {
  if (viewMode === "year") {
    const { year, month } = parseMonthValue(period);
    const lastClosedMonth = Math.max(1, month - 1);
    const lastClosedPeriod = `${year}-${String(lastClosedMonth).padStart(2, "0")}`;
    return { from: `${year}-01-01`, to: monthEndDate(lastClosedPeriod) };
  }
  return { from: monthToDate(period), to: monthEndDate(period) };
}

function revenueFetchRange(from: string, to: string) {
  const fromMonth = shiftMonth(from.slice(0, 7), -1);
  const toMonth = shiftMonth(to.slice(0, 7), 1);
  return { from: monthToDate(fromMonth), to: monthEndDate(toMonth) };
}

function cfoPeriodLabel(period: string, viewMode: CfoViewMode) {
  if (viewMode === "month") return formatMonthField(period);
  const range = cfoPeriodRange(period, viewMode);
  const year = range.from.slice(0, 4);
  const lastMonth = Number(range.to.slice(5, 7));
  return `Rok ${year} do ${MONTH_LABELS[lastMonth - 1]}`;
}

function monthToDate(value: string) {
  return `${value}-01`;
}

function monthEndDate(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function parseMonthValue(value: string) {
  const [year, month] = value.split("-").map(Number);
  return { year: year || new Date().getFullYear(), month: month || new Date().getMonth() + 1 };
}

function formatMonthField(value: string) {
  const { year, month } = parseMonthValue(value);
  return `${MONTH_LABELS[month - 1] || ""} ${year}`.trim();
}

function isFullMonthPeriod(start: string, end: string) {
  if (!start || !end) return false;
  const month = start.slice(0, 7);
  return start === monthToDate(month) && end === monthEndDate(month);
}

function formatCostPeriod(start: string, end: string) {
  if (isFullMonthPeriod(start, end)) return formatMonthField(start.slice(0, 7));
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function parseMonthFieldText(value: string) {
  const normalized = value.trim().toLowerCase();
  const isoMatch = /^(\d{4})-(\d{1,2})$/.exec(normalized);
  if (isoMatch) return validMonthValue(Number(isoMatch[1]), Number(isoMatch[2]));
  const numericMatch = /^(\d{1,2})[./-](\d{4})$/.exec(normalized);
  if (numericMatch) return validMonthValue(Number(numericMatch[2]), Number(numericMatch[1]));
  const textMatch = /^([a-ząćęłńóśźż]+)\s+(\d{4})$/.exec(normalized);
  if (!textMatch) return null;
  const monthIndex = MONTH_LABELS.findIndex((label) => normalizePolishText(label).startsWith(normalizePolishText(textMatch[1])));
  return monthIndex >= 0 ? validMonthValue(Number(textMatch[2]), monthIndex + 1) : null;
}

function validMonthValue(year: number, month: number) {
  if (!year || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftMonth(value: string, delta: number) {
  const { year, month } = parseMonthValue(value);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizePolishText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace("ł", "l");
}

function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateForField(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
}

function parseDateFieldText(value: string) {
  const trimmed = value.trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) return isValidDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])) ? trimmed : null;
  const polishMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(trimmed);
  if (!polishMatch) return null;
  const day = Number(polishMatch[1]);
  const month = Number(polishMatch[2]);
  const year = Number(polishMatch[3]);
  if (!isValidDateParts(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isValidDateParts(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function calendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatMoney(value: number | string | null | undefined) {
  return `${formatPlNumber(Number(value || 0), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function formatNumberInput(value: number | string | null | undefined) {
  return formatPlNumber(Number(value || 0), { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatHours(value: number) {
  return `${formatPlNumber(Number(value || 0), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

function formatPercent(value: number | null) {
  if (value === null) return "Brak";
  return `${formatPlNumber(value * 100, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
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
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Brak";
  return new Intl.DateTimeFormat("pl-PL").format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  const normalized = stringValue(value).replace(/\s/g, "").replace(",", ".");
  return normalized ? Number(normalized) || 0 : 0;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 25000) return excelSerialDate(value);
  const text = stringValue(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) return parsePolishDate(text);
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return parsePolishDate(text.replace(/\./g, "-"));
  return null;
}

function excelSerialDate(value: number) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(value) * 86400000).toISOString().slice(0, 10);
}

function parsePolishDate(value: unknown) {
  const text = stringValue(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const [day, month, year] = text.split("-");
  return `${year}-${month}-${day}`;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function documentNumberOrNull(value: string) {
  return value.trim() ? value : null;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "sprawdź format pliku i uprawnienia użytkownika";
}

function polishCount(count: number, one: string, few: string, many: string) {
  if (count === 1) return one;
  const last = count % 10;
  const lastTwo = count % 100;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

const contentStyle: CSSProperties = { padding: "32px", display: "grid", gap: "20px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", flexWrap: "wrap" };
const headerActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" };
const viewModeToggleStyle: CSSProperties = { display: "inline-flex", border: `1px solid ${colors.border}`, borderRadius: radius.input, overflow: "hidden", background: colors.white, minHeight: "42px" };
const viewModeButtonStyle: CSSProperties = { border: 0, background: "transparent", color: colors.navy, padding: "9px 13px", fontWeight: 850, cursor: "pointer" };
const viewModeActiveButtonStyle: CSSProperties = { ...viewModeButtonStyle, background: colors.navy, color: colors.white };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { color: colors.navy, fontSize: "42px", margin: 0, lineHeight: 1.05 };
const monthFieldWrapperStyle: CSSProperties = { position: "relative", width: "235px" };
const monthControlStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", display: "grid", gridTemplateColumns: "32px minmax(0, 1fr) 38px", alignItems: "center", overflow: "hidden" };
const monthIconStyle: CSSProperties = { color: colors.navy, justifySelf: "center" };
const monthTextInputStyle: CSSProperties = { border: 0, outline: "none", background: "transparent", color: colors.text, minHeight: "40px", padding: "9px 0", fontWeight: 850, width: "100%", boxSizing: "border-box", fontSize: "15px" };
const monthPickerStyle: CSSProperties = { position: "absolute", top: "48px", right: 0, zIndex: 1100, width: "285px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, boxShadow: shadow.card, padding: "12px", color: colors.text };
const monthGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "7px", alignItems: "stretch" };
const monthButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: "10px", background: colors.inputBackground, color: colors.text, height: "38px", padding: "0 6px", fontSize: "13px", fontWeight: 850, cursor: "pointer", textAlign: "center", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, boxSizing: "border-box", width: "100%" };
const monthSelectedButtonStyle: CSSProperties = { background: colors.navy, borderColor: colors.navy, color: colors.white };
const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" };
const metricStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.input, boxShadow: shadow.soft, display: "grid", gap: "9px", padding: "16px", color: colors.muted, fontWeight: 800 };
const metricValueStyle: CSSProperties = { color: colors.navy, fontSize: "21px", lineHeight: 1.1 };
const goodMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.success };
const badMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.danger };
const warnMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.warning };
const tabsStyle: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", borderBottom: `1px solid ${colors.border}`, paddingBottom: "10px" };
const tabStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "40px", padding: "8px 12px", fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, background: colors.navy, color: colors.white, borderColor: colors.navy };
const dashboardGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)", gap: "18px", alignItems: "start" };
const sectionStackStyle: CSSProperties = { display: "grid", gap: "18px" };
const panelStyle: CSSProperties = cfoUi.panel;
const widePanelStyle: CSSProperties = { ...panelStyle, gridColumn: "1 / -1" };
const panelHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" };
const panelHeaderWithTotalStyle: CSSProperties = { ...panelHeaderStyle, justifyContent: "space-between", flexWrap: "wrap" };
const panelTitleGroupStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "10px", minWidth: 0 };
const panelHeaderTotalStyle: CSSProperties = { color: colors.navy, fontSize: "15px", whiteSpace: "nowrap" };
const dashboardScopeBadgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontSize: "12px", fontWeight: 900, marginLeft: "auto" };
const panelIconStyle: CSSProperties = { color: colors.red, display: "inline-flex" };
const panelTitleStyle: CSSProperties = cfoUi.title;
const recommendationStyle: CSSProperties = { display: "grid", gap: "6px", background: "#e9eef7", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "16px", color: colors.navy };
const ownerGoalBreakdownStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "7px 14px", marginTop: "8px", maxWidth: "560px" };
const dangerInlineStyle: CSSProperties = { color: colors.danger, fontWeight: 900 };
const successInlineStyle: CSSProperties = { color: colors.success, fontWeight: 900 };
const warningInlineStyle: CSSProperties = { color: colors.warning, fontWeight: 900 };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = cfoUi.table;
const wideCostTableStyle: CSSProperties = { ...tableStyle, minWidth: "1240px", tableLayout: "fixed", fontSize: "13px", lineHeight: 1.4 };
const thStyle: CSSProperties = cfoUi.th;
const tdStyle: CSSProperties = cfoUi.td;
const documentCostCellStyle: CSSProperties = { whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" };
const contractorCostCellStyle: CSSProperties = { whiteSpace: "normal", overflowWrap: "anywhere", wordBreak: "break-word" };
const invoiceGroupCellStyle: CSSProperties = { ...tdStyle, background: "#f1f5f9", color: colors.navy, paddingTop: "14px", paddingBottom: "14px" };
const invoiceLineIndentStyle: CSSProperties = { display: "inline-flex", paddingLeft: "18px" };
const smallStyle: CSSProperties = { display: "block", color: colors.muted, marginTop: "4px", fontSize: "12px", fontWeight: 650 };
const invoiceLinePeriodStyle: CSSProperties = { ...smallStyle, paddingLeft: "18px", color: colors.navy };
const settledTextStyle: CSSProperties = { color: colors.success, fontWeight: 850 };
const settledSmallStyle: CSSProperties = { ...smallStyle, color: colors.success };
const overpaidTextStyle: CSSProperties = { color: colors.warning, fontWeight: 850 };
const overpaidSmallStyle: CSSProperties = { ...smallStyle, color: colors.warning };
const compactSelectStyle: CSSProperties = { minHeight: "36px", padding: "7px 10px", background: colors.white };
const costSelectStyle: CSSProperties = { ...compactSelectStyle, fontSize: "12px", fontWeight: 650, minHeight: "32px", padding: "6px 8px" };
const iconDangerButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: "12px", background: colors.white, color: colors.red, width: "38px", minWidth: "38px", height: "38px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const uploadBoxStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, cursor: "pointer", padding: "18px", color: colors.text, display: "grid", gap: "8px", justifyItems: "start" };
const manualFormStyle: CSSProperties = { display: "grid", gap: "10px", marginTop: "14px", maxWidth: "1120px" };
const manualTopRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(230px, 1.4fr) minmax(200px, 1fr) minmax(180px, 0.8fr)", gap: "10px", alignItems: "start" };
const manualBottomRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px, 1fr) minmax(210px, 1fr) minmax(330px, 1.2fr) auto", gap: "10px", alignItems: "start" };
const dateRangeStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" };
const manualPeriodStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", minHeight: "42px" };
const checkboxLabelStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px", color: colors.navy, fontSize: "13px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const periodMonthBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", width: "fit-content", minHeight: "36px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.navy, padding: "7px 11px", fontWeight: 850 };
const costPeriodCellStyle: CSSProperties = { display: "grid", gap: "8px", minWidth: 0 };
const costDateRangeStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 150px)", gap: "8px" };
const inputStyle: CSSProperties = cfoUi.input;
const searchFieldWrapStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px, 1fr) auto", gap: "10px", alignItems: "center", margin: "12px 0 14px" };
const searchFieldStyle: CSSProperties = { ...inputStyle, minHeight: "40px", padding: "8px 12px" };
const searchClearButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "40px", padding: "8px 12px", fontWeight: 850, cursor: "pointer" };
const dateFieldStyle: CSSProperties = { position: "relative", minWidth: 0 };
const dateControlStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 38px", alignItems: "center", overflow: "hidden" };
const dateTextInputStyle: CSSProperties = { border: 0, outline: "none", background: "transparent", color: colors.text, minHeight: "40px", padding: "9px 0 9px 12px", fontWeight: 750, width: "100%", boxSizing: "border-box" };
const dateIconButtonStyle: CSSProperties = { border: 0, background: "transparent", color: colors.navy, width: "38px", minHeight: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const datePickerStyle: CSSProperties = { position: "absolute", top: "48px", right: 0, zIndex: 1100, width: "270px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.card, boxShadow: shadow.card, padding: "12px", color: colors.text };
const datePickerHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "34px minmax(0, 1fr) 34px", alignItems: "center", gap: "8px", color: colors.navy, marginBottom: "10px", textAlign: "center" };
const dateNavButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: "10px", background: colors.inputBackground, color: colors.navy, minHeight: "32px", fontSize: "20px", fontWeight: 850, cursor: "pointer" };
const dateWeekGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" };
const dateWeekdayStyle: CSSProperties = { color: colors.muted, fontSize: "11px", fontWeight: 900, textAlign: "center", padding: "4px 0", textTransform: "uppercase" };
const dateDayStyle: CSSProperties = { border: 0, borderRadius: "9px", background: "transparent", color: colors.text, minHeight: "30px", fontSize: "13px", fontWeight: 800, cursor: "pointer" };
const dateMutedDayStyle: CSSProperties = { color: "#94a3b8" };
const dateSelectedDayStyle: CSSProperties = { background: colors.navy, color: colors.white };
const todayButtonStyle: CSSProperties = { border: 0, background: "transparent", color: colors.red, fontWeight: 850, marginTop: "10px", padding: "7px 8px", cursor: "pointer", justifySelf: "start" };
const teamInputStyle: CSSProperties = { ...inputStyle, minHeight: "34px", padding: "6px 8px", width: "96px", textAlign: "right" };
const primaryButtonStyle: CSSProperties = cfoUi.primaryButton;
const secondaryButtonStyle: CSSProperties = cfoUi.secondaryButton;
const moneyEditStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", color: colors.navy, fontWeight: 850, whiteSpace: "nowrap" };
const moneyInputStyle: CSSProperties = { ...inputStyle, minHeight: "36px", padding: "7px 9px", width: "102px" };
const costMoneyEditStyle: CSSProperties = { ...moneyEditStyle, display: "flex", width: "100%", minWidth: 0, fontSize: "12px", fontWeight: 650 };
const costMoneyInputStyle: CSSProperties = { ...moneyInputStyle, fontSize: "12px", minHeight: "32px", padding: "6px 8px", width: "100%", minWidth: 0, flex: "1 1 0" };
const costPaymentCellStyle: CSSProperties = { display: "grid", gap: "6px", minWidth: 0 };
const costPaymentLabelStyle: CSSProperties = { display: "grid", gap: "4px", color: colors.muted, fontSize: "11px", fontWeight: 650 };
const costPaymentInputStyle: CSSProperties = { ...inputStyle, fontFamily: "inherit", fontSize: "12px", fontWeight: 500, minHeight: "32px", padding: "5px 6px", minWidth: 0, maxWidth: "100%", borderRadius: "8px" };
const mutedRowStyle: CSSProperties = { opacity: 0.58, background: "#f1f5f9" };
const formFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "14px", flexWrap: "wrap" };
const miniListStyle: CSSProperties = { display: "grid", gap: "8px" };
const miniItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "10px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", color: colors.text, alignItems: "center" };
const teamCapacityItemStyle: CSSProperties = { ...miniItemStyle, gridTemplateColumns: "minmax(220px, 1.4fr) repeat(5, minmax(120px, auto))", alignItems: "center" };
const infoNoticeStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: "#e9eef7", color: colors.navy, padding: "12px", fontWeight: 800 };
const costBreakdownGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "12px" };
const costBreakdownItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", display: "grid", gap: "11px", minWidth: 0 };
const costBreakdownHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "14px", color: colors.navy, alignItems: "start" };
const costBreakdownAmountStyle: CSSProperties = { whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" };
const costSubListStyle: CSSProperties = { display: "grid", gap: "7px" };
const costSubItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "14px", color: colors.text, fontSize: "13px", borderTop: `1px solid ${colors.border}`, paddingTop: "7px", alignItems: "start" };
const costPaymentStatusStyle: CSSProperties = { display: "grid", gap: "3px", color: colors.text, fontSize: "12px", lineHeight: 1.25, minWidth: 0 };

