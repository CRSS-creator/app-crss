"use client";

import { useState } from "react";
import { WalletCards, FileText, ReceiptText, Save, Search } from "lucide-react";
import { colors } from "@/app/design";
import CfoDateField from "./CfoDateField";
import * as ui from "./cfoStyles";
import Link from "next/link";
import CfoPayrollSettlement from "./CfoPayrollSettlement";
import CfoManualCashflows from "./CfoManualCashflows";
import CfoAnnualSchedules from "./CfoAnnualSchedules";
import { OBLIGATION_TYPES, businessDate, type CashflowSnapshot, type CfoObligation } from "@/lib/cfoCashflow";
import { saveObligation } from "@/lib/cfoCashflowService";
import { updateCfoCost } from "@/lib/cfoService";

const money = (n: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
function costMonthLabel(date: string) {
  const [year, month] = date.slice(0, 7).split("-");
  return year && month ? month + "." + year : "—";
}
function status(paid: string | null | undefined, due: string | null | undefined) {
  return paid ? "Zapłacone" : due && due < businessDate() ? "Zaległe" : "Do zapłaty";
}

export default function CfoCashflowPanel({ snapshot, period, onUpdated }: {
  snapshot: CashflowSnapshot; period: string; onUpdated: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Omit<CfoObligation, "id"> & { id?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showPaid, setShowPaid] = useState(false);
  const change = (row: Omit<CfoObligation, "id"> & { id?: string }, patch: Partial<CfoObligation>) => {
    setDrafts(current => ({ ...current, [period + row.typ]: { ...row, ...patch } }));
  };
  async function save(row: Omit<CfoObligation, "id"> & { id?: string }) {
    if (!Number.isFinite(Number(row.kwota)) || Number(row.kwota) < 0) return setError("Podaj poprawną kwotę.");
    setSaving(true); setError("");
    try {
      const result = await saveObligation(row);
      if (result.error) return setError("Nie udało się zapisać zobowiązania: " + result.error.message);
      setDrafts(current => { const next = { ...current }; delete next[period + row.typ]; return next; });
      await onUpdated();
    } finally { setSaving(false); }
  }
  async function costDate(id: string, field: "data_zaplaty", date: string) {
    setSaving(true); setError("");
    try {
      const result = await updateCfoCost(id, { [field]: date || null });
      if (result.error) return setError("Nie udało się zapisać daty: " + result.error.message);
      await onUpdated();
    } finally { setSaving(false); }
  }
  const matches = (label: string) => label.toLocaleLowerCase("pl").includes(search.toLocaleLowerCase("pl"));
  const invoices = snapshot.invoices.filter(i => matches(`${i.numer || ""} ${i.kontrahent_nazwa || ""}`) && (showPaid || i.status !== "oplacona"));
  const costs = snapshot.costs.filter(c => !c.ignoruj && !c.rozliczenie_wynagrodzen_okres && matches(`${c.numer_dokumentu || ""} ${c.kontrahent}`) && (showPaid || !c.data_zaplaty));
  return <div style={{ display: "grid", gap: "18px" }}>
    <CfoManualCashflows key={period} period={period} rows={snapshot.manualFlows || []} onUpdated={onUpdated} />
    <CfoAnnualSchedules snapshot={snapshot} onUpdated={onUpdated} />
    {error && <div role="alert" style={ui.error}>{error}</div>}
    <section style={ui.panel}>
      <header style={ui.header}><div style={ui.titleGroup}><WalletCards size={21} color={colors.red} /><h2 style={ui.title}>Rozliczenie wynagrodzeń i podatków</h2></div><span style={ui.badge}>{period}</span></header>
      <p style={ui.text}>Wybierz miesiąc, którego dotyczą wynagrodzenia. Podaj rzeczywisty podział na przelewy netto, ZUS i PIT oraz ich terminy i daty zapłaty. ZUS obejmuje całą płatność. VAT i CIT rozliczasz osobno.</p>
      <CfoPayrollSettlement snapshot={snapshot} period={period} onUpdated={onUpdated} />
      <div style={{ overflowX: "auto" }}><table style={{ ...ui.table, minWidth: "900px" }}>
        <thead><tr>{["Rodzaj", "Kwota (zł)", "Termin płatności", "Data zapłaty", "Status", ""].map((h, i) => <th key={i} style={ui.th}>{h}</th>)}</tr></thead>
        <tbody>{OBLIGATION_TYPES.filter(kind => kind.value !== "wynagrodzenie_prezesa_netto" && kind.value !== "potracenia").map(kind => {
          const row = drafts[period + kind.value] || snapshot.obligations.find(o => o.okres.slice(0, 7) === period && o.typ === kind.value)
            || { okres: period + "-01", typ: kind.value, kwota: 0, termin_platnosci: null, data_zaplaty: null };
          const stored = snapshot.obligations.some(o => o.okres.slice(0, 7) === period && o.typ === kind.value);
          const label = !stored ? "Brak danych" : Number(row.kwota) === 0 ? "Brak zobowiązania" : status(row.data_zaplaty, row.termin_platnosci);
          return <tr key={kind.value}>
            <td style={{ ...ui.td, fontWeight: 650, whiteSpace: "nowrap" }}>{kind.label}</td>
            <td style={{ ...ui.td, width: "130px" }}><input aria-label={"Kwota " + kind.label} style={{ ...ui.compactInput, textAlign: "right" }} type="number" min="0" step="0.01" value={row.kwota} disabled={saving} onChange={e => change(row, { kwota: Number(e.target.value) })} /></td>
            <td style={{ ...ui.td, minWidth: "175px" }}><CfoDateField ariaLabel={"Termin " + kind.label} compact value={row.termin_platnosci || ""} disabled={saving} onChange={value => change(row, { termin_platnosci: value || null })} /></td>
            <td style={{ ...ui.td, minWidth: "175px" }}><CfoDateField ariaLabel={"Zapłata " + kind.label} compact max={businessDate()} value={row.data_zaplaty || ""} disabled={saving} onChange={value => change(row, { data_zaplaty: value || null })} /></td>
            <td style={ui.td}><span style={{ ...ui.badge, ...(label === "Zapłacone" ? { color: colors.success, background: "rgba(22,163,74,0.08)" } : label === "Zaległe" ? { color: colors.danger, background: "rgba(220,38,38,0.06)" } : {}) }}>{label}</span></td>
            <td style={ui.td}><button type="button" disabled={saving} style={ui.smallButton} onClick={() => void save(row)}><Save size={14} />Zapisz</button></td>
          </tr>;
        })}</tbody>
      </table></div>
      <details style={ui.details}><summary style={ui.summary}>Jak te kwoty wpływają na Budżet?</summary><p style={{ ...ui.text, margin: "10px 0 0" }}>Budżet powtarza ostatnią zapisaną kwotę i termin osobno dla każdego rodzaju. Zapis konkretnego miesiąca zastępuje tę prognozę. Kwota 0 oznacza brak zobowiązania. Powiązane koszty wynagrodzeń są uwzględniane w wyniku CFO, a ich przepływy pochodzą wyłącznie z tego rozliczenia. Pełny koszt dokumentu nie jest ponownie dodawany do płatności.</p></details>
    </section>
    <section style={ui.panel}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "14px", marginBottom: "22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: "1 1 280px" }}><Search size={17} color={colors.muted} /><input style={ui.input} placeholder="Szukaj dokumentu lub kontrahenta…" aria-label="Szukaj rozrachunków" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: colors.navy, fontSize: "13px", fontWeight: 650, cursor: "pointer" }}><input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} />Pokaż również zapłacone</label>
      </div>
      <header style={ui.header}><div style={ui.titleGroup}><FileText size={21} color={colors.red} /><h2 style={ui.title}>Należności z faktur</h2></div><Link href="/faktury" style={{ ...ui.smallButton, textDecoration: "none" }}>Przejdź do Faktur</Link></header>
      <p style={ui.text}>Statusy i daty wpłat pochodzą z Faktur. Uzupełnij brakujące daty przy opłaconych dokumentach, aby uwzględnić je w historii płatności.</p>
      <div style={{ overflowX: "auto" }}><table style={{ ...ui.table, minWidth: "620px" }}><thead><tr>{["Faktura", "Klient", "Brutto", "Termin", "Zapłata", "Status"].map(h => <th key={h} style={ui.th}>{h}</th>)}</tr></thead>
        <tbody>{invoices.length === 0 && <tr><td colSpan={6} style={{ ...ui.td, textAlign: "center", color: colors.muted, padding: "24px" }}>Brak faktur dla wybranych filtrów.</td></tr>}{invoices.map(i => <tr key={i.id}><td style={{ ...ui.td, fontWeight: 650 }}>{i.numer || "—"}</td><td style={ui.td}>{i.kontrahent_nazwa}</td><td style={{ ...ui.td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{new Intl.NumberFormat("pl-PL", { style: "currency", currency: i.waluta || "PLN" }).format(Number(i.kwota_brutto))}</td><td style={ui.td}>{ui.dateLabel(i.termin_platnosci)}</td><td style={ui.td}>{ui.dateLabel(i.data_zaplaty)}</td><td style={ui.td}><span style={ui.badge}>{i.status === "oplacona" ? "Zapłacona" : i.status === "przeterminowana" ? "Zaległa" : status(null, i.termin_platnosci)}</span></td></tr>)}</tbody>
      </table></div>
      <header style={{ ...ui.header, marginTop: "28px" }}><div style={ui.titleGroup}><ReceiptText size={21} color={colors.red} /><h2 style={ui.title}>Faktury kosztowe</h2></div></header>
      <p style={ui.text}>Wpisz faktyczną datę pełnej zapłaty. Dokumenty i kategorie edytujesz w zakładce Koszty.</p>
      <div style={{ overflowX: "auto" }}><table style={{ ...ui.table, minWidth: "900px" }}><thead><tr>{["Dokument", "Data dokumentu", "Miesiąc przypisania kosztu", "Dostawca", "Brutto", "Data zapłaty", "Status"].map(h => <th key={h} style={ui.th}>{h}</th>)}</tr></thead>
        <tbody>{costs.length === 0 && <tr><td colSpan={7} style={{ ...ui.td, textAlign: "center", color: colors.muted, padding: "24px" }}>Brak kosztów dla wybranych filtrów.</td></tr>}{costs.map(c => <tr key={c.id}><td style={{ ...ui.td, fontWeight: 650 }}>{c.numer_dokumentu || "—"}</td><td style={{ ...ui.td, whiteSpace: "nowrap" }}>{ui.dateLabel(c.data_dokumentu)}</td><td style={{ ...ui.td, whiteSpace: "nowrap" }}>{costMonthLabel(c.okres_start)}{c.okres_end.slice(0, 7) !== c.okres_start.slice(0, 7) ? " – " + costMonthLabel(c.okres_end) : ""}</td><td style={ui.td}>{c.kontrahent}</td><td style={{ ...ui.td, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money(Number(c.kwota_brutto ?? c.kwota_netto_cfo))}</td><td style={{ ...ui.td, minWidth: "180px" }}><CfoDateField ariaLabel={"Zapłata " + (c.numer_dokumentu || c.kontrahent)} compact max={businessDate()} disabled={saving} value={c.data_zaplaty || ""} onChange={value => void costDate(c.id, "data_zaplaty", value)} /></td><td style={ui.td}><span style={ui.badge}>{c.data_zaplaty ? "Zapłacone" : "Brak daty zapłaty"}</span></td></tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
