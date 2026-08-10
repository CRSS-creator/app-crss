"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { BarChart3, Banknote, FileSpreadsheet, Plus, RefreshCw, Save, Upload } from "lucide-react";
import * as XLSX from "xlsx";

import { colors, radius, shadow } from "@/app/design";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import AppSelect from "@/components/AppSelect";
import {
  fetchCfoBankTransactions,
  fetchCfoCosts,
  fetchCfoEmployeeCosts,
  fetchCfoRevenueLines,
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
} from "@/lib/cfoService";

const REVENUE_OPTIONS: { value: CfoRevenueCategory; label: string }[] = [
  { value: "abonamenty", label: "Abonamenty / MRR" },
  { value: "kadry_place", label: "Kadry i place" },
  { value: "uslugi_dodatkowe", label: "Uslugi dodatkowe" },
  { value: "wdrozenia", label: "Wdrozenia" },
  { value: "pozostale", label: "Pozostale" },
];

const COST_OPTIONS: { value: CfoCostCategory; label: string }[] = [
  { value: "koszty_zespolu", label: "Koszty zespolu" },
  { value: "lokal_infrastruktura", label: "Lokal i infrastruktura" },
  { value: "systemy_technologia", label: "Systemy i technologia" },
  { value: "marketing_sprzedaz", label: "Marketing i sprzedaz" },
  { value: "administracja_ogolne", label: "Administracja i ogolne" },
  { value: "zarzad_wlasciciel", label: "Zarzad/wlasciciel" },
  { value: "jednorazowe_nadzwyczajne", label: "Jednorazowe/nadzwyczajne" },
];

const BANK_TYPE_OPTIONS: { value: CfoBankTransactionType; label: string }[] = [
  { value: "do_przypisania", label: "Do przypisania" },
  { value: "koszt", label: "Koszt" },
  { value: "wynagrodzenie_netto", label: "Wynagrodzenie netto" },
  { value: "pit", label: "PIT" },
  { value: "zus", label: "ZUS" },
  { value: "cit", label: "CIT" },
  { value: "vat", label: "VAT" },
  { value: "faktura_sprzedazowa", label: "Faktura sprzedazowa" },
  { value: "transfer_wewnetrzny", label: "Transfer wewnetrzny" },
  { value: "ignoruj", label: "Ignoruj" },
  { value: "inne", label: "Inne" },
];

