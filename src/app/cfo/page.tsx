"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Banknote, BriefcaseBusiness, CalendarDays, FileSpreadsheet, LayoutDashboard, Plus, ReceiptText, RefreshCw, TrendingUp, Upload, Users } from "lucide-react";

import { colors, radius, shadow } from "@/app/design";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import AppSelect from "@/components/AppSelect";
import {
  fetchCfoBankTransactions,
  fetchCfoCosts,
  fetchCfoEmployeeCosts,
  fetchCfoRevenueLines,
  fetchCfoTeamMembers,
  importBankTransactions,
  insertCfoCosts,
  updateBankTransaction,
  updateCfoCost,
  updateInvoiceLineCfoCategory,
  upsertCfoEmployeeCost,
  type CfoBankImportRow,
  type CfoBankTransaction,
  type CfoBankTransactionType,
  type CfoCostCategory,
  type CfoCostImportRow,
  type CfoCostItem,
  type CfoEmployeeCost,
  type CfoInvoiceLine,
  type CfoRevenueCategory,
  type CfoTeamMember,
} from "@/lib/cfoService";

type CfoTab = "dashboard" | "przychody" | "koszty" | "cashflow" | "zespol" | "klienci";

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
  { value: "ignoruj", label: "Ignoruj" },
  { value: "inne", label: "Inne" },
];

