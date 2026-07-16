"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Plus, Save } from "lucide-react";
import AccessGuard from "@/components/AccessGuard";
import AppLayout from "@/components/AppLayout";
import { colors, radius, shadow } from "@/app/design";
import { fetchClients } from "@/lib/clientService";
import {
  addClientToLimit,
  fetchLimitMonthlyRecords,
  fetchLimitRegisters,
  updateLimitRegister,
  upsertMonthlyLimitAmount,
  type LimitMonthlyRecord,
  type LimitRegisterRecord,
  type LimitType,
} from "@/lib/limitService";

type Client = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  opiekun_id: string | null;
  profiles?: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

type LimitTab = { value: LimitType; label: string };

type LimitRow = {
  register: LimitRegisterRecord;
  client: Client | null;
  monthly: LimitMonthlyRecord[];
};

const LIMIT_TABS: LimitTab[] = [
  { value: "vat", label: "VAT" },
  { value: "wnt", label: "WNT" },
  { value: "kasa_fiskalna", label: "Kasa fiskalna" },
];

const MONTHS = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];

export default function LimitsPage() {
  return (
    <AppLayout activePage="limity">
      <AccessGuard moduleName="limity">
        <LimitsContent />
      </AccessGuard>
    </AppLayout>
  );
}

function LimitsContent() {
  const currentYear = new Date().getFullYear();
  const [activeType, setActiveType] = useState<LimitType>("vat");
  const [year, setYear] = useState(currentYear);
  const [clients, setClients] = useState<Client[]>([]);
  const [registers, setRegisters] = useState<LimitRegisterRecord[]>([]);
  const [monthlyRecords, setMonthlyRecords] = useState<LimitMonthlyRecord[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [clientToAdd, setClientToAdd] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData(year);
  }, [year]);

  async function loadData(selectedYear = year) {
    setLoading(true);
    const [clientsResult, registersResult, monthlyResult] = await Promise.all([
      fetchClients(),
      fetchLimitRegisters(),
      fetchLimitMonthlyRecords(selectedYear),
    ]);

    if (clientsResult.error) console.error("Błąd pobierania klientów do limitów:", clientsResult.error);
    if (registersResult.error) console.error("Błąd pobierania rejestru limitów:", registersResult.error);
    if (monthlyResult.error) console.error("Błąd pobierania miesięcy limitów:", monthlyResult.error);

    setClients(clientsResult.error ? [] : ((clientsResult.data || []) as unknown as Client[]));
    setRegisters(registersResult.error ? [] : ((registersResult.data || []) as LimitRegisterRecord[]));
    setMonthlyRecords(monthlyResult.error ? [] : ((monthlyResult.data || []) as LimitMonthlyRecord[]));
    setLoading(false);
  }

  const rows = useMemo(() => buildRows(activeType, clients, registers, monthlyRecords), [activeType, clients, registers, monthlyRecords]);
  const selectedRow = rows.find((row) => row.register.id === selectedRegisterId) || rows[0] || null;
  const availableClients = clients.filter((client) => !registers.some((register) => register.typ === activeType && register.klient_id === client.id));
  const isVatRegister = activeType === "vat";
  const isAutomaticRegister = activeType === "vat" || activeType === "wnt";

  async function handleAddClient() {
    if (!clientToAdd) return;
    const result = await addClientToLimit(clientToAdd, activeType);
    if (result.error) {
      alert(result.error.message.includes("duplicate") ? "Ten klient jest już dodany do tego limitu." : result.error.message);
      return;
    }
    setClientToAdd("");
    setShowAddForm(false);
    await loadData();
    setSelectedRegisterId(result.data?.id || null);
  }

  function changeTab(type: LimitType) {
    setActiveType(type);
    setSelectedRegisterId(null);
    setShowAddForm(false);
    setClientToAdd("");
  }

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Limity</p>
          <h1 style={titleStyle}>Rejestry limitów klientów</h1>
        </div>
        <div style={yearBoxStyle}>
          <span style={yearLabelStyle}>Rok</span>
          <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value) || currentYear)} style={yearInputStyle} />
        </div>
      </header>

      <nav style={tabsStyle} aria-label="Rejestry limitów">
        {LIMIT_TABS.map((tab) => (
          <button key={tab.value} type="button" onClick={() => changeTab(tab.value)} style={activeType === tab.value ? activeTabStyle : tabStyle}>
            {tab.label}
          </button>
        ))}
      </nav>

      <section style={layoutStyle}>
        <div style={cardStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>{activeTabLabel(activeType)}</h2>
              <p style={sectionHintStyle}>{registerHint(activeType)}</p>
            </div>
            {!isAutomaticRegister && (
              <button type="button" onClick={() => setShowAddForm((value) => !value)} style={primaryButtonStyle}>
                <Plus size={18} /> Dodaj klienta
              </button>
            )}
          </div>

          {showAddForm && !isAutomaticRegister && (
            <div style={addFormStyle}>
              <select value={clientToAdd} onChange={(event) => setClientToAdd(event.target.value)} style={selectStyle}>
                <option value="">Wybierz klienta</option>
                {availableClients.map((client) => (
                  <option key={client.id} value={client.id}>{client.nazwa || "Klient bez nazwy"} {client.nip ? `(${client.nip})` : ""}</option>
                ))}
              </select>
              <button type="button" onClick={() => void handleAddClient()} disabled={!clientToAdd} style={smallPrimaryButtonStyle}>Dodaj</button>
            </div>
          )}

          {loading ? (
            <p style={emptyStyle}>Ładowanie limitów...</p>
          ) : rows.length === 0 ? (
            <p style={emptyStyle}>{emptyRegisterText(activeType)}</p>
          ) : (
            <div style={listStyle}>
              {rows.map((row) => {
                const usage = calculateUsage(row.register, row.monthly);
                return (
                  <button key={row.register.id} type="button" onClick={() => setSelectedRegisterId(row.register.id)} style={selectedRow?.register.id === row.register.id ? activeRowStyle : rowStyle}>
                    <div style={rowTopStyle}>
                      <div>
                        <strong style={clientNameStyle}>{row.client?.nazwa || "Klient bez nazwy"}</strong>
                        <span style={clientMetaStyle}>{row.client?.nip || "Brak NIP"} · {caregiverLabel(row.client)}</span>
                      </div>
                      <strong style={percentStyle}>{usage.percent.toFixed(0)}%</strong>
                    </div>
                    <ProgressBar percent={usage.percent} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          {selectedRow ? (
            <LimitDetails key={`${selectedRow.register.id}-${year}`} row={selectedRow} year={year} onSaved={() => void loadData()} />
          ) : (
            <p style={emptyStyle}>Wybierz klienta z listy, aby uzupełnić limit roczny i miesiące.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function LimitDetails({ row, year, onSaved }: { row: LimitRow; year: number; onSaved: () => void }) {
  const [annualLimit, setAnnualLimit] = useState(String(toNumber(row.register.limit_roczny)));
  const [notes, setNotes] = useState(row.register.uwagi || "");
  const [monthValues, setMonthValues] = useState<Record<number, string>>(() => monthValueMap(row.monthly));
  const [businessStartDate, setBusinessStartDate] = useState(`${year}-01-01`);
  const [saving, setSaving] = useState(false);
  const proportionalBase = proportionalLimitBase(row.register.typ);
  const proportionalResult = proportionalBase ? calculateProportionalLimit(proportionalBase, businessStartDate, year) : null;

  async function saveDetails() {
    setSaving(true);
    const registerResult = await updateLimitRegister(row.register.id, {
      limit_roczny: parseAmount(annualLimit),
      uwagi: notes.trim() || null,
    });

    if (registerResult.error) {
      setSaving(false);
      alert(registerResult.error.message);
      return;
    }

    for (let month = 1; month <= 12; month += 1) {
      const amount = parseAmount(monthValues[month] || "0");
      const result = await upsertMonthlyLimitAmount(row.register.id, year, month, amount);
      if (result.error) {
        setSaving(false);
        alert(result.error.message);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <section>
      <div style={sectionHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>{row.client?.nazwa || "Klient bez nazwy"}</h2>
          <p style={sectionHintStyle}>{activeTabLabel(row.register.typ)} · {year} · {row.client?.nip || "Brak NIP"}</p>
        </div>
        <button type="button" onClick={() => void saveDetails()} disabled={saving} style={primaryButtonStyle}>
          <Save size={18} /> {saving ? "Zapisywanie..." : "Zapisz"}
        </button>
      </div>

      <div style={detailsBodyStyle}>
        <div style={annualGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Limit roczny</span>
            <input value={annualLimit} onChange={(event) => setAnnualLimit(event.target.value)} inputMode="decimal" style={inputStyle} />
          </label>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Uwagi</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} style={inputStyle} />
          </label>
        </div>

        {proportionalBase && proportionalResult && (
          <div style={proportionalBoxStyle}>
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Rozpoczęcie działalności w roku</span>
              <input type="date" value={businessStartDate} onChange={(event) => setBusinessStartDate(event.target.value)} style={inputStyle} />
            </label>
            <div style={proportionalInfoStyle}>
              <strong>{formatMoney(proportionalResult.amount)}</strong>
              <span>{proportionalBase.toLocaleString("pl-PL")} zł / 365 × {proportionalResult.days} dni</span>
            </div>
            <button type="button" onClick={() => setAnnualLimit(String(proportionalResult.amount.toFixed(2)))} style={secondaryButtonStyle}>
              Ustaw wyliczony limit
            </button>
          </div>
        )}

        <div style={monthGridStyle}>
          {MONTHS.map((monthName, index) => {
            const month = index + 1;
            return (
              <label key={month} style={monthFieldStyle}>
                <span style={fieldLabelStyle}>{monthName}</span>
                <input
                  value={monthValues[month] || ""}
                  onChange={(event) => setMonthValues((values) => ({ ...values, [month]: event.target.value }))}
                  inputMode="decimal"
                  style={inputStyle}
                />
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div style={progressTrackStyle}>
      <div style={{ ...progressFillStyle, width: `${width}%`, background: progressColor(percent) }} />
    </div>
  );
}

function buildRows(type: LimitType, clients: Client[], registers: LimitRegisterRecord[], monthlyRecords: LimitMonthlyRecord[]) {
  return registers
    .filter((register) => register.typ === type)
    .map((register) => ({
      register,
      client: clients.find((client) => client.id === register.klient_id) || null,
      monthly: monthlyRecords.filter((month) => month.limit_id === register.id),
    }))
    .sort((first, second) => String(first.client?.nazwa || "").localeCompare(String(second.client?.nazwa || ""), "pl"));
}

function calculateUsage(register: LimitRegisterRecord, monthly: LimitMonthlyRecord[]) {
  const limit = toNumber(register.limit_roczny);
  const used = monthly.reduce((sum, item) => sum + toNumber(item.kwota), 0);
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  return { percent };
}

function monthValueMap(monthly: LimitMonthlyRecord[]) {
  return Object.fromEntries(MONTHS.map((_, index) => {
    const month = index + 1;
    const record = monthly.find((item) => item.miesiac === month);
    return [month, record ? String(toNumber(record.kwota)) : ""];
  }));
}

function activeTabLabel(type: LimitType) {
  return LIMIT_TABS.find((tab) => tab.value === type)?.label || type;
}

function registerHint(type: LimitType) {
  if (type === "vat") return "Klienci zwolnieni z VAT są dodawani automatycznie. Szczegóły służą do uzupełnienia miesięcy.";
  if (type === "wnt") return "Klienci bez VAT i z rejestracją VAT-UE są dodawani automatycznie. Szczegóły służą do uzupełnienia limitu i miesięcy.";
  return "Lista klientów dodanych do tego limitu. Szczegóły służą do uzupełnienia limitu rocznego i miesięcy.";
}

function emptyRegisterText(type: LimitType) {
  if (type === "vat") return "Brak klientów zwolnionych z VAT.";
  if (type === "wnt") return "Brak klientów bez VAT z rejestracją VAT-UE.";
  return "Brak klientów w tym limicie. Dodaj pierwszego klienta przyciskiem powyżej.";
}

function caregiverLabel(client: Client | null) {
  const profile = Array.isArray(client?.profiles) ? client?.profiles[0] : client?.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseAmount(value: string) {
  return toNumber(value);
}

function proportionalLimitBase(type: LimitType) {
  if (type === "vat") return 240000;
  if (type === "kasa_fiskalna") return 20000;
  return null;
}

function calculateProportionalLimit(base: number, startDate: string, year: number) {
  const start = new Date(`${startDate}T00:00:00`);
  const yearStart = new Date(`${year}-01-01T00:00:00`);
  const yearEnd = new Date(`${year}-12-31T00:00:00`);

  if (Number.isNaN(start.getTime())) return { days: 365, amount: base };

  const effectiveStart = start < yearStart ? yearStart : start > yearEnd ? yearEnd : start;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((yearEnd.getTime() - effectiveStart.getTime()) / millisecondsPerDay) + 1;
  const amount = Math.round(((base / 365) * days) * 100) / 100;
  return { days, amount };
}

function formatMoney(value: number) {
  return value.toLocaleString("pl-PL", { style: "currency", currency: "PLN" });
}

function progressColor(percent: number) {
  if (percent >= 100) return colors.danger;
  if (percent >= 80) return colors.warning;
  return colors.success;
}

const pageStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { margin: "0 0 8px", fontSize: "13px", fontWeight: 850, letterSpacing: "0.08em", color: colors.red, textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, fontSize: "34px", lineHeight: 1.15, color: colors.navy };
const yearBoxStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.card, padding: "10px 12px" };
const yearLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const yearInputStyle: CSSProperties = { width: "92px", minHeight: "38px", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "0 10px", color: colors.navy, fontWeight: 850 };
const tabsStyle: CSSProperties = { display: "flex", gap: "10px", flexWrap: "wrap" };
const tabStyle: CSSProperties = { minHeight: "42px", padding: "0 18px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.card, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const activeTabStyle: CSSProperties = { ...tabStyle, background: colors.navy, color: colors.white, borderColor: colors.navy };
const layoutStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(420px, 0.95fr) minmax(560px, 1.25fr)", gap: "18px", alignItems: "start" };
const cardStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, boxShadow: shadow.card, overflow: "hidden" };
const sectionHeaderStyle: CSSProperties = { padding: "22px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start" };
const sectionTitleStyle: CSSProperties = { margin: 0, fontSize: "22px", color: colors.navy };
const sectionHintStyle: CSSProperties = { margin: "6px 0 0", color: colors.muted, fontSize: "14px" };
const primaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 16px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer" };
const smallPrimaryButtonStyle: CSSProperties = { ...primaryButtonStyle, minHeight: "40px" };
const addFormStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", padding: "14px 24px", borderBottom: `1px solid ${colors.border}`, background: colors.inputBackground };
const selectStyle: CSSProperties = { minHeight: "40px", border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "0 12px", color: colors.navy, fontWeight: 750, background: colors.white };
const emptyStyle: CSSProperties = { margin: 0, padding: "28px 24px", color: colors.muted, fontWeight: 750 };
const listStyle: CSSProperties = { display: "flex", flexDirection: "column" };
const rowStyle: CSSProperties = { width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${colors.border}`, background: colors.card, padding: "16px 20px", cursor: "pointer" };
const activeRowStyle: CSSProperties = { ...rowStyle, background: "rgba(23, 59, 115, 0.06)" };
const rowTopStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "14px", marginBottom: "12px" };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "15px", lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.muted, fontSize: "12px", fontWeight: 750 };
const percentStyle: CSSProperties = { color: colors.navy, fontSize: "18px" };
const progressTrackStyle: CSSProperties = { width: "100%", height: "10px", borderRadius: radius.badge, background: "rgba(100, 116, 139, 0.16)", overflow: "hidden" };
const progressFillStyle: CSSProperties = { height: "100%", borderRadius: radius.badge, transition: "width 0.2s ease" };
const detailsBodyStyle: CSSProperties = { padding: "22px 24px", display: "flex", flexDirection: "column", gap: "18px" };
const annualGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "220px 1fr", gap: "12px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px" };
const fieldLabelStyle: CSSProperties = { color: colors.muted, fontSize: "12px", fontWeight: 850, textTransform: "uppercase" };
const inputStyle: CSSProperties = { minHeight: "42px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.text, padding: "0 12px", fontSize: "14px", fontWeight: 750 };
const proportionalBoxStyle: CSSProperties = { display: "grid", gridTemplateColumns: "220px 1fr auto", gap: "12px", alignItems: "end", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "14px" };
const proportionalInfoStyle: CSSProperties = { minHeight: "42px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", color: colors.muted, fontSize: "12px", fontWeight: 800 };
const secondaryButtonStyle: CSSProperties = { minHeight: "42px", padding: "0 14px", borderRadius: radius.button, border: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 850, cursor: "pointer" };
const monthGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" };
const monthFieldStyle: CSSProperties = { ...fieldStyle, border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "12px" };
