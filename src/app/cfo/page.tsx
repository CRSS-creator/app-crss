"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Banknote, BriefcaseBusiness, CalendarDays, FileSpreadsheet, LayoutDashboard, Plus, ReceiptText, RefreshCw, Save, Trash2, TrendingUp, Upload, Users } from "lucide-react";
import * as XLSX from "xlsx";

import { colors, radius, shadow } from "@/app/design";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import AppSelect from "@/components/AppSelect";
import {
  fetchCfoBankTransactions,
  fetchCfoBankTransactionsRange,
  fetchCfoCashflowInvoices,
  fetchCfoClientTimeEntries,
  fetchCfoClientTimeEntriesRange,
  fetchCfoCosts,
  fetchCfoCostsRange,
  fetchCfoEmployeeCosts,
  fetchCfoEmployeeCostsRange,
  fetchCfoRevenueLinesRange,
  fetchCfoTeamMembers,
  importBankTransactions,
  deleteCfoCost,
  deletePaymentSplit,
  insertCfoCosts,
  insertPaymentSplit,
  updateBankTransaction,
  updateCfoCost,
  updateInvoiceLineCfoCategory,
  updatePaymentSplit,
  upsertCfoEmployeeCost,
  type CfoBankImportRow,
  type CfoBankTransaction,
  type CfoBankTransactionType,
  type CfoCashflowInvoice,
  type CfoClientTimeEntry,
  type CfoCostCategory,
  type CfoCostImportRow,
  type CfoCostItem,
  type CfoEmployeeCost,
  type CfoInvoiceLine,
  type CfoPaymentSplit,
  type CfoRevenueCategory,
  type CfoTeamMember,
} from "@/lib/cfoService";

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