const SUBCATEGORIES: Record<CfoCostCategory, string[]> = {
  koszty_zespolu: ["Wynagrodzenie podstawowe", "ZUS pracodawcy", "Benefity", "Premie", "Szkolenia"],
  lokal_infrastruktura: ["Czynsz", "Prąd", "Gaz", "Śmieci", "Woda", "Sprzątanie", "Wyposażenie", "Materiały gospodarcze"],
  systemy_technologia: ["wFirma", "Google Workspace", "MS Office", "OpenAI", "T-Mobile"],
  marketing_sprzedaz: ["Meta ADS", "Google ADS", "Canva", "Koszt zespołu marketingowego", "Koszt zespołu sprzedażowego"],
  administracja_ogolne: ["Artykuły biurowe / spożywcze", "Prawne / podatkowe", "OC", "Bank", "Poczta / kurier", "Reprezentacja", "Inne"],
  zarzad_wlasciciel: ["Wynagrodzenie podstawowe Prezesa", "Premia Prezesa", "Samochód służbowy"],
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revenueLines, setRevenueLines] = useState<CfoInvoiceLine[]>([]);
  const [costs, setCosts] = useState<CfoCostItem[]>([]);
  const [employeeCosts, setEmployeeCosts] = useState<CfoEmployeeCost[]>([]);
  const [bankTransactions, setBankTransactions] = useState<CfoBankTransaction[]>([]);
  const [teamMembers, setTeamMembers] = useState<CfoTeamMember[]>([]);
  const [selectedTeamMemberId, setSelectedTeamMemberId] = useState("");
  const [manualCost, setManualCost] = useState(() => emptyManualCost(period));
  const [employeeDraft, setEmployeeDraft] = useState<Omit<CfoEmployeeCost, "id">>({ ...EMPTY_EMPLOYEE, okres: monthToDate(period) });

  useEffect(() => {
    void loadData();
    // Dane CFO przeładowują się po zmianie okresu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const view = useMemo(
    () => buildCfoView(period, revenueLines, costs, employeeCosts, bankTransactions),
    [period, revenueLines, costs, employeeCosts, bankTransactions],
  );

  async function loadData() {
    setLoading(true);
    const [revenueResult, costsResult, employeeResult, bankResult, teamResult] = await Promise.all([
      fetchCfoRevenueLines(monthToDate(period)),
      fetchCfoCosts(monthToDate(period)),
      fetchCfoEmployeeCosts(monthToDate(period)),
      fetchCfoBankTransactions(monthToDate(period)),
      fetchCfoTeamMembers(),
    ]);

    if (revenueResult.error) console.error("Błąd pobierania przychodów CFO:", revenueResult.error);
    if (costsResult.error) console.error("Błąd pobierania kosztów CFO:", costsResult.error);
    if (employeeResult.error) console.error("Błąd pobierania kosztów pracowników CFO:", employeeResult.error);
    if (bankResult.error) console.error("Błąd pobierania transakcji bankowych CFO:", bankResult.error);
    if (teamResult.error) console.error("Błąd pobierania zespołu CFO:", teamResult.error);

    setRevenueLines((revenueResult.data || []) as unknown as CfoInvoiceLine[]);
    setCosts((costsResult.data || []) as CfoCostItem[]);
    setEmployeeCosts((employeeResult.data || []) as CfoEmployeeCost[]);
    setBankTransactions((bankResult.data || []) as CfoBankTransaction[]);
    setTeamMembers((teamResult.data || []) as CfoTeamMember[]);
    setManualCost(emptyManualCost(period));
    setEmployeeDraft({ ...EMPTY_EMPLOYEE, okres: monthToDate(period) });
    setSelectedTeamMemberId("");
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
        return alert("Nie udało się zaimportować kosztów.");
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
        return alert("Nie udało się zaimportować historii rachunku.");
      }
      await loadData();
      alert(`Zaimportowano transakcje: ${result.data?.length || 0}.`);
    } finally {
      setSaving(false);
    }
  }

  async function addManualCost() {
    if (!manualCost.kontrahent.trim()) return alert("Podaj kontrahenta.");
    setSaving(true);
    const result = await insertCfoCosts([{ ...manualCost, import_key: `manual:${crypto.randomUUID()}`, zrodlo: "recznie" }]);
    setSaving(false);
    if (result.error) return alert("Nie udało się dodać kosztu.");
    await loadData();
  }

  async function saveEmployeeCost() {
    if (!employeeDraft.osoba_nazwa.trim()) return alert("Wybierz osobę z zespołu.");
    setSaving(true);
    const result = await upsertCfoEmployeeCost(employeeDraft);
    setSaving(false);
    if (result.error) return alert("Nie udało się zapisać kosztu pracownika.");
    await loadData();
  }

  function selectTeamMember(memberId: string) {
    const member = teamMembers.find((item) => item.id === memberId);
    setSelectedTeamMemberId(memberId);
    setEmployeeDraft((current) => ({
      ...current,
      osoba_id: member?.id || null,
      osoba_nazwa: member ? teamMemberName(member) : "",
    }));
  }

  return (
    <main style={contentStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Moduł zarządczy</p>
          <h1 style={titleStyle}>CFO</h1>
        </div>
        <div style={headerActionsStyle}>
          <label style={monthFieldStyle}>
            <CalendarDays size={17} />
            <input style={monthInputStyle} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          </label>
          <button type="button" style={secondaryButtonStyle} onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={17} />
            Odśwież
          </button>
        </div>
      </header>

      <section style={metricGridStyle}>
        <Metric label="Przychody" value={formatMoney(view.revenue)} />
        <Metric label="MRR" value={formatMoney(view.mrr)} />
        <Metric label="Koszty zarządcze" value={formatMoney(view.managementCosts)} />
        <Metric label="Wynik operacyjny" value={formatMoney(view.operatingResult)} tone={view.operatingResult >= 0 ? "good" : "bad"} />
        <Metric label="Cash flow" value={formatMoney(view.cashFlow)} tone={view.cashFlow >= 0 ? "good" : "bad"} />
        <Metric label="Cel właściciela" value={view.ownerGoalText} tone={view.ownerGoalGap <= 0 ? "good" : "warn"} />
      </section>

      <nav style={tabsStyle} aria-label="Sekcje CFO">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" style={activeTab === tab.id ? activeTabStyle : tabStyle} onClick={() => setActiveTab(tab.id)}>
              <Icon size={17} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {loading ? <section style={panelStyle}>Ładowanie danych CFO...</section> : null}
      {!loading && activeTab === "dashboard" ? renderDashboard(view) : null}
      {!loading && activeTab === "przychody" ? renderRevenueSection(revenueLines, changeRevenueCategory) : null}
      {!loading && activeTab === "koszty" ? renderCostSection(costs, manualCost, setManualCost, addManualCost, importCostsFile, saving) : null}
      {!loading && activeTab === "cashflow" ? renderCashflowSection(bankTransactions, importBankFile, saving, setBankTransactions) : null}
      {!loading && activeTab === "zespol" ? renderTeamSection(teamMembers, employeeCosts, selectedTeamMemberId, selectTeamMember, employeeDraft, setEmployeeDraft, saveEmployeeCost, saving, period) : null}
      {!loading && activeTab === "klienci" ? renderClientsSection(view.clients) : null}
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

function renderDashboard(view: CfoView) {
  return (
    <section style={sectionGridStyle}>
      <article style={widePanelStyle}>
        <div style={panelHeaderStyle}>
          <TrendingUp size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Dashboard właścicielski</h2>
        </div>
        <div style={recommendationStyle}>
          <strong>{view.ownerGoalGap <= 0 ? "Cel właściciela jest pokryty" : "Brakująca marża do bezpiecznej wypłaty"}</strong>
          <span>
            {view.ownerGoalGap <= 0
              ? "Aktualny wynik operacyjny pokrywa miesięczny cel właściciela."
              : `Brakuje ${formatMoney(view.ownerGoalGap)} miesięcznej marży. Przy marży 40% oznacza to około ${formatMoney(view.ownerGoalGap / 0.4)} dodatkowego MRR albo równoważną poprawę kosztów.`}
          </span>
        </div>
        <div style={quickGridStyle}>
          <MiniStat label="Pozycje faktur" value={String(view.invoiceLineCount)} helper={`${view.uncategorizedRevenue} bez kategorii CFO`} />
          <MiniStat label="Koszty" value={String(view.costCount)} helper={`${formatMoney(view.managementCosts)} w tym okresie`} />
          <MiniStat label="Transakcje bankowe" value={String(view.bankTransactionCount)} helper={`${view.unassignedBankCount} do przypisania`} />
          <MiniStat label="Godziny zespołu" value={`${view.availableHours.toLocaleString("pl-PL")} h`} helper="na podstawie dni roboczych i etatów" />
        </div>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <ReceiptText size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Struktura przychodów</h2>
        </div>
        <Breakdown rows={view.revenueBreakdown} />
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <FileSpreadsheet size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Struktura kosztów</h2>
        </div>
        <Breakdown rows={view.costBreakdown} />
      </article>
    </section>
  );
}

function renderRevenueSection(lines: CfoInvoiceLine[], onChange: (line: CfoInvoiceLine, category: CfoRevenueCategory) => void) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <TrendingUp size={21} style={panelIconStyle} />
        <h2 style={panelTitleStyle}>Przychody z faktur</h2>
      </div>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Klient</Th><Th>Pozycja</Th><Th>Kategoria CFO</Th><Th align="right">Netto</Th></tr></thead>
          <tbody>
            {lines.length === 0 ? <EmptyRow colSpan={4} text="Brak pozycji faktur dla okresu." /> : lines.map((line) => (
              <tr key={line.id}>
                <Td>{invoiceClientName(line)}</Td>
                <Td>{line.nazwa}</Td>
                <Td>
                  <AppSelect value={line.cfo_przychod_kategoria || "pozostale"} options={REVENUE_OPTIONS} onChange={(value) => onChange(line, value as CfoRevenueCategory)} style={compactSelectStyle} />
                </Td>
                <Td align="right">{formatMoney(line.kwota_netto)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function renderCostSection(
  costs: CfoCostItem[],
  manualCost: CfoCostImportRow,
  setManualCost: (next: CfoCostImportRow | ((current: CfoCostImportRow) => CfoCostImportRow)) => void,
  addManualCost: () => void,
  importCostsFile: (file: File) => void,
  saving: boolean,
) {
  const subcategoryOptions = SUBCATEGORIES[manualCost.kategoria].map((item) => ({ value: item, label: item }));
  return (
    <section style={sectionStackStyle}>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <Upload size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Import i ręczne koszty</h2>
        </div>
        <label style={uploadBoxStyle}>
          <FileSpreadsheet size={22} />
          <strong>Wczytaj CSV kosztów</strong>
          <span>Numer dokumentu, kontrahent, netto, VAT, brutto i opis. Kwotę netto CFO możesz później poprawić.</span>
          <input type="file" accept=".csv,.txt" hidden onChange={(event) => event.target.files?.[0] && importCostsFile(event.target.files[0])} />
        </label>
        <div style={manualGridStyle}>
          <input style={inputStyle} placeholder="Kontrahent" value={manualCost.kontrahent} onChange={(event) => setManualCost((current) => ({ ...current, kontrahent: event.target.value }))} />
          <input style={inputStyle} placeholder="Numer dokumentu" value={manualCost.numer_dokumentu || ""} onChange={(event) => setManualCost((current) => ({ ...current, numer_dokumentu: emptyToNull(event.target.value) }))} />
          <input style={inputStyle} placeholder="Netto CFO" type="number" value={manualCost.kwota_netto_cfo} onChange={(event) => setManualCost((current) => ({ ...current, kwota_netto_cfo: Number(event.target.value || 0), kwota_netto_import: Number(event.target.value || 0) }))} />
          <AppSelect value={manualCost.kategoria} options={COST_OPTIONS} onChange={(value) => setManualCost((current) => ({ ...current, kategoria: value as CfoCostCategory, podkategoria: null }))} />
          <AppSelect value={manualCost.podkategoria || ""} options={[{ value: "", label: "Bez podkategorii" }, ...subcategoryOptions]} onChange={(value) => setManualCost((current) => ({ ...current, podkategoria: emptyToNull(value) }))} />
          <input style={inputStyle} type="date" value={manualCost.okres_start} onChange={(event) => setManualCost((current) => ({ ...current, okres_start: event.target.value }))} />
          <input style={inputStyle} type="date" value={manualCost.okres_end} onChange={(event) => setManualCost((current) => ({ ...current, okres_end: event.target.value }))} />
          <button type="button" style={primaryButtonStyle} onClick={addManualCost} disabled={saving}><Plus size={17} />Dodaj</button>
        </div>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <ReceiptText size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Koszty CFO</h2>
        </div>
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead><tr><Th>Dokument</Th><Th>Kontrahent</Th><Th>Kategoria</Th><Th>Podkategoria</Th><Th>Okres</Th><Th align="right">Netto CFO</Th><Th align="right">Brutto CF</Th></tr></thead>
            <tbody>
              {costs.length === 0 ? <EmptyRow colSpan={7} text="Brak kosztów w tym okresie." /> : costs.map((cost) => (
                <tr key={cost.id} style={cost.ignoruj ? mutedRowStyle : undefined}>
                  <Td>{cost.numer_dokumentu || "Brak numeru"}<small style={smallStyle}>{formatDate(cost.data_dokumentu)}</small></Td>
                  <Td>{cost.kontrahent}</Td>
                  <Td><AppSelect value={cost.kategoria} options={COST_OPTIONS} onChange={(value) => void updateCost(cost.id, { kategoria: value as CfoCostCategory })} style={compactSelectStyle} /></Td>
                  <Td>{cost.podkategoria || "Bez podkategorii"}</Td>
                  <Td>{formatDate(cost.okres_start)} - {formatDate(cost.okres_end)}</Td>
                  <Td align="right"><input style={moneyInputStyle} type="number" defaultValue={cost.kwota_netto_cfo} onBlur={(event) => void updateCost(cost.id, { kwota_netto_cfo: Number(event.target.value || 0) })} /></Td>
                  <Td align="right">{formatMoney(cost.kwota_brutto)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function renderCashflowSection(
  transactions: CfoBankTransaction[],
  importBankFile: (file: File) => void,
  saving: boolean,
  setTransactions: (next: CfoBankTransaction[] | ((current: CfoBankTransaction[]) => CfoBankTransaction[])) => void,
) {
  async function changeTransaction(transaction: CfoBankTransaction, payload: Partial<CfoBankTransaction>) {
    const result = await updateBankTransaction(transaction.id, payload);
    if (result.error) return alert("Nie udało się zapisać transakcji bankowej.");
    setTransactions((current) => current.map((item) => item.id === transaction.id ? ((result.data || { ...item, ...payload }) as unknown as CfoBankTransaction) : item));
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
          <span>Obsługiwane są pliki z przecinkiem jako separatorem. Przelewy własne będą domyślnie oznaczane jako wewnętrzne.</span>
          <input type="file" accept=".csv,.txt" hidden disabled={saving} onChange={(event) => event.target.files?.[0] && importBankFile(event.target.files[0])} />
        </label>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <ReceiptText size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Transakcje bankowe</h2>
        </div>
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead><tr><Th>Data</Th><Th>Kontrahent</Th><Th>Tytuł</Th><Th>Typ</Th><Th align="right">Kwota</Th><Th>Uwzględniać</Th></tr></thead>
            <tbody>
              {transactions.length === 0 ? <EmptyRow colSpan={6} text="Brak transakcji w tym okresie." /> : transactions.map((transaction) => (
                <tr key={transaction.id} style={transaction.ignoruj ? mutedRowStyle : undefined}>
                  <Td>{formatDate(transaction.data_ksiegowania)}</Td>
                  <Td>{transaction.kontrahent || "Brak kontrahenta"}</Td>
                  <Td>{transaction.tytul || "Brak tytułu"}</Td>
                  <Td><AppSelect value={transaction.typ} options={BANK_TYPE_OPTIONS} onChange={(value) => void changeTransaction(transaction, { typ: value as CfoBankTransactionType, ignoruj: value === "ignoruj" || value === "transfer_wewnetrzny" })} style={compactSelectStyle} /></Td>
                  <Td align="right">{formatMoney(transaction.kwota)}</Td>
                  <Td><input type="checkbox" checked={!transaction.ignoruj} onChange={(event) => void changeTransaction(transaction, { ignoruj: !event.target.checked })} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function renderTeamSection(
  teamMembers: CfoTeamMember[],
  employeeCosts: CfoEmployeeCost[],
  selectedTeamMemberId: string,
  selectTeamMember: (memberId: string) => void,
  employeeDraft: Omit<CfoEmployeeCost, "id">,
  setEmployeeDraft: (next: Omit<CfoEmployeeCost, "id"> | ((current: Omit<CfoEmployeeCost, "id">) => Omit<CfoEmployeeCost, "id">)) => void,
  saveEmployeeCost: () => void,
  saving: boolean,
  period: string,
) {
  const memberOptions = teamMembers.map((member) => ({ value: member.id, label: `${teamMemberName(member)} · ${roleLabel(member.role)}` }));
  return (
    <section style={sectionGridStyle}>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <Users size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Koszty zespołu</h2>
        </div>
        <div style={employeeFormStyle}>
          <AppSelect value={selectedTeamMemberId} options={[{ value: "", label: "Wybierz osobę" }, ...memberOptions]} onChange={selectTeamMember} />
          <AppSelect value={employeeDraft.zespol} options={[{ value: "ksiegowy", label: "Zespół księgowy" }, { value: "marketingowy", label: "Zespół marketingowy" }, { value: "sprzedazowy", label: "Zespół sprzedażowy" }]} onChange={(value) => setEmployeeDraft((current) => ({ ...current, zespol: value as CfoEmployeeCost["zespol"] }))} />
          <NumberInput label="Wymiar etatu" value={employeeDraft.wymiar_etatu} onChange={(value) => setEmployeeDraft((current) => ({ ...current, wymiar_etatu: value }))} />
          <NumberInput label="Podstawa" value={employeeDraft.podstawa} onChange={(value) => setEmployeeDraft((current) => ({ ...current, podstawa: value }))} />
          <NumberInput label="ZUS pracodawcy" value={employeeDraft.zus_pracodawcy} onChange={(value) => setEmployeeDraft((current) => ({ ...current, zus_pracodawcy: value }))} />
          <NumberInput label="Benefity" value={employeeDraft.benefity} onChange={(value) => setEmployeeDraft((current) => ({ ...current, benefity: value }))} />
          <NumberInput label="Premie" value={employeeDraft.premie} onChange={(value) => setEmployeeDraft((current) => ({ ...current, premie: value }))} />
          <NumberInput label="Szkolenia" value={employeeDraft.szkolenia} onChange={(value) => setEmployeeDraft((current) => ({ ...current, szkolenia: value }))} />
          <NumberInput label="Nieobecności godzinowo" value={employeeDraft.nieobecnosci_godziny} onChange={(value) => setEmployeeDraft((current) => ({ ...current, nieobecnosci_godziny: value }))} />
          <NumberInput label="Nadgodziny" value={employeeDraft.nadgodziny} onChange={(value) => setEmployeeDraft((current) => ({ ...current, nadgodziny: value }))} />
        </div>
        <div style={formFooterStyle}>
          <span style={smallStyle}>Norma dzienna: 8 h. Capacity liczone z dni roboczych, wymiaru etatu, nieobecności i nadgodzin.</span>
          <button type="button" style={primaryButtonStyle} onClick={saveEmployeeCost} disabled={saving}><Plus size={17} />Dodaj koszt</button>
        </div>
      </article>
      <article style={panelStyle}>
        <div style={panelHeaderStyle}>
          <CalendarDays size={21} style={panelIconStyle} />
          <h2 style={panelTitleStyle}>Miesięczny capacity</h2>
        </div>
        <div style={miniListStyle}>
          {employeeCosts.length === 0 ? <span style={smallStyle}>Brak kosztów zespołu dla okresu.</span> : employeeCosts.map((employee) => {
            const hours = availableHours(employee, period);
            const hourly = hours > 0 ? (Number(employee.podstawa || 0) + Number(employee.zus_pracodawcy || 0) + Number(employee.benefity || 0)) / hours : 0;
            return (
              <div key={employee.id} style={miniItemStyle}>
                <div><strong>{employee.osoba_nazwa}</strong><small style={smallStyle}>{employee.zespol === "ksiegowy" ? "Zespół księgowy" : employee.zespol === "marketingowy" ? "Marketing" : "Sprzedaż"}</small></div>
                <span>{hours.toLocaleString("pl-PL")} h</span>
                <span>{formatMoney(hourly)} / h</span>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}

function renderClientsSection(clients: CfoClientRow[]) {
  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <BriefcaseBusiness size={21} style={panelIconStyle} />
        <h2 style={panelTitleStyle}>Rentowność klientów</h2>
      </div>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Klient</Th><Th align="right">Przychód</Th><Th align="right">MRR</Th><Th>Status</Th></tr></thead>
          <tbody>
            {clients.length === 0 ? <EmptyRow colSpan={4} text="Brak klientów z przychodami w tym okresie." /> : clients.map((client) => (
              <tr key={client.name}>
                <Td>{client.name}</Td>
                <Td align="right">{formatMoney(client.revenue)}</Td>
                <Td align="right">{formatMoney(client.mrr)}</Td>
                <Td><span style={badgeStyle}>Wymaga kosztu czasu</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input style={inputStyle} type="number" value={value} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </label>
  );
}

function MiniStat({ label, value, helper }: { label: string; value: string; helper: string }) {
  return <div style={miniStatStyle}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>;
}

function Breakdown({ rows }: { rows: { label: string; value: number }[] }) {
  if (rows.length === 0) return <span style={smallStyle}>Brak danych w tym okresie.</span>;
  return <div style={miniListStyle}>{rows.map((row) => <div key={row.label} style={miniItemStyle}><span>{row.label}</span><strong>{formatMoney(row.value)}</strong></div>)}</div>;
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <th style={{ ...thStyle, textAlign: align }}>{children}</th>;
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return <td style={{ ...tdStyle, textAlign: align }}>{children}</td>;
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td style={tdStyle} colSpan={colSpan}>{text}</td></tr>;
}

async function updateCost(costId: string, payload: Partial<CfoCostItem>) {
  const result = await updateCfoCost(costId, payload);
  if (result.error) alert("Nie udało się zapisać kosztu.");
}

type CfoClientRow = { name: string; revenue: number; mrr: number };
type CfoView = ReturnType<typeof buildCfoView>;

function buildCfoView(period: string, revenueLines: CfoInvoiceLine[], costs: CfoCostItem[], employees: CfoEmployeeCost[], bank: CfoBankTransaction[]) {
  const revenue = sum(revenueLines.map((line) => Number(line.kwota_netto || 0)));
  const mrr = sum(revenueLines.filter((line) => line.cfo_przychod_kategoria === "abonamenty").map((line) => Number(line.kwota_netto || 0)));
  const employeeBase = sum(employees.map((employee) => Number(employee.podstawa || 0) + Number(employee.zus_pracodawcy || 0) + Number(employee.benefity || 0) + Number(employee.premie || 0) + Number(employee.szkolenia || 0)));
  const costBase = sum(costs.filter((cost) => !cost.ignoruj).map(monthlyCostShare));
  const managementCosts = costBase + employeeBase;
  const operatingResult = revenue - managementCosts;
  const cashFlow = sum(bank.filter((transaction) => !transaction.ignoruj && transaction.typ !== "transfer_wewnetrzny").map((transaction) => Number(transaction.kwota || 0)));
  const ownerGoalGap = Math.max(0, 15000 - operatingResult);
  const clientsByName = new Map<string, CfoClientRow>();
  const revenueByCategory = new Map<string, number>();
  const costsByCategory = new Map<string, number>();

  revenueLines.forEach((line) => {
    const category = revenueLabel(line.cfo_przychod_kategoria || "pozostale");
    revenueByCategory.set(category, (revenueByCategory.get(category) || 0) + Number(line.kwota_netto || 0));
    const name = invoiceClientName(line);
    const current = clientsByName.get(name) || { name, revenue: 0, mrr: 0 };
    current.revenue += Number(line.kwota_netto || 0);
    if (line.cfo_przychod_kategoria === "abonamenty") current.mrr += Number(line.kwota_netto || 0);
    clientsByName.set(name, current);
  });

  costs.forEach((cost) => {
    const label = costLabel(cost.kategoria);
    costsByCategory.set(label, (costsByCategory.get(label) || 0) + monthlyCostShare(cost));
  });

  return {
    revenue,
    mrr,
    managementCosts,
    operatingResult,
    cashFlow,
    ownerGoalGap,
    ownerGoalText: ownerGoalGap <= 0 ? "Pokryty" : `Brakuje ${formatMoney(ownerGoalGap)}`,
    invoiceLineCount: revenueLines.length,
    uncategorizedRevenue: revenueLines.filter((line) => !line.cfo_przychod_kategoria).length,
    costCount: costs.length,
    bankTransactionCount: bank.length,
    unassignedBankCount: bank.filter((transaction) => transaction.typ === "do_przypisania" && !transaction.ignoruj).length,
    availableHours: sum(employees.map((employee) => Math.max(0, availableHours(employee, period)))),
    clients: Array.from(clientsByName.values()).sort((a, b) => b.revenue - a.revenue),
    revenueBreakdown: Array.from(revenueByCategory, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    costBreakdown: Array.from(costsByCategory, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
  };
}

async function parseCostWorkbook(file: File, period: string): Promise<CfoCostImportRow[]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    alert("Ten import przyjmuje teraz CSV. Otwórz plik w Excelu i zapisz jako CSV, a następnie wczytaj ponownie.");
    return [];
  }
  const rows = parseDelimitedTable(await file.text());
  return rows.map((row, index) => {
    const documentNumber = stringValue(row["Nr dokumentu"] ?? row["Numer dokumentu"]);
    const contractor = stringValue(row["Kontrahent"]) || "Brak kontrahenta";
    const description = stringValue(row["Opis"]);
    const net = numberValue(row["Kwota netto"]);
    const vat = numberValue(row["Kwota VAT"]);
    const gross = numberValue(row["Razem"] ?? row["Kwota brutto"]);
    const category = classifyCost(contractor, description);
    return {
      import_key: `cost:${file.name}:${documentNumber || index}:${contractor}:${net}`,
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
      okres_end: monthToDate(period),
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

function monthlyCostShare(cost: CfoCostItem) {
  if (cost.ujecie_zarzadcze !== "rozliczenie_w_czasie") return Number(cost.kwota_netto_cfo || 0);
  return Number(cost.kwota_netto_cfo || 0) / Math.max(1, monthsBetween(cost.okres_start, cost.okres_end));
}

function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = end.slice(0, 7).split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth + 1;
}

function availableHours(employee: CfoEmployeeCost, period: string) {
  return businessDaysInMonth(period) * 8 * Number(employee.wymiar_etatu || 0) - Number(employee.nieobecnosci_godziny || 0) + Number(employee.nadgodziny || 0);
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
  const invoice = Array.isArray(line.faktury) ? line.faktury[0] : line.faktury;
  const client = Array.isArray(invoice?.klienci) ? invoice?.klienci[0] : invoice?.klienci;
  return client?.nazwa || invoice?.kontrahent_nazwa || "Klient bez nazwy";
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

function emptyManualCost(period: string): CfoCostImportRow {
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
    kategoria: "administracja_ogolne",
    podkategoria: null,
    okres_start: monthToDate(period),
    okres_end: monthToDate(period),
    zrodlo: "recznie",
  };
}

function currentMonthInput() {
  return new Date().toISOString().slice(0, 7);
}

function currentMonthDate() {
  return `${currentMonthInput()}-01`;
}

function monthToDate(value: string) {
  return `${value}-01`;
}

function formatMoney(value: number | string | null | undefined) {
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
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
  const text = stringValue(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) return parsePolishDate(text);
  return null;
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

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

const contentStyle: CSSProperties = { padding: "32px", display: "grid", gap: "20px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", flexWrap: "wrap" };
const headerActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { color: colors.navy, fontSize: "42px", margin: 0, lineHeight: 1.05 };
const monthFieldStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "0 12px", minHeight: "42px" };
const monthInputStyle: CSSProperties = { border: 0, outline: 0, background: "transparent", color: colors.text, fontWeight: 850, fontSize: "15px" };
const metricGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "12px" };
const metricStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.input, boxShadow: shadow.soft, display: "grid", gap: "9px", padding: "16px", color: colors.muted, fontWeight: 800 };
const metricValueStyle: CSSProperties = { color: colors.navy, fontSize: "21px", lineHeight: 1.1 };
const goodMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.success };
const badMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.danger };
const warnMetricValueStyle: CSSProperties = { ...metricValueStyle, color: colors.warning };
const tabsStyle: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", borderBottom: `1px solid ${colors.border}`, paddingBottom: "10px" };
const tabStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "40px", padding: "8px 12px", fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, background: colors.navy, color: colors.white, borderColor: colors.navy };
const sectionGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(320px, 0.8fr)", gap: "18px", alignItems: "start" };
const sectionStackStyle: CSSProperties = { display: "grid", gap: "18px" };
const panelStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, padding: "20px", minWidth: 0 };
const widePanelStyle: CSSProperties = { ...panelStyle, gridColumn: "1 / -1" };
const panelHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" };
const panelIconStyle: CSSProperties = { color: colors.red, display: "inline-flex" };
const panelTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "21px" };
const recommendationStyle: CSSProperties = { display: "grid", gap: "6px", background: "#e9eef7", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "16px", color: colors.navy };
const quickGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px", marginTop: "14px" };
const miniStatStyle: CSSProperties = { display: "grid", gap: "6px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "12px", color: colors.muted, fontWeight: 750 };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { color: colors.muted, borderBottom: `1px solid ${colors.border}`, padding: "11px 9px", fontSize: "12px", textTransform: "uppercase", letterSpacing: 0 };
const tdStyle: CSSProperties = { color: colors.text, borderBottom: `1px solid ${colors.border}`, padding: "10px 9px", verticalAlign: "middle" };
const smallStyle: CSSProperties = { display: "block", color: colors.muted, marginTop: "4px", fontSize: "12px", fontWeight: 650 };
const compactSelectStyle: CSSProperties = { minHeight: "36px", padding: "7px 10px", background: colors.white };
const uploadBoxStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, cursor: "pointer", padding: "18px", color: colors.text, display: "grid", gap: "8px", justifyItems: "start" };
const manualGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: "10px", marginTop: "14px", alignItems: "start" };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontWeight: 750, width: "100%", boxSizing: "border-box" };
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.input, background: colors.red, color: colors.white, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" };
const moneyInputStyle: CSSProperties = { ...inputStyle, minHeight: "36px", padding: "7px 9px", width: "120px" };
const mutedRowStyle: CSSProperties = { opacity: 0.58, background: "#f1f5f9" };
const employeeFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" };
const fieldStyle: CSSProperties = { display: "grid", gap: "6px", color: colors.muted, fontWeight: 800, fontSize: "13px" };
const formFooterStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "14px", flexWrap: "wrap" };
const miniListStyle: CSSProperties = { display: "grid", gap: "8px" };
const miniItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "10px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", color: colors.text, alignItems: "center" };
const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontSize: "12px", fontWeight: 900 };