const SUBCATEGORIES: Record<CfoCostCategory, string[]> = {
  koszty_zespolu: ["Wynagrodzenie podstawowe", "ZUS pracodawcy", "Benefity", "Premie", "Szkolenia"],
  lokal_infrastruktura: ["Czynsz", "Prad", "Gaz", "Smieci", "Woda", "Sprzatanie", "Wyposazenie", "Materialy gospodarcze"],
  systemy_technologia: ["wFirma", "Google Workspace", "MS Office", "OpenAI", "T-Mobile", "LEX", "Hosting/inne"],
  marketing_sprzedaz: ["Meta Ads", "Google Ads", "Canva", "Koszt zespolu marketingowego", "Koszt zespolu sprzedazowego"],
  administracja_ogolne: ["Artykuly biurowe/spozywcze", "Prawne/podatkowe", "OC", "Bank", "Poczta/kurier", "Reprezentacja", "Inne"],
  zarzad_wlasciciel: ["Wynagrodzenie podstawowe Prezesa", "Premia Prezesa", "Samochod sluzbowy"],
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
  const [period, setPeriod] = useState(currentMonthInput());
  const [loading, setLoading] = useState(true);
  const [revenueLines, setRevenueLines] = useState<CfoInvoiceLine[]>([]);
  const [costs, setCosts] = useState<CfoCostItem[]>([]);
  const [employeeCosts, setEmployeeCosts] = useState<CfoEmployeeCost[]>([]);
  const [bankTransactions, setBankTransactions] = useState<CfoBankTransaction[]>([]);
  const [manualCost, setManualCost] = useState(() => emptyManualCost(period));
  const [employeeDraft, setEmployeeDraft] = useState<Omit<CfoEmployeeCost, "id">>({ ...EMPTY_EMPLOYEE, okres: monthToDate(period) });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadData();
    // loadData intentionally reloads only when the selected CFO period changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const view = useMemo(
    () => buildCfoView(period, revenueLines, costs, employeeCosts, bankTransactions),
    [period, revenueLines, costs, employeeCosts, bankTransactions]
  );

  async function loadData() {
    setLoading(true);
    const [revenueResult, costsResult, employeeResult, bankResult] = await Promise.all([
      fetchCfoRevenueLines(monthToDate(period)),
      fetchCfoCosts(monthToDate(period)),
      fetchCfoEmployeeCosts(monthToDate(period)),
      fetchCfoBankTransactions(monthToDate(period)),
    ]);

    if (revenueResult.error) console.error("Blad pobierania przychodow CFO:", revenueResult.error);
    if (costsResult.error) console.error("Blad pobierania kosztow CFO:", costsResult.error);
    if (employeeResult.error) console.error("Blad pobierania kosztow pracownikow CFO:", employeeResult.error);
    if (bankResult.error) console.error("Blad pobierania transakcji bankowych CFO:", bankResult.error);

    setRevenueLines((revenueResult.data || []) as unknown as CfoInvoiceLine[]);
    setCosts((costsResult.data || []) as CfoCostItem[]);
    setEmployeeCosts((employeeResult.data || []) as CfoEmployeeCost[]);
    setBankTransactions((bankResult.data || []) as CfoBankTransaction[]);
    setManualCost(emptyManualCost(period));
    setEmployeeDraft({ ...EMPTY_EMPLOYEE, okres: monthToDate(period) });
    setLoading(false);
  }

  async function changeRevenueCategory(line: CfoInvoiceLine, category: CfoRevenueCategory) {
    const result = await updateInvoiceLineCfoCategory(line.id, category);
    if (result.error) {
      alert("Nie udalo sie zapisac kategorii CFO pozycji faktury.");
      return;
    }
    setRevenueLines((current) => current.map((item) => (item.id === line.id ? ((result.data || { ...item, cfo_przychod_kategoria: category }) as unknown as CfoInvoiceLine) : item)));
  }

  async function importCostsFile(file: File) {
    setSaving(true);
    try {
      const rows = await parseCostWorkbook(file, period);
      if (rows.length === 0) {
        alert("Nie znaleziono pozycji kosztowych w pliku.");
        return;
      }
      const result = await insertCfoCosts(rows);
      if (result.error) {
        alert("Nie udalo sie zaimportowac kosztow.");
        console.error(result.error);
        return;
      }
      await loadData();
      alert(`Zaimportowano nowe pozycje kosztowe: ${result.data?.length || 0}.`);
    } finally {
      setSaving(false);
    }
  }

  async function importBankFile(file: File) {
    setSaving(true);
    try {
      const rows = await parseBankCsv(file);
      if (rows.length === 0) {
        alert("Nie znaleziono transakcji bankowych w pliku.");
        return;
      }
      const result = await importBankTransactions(rows);
      if (result.error) {
        alert("Nie udalo sie zaimportowac historii rachunku.");
        console.error(result.error);
        return;
      }
      await loadData();
      alert(`Zaimportowano nowe transakcje: ${result.data?.length || 0}.`);
    } finally {
      setSaving(false);
    }
  }

  async function addManualCost() {
    if (!manualCost.kontrahent.trim()) {
      alert("Podaj kontrahenta.");
      return;
    }
    setSaving(true);
    const result = await insertCfoCosts([{ ...manualCost, import_key: `manual:${crypto.randomUUID()}`, zrodlo: "recznie" }]);
    setSaving(false);
    if (result.error) {
      alert("Nie udalo sie dodac kosztu.");
      return;
    }
    await loadData();
  }

  async function saveEmployeeCost() {
    if (!employeeDraft.osoba_nazwa.trim()) {
      alert("Podaj imie i nazwisko osoby.");
      return;
    }
    setSaving(true);
    const result = await upsertCfoEmployeeCost(employeeDraft);
    setSaving(false);
    if (result.error) {
      alert("Nie udalo sie zapisac kosztu pracownika.");
      return;
    }
    await loadData();
  }

  async function changeCost(cost: CfoCostItem, payload: Partial<CfoCostItem>) {
    const optimistic = { ...cost, ...payload };
    setCosts((current) => current.map((item) => (item.id === cost.id ? optimistic : item)));
    const result = await updateCfoCost(cost.id, payload);
    if (result.error) {
      alert("Nie udalo sie zapisac kosztu.");
      await loadData();
    }
  }

  async function changeTransaction(transaction: CfoBankTransaction, payload: Partial<CfoBankTransaction>) {
    const optimistic = { ...transaction, ...payload };
    setBankTransactions((current) => current.map((item) => (item.id === transaction.id ? optimistic : item)));
    const result = await updateBankTransaction(transaction.id, payload);
    if (result.error) {
      alert("Nie udalo sie zapisac transakcji.");
      await loadData();
    }
  }

  return (
    <section style={contentStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Modul zarzadczy</p>
          <h1 style={titleStyle}>CFO</h1>
        </div>
        <div style={headerActionsStyle}>
          <input style={monthInputStyle} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} />
          <button type="button" style={secondaryButtonStyle} onClick={loadData} disabled={loading}>
            <RefreshCw size={17} />
            Odswiez
          </button>
        </div>
      </header>

      <section style={summaryGridStyle}>
        <Metric title="Przychody" value={formatMoney(view.revenue)} />
        <Metric title="MRR" value={formatMoney(view.mrr)} />
        <Metric title="Koszty zarzadcze" value={formatMoney(view.managementCosts)} />
        <Metric title="Wynik operacyjny" value={formatMoney(view.operatingResult)} tone={view.operatingResult >= 0 ? "success" : "danger"} />
        <Metric title="Cash flow" value={formatMoney(view.cashFlow)} tone={view.cashFlow >= 0 ? "success" : "danger"} />
        <Metric title="Cel wlasciciela" value={view.ownerGoalText} tone={view.ownerGoalGap <= 0 ? "success" : "warning"} />
      </section>

      <section style={recommendationStyle}>
        <BarChart3 size={22} />
        <div>
          <strong>Brakujaca marza do bezpiecznej wyplaty</strong>
          <p>
            {view.ownerGoalGap <= 0
              ? "Cel 15 000 zl jest pokryty przy obecnym wyniku operacyjnym."
              : `Brakuje ok. ${formatMoney(view.ownerGoalGap)} miesiecznej marzy przed wlascicielem. Przy marzy 40% oznacza to ok. ${formatMoney(view.ownerGoalGap / 0.4)} dodatkowego MRR lub rownowaznej poprawy kosztow.`}
          </p>
        </div>
      </section>

      <section style={twoColumnStyle}>
        <Panel title="Przychody z faktur" icon={<FileSpreadsheet size={19} />}>
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>Klient</Th>
                <Th>Pozycja</Th>
                <Th>Kategoria CFO</Th>
                <Th>Netto</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><Td colSpan={4}>Ladowanie...</Td></tr>
              ) : revenueLines.length === 0 ? (
                <tr><Td colSpan={4}>Brak pozycji faktur dla okresu.</Td></tr>
              ) : revenueLines.map((line) => (
                <tr key={line.id}>
                  <Td>{invoiceClientName(line)}</Td>
                  <Td strong>{line.nazwa}</Td>
                  <Td>
                    <AppSelect
                      value={line.cfo_przychod_kategoria || "pozostale"}
                      options={REVENUE_OPTIONS}
                      onChange={(value) => changeRevenueCategory(line, value as CfoRevenueCategory)}
                      style={compactSelectStyle}
                    />
                  </Td>
                  <Td strong>{formatMoney(line.kwota_netto)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel title="Import kosztow" icon={<Upload size={19} />}>
          <div style={importGridStyle}>
            <label style={uploadBoxStyle}>
              <FileSpreadsheet size={24} />
              <strong>Wczytaj Excel kosztow</strong>
              <span>Nr dokumentu, kontrahent, netto, VAT, brutto i opis.</span>
              <input hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => event.target.files?.[0] && importCostsFile(event.target.files[0])} />
            </label>
            <label style={uploadBoxStyle}>
              <Banknote size={24} />
              <strong>Wczytaj CSV banku</strong>
              <span>Historia Erste z przecinkiem jako separatorem.</span>
              <input hidden type="file" accept=".csv" onChange={(event) => event.target.files?.[0] && importBankFile(event.target.files[0])} />
            </label>
          </div>

          <div style={manualGridStyle}>
            <input style={inputStyle} placeholder="Kontrahent" value={manualCost.kontrahent} onChange={(event) => setManualCost({ ...manualCost, kontrahent: event.target.value })} />
            <input style={inputStyle} placeholder="Numer dokumentu" value={manualCost.numer_dokumentu || ""} onChange={(event) => setManualCost({ ...manualCost, numer_dokumentu: emptyToNull(event.target.value) })} />
            <input style={inputStyle} type="number" placeholder="Netto CFO" value={manualCost.kwota_netto_cfo || ""} onChange={(event) => setManualCost({ ...manualCost, kwota_netto_cfo: Number(event.target.value || 0), kwota_netto_import: Number(event.target.value || 0) })} />
            <button type="button" style={primaryButtonStyle} disabled={saving} onClick={addManualCost}>
              <Plus size={17} />
              Dodaj
            </button>
          </div>
        </Panel>
      </section>

      <Panel title="Koszty CFO" icon={<FileSpreadsheet size={19} />}>
        <Table minWidth={1100}>
          <thead>
            <tr>
              <Th>Dokument</Th>
              <Th>Kontrahent</Th>
              <Th>Kategoria</Th>
              <Th>Podkategoria</Th>
              <Th>Okres od</Th>
              <Th>Okres do</Th>
              <Th>Netto CFO</Th>
              <Th>Brutto CF</Th>
            </tr>
          </thead>
          <tbody>
            {costs.length === 0 ? (
              <tr><Td colSpan={8}>Brak kosztow w tym okresie.</Td></tr>
            ) : costs.map((cost) => (
              <tr key={cost.id} style={cost.ignoruj ? mutedRowStyle : undefined}>
                <Td strong>{cost.numer_dokumentu || "Recznie"}</Td>
                <Td>{cost.kontrahent}<Small>{cost.opis}</Small></Td>
                <Td>
                  <AppSelect value={cost.kategoria} options={COST_OPTIONS} onChange={(value) => changeCost(cost, { kategoria: value as CfoCostCategory, podkategoria: null })} style={compactSelectStyle} />
                </Td>
                <Td>
                  {SUBCATEGORIES[cost.kategoria].length ? (
                    <AppSelect
                      value={cost.podkategoria || ""}
                      options={[{ value: "", label: "Bez podkategorii" }, ...SUBCATEGORIES[cost.kategoria].map((item) => ({ value: item, label: item }))]}
                      onChange={(value) => changeCost(cost, { podkategoria: emptyToNull(value) })}
                      style={compactSelectStyle}
                    />
                  ) : "Bez podkategorii"}
                </Td>
                <Td><input style={dateInputStyle} type="date" value={cost.okres_start} onChange={(event) => changeCost(cost, { okres_start: event.target.value })} /></Td>
                <Td><input style={dateInputStyle} type="date" value={cost.okres_end} onChange={(event) => changeCost(cost, { okres_end: event.target.value })} /></Td>
                <Td><input style={moneyInputStyle} type="number" value={cost.kwota_netto_cfo} onChange={(event) => changeCost(cost, { kwota_netto_cfo: Number(event.target.value || 0) })} /></Td>
                <Td strong>{formatMoney(cost.kwota_brutto)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <section style={twoColumnStyle}>
        <Panel title="Zespol / Capacity" icon={<Save size={19} />}>
          <div style={employeeFormStyle}>
            <input style={inputStyle} placeholder="Osoba" value={employeeDraft.osoba_nazwa} onChange={(event) => setEmployeeDraft({ ...employeeDraft, osoba_nazwa: event.target.value })} />
            <input style={inputStyle} type="number" step="0.25" placeholder="Wymiar etatu" value={employeeDraft.wymiar_etatu} onChange={(event) => setEmployeeDraft({ ...employeeDraft, wymiar_etatu: Number(event.target.value || 0) })} />
            <input style={inputStyle} type="number" placeholder="Podstawa" value={employeeDraft.podstawa || ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, podstawa: Number(event.target.value || 0) })} />
            <input style={inputStyle} type="number" placeholder="ZUS pracodawcy" value={employeeDraft.zus_pracodawcy || ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, zus_pracodawcy: Number(event.target.value || 0) })} />
            <input style={inputStyle} type="number" placeholder="Benefity" value={employeeDraft.benefity || ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, benefity: Number(event.target.value || 0) })} />
            <input style={inputStyle} type="number" placeholder="Nieobecnosci h" value={employeeDraft.nieobecnosci_godziny || ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, nieobecnosci_godziny: Number(event.target.value || 0) })} />
            <input style={inputStyle} type="number" placeholder="Nadgodziny h" value={employeeDraft.nadgodziny || ""} onChange={(event) => setEmployeeDraft({ ...employeeDraft, nadgodziny: Number(event.target.value || 0) })} />
            <button type="button" style={primaryButtonStyle} disabled={saving} onClick={saveEmployeeCost}>Zapisz</button>
          </div>
          <div style={miniListStyle}>
            {employeeCosts.map((employee) => {
              const hours = availableHours(employee, period);
              const baseCost = employee.podstawa + employee.zus_pracodawcy + employee.benefity;
              return (
                <div key={employee.id} style={miniItemStyle}>
                  <strong>{employee.osoba_nazwa}</strong>
                  <span>{hours.toLocaleString("pl-PL")} h dostepne</span>
                  <span>{formatMoney(hours > 0 ? baseCost / hours : 0)}/h</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Cash flow bankowy" icon={<Banknote size={19} />}>
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Opis</Th>
                <Th>Typ</Th>
                <Th>Kwota</Th>
              </tr>
            </thead>
            <tbody>
              {bankTransactions.length === 0 ? (
                <tr><Td colSpan={4}>Brak transakcji bankowych.</Td></tr>
              ) : bankTransactions.slice(0, 18).map((transaction) => (
                <tr key={transaction.id} style={transaction.ignoruj || transaction.typ === "transfer_wewnetrzny" ? mutedRowStyle : undefined}>
                  <Td>{formatDate(transaction.data_ksiegowania)}</Td>
                  <Td>{transaction.tytul || "Bez tytulu"}<Small>{transaction.kontrahent}</Small></Td>
                  <Td>
                    <AppSelect
                      value={transaction.typ}
                      options={BANK_TYPE_OPTIONS}
                      onChange={(value) => changeTransaction(transaction, { typ: value as CfoBankTransactionType, ignoruj: value === "ignoruj" })}
                      style={compactSelectStyle}
                    />
                  </Td>
                  <Td strong>{formatMoney(transaction.kwota)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>
      </section>

      <Panel title="Rentownosc klientow" icon={<BarChart3 size={19} />}>
        <Table minWidth={820}>
          <thead>
            <tr>
              <Th>Klient</Th>
              <Th>Przychod</Th>
              <Th>MRR</Th>
              <Th>Status CFO</Th>
            </tr>
          </thead>
          <tbody>
            {view.clients.length === 0 ? (
              <tr><Td colSpan={4}>Brak danych klientowskich w tym okresie.</Td></tr>
            ) : view.clients.map((client) => (
              <tr key={client.name}>
                <Td strong>{client.name}</Td>
                <Td>{formatMoney(client.revenue)}</Td>
                <Td>{formatMoney(client.mrr)}</Td>
                <Td><Badge tone="neutral">Wymaga kosztu czasu</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </section>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={panelStyle}>
      <header style={panelHeaderStyle}>
        <span style={panelIconStyle}>{icon}</span>
        <h2 style={panelTitleStyle}>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Metric({ title, value, tone = "neutral" }: { title: string; value: string; tone?: "neutral" | "success" | "danger" | "warning" }) {
  return (
    <article style={metricStyle}>
      <span>{title}</span>
      <strong style={tone === "success" ? successTextStyle : tone === "danger" ? dangerTextStyle : tone === "warning" ? warningTextStyle : metricValueStyle}>{value}</strong>
    </article>
  );
}

function Table({ minWidth, children }: { minWidth: number; children: React.ReactNode }) {
  return <div style={tableWrapperStyle}><table style={{ ...tableStyle, minWidth }}>{children}</table></div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>;
}

function Td({ children, strong, colSpan }: { children: React.ReactNode; strong?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} style={{ ...tdStyle, fontWeight: strong ? 760 : 540 }}>{children}</td>;
}

function Small({ children }: { children: React.ReactNode }) {
  return children ? <small style={smallStyle}>{children}</small> : null;
}

function Badge({ children }: { children: React.ReactNode; tone: "neutral" }) {
  return <span style={badgeStyle}>{children}</span>;
}

function buildCfoView(period: string, revenueLines: CfoInvoiceLine[], costs: CfoCostItem[], employees: CfoEmployeeCost[], bank: CfoBankTransaction[]) {
  const revenue = sum(revenueLines.map((line) => Number(line.kwota_netto || 0)));
  const mrr = sum(revenueLines.filter((line) => line.cfo_przychod_kategoria === "abonamenty").map((line) => Number(line.kwota_netto || 0)));
  const costBase = sum(costs.filter((cost) => !cost.ignoruj).map((cost) => monthlyCostShare(cost)));
  const employeeBase = sum(employees.map((employee) => employee.podstawa + employee.zus_pracodawcy + employee.benefity + employee.premie + employee.szkolenia));
  const managementCosts = costBase + employeeBase;
  const operatingResult = revenue - managementCosts;
  const cashFlow = sum(bank.filter((transaction) => !transaction.ignoruj && transaction.typ !== "transfer_wewnetrzny").map((transaction) => Number(transaction.kwota || 0)));
  const ownerGoalGap = Math.max(0, 15000 - operatingResult);

  const clientsByName = new Map<string, { name: string; revenue: number; mrr: number }>();
  revenueLines.forEach((line) => {
    const name = invoiceClientName(line);
    const current = clientsByName.get(name) || { name, revenue: 0, mrr: 0 };
    current.revenue += Number(line.kwota_netto || 0);
    if (line.cfo_przychod_kategoria === "abonamenty") current.mrr += Number(line.kwota_netto || 0);
    clientsByName.set(name, current);
  });

  return {
    revenue,
    mrr,
    managementCosts,
    operatingResult,
    cashFlow,
    ownerGoalGap,
    ownerGoalText: ownerGoalGap <= 0 ? "Pokryty" : `Brakuje ${formatMoney(ownerGoalGap)}`,
    clients: Array.from(clientsByName.values()).sort((a, b) => b.revenue - a.revenue),
  };
}

function monthlyCostShare(cost: CfoCostItem) {
  if (cost.ujecie_zarzadcze !== "rozliczenie_w_czasie") return Number(cost.kwota_netto_cfo || 0);
  const months = Math.max(1, monthsBetween(cost.okres_start, cost.okres_end));
  return Number(cost.kwota_netto_cfo || 0) / months;
}

function monthsBetween(start: string, end: string) {
  const [startYear, startMonth] = start.slice(0, 7).split("-").map(Number);
  const [endYear, endMonth] = end.slice(0, 7).split("-").map(Number);
  return (endYear - startYear) * 12 + endMonth - startMonth + 1;
}

async function parseCostWorkbook(file: File, period: string): Promise<CfoCostImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

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
  const text = await file.text();
  const rows = parseCsv(text).filter((row) => row.length >= 8);
  const summary = rows[0];
  const accountNumber = normalizeAccount(String(summary[2] || "").replace(/^'/, ""));
  const accountName = String(summary[3] || "");
  const currency = String(summary[4] || "PLN") || "PLN";

  return rows.slice(1).map((row) => {
    const title = String(row[2] || "");
    const contractor = String(row[3] || "");
    const amount = numberValue(row[5]);
    const type = classifyBankTransaction(title, contractor);

    return {
      account: {
        numer_rachunku: accountNumber,
        nazwa: accountName,
        waluta: currency,
      },
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
    } else if (char === "," && !quoted) {
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
  if (value.includes("lex") || value.includes("wolters")) return { category: "systemy_technologia", subcategory: "LEX" };
  if (value.includes("hosting") || value.includes("hetzner")) return { category: "systemy_technologia", subcategory: "Hosting/inne" };
  if (value.includes("marketing") || value.includes("facebook") || value.includes("facebk") || value.includes("meta")) return { category: "marketing_sprzedaz", subcategory: "Meta Ads" };
  if (value.includes("canva")) return { category: "marketing_sprzedaz", subcategory: "Canva" };
  if (value.includes("najem") || value.includes("czynsz")) return { category: "lokal_infrastruktura", subcategory: "Czynsz" };
  if (value.includes("gaz")) return { category: "lokal_infrastruktura", subcategory: "Gaz" };
  if (value.includes("woda")) return { category: "lokal_infrastruktura", subcategory: "Woda" };
  if (value.includes("smiec") || value.includes("śmie")) return { category: "lokal_infrastruktura", subcategory: "Smieci" };
  if (value.includes("gospodarcze")) return { category: "lokal_infrastruktura", subcategory: "Materialy gospodarcze" };
  if (value.includes("kurier") || value.includes("furgonetka")) return { category: "administracja_ogolne", subcategory: "Poczta/kurier" };
  if (value.includes("biurow") || value.includes("papier")) return { category: "administracja_ogolne", subcategory: "Artykuly biurowe/spozywcze" };
  if (value.includes("silown") || value.includes("benefit")) return { category: "koszty_zespolu", subcategory: "Benefity" };
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

function invoiceClientName(line: CfoInvoiceLine) {
  const invoice = Array.isArray(line.faktury) ? line.faktury[0] : line.faktury;
  const client = Array.isArray(invoice?.klienci) ? invoice?.klienci[0] : invoice?.klienci;
  return client?.nazwa || invoice?.kontrahent_nazwa || "Klient bez nazwy";
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
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zl`;
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
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
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

const contentStyle: CSSProperties = { padding: "34px", display: "grid", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start" };
const headerActionsStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "center" };
const eyebrowStyle: CSSProperties = { color: colors.red, fontWeight: 850, margin: "0 0 8px" };
const titleStyle: CSSProperties = { color: colors.navy, fontSize: "42px", margin: 0, lineHeight: 1.05 };
const monthInputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontWeight: 800 };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "14px" };
const metricStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.input, boxShadow: shadow.soft, display: "grid", gap: "9px", padding: "16px", color: colors.muted, fontWeight: 800 };
const metricValueStyle: CSSProperties = { color: colors.navy, fontSize: "21px", lineHeight: 1.1 };
const successTextStyle: CSSProperties = { ...metricValueStyle, color: colors.success };
const dangerTextStyle: CSSProperties = { ...metricValueStyle, color: colors.danger };
const warningTextStyle: CSSProperties = { ...metricValueStyle, color: colors.warning };
const recommendationStyle: CSSProperties = { display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: "12px", alignItems: "start", background: "#e9eef7", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "18px", color: colors.navy };
const twoColumnStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(360px, 0.8fr)", gap: "20px", alignItems: "start" };
const panelStyle: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, padding: "20px", minWidth: 0 };
const panelHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" };
const panelIconStyle: CSSProperties = { color: colors.red, display: "inline-flex" };
const panelTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "21px" };
const tableWrapperStyle: CSSProperties = { overflowX: "auto" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", color: colors.muted, borderBottom: `1px solid ${colors.border}`, padding: "11px 9px", fontSize: "12px", textTransform: "uppercase", letterSpacing: 0 };
const tdStyle: CSSProperties = { color: colors.text, borderBottom: `1px solid ${colors.border}`, padding: "10px 9px", verticalAlign: "middle" };
const smallStyle: CSSProperties = { display: "block", color: colors.muted, marginTop: "4px", fontSize: "12px", fontWeight: 650 };
const compactSelectStyle: CSSProperties = { minHeight: "36px", padding: "7px 10px", background: colors.white };
const importGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" };
const uploadBoxStyle: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, cursor: "pointer", padding: "18px", color: colors.text, display: "grid", gap: "8px", justifyItems: "start" };
const manualGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 0.8fr 0.7fr auto", gap: "10px", marginTop: "14px" };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontWeight: 750, width: "100%", boxSizing: "border-box" };
const primaryButtonStyle: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.input, background: colors.red, color: colors.white, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, minHeight: "42px", padding: "9px 14px", fontWeight: 850, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" };
const dateInputStyle: CSSProperties = { ...inputStyle, minHeight: "36px", padding: "7px 9px", width: "150px" };
const moneyInputStyle: CSSProperties = { ...inputStyle, minHeight: "36px", padding: "7px 9px", width: "120px" };
const mutedRowStyle: CSSProperties = { opacity: 0.58, background: "#f1f5f9" };
const employeeFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" };
const miniListStyle: CSSProperties = { display: "grid", gap: "8px", marginTop: "14px" };
const miniItemStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto auto", gap: "10px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", color: colors.text, alignItems: "center" };
const badgeStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontSize: "12px", fontWeight: 900 };