const BANK_TYPE_OPTIONS: { value: CfoBankTransactionType; label: string }[] = [
  { value: "do_przypisania", label: "Do przypisania" },
  { value: "koszt", label: "Koszt" },
  { value: "wynagrodzenie_netto", label: "Wynagrodzenie netto" },
  { value: "pit", label: "PIT" },
  { value: "zus", label: "ZUS" },
  { value: "cit", label: "CIT" },
  { value: "vat", label: "VAT" },
  { value: "faktura_sprzedazowa", label: "Faktura sprzedażowa" },
  { value: "transfer_wewnetrzny", label: "Przelew wewnętrzny" },
  { value: "inne", label: "Inne" },
];

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
  const [cashflowCosts, setCashflowCosts] = useState<CfoCostItem[]>([]);
  const [employeeCosts, setEmployeeCosts] = useState<CfoEmployeeCost[]>([]);
  const [bankTransactions, setBankTransactions] = useState<CfoBankTransaction[]>([]);
  const [cashflowInvoices, setCashflowInvoices] = useState<CfoCashflowInvoice[]>([]);
  const [clientTimeEntries, setClientTimeEntries] = useState<CfoClientTimeEntry[]>([]);
  const [teamMembers, setTeamMembers] = useState<CfoTeamMember[]>([]);
  const [manualCost, setManualCost] = useState<ManualCostDraft>(() => emptyManualCost(period));
  const [manualInterperiod, setManualInterperiod] = useState(false);
  const [expandedCostPeriods, setExpandedCostPeriods] = useState<Record<string, boolean>>({});
  const [employeeDrafts, setEmployeeDrafts] = useState<Record<string, EmployeeCostDraft>>({});
  const [costSearch, setCostSearch] = useState("");
  const [cashflowSearch, setCashflowSearch] = useState("");

  useEffect(() => {
    void loadData();
    // Dane CFO przeładowują się po zmianie okresu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, viewMode]);

  const view = useMemo(
    () => buildCfoView(period, viewMode, revenueLines, costs, employeeCosts, bankTransactions),
    [period, viewMode, revenueLines, costs, employeeCosts, bankTransactions],
  );

  const clientProfitability = useMemo(
    () => buildClientProfitability(period, view.clients, employeeCosts, clientTimeEntries),
    [period, view.clients, employeeCosts, clientTimeEntries],
  );

  async function loadData() {
    setLoading(true);
    const range = cfoPeriodRange(period, viewMode);
    const revenueRange = revenueFetchRange(range.from, range.to);
    const cashflowCostRange = cfoCashflowCostLinkRange(period);
    const [revenueResult, costsResult, cashflowCostsResult, employeeResult, bankResult, invoicesResult, teamResult, timeResult] = await Promise.all([
      fetchCfoRevenueLinesRange(revenueRange.from, revenueRange.to),
      viewMode === "year" ? fetchCfoCostsRange(range.from, range.to) : fetchCfoCosts(range.from),
      fetchCfoCostsRange(cashflowCostRange.from, cashflowCostRange.to),
      viewMode === "year" ? fetchCfoEmployeeCostsRange(range.from, range.to) : fetchCfoEmployeeCosts(range.from),
      viewMode === "year" ? fetchCfoBankTransactionsRange(range.from, range.to) : fetchCfoBankTransactions(range.from),
      fetchCfoCashflowInvoices(period),
      fetchCfoTeamMembers(),
      viewMode === "year" ? fetchCfoClientTimeEntriesRange(range.from, range.to) : fetchCfoClientTimeEntries(range.from),
    ]);

    if (revenueResult.error) console.error("Błąd pobierania przychodów CFO:", revenueResult.error);
    if (costsResult.error) console.error("Błąd pobierania kosztów CFO:", costsResult.error);
    if (employeeResult.error) console.error("Błąd pobierania kosztów pracowników CFO:", employeeResult.error);
    if (bankResult.error) console.error("Błąd pobierania transakcji bankowych CFO:", bankResult.error);
    if (invoicesResult.error) console.error("Błąd pobierania faktur do cash flow CFO:", invoicesResult.error);
    if (teamResult.error) console.error("Błąd pobierania zespołu CFO:", teamResult.error);
    if (timeResult.error) console.error("Błąd pobierania czasu pracy klientów CFO:", timeResult.error);

    setRevenueLines((revenueResult.data || []) as unknown as CfoInvoiceLine[]);
    setCosts((costsResult.data || []) as CfoCostItem[]);
    setCashflowCosts((cashflowCostsResult.data || []) as CfoCostItem[]);
    setEmployeeCosts((employeeResult.data || []) as CfoEmployeeCost[]);
    setBankTransactions((bankResult.data || []) as CfoBankTransaction[]);
    setCashflowInvoices((invoicesResult.data || []) as CfoCashflowInvoice[]);
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
      const result = await insertCfoCosts(rows);
      if (result.error) {
        console.error(result.error);
        return alert(`Nie udało się zaimportować kosztów: ${errorMessage(result.error)}`);
      }
      await loadData();
      alert(`Zaimportowano pozycje kosztowe: ${result.data?.length || 0}.`);
    } finally {
      setSaving(false);
    }
  }

  async function importBankFile(file: File) {
    setSaving(true);
    try {
      const rows = await parseBankCsv(file);
      if (rows.length === 0) return alert("Nie znaleziono transakcji bankowych w pliku.");
      const result = await importBankTransactions(rows);
      if (result.error) {
        console.error(result.error);
        return alert(`Nie udało się zaimportować historii rachunku: ${errorMessage(result.error)}`);
      }
      await loadData();
      alert(`Zaimportowano transakcje: ${result.data?.length || 0}.`);
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
        <Metric label="Cash flow" value={formatMoney(view.cashFlow)} tone={view.cashFlow >= 0 ? "good" : "bad"} />
        <Metric label="Cel właściciela" value={view.ownerGoalText} tone={view.ownerGoalGap <= 0 ? "good" : "bad"} />
      </section>

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
      {!loading && activeTab === "koszty" ? renderCostSection(period, costs, bankTransactions, setCosts, manualCost, setManualCost, manualInterperiod, setManualInterperiod, expandedCostPeriods, setExpandedCostPeriods, addManualCost, importCostsFile, saving, costSearch, setCostSearch) : null}
      {!loading && activeTab === "cashflow" ? renderCashflowSection(period, bankTransactions, mergeCostLists(costs, cashflowCosts), cashflowInvoices, importBankFile, saving, setBankTransactions, cashflowSearch, setCashflowSearch) : null}
      {!loading && activeTab === "zespol" ? renderTeamSectionTable(teamMembers, employeeDrafts, setEmployeeDrafts, saveTeamCosts, saving, period, clientTimeEntries) : null}
      {!loading && activeTab === "klienci" ? renderClientsSection(clientProfitability) : null}
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
  transactions: CfoBankTransaction[],
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
  const costPaymentMap = buildCostPaymentMap(transactions);
  const visibleCosts = filterCosts(costs, search);

  async function changeCost(cost: CfoCostItem, payload: Partial<CfoCostItem>) {
    setCosts((current) => current.map((item) => item.id === cost.id ? { ...item, ...payload } : item));
    await updateCost(cost.id, payload);
  }

  async function removeCost(cost: CfoCostItem, paid: number) {
    const label = cost.numer_dokumentu || cost.kontrahent || "pozycjÄ™ kosztowÄ…";
    const message = paid > 0
      ? `UsunÄ…Ä‡ koszt ${label}? Do tej pozycji przypisano pĹ‚atnoĹ›ci na ${formatMoney(paid)}. Transakcje bankowe zostanÄ… w cash flow, ale stracÄ… to powiÄ…zanie.`
      : `UsunÄ…Ä‡ koszt ${label}?`;
    if (!confirm(message)) return;
    const result = await deleteCfoCost(cost.id);
    if (result.error) {
      console.error(result.error);
      alert("Nie udaĹ‚o siÄ™ usunÄ…Ä‡ kosztu.");
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
              <col style={{ width: "13%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead><tr><Th>Dokument</Th><Th>Kontrahent</Th><Th>Kategoria</Th><Th>Podkategoria</Th><Th>Okres</Th><Th align="right">Netto CFO</Th><Th align="right">Brutto cash flow</Th><Th>Rozliczenie CF</Th><Th align="right"><span aria-hidden="true"> </span></Th></tr></thead>
            <tbody>
              {visibleCosts.length === 0 ? <EmptyRow colSpan={9} text={costs.length === 0 ? "Brak kosztów w tym okresie." : "Brak kosztów pasujących do wyszukiwania."} /> : visibleCosts.map((cost) => {
                const rowSubcategoryOptions = SUBCATEGORIES[cost.kategoria].map((item) => ({ value: item, label: item }));
                const isInterperiod = expandedCostPeriods[cost.id] || !isFullMonthPeriod(cost.okres_start, cost.okres_end);
                const paid = costPaymentMap.get(cost.id) || 0;
                const paymentState = costPaymentState(cost, paid);
                const settlementStyle = paymentState === "settled" ? settledTextStyle : paymentState === "overpaid" ? overpaidTextStyle : null;
                const settlementSmallStyle = paymentState === "settled" ? settledSmallStyle : paymentState === "overpaid" ? overpaidSmallStyle : smallStyle;
                return (
                  <tr key={cost.id} style={cost.ignoruj ? mutedRowStyle : undefined}>
                    <Td style={{ ...documentCostCellStyle, ...settlementStyle }}>{cost.numer_dokumentu || "Brak numeru"}<small style={settlementSmallStyle}>{formatDate(cost.data_dokumentu)}</small></Td>
                    <Td style={{ ...contractorCostCellStyle, ...settlementStyle }}>{cost.kontrahent}</Td>
                    <Td><AppSelect value={cost.kategoria} options={COST_OPTIONS} onChange={(value) => void changeCost(cost, { kategoria: value as CfoCostCategory, podkategoria: null })} style={compactSelectStyle} /></Td>
                    <Td>
                      {rowSubcategoryOptions.length > 0 ? (
                        <AppSelect
                          value={cost.podkategoria || ""}
                          options={[{ value: "", label: "Wybierz podkategorię" }, ...rowSubcategoryOptions]}
                          onChange={(value) => void changeCost(cost, { podkategoria: emptyToNull(value) })}
                          style={compactSelectStyle}
                        />
                      ) : <span style={smallStyle}>Bez podkategorii</span>}
                    </Td>
                    <Td>
                      <div style={costPeriodCellStyle}>
                        <label style={checkboxLabelStyle}>
                          <input type="checkbox" checked={isInterperiod} onChange={(event) => toggleCostInterperiod(cost, event.target.checked)} />
                          Międzyokresowe
                        </label>
                        {isInterperiod ? (
                          <div style={costDateRangeStyle}>
                            <DateField value={cost.okres_start} onChange={(value) => void changeCost(cost, { okres_start: value })} />
                            <DateField value={cost.okres_end} onChange={(value) => void changeCost(cost, { okres_end: value })} />
                          </div>
                        ) : <span style={periodMonthBadgeStyle}>{formatCostPeriod(cost.okres_start, cost.okres_end)}</span>}
                      </div>
                    </Td>
                    <Td align="right">
                      <span style={moneyEditStyle}>
                        <MoneyTextInput
                          style={moneyInputStyle}
                          value={cost.kwota_netto_cfo}
                          onValueChange={(value) => setCosts((current) => current.map((item) => item.id === cost.id ? { ...item, kwota_netto_cfo: value } : item))}
                          onCommit={(value) => void updateCost(cost.id, { kwota_netto_cfo: value })}
                        />
                        zł
                      </span>
                    </Td>
                    <Td align="right">
                      <span style={{ ...moneyEditStyle, ...settlementStyle }}>
                        <MoneyTextInput
                          style={moneyInputStyle}
                          value={costGrossValue(cost)}
                          onValueChange={(value) => setCosts((current) => current.map((item) => item.id === cost.id ? { ...item, kwota_brutto: value } : item))}
                          onCommit={(value) => void updateCost(cost.id, { kwota_brutto: value })}
                        />
                        zł
                      </span>
                    </Td>
                    <Td><CostPaymentStatus cost={cost} paid={paid} compact /></Td>
                    <Td align="right">
                      <button type="button" style={iconDangerButtonStyle} onClick={() => void removeCost(cost, paid)} title="UsuĹ„ koszt" aria-label="UsuĹ„ koszt">
                        <Trash2 size={17} />
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

function renderCashflowSection(
  period: string,
  transactions: CfoBankTransaction[],
  costs: CfoCostItem[],
  invoices: CfoCashflowInvoice[],
  importBankFile: (file: File) => void,
  saving: boolean,
  setTransactions: (next: CfoBankTransaction[] | ((current: CfoBankTransaction[]) => CfoBankTransaction[])) => void,
  search: string,
  setSearch: (value: string) => void,
) {
  const costPaymentMap = buildCostPaymentMap(transactions);
  const invoicePaymentMap = buildInvoicePaymentMap(transactions);
  const currentTransactionIds = new Set(transactions.map((transaction) => transaction.id));
  const costOptions = [
    { value: "", label: "Nie przypisano do kosztu" },
    ...costs.filter((cost) => !cost.ignoruj).map((cost) => ({
      value: cost.id,
      label: costOptionLabel(cost),
      tone: costPaymentState(cost, costPaymentMap.get(cost.id) || 0) === "settled" ? "success" as const : undefined,
    })),
  ];
  const splitCostOptions = [
    { value: "__outside", label: "Poza kosztem CFO" },
    ...costs.filter((cost) => !cost.ignoruj).map((cost) => ({
      value: cost.id,
      label: costOptionLabel(cost),
      tone: costPaymentState(cost, costPaymentMap.get(cost.id) || 0) === "settled" ? "success" as const : undefined,
    })),
  ];
  const invoiceOptions = [
    { value: "", label: "Nie przypisano do faktury" },
    ...invoices.map((invoice) => ({
      value: invoice.id,
      label: invoiceOptionLabel(invoice, period),
      tone: isInvoiceSettled(invoice, invoicePaidValue(invoice, currentTransactionIds) + (invoicePaymentMap.get(invoice.id) || 0)) ? "success" as const : undefined,
    })),
  ];
  const visibleTransactions = filterBankTransactions(transactions, search, costs, invoices);
  async function changeTransaction(transaction: CfoBankTransaction, payload: Partial<CfoBankTransaction>) {
    const result = await updateBankTransaction(transaction.id, payload);
    if (result.error) return alert("Nie udało się zapisać transakcji bankowej.");
    setTransactions((current) => current.map((item) => item.id === transaction.id ? ((result.data || { ...item, ...payload }) as unknown as CfoBankTransaction) : item));
  }

  async function changeTransactionType(transaction: CfoBankTransaction, value: string) {
    const typ = value as CfoBankTransactionType;
    const payload: Partial<CfoBankTransaction> = {
      typ,
      ignoruj: typ === "transfer_wewnetrzny",
    };
    if (typ !== "koszt") payload.koszt_id = null;
    if (typ !== "faktura_sprzedazowa") payload.faktura_id = null;
    await changeTransaction(transaction, payload);
  }

  async function assignCost(transaction: CfoBankTransaction, costId: string) {
    await changeTransaction(transaction, {
      koszt_id: costId || null,
      faktura_id: null,
      typ: costId ? "koszt" : "do_przypisania",
      ignoruj: false,
      dopasowanie_status: costId ? "reczne" : "nieprzypisane",
    });
  }

  async function assignInvoice(transaction: CfoBankTransaction, invoiceId: string) {
    await changeTransaction(transaction, {
      faktura_id: invoiceId || null,
      koszt_id: null,
      typ: invoiceId ? "faktura_sprzedazowa" : "do_przypisania",
      ignoruj: false,
      dopasowanie_status: invoiceId ? "reczne" : "nieprzypisane",
    });
  }

  async function toggleSplitPayment(transaction: CfoBankTransaction, enabled: boolean) {
    await changeTransaction(transaction, {
      rozbita: enabled,
      koszt_id: enabled ? null : transaction.koszt_id,
      dopasowanie_status: enabled ? "reczne" : transaction.dopasowanie_status,
    });
  }

  async function addPaymentSplit(transaction: CfoBankTransaction) {
    const splits = paymentSplits(transaction);
    const remaining = Math.max(0, Math.abs(Number(transaction.kwota || 0)) - sum(splits.map((split) => Number(split.kwota || 0))));
    const result = await insertPaymentSplit({
      transakcja_id: transaction.id,
      koszt_id: null,
      opis: null,
      kwota: remaining,
      poza_kosztem_cfo: false,
    });
    if (result.error) return alert("Nie udało się dodać linii rozbicia.");
    setTransactions((current) => current.map((item) => item.id === transaction.id ? {
      ...item,
      cfo_rozbicia_platnosci: [...paymentSplits(item), result.data as CfoPaymentSplit],
    } : item));
  }

  async function changePaymentSplit(transaction: CfoBankTransaction, split: CfoPaymentSplit, payload: Partial<CfoPaymentSplit>) {
    const result = await updatePaymentSplit(split.id, payload);
    if (result.error) return alert("Nie udało się zapisać linii rozbicia.");
    setTransactions((current) => current.map((item) => item.id === transaction.id ? {
      ...item,
      cfo_rozbicia_platnosci: paymentSplits(item).map((row) => row.id === split.id ? { ...row, ...payload, ...(result.data as CfoPaymentSplit) } : row),
    } : item));
  }

  async function removePaymentSplit(transaction: CfoBankTransaction, split: CfoPaymentSplit) {
    const result = await deletePaymentSplit(split.id);
    if (result.error) return alert("Nie udało się usunąć linii rozbicia.");
    setTransactions((current) => current.map((item) => item.id === transaction.id ? {
      ...item,
      cfo_rozbicia_platnosci: paymentSplits(item).filter((row) => row.id !== split.id),
    } : item));
  }

  return (
    <section style={sectionStackStyle}>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <Banknote size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Import historii rachunku</h2>
        </div>
        <label style={uploadBoxStyle}>
          <Upload size={22} />
          <strong>Wczytaj CSV z Erste Bank</strong>
          <span>Obsługiwane są pliki z przecinkiem jako separatorem. Przelewy własne będą domyślnie oznaczane jako wewnętrzne. Wpływy możesz przypisać do faktur, a wypływy do kosztów.</span>
          <input type="file" accept=".csv,.txt" hidden disabled={saving} onChange={(event) => event.target.files?.[0] && importBankFile(event.target.files[0])} />
        </label>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <ReceiptText size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Transakcje bankowe</h2>
        </div>
        <SearchField value={search} onChange={setSearch} placeholder="Szukaj transakcji po dacie, kontrahencie, tytule, powiązaniu albo kwocie..." />
        <div style={tableWrapperStyle}>
          <table style={cashflowTableStyle}>
            <colgroup>
              <col style={{ width: "7%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "29%" }} />
              <col style={{ width: "11%" }} />
            </colgroup>
            <thead><tr><Th>Data</Th><Th>Kontrahent</Th><Th>Tytuł</Th><Th>Typ</Th><Th>Uwzgl.</Th><Th>Powiązanie</Th><Th align="right">Kwota</Th></tr></thead>
            <tbody>
              {visibleTransactions.length === 0 ? <EmptyRow colSpan={7} text={transactions.length === 0 ? "Brak transakcji w tym okresie." : "Brak transakcji pasujących do wyszukiwania."} /> : visibleTransactions.map((transaction) => {
                const linkMode = transaction.typ === "faktura_sprzedazowa" || (transaction.typ !== "koszt" && transaction.kwota > 0) ? "invoice" : "cost";
                const splits = paymentSplits(transaction);
                const isSplitMode = linkMode === "cost" && transaction.rozbita;
                return (
                  <Fragment key={transaction.id}>
                    <tr style={bankTransactionRowStyle(transaction)}>
                      <Td>{formatDate(transaction.data_ksiegowania)}</Td>
                      <Td>{transaction.kontrahent || "Brak kontrahenta"}</Td>
                      <Td>{transaction.tytul || "Brak tytułu"}</Td>
                      <Td><AppSelect value={bankTypeSelectValue(transaction.typ)} options={BANK_TYPE_OPTIONS} onChange={(value) => void changeTransactionType(transaction, value)} style={compactSelectStyle} /></Td>
                      <Td align="right"><input type="checkbox" checked={!transaction.ignoruj} onChange={(event) => void changeTransaction(transaction, { ignoruj: !event.target.checked })} /></Td>
                      <Td style={cashflowLinkTdStyle}>
                        <div style={cashflowLinkCellStyle}>
                          {linkMode === "cost" ? (
                            <>
                              <label style={inlineCheckboxStyle}>
                                <input type="checkbox" checked={transaction.rozbita} onChange={(event) => void toggleSplitPayment(transaction, event.target.checked)} />
                                Rozbij płatność
                              </label>
                              {!isSplitMode ? (
                                <AppSelect
                                  value={transaction.koszt_id || ""}
                                  options={costOptions}
                                  onChange={(value) => void assignCost(transaction, value)}
                                  searchable
                                  searchPlaceholder="Szukaj kosztu..."
                                  style={costLinkSelectStyle}
                                  menuStyle={costLinkMenuStyle}
                                />
                              ) : <span style={smallStyle}>Rozliczenie w liniach poniżej</span>}
                            </>
                          ) : (
                            <AppSelect
                              value={transaction.faktura_id || ""}
                              options={invoiceOptions}
                              onChange={(value) => void assignInvoice(transaction, value)}
                              searchable
                              searchPlaceholder="Szukaj faktury..."
                              style={costLinkSelectStyle}
                              menuStyle={costLinkMenuStyle}
                            />
                          )}
                        </div>
                      </Td>
                      <Td align="right" style={cashflowAmountCellStyle}>{formatMoney(transaction.kwota)}</Td>
                    </tr>
                    {isSplitMode ? (
                      <tr style={bankTransactionRowStyle(transaction)}>
                        <Td colSpan={7}>
                          <div style={paymentSplitBoxStyle}>
                            <div style={paymentSplitHeaderStyle}>
                              <strong>Rozbicie płatności</strong>
                              <button type="button" style={smallActionButtonStyle} onClick={() => void addPaymentSplit(transaction)}>+ Dodaj linię</button>
                            </div>
                            {splits.length === 0 ? <span style={smallStyle}>Dodaj linię, aby przypisać część płatności do kosztu CFO albo oznaczyć ją jako poza kosztem CFO.</span> : null}
                            {splits.map((split) => (
                              <div key={split.id} style={paymentSplitLineStyle}>
                                <MoneyTextInput
                                  value={Number(split.kwota || 0)}
                                  onValueChange={(value) => setTransactions((current) => current.map((item) => item.id === transaction.id ? {
                                    ...item,
                                    cfo_rozbicia_platnosci: paymentSplits(item).map((row) => row.id === split.id ? { ...row, kwota: value } : row),
                                  } : item))}
                                  onCommit={(value) => void changePaymentSplit(transaction, split, { kwota: Math.max(0, value) })}
                                  style={splitAmountInputStyle}
                                />
                                <span style={currencySuffixStyle}>zł</span>
                                <AppSelect
                                  value={split.poza_kosztem_cfo ? "__outside" : split.koszt_id || ""}
                                  options={splitCostOptions}
                                  onChange={(value) => void changePaymentSplit(transaction, split, {
                                    koszt_id: value && value !== "__outside" ? value : null,
                                    poza_kosztem_cfo: value === "__outside",
                                    opis: value === "__outside" ? "Poza kosztem CFO" : null,
                                  })}
                                  searchable
                                  searchPlaceholder="Szukaj kosztu..."
                                  style={splitCostSelectStyle}
                                  menuStyle={costLinkMenuStyle}
                                />
                                <button type="button" style={smallGhostButtonStyle} onClick={() => void removePaymentSplit(transaction, split)}>Usuń</button>
                              </div>
                            ))}
                          </div>
                        </Td>
                      </tr>
                    ) : null}
                  </Fragment>
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
          <h2 style={panelTitleStyle}>Koszty zespołu</h2>
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
          <span style={smallStyle}>Norma dzienna: 8 h. Nieobecności wpisuj w dniach, każdy dzień zmniejsza dostępność o 8 h.</span>
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

function renderClientsSection(clients: CfoClientProfitabilityRow[]) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <BriefcaseBusiness size={21} style={panelIconStyle} />
        <h2 style={panelTitleStyle}>Rentowność klientów</h2>
      </div>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Klient</Th><Th align="right">Przychód</Th><Th align="right">MRR</Th><Th align="right">Godziny</Th><Th align="right">Koszt pracy</Th><Th align="right">Wynik</Th><Th align="right">Marża</Th><Th>Status</Th></tr></thead>
          <tbody>
            {clients.length === 0 ? <EmptyRow colSpan={8} text="Brak klientów z przychodami w tym okresie." /> : clients.map((client) => (
              <tr key={client.key}>
                <Td>{client.name}</Td>
                <Td align="right"><strong>{formatMoney(client.revenue)}</strong></Td>
                <Td align="right">{formatMoney(client.mrr)}</Td>
                <Td align="right">{formatHours(client.hours)}</Td>
                <Td align="right">{formatMoney(client.laborCost)}</Td>
                <Td align="right"><strong>{formatMoney(client.result)}</strong></Td>
                <Td align="right"><strong>{formatPercent(client.margin)}</strong></Td>
                <Td><span style={clientStatusStyle(client.statusTone)}>{client.status}</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
type CfoClientProfitabilityRow = CfoClientRow & {
  hours: number;
  laborCost: number;
  result: number;
  margin: number | null;
  status: string;
  statusTone: "good" | "watch" | "warn" | "bad" | "missing";
};

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
  if (settlementPeriod) return monthToDate(shiftMonth(settlementPeriod, 1));
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

function buildClientProfitability(period: string, clients: CfoClientRow[], employees: CfoEmployeeCost[], timeEntries: CfoClientTimeEntry[]): CfoClientProfitabilityRow[] {
  const hourlyCostByPerson = new Map<string, number>();
  employees.forEach((employee) => {
    if (!employee.osoba_id || !employee.w_capacity) return;
    const hours = availableHours(employee, period);
    const directCost = Number(employee.podstawa || 0) + Number(employee.zus_pracodawcy || 0) + Number(employee.benefity || 0);
    hourlyCostByPerson.set(employee.osoba_id, hours > 0 ? directCost / hours : 0);
  });

  const clientHours = new Map<string, number>();
  const clientLaborCost = new Map<string, number>();
  timeEntries.forEach((entry) => {
    if (!entry.klient_id) return;
    const hours = Number(entry.duration_seconds || 0) / 3600;
    const hourlyCost = hourlyCostByPerson.get(entry.osoba_id) || 0;
    clientHours.set(entry.klient_id, (clientHours.get(entry.klient_id) || 0) + hours);
    clientLaborCost.set(entry.klient_id, (clientLaborCost.get(entry.klient_id) || 0) + hours * hourlyCost);
  });

  return clients.map((client) => {
    const hours = client.id ? clientHours.get(client.id) || 0 : 0;
    const laborCost = client.id ? clientLaborCost.get(client.id) || 0 : 0;
    const result = client.revenue - laborCost;
    const margin = client.revenue > 0 ? result / client.revenue : null;
    const status = clientProfitabilityStatus(margin, hours);
    return { ...client, hours, laborCost, result, margin, ...status };
  });
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

function buildCostPaymentMap(transactions: CfoBankTransaction[]) {
  const byCost = new Map<string, number>();
  transactions.forEach((transaction) => {
    if (transaction.ignoruj || transaction.typ !== "koszt") return;
    const splits = paymentSplits(transaction);
    if (splits.length > 0 || transaction.rozbita) {
      splits.forEach((split) => {
        if (!split.koszt_id || split.poza_kosztem_cfo) return;
        const paid = Number(split.kwota || 0);
        byCost.set(split.koszt_id, (byCost.get(split.koszt_id) || 0) + paid);
      });
      return;
    }
    if (!transaction.koszt_id) return;
    byCost.set(transaction.koszt_id, (byCost.get(transaction.koszt_id) || 0) + Math.abs(Number(transaction.kwota || 0)));
  });
  return byCost;
}

function buildInvoicePaymentMap(transactions: CfoBankTransaction[]) {
  const byInvoice = new Map<string, number>();
  transactions.forEach((transaction) => {
    if (!transaction.faktura_id || transaction.ignoruj || transaction.typ !== "faktura_sprzedazowa") return;
    const paid = Math.abs(Number(transaction.kwota || 0));
    byInvoice.set(transaction.faktura_id, (byInvoice.get(transaction.faktura_id) || 0) + paid);
  });
  return byInvoice;
}

function costPaymentState(cost: CfoCostItem, paid: number): "none" | "partial" | "settled" | "overpaid" {
  const gross = costGrossValue(cost);
  if (gross <= 0 || paid <= 0) return "none";
  const remaining = gross - paid;
  if (Math.abs(remaining) <= 0.01) return "settled";
  return remaining < 0 ? "overpaid" : "partial";
}

function isInvoiceSettled(invoice: CfoCashflowInvoice, paid: number) {
  const gross = Number(invoice.kwota_brutto || 0);
  return gross > 0 && Math.abs(gross - paid) <= 0.01;
}

function invoicePaidValue(invoice: CfoCashflowInvoice, excludeTransactionIds = new Set<string>()) {
  const rows = invoice.cfo_transakcje_bankowe || [];
  const transactions = Array.isArray(rows) ? rows : [rows].filter(Boolean);
  return transactions.reduce((sum, transaction) => {
    if (!transaction || excludeTransactionIds.has(transaction.id) || transaction.ignoruj || transaction.typ !== "faktura_sprzedazowa") return sum;
    return sum + Math.abs(Number(transaction.kwota || 0));
  }, 0);
}

function paymentSplits(transaction: CfoBankTransaction) {
  const rows = transaction.cfo_rozbicia_platnosci || [];
  return Array.isArray(rows) ? rows : [rows].filter(Boolean);
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

function filterBankTransactions(transactions: CfoBankTransaction[], search: string, costs: CfoCostItem[], invoices: CfoCashflowInvoice[]) {
  const query = normalizeSearchValue(search);
  if (!query) return transactions;
  const costLabels = new Map(costs.map((cost) => [cost.id, costOptionLabel(cost)]));
  const invoiceLabels = new Map(invoices.map((invoice) => [invoice.id, invoiceOptionLabel(invoice, "")]));

  return transactions.filter((transaction) => {
    const splitLabels = paymentSplits(transaction).map((split) => split.poza_kosztem_cfo ? "Poza kosztem CFO" : split.koszt_id ? costLabels.get(split.koszt_id) : "").join(" ");
    return normalizeSearchValue([
      formatDate(transaction.data_ksiegowania),
      transaction.kontrahent,
      transaction.tytul,
      bankTypeLabel(transaction.typ),
      transaction.koszt_id ? costLabels.get(transaction.koszt_id) : null,
      transaction.faktura_id ? invoiceLabels.get(transaction.faktura_id) : null,
      splitLabels,
      formatMoney(transaction.kwota),
    ].filter(Boolean).join(" ")).includes(query);
  });
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

function bankTypeSelectValue(type: CfoBankTransactionType) {
  return type === "ignoruj" ? "do_przypisania" : type;
}

function bankTypeLabel(type: CfoBankTransactionType) {
  return BANK_TYPE_OPTIONS.find((option) => option.value === bankTypeSelectValue(type))?.label || type;
}

function bankTransactionRowStyle(transaction: CfoBankTransaction): CSSProperties | undefined {
  if (transaction.ignoruj) return mutedRowStyle;
  if (transaction.typ === "do_przypisania") return unassignedRowStyle;
  return undefined;
}

function costGrossValue(cost: CfoCostItem) {
  const gross = Number(cost.kwota_brutto || 0);
  if (gross > 0) return gross;
  return Number(cost.kwota_netto_cfo || 0);
}

function costOptionLabel(cost: CfoCostItem) {
  const number = cost.numer_dokumentu || "Bez numeru";
  const contractor = cost.kontrahent || "Bez kontrahenta";
  return `${number} · ${contractor} · brutto: ${formatMoney(costGrossValue(cost))}`;
}

function invoiceOptionLabel(invoice: CfoCashflowInvoice, selectedPeriod: string) {
  const issuePeriod = invoice.data_wystawienia?.slice(0, 7) || "";
  const scope = issuePeriod === selectedPeriod.slice(0, 7)
    ? formatMonthField(selectedPeriod)
    : `Inne okresy · ${issuePeriod ? formatMonthField(issuePeriod) : "bez daty"}`;
  const number = invoice.numer || "Faktura bez numeru";
  const contractor = invoice.kontrahent_nazwa || "Bez kontrahenta";
  return `${scope} · ${number} · ${contractor} · ${formatMoney(invoice.kwota_brutto)}`;
}

function clientProfitabilityStatus(margin: number | null, hours: number) {
  if (hours <= 0) return { status: "Brakuje czasu pracy", statusTone: "missing" as const };
  if (margin === null) return { status: "Brak przychodu", statusTone: "missing" as const };
  if (margin >= 0.4) return { status: "Chronić", statusTone: "good" as const };
  if (margin >= 0.25) return { status: "Obserwować", statusTone: "watch" as const };
  if (margin >= 0.15) return { status: "Podwyżka", statusTone: "warn" as const };
  return { status: "Konieczna podwyżka / rozważyć zakończenie", statusTone: "bad" as const };
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

function buildCostImportRows(rows: Record<string, unknown>[], fileName: string, period: string): CfoCostImportRow[] {
  return rows.map((row, index) => {
    const documentNumber = stringValue(row["Nr dokumentu"] ?? row["Numer dokumentu"]);
    const contractor = stringValue(row["Kontrahent"]) || "Brak kontrahenta";
    const description = stringValue(row["Opis"]);
    const net = numberValue(row["Kwota netto"]);
    const vat = numberValue(row["Kwota VAT"]);
    const gross = numberValue(row["Razem"] ?? row["Kwota brutto"]);
    const category = classifyCost(contractor, description);
    return {
      import_key: `cost:${fileName}:${documentNumber || index}:${contractor}:${net}`,
      data_dokumentu: dateValue(row["Data wystawienia"]),
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

async function parseBankCsv(file: File): Promise<CfoBankImportRow[]> {
  const rows = parseCsv(await file.text()).filter((row) => row.length >= 8);
  const summary = rows[0];
  const accountNumber = normalizeAccount(String(summary?.[2] || "").replace(/^'/, ""));
  const accountName = String(summary?.[3] || "");
  const currency = String(summary?.[4] || "PLN") || "PLN";
  return rows.slice(1).map((row) => {
    const title = String(row[2] || "");
    const contractor = String(row[3] || "");
    const amount = numberValue(row[5]);
    const type = classifyBankTransaction(title, contractor);
    return {
      account: { numer_rachunku: accountNumber, nazwa: accountName, waluta: currency },
      transaction: {
        import_key: `bank:${accountNumber}:${row[0]}:${row[1]}:${row[7]}:${amount}:${title}`,
        data_ksiegowania: parsePolishDate(row[0]),
        data_operacji: parsePolishDate(row[1]),
        tytul: title,
        kontrahent: contractor || null,
        rachunek_kontrahenta: normalizeAccount(row[4]),
        kwota: amount,
        saldo_po: numberValue(row[6]),
        lp: row[7] ? Number(row[7]) : null,
        typ: type,
        ignoruj: type === "transfer_wewnetrzny",
      },
    };
  });
}

function parseCsv(text: string) {
  return parseDelimited(text, ",");
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

function classifyBankTransaction(title: string, contractor: string): CfoBankTransactionType {
  const value = `${title} ${contractor}`.toLowerCase();
  if (value.includes("przelew własny") || value.includes("przelew wlasny")) return "transfer_wewnetrzny";
  if (value.includes("/vat/")) return "vat";
  if (value.includes("wynagrodzenie")) return "wynagrodzenie_netto";
  if (value.includes("zus")) return "zus";
  if (value.includes("pit")) return "pit";
  if (value.includes("cit")) return "cit";
  return "do_przypisania";
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

function cfoCashflowCostLinkRange(period: string) {
  const fromMonth = shiftMonth(period, -12);
  const toMonth = shiftMonth(period, 12);
  return { from: monthToDate(fromMonth), to: monthEndDate(toMonth) };
}

function mergeCostLists(primary: CfoCostItem[], secondary: CfoCostItem[]) {
  const byId = new Map<string, CfoCostItem>();
  secondary.forEach((cost) => byId.set(cost.id, cost));
  primary.forEach((cost) => byId.set(cost.id, cost));
  return Array.from(byId.values()).sort((first, second) => {
    const firstDate = first.data_dokumentu || first.okres_start || "";
    const secondDate = second.data_dokumentu || second.okres_start || "";
    return secondDate.localeCompare(firstDate);
  });
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

function normalizeAccount(value: unknown) {
  return stringValue(value).replace(/^'/, "").replace(/\s/g, "");
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
const panelStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, padding: "20px", minWidth: 0 };
const widePanelStyle: CSSProperties = { ...panelStyle, gridColumn: "1 / -1" };
const panelHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" };
const panelHeaderWithTotalStyle: CSSProperties = { ...panelHeaderStyle, justifyContent: "space-between", flexWrap: "wrap" };
const panelTitleGroupStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "10px", minWidth: 0 };
const panelHeaderTotalStyle: CSSProperties = { color: colors.navy, fontSize: "15px", whiteSpace: "nowrap" };
const dashboardScopeBadgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontSize: "12px", fontWeight: 900, marginLeft: "auto" };
const panelIconStyle: CSSProperties = { color: colors.red, display: "inline-flex" };
const panelTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "21px" };
const recommendationStyle: CSSProperties = { display: "grid", gap: "6px", background: "#e9eef7", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "16px", color: colors.navy };
const ownerGoalBreakdownStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "7px 14px", marginTop: "8px", maxWidth: "560px" };
const dangerInlineStyle: CSSProperties = { color: colors.danger, fontWeight: 900 };
const successInlineStyle: CSSProperties = { color: colors.success, fontWeight: 900 };
const warningInlineStyle: CSSProperties = { color: colors.warning, fontWeight: 900 };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const wideCostTableStyle: CSSProperties = { ...tableStyle, minWidth: "1380px", tableLayout: "fixed" };
const cashflowTableStyle: CSSProperties = { ...tableStyle, minWidth: "0", tableLayout: "fixed" };
const thStyle: CSSProperties = { color: colors.muted, borderBottom: `1px solid ${colors.border}`, padding: "11px 9px", fontSize: "12px", textTransform: "uppercase", letterSpacing: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const tdStyle: CSSProperties = { color: colors.text, borderBottom: `1px solid ${colors.border}`, padding: "10px 9px", verticalAlign: "middle" };
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
const costLinkSelectStyle: CSSProperties = { ...compactSelectStyle, width: "100%", minWidth: 0, maxWidth: "100%", paddingLeft: "9px", paddingRight: "8px", gap: "6px" };
const costLinkMenuStyle: CSSProperties = { width: "560px", maxWidth: "min(560px, calc(100vw - 32px))" };
const cashflowLinkTdStyle: CSSProperties = { minWidth: 0, overflow: "hidden" };
const cashflowLinkCellStyle: CSSProperties = { display: "grid", gap: "8px", minWidth: 0, maxWidth: "100%", overflow: "hidden" };
const inlineCheckboxStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", color: colors.navy, fontWeight: 850, fontSize: "12px", cursor: "pointer" };
const paymentSplitBoxStyle: CSSProperties = { display: "grid", gap: "10px", margin: "6px 0 10px 84px", padding: "12px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, maxWidth: "940px" };
const paymentSplitHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", color: colors.navy };
const paymentSplitLineStyle: CSSProperties = { display: "grid", gridTemplateColumns: "130px auto minmax(260px, 1fr) auto", gap: "8px", alignItems: "center" };
const splitAmountInputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontWeight: 750, boxSizing: "border-box", width: "130px", minWidth: "130px", fontVariantNumeric: "tabular-nums" };
const currencySuffixStyle: CSSProperties = { color: colors.navy, fontWeight: 850, whiteSpace: "nowrap" };
const splitCostSelectStyle: CSSProperties = { ...compactSelectStyle, width: "100%", minWidth: 0 };
const smallActionButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, fontWeight: 900, padding: "8px 12px", cursor: "pointer" };
const smallGhostButtonStyle: CSSProperties = { ...smallActionButtonStyle, color: colors.red };
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
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontWeight: 750, width: "100%", boxSizing: "border-box" };
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
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.input, background: colors.red, color: colors.white, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" };
const moneyEditStyle: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", color: colors.navy, fontWeight: 850, whiteSpace: "nowrap" };
const moneyInputStyle: CSSProperties = { ...inputStyle, minHeight: "36px", padding: "7px 9px", width: "102px" };
const nowrapMoneyCellStyle: CSSProperties = { whiteSpace: "nowrap" };
const cashflowAmountCellStyle: CSSProperties = { ...nowrapMoneyCellStyle, fontVariantNumeric: "tabular-nums" };
const mutedRowStyle: CSSProperties = { opacity: 0.58, background: "#f1f5f9" };
const unassignedRowStyle: CSSProperties = { background: "#fffbeb" };
const formFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "14px", flexWrap: "wrap" };
const miniListStyle: CSSProperties = { display: "grid", gap: "8px" };
const miniItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "10px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", color: colors.text, alignItems: "center" };
const teamCapacityItemStyle: CSSProperties = { ...miniItemStyle, gridTemplateColumns: "minmax(220px, 1.4fr) repeat(5, minmax(120px, auto))", alignItems: "center" };
const infoNoticeStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: "#e9eef7", color: colors.navy, padding: "12px", fontWeight: 800 };
const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontSize: "12px", fontWeight: 900 };
const costBreakdownGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "12px" };
const costBreakdownItemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", display: "grid", gap: "11px", minWidth: 0 };
const costBreakdownHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "14px", color: colors.navy, alignItems: "start" };
const costBreakdownAmountStyle: CSSProperties = { whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" };
const costSubListStyle: CSSProperties = { display: "grid", gap: "7px" };
const costSubItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "14px", color: colors.text, fontSize: "13px", borderTop: `1px solid ${colors.border}`, paddingTop: "7px", alignItems: "start" };
const costPaymentStatusStyle: CSSProperties = { display: "grid", gap: "3px", color: colors.text, fontSize: "12px", lineHeight: 1.25, minWidth: 0 };

function clientStatusStyle(tone: CfoClientProfitabilityRow["statusTone"]): CSSProperties {
  const palette = {
    good: { background: "#dcfce7", color: colors.success },
    watch: { background: "#e9eef7", color: colors.navy },
    warn: { background: "#fef3c7", color: colors.warning },
    bad: { background: "#fee2e2", color: colors.danger },
    missing: { background: "rgba(23, 59, 115, 0.10)", color: colors.navy },
  }[tone];

  return { ...badgeStyle, ...palette };
}
