"use client";

import { useState } from "react";
import { CalendarClock, Plus, Save, Pencil, Power, X } from "lucide-react";
import { colors } from "@/app/design";
import AppSelect from "./AppSelect";
import { AppMonthInput } from "./AppDateInputs";
import CfoDateField from "./CfoDateField";
import * as ui from "./cfoStyles";
import type { AnnualCostInput } from "@/lib/cfoAnnualCosts";
import { nextAnnualRenewal } from "@/lib/cfoAnnualCosts";
import type { CashflowSnapshot } from "@/lib/cfoCashflow";
import { businessDate, shiftDateMonth } from "@/lib/cfoCashflow";
import { saveAnnualSchedule } from "@/lib/cfoCashflowService";
import { type CfoCostCategory } from "@/lib/cfoService";

const categories: [CfoCostCategory, string][] = [
  ["koszty_zespolu", "Koszty zespołu"], ["lokal_infrastruktura", "Lokal i infrastruktura"],
  ["systemy_technologia", "Systemy i technologia"], ["marketing_sprzedaz", "Marketing i sprzedaż"],
  ["administracja_ogolne", "Administracja i ogólne"], ["zarzad_wlasciciel", "Zarząd / właściciel"],
  ["jednorazowe_nadzwyczajne", "Jednorazowe i nadzwyczajne"],
];
const money = (n: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
function emptySchedule(): AnnualCostInput {
  const next = shiftDateMonth(businessDate(), 12);
  return { nazwa: "", kontrahent: "", kategoria: "systemy_technologia", podkategoria: null,
    kwota_netto: 0, kwota_brutto: 0, pierwszy_okres: next.slice(0, 7) + "-01", data_faktury: next,
    termin_platnosci: next, aktywny: true };
}

export default function CfoAnnualSchedules({ snapshot, onUpdated }: { snapshot: CashflowSnapshot; onUpdated: () => Promise<void> }) {
  const [draft, setDraft] = useState<AnnualCostInput | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const schedules = snapshot.annualSchedules || [];
  const change = (patch: Partial<AnnualCostInput>) => setDraft(current => current ? { ...current, ...patch } : current);
  function source(id: string) {
    setSourceId(id);
    const cost = snapshot.costs.find(c => c.id === id);
    if (!cost) { setDraft(emptySchedule()); return; }
    const paymentBase = cost.termin_platnosci || cost.data_zaplaty || cost.data_dokumentu || cost.okres_start;
    let offset = 12;
    while (shiftDateMonth(paymentBase, offset) <= businessDate()) offset += 12;
    const issue = shiftDateMonth(cost.data_dokumentu || cost.okres_start, offset);
    setDraft({ nazwa: cost.opis || cost.kontrahent, kontrahent: cost.kontrahent, kategoria: cost.kategoria,
      podkategoria: cost.podkategoria, kwota_netto: Number(cost.kwota_netto_cfo), kwota_brutto: Number(cost.kwota_brutto ?? cost.kwota_netto_cfo),
      pierwszy_okres: shiftDateMonth(cost.okres_start, offset).slice(0, 7) + "-01", data_faktury: issue,
      termin_platnosci: shiftDateMonth(paymentBase, offset), aktywny: true });
  }
  async function save(row: AnnualCostInput, sourceCostId?: string) {
    if (!row.nazwa.trim() || !row.kontrahent.trim() || !row.pierwszy_okres || !row.data_faktury || !row.termin_platnosci
      || !Number.isFinite(Number(row.kwota_netto)) || !Number.isFinite(Number(row.kwota_brutto))
      || Number(row.kwota_netto) < 0 || Number(row.kwota_brutto) < Number(row.kwota_netto)) {
      setError("Uzupełnij nazwę, dostawcę, daty i poprawne kwoty netto oraz brutto."); return;
    }
    setBusy(true); setError("");
    try {
      const result = await saveAnnualSchedule(row, sourceCostId);
      if (result.error) { setError("Nie udało się zapisać harmonogramu: " + result.error.message); return; }
      setDraft(null); setSourceId(""); await onUpdated();
    } finally { setBusy(false); }
  }
  return <section style={ui.panel}>
    <header style={ui.header}>
      <div style={ui.titleGroup}><CalendarClock size={21} color={colors.red} /><h2 style={ui.title}>Harmonogram kosztów rocznych</h2></div>
      <button type="button" style={ui.primaryButton} disabled={busy} onClick={() => { setDraft(emptySchedule()); setSourceId(""); }}><Plus size={16} />Dodaj harmonogram</button>
    </header>
    <p style={ui.text}>Koszt rozliczany przez 12 miesięcy, płatność raz w roku. Zaimportowana i powiązana faktura zastępuje prognozę odnowienia.</p>
    {error && <div role="alert" style={ui.error}>{error}</div>}
    {schedules.length === 0 && !draft ? <div style={ui.empty}>Brak harmonogramów. Dodaj pierwszy koszt roczny lub utwórz harmonogram na podstawie istniejącej faktury.</div> : schedules.length > 0 && <div style={{ overflowX: "auto" }}><table style={ui.table}><thead><tr>{["Koszt / dostawca", "Netto / rok", "Brutto / płatność", "Pierwszy okres", "Kolejna faktura / termin", "Stan", ""].map((h, i) => <th style={ui.th} key={i}>{h}</th>)}</tr></thead>
      <tbody>{schedules.map(row => { const next = nextAnnualRenewal(row, snapshot.costs, businessDate()); return <tr key={row.id}>
        <td style={ui.td}><strong>{row.nazwa}</strong><br /><small style={{ color: colors.muted }}>{row.kontrahent}</small></td><td style={ui.td}>{money(Number(row.kwota_netto))}<br /><small style={{ color: colors.muted }}>{money(Number(row.kwota_netto) / 12)} / miesiąc</small></td>
        <td style={ui.td}>{money(Number(row.kwota_brutto))}</td><td style={ui.td}>{row.pierwszy_okres.slice(0, 7)}</td><td style={ui.td}>{ui.dateLabel(next?.issue)}<br />{ui.dateLabel(next?.due)}</td>
        <td style={ui.td}><span style={{ ...ui.badge, ...(row.aktywny ? { color: colors.success, background: "rgba(22,163,74,0.08)" } : {}) }}>{row.aktywny ? "Aktywny" : "Wyłączony"}</span></td><td style={ui.td}><div style={ui.actions}><button type="button" style={ui.smallButton} disabled={busy} onClick={() => { setDraft({ ...row }); setSourceId(""); }}><Pencil size={14} />Edytuj</button><button type="button" style={ui.smallButton} disabled={busy} onClick={() => void save({ ...row, aktywny: !row.aktywny })}><Power size={14} />{row.aktywny ? "Wyłącz" : "Włącz"}</button></div></td>
      </tr>; })}</tbody>
    </table></div>}
    {draft && <form onSubmit={event => { event.preventDefault(); void save(draft, sourceId || undefined); }} style={ui.form}>
      <div style={{ ...ui.header, marginBottom: 0 }}><h3 style={{ ...ui.title, fontSize: "18px" }}>{draft.id ? "Edytuj harmonogram" : "Nowy harmonogram"}</h3><span style={ui.badge}>Odnowienie co 12 miesięcy</span></div>
      {!draft.id && <label style={ui.field}><span>Na podstawie istniejącego kosztu</span><AppSelect style={ui.input} labelStyle={{ fontSize: "13px", fontWeight: 600 }} disabled={busy} value={sourceId} searchable searchPlaceholder="Szukaj dostawcy lub numeru faktury…" onChange={source} options={[{ value: "", label: "Nowy koszt — uzupełnij samodzielnie" }, ...snapshot.costs.filter(c => !c.ignoruj && !c.harmonogram_id && !c.rozliczenie_wynagrodzen_okres).map(c => ({ value: c.id, label: c.kontrahent + " — " + (c.numer_dokumentu || c.opis || c.data_dokumentu || "Bez numeru") }))]} /></label>}
      <section><h4 style={ui.groupTitle}>Dane kosztu</h4><div style={ui.fieldGrid}>
        <label style={ui.field}>Nazwa kosztu<input style={ui.input} required disabled={busy} placeholder="Np. roczna licencja programu" value={draft.nazwa} onChange={e => change({ nazwa: e.target.value })} /></label>
        <label style={ui.field}>Dostawca<input style={ui.input} required disabled={busy} value={draft.kontrahent} onChange={e => change({ kontrahent: e.target.value })} /></label>
        <label style={ui.field}><span>Kategoria</span><AppSelect style={ui.input} labelStyle={{ fontSize: "13px", fontWeight: 600 }} disabled={busy} value={draft.kategoria} onChange={value => change({ kategoria: value as CfoCostCategory, podkategoria: null })} options={categories.map(([value, label]) => ({ value, label }))} /></label>
        <label style={ui.field}>Podkategoria<input style={ui.input} disabled={busy} placeholder="Opcjonalnie" value={draft.podkategoria || ""} onChange={e => change({ podkategoria: e.target.value || null })} /></label>
      </div></section>
      <section><h4 style={ui.groupTitle}>Kwoty za rok</h4><div style={ui.fieldGrid}>
        <label style={ui.field}>Netto (zł)<input style={ui.input} type="number" min="0" step="0.01" required disabled={busy} value={draft.kwota_netto} onChange={e => change({ kwota_netto: Number(e.target.value) })} /></label>
        <label style={ui.field}>Brutto do zapłaty (zł)<input style={ui.input} type="number" min={draft.kwota_netto} step="0.01" required disabled={busy} value={draft.kwota_brutto} onChange={e => change({ kwota_brutto: Number(e.target.value) })} /></label>
      </div><p style={{ ...ui.text, margin: "10px 0 0" }}>Miesięczny koszt netto: <strong style={{ color: colors.navy }}>{money(Number(draft.kwota_netto) / 12)}</strong></p></section>
      <section><h4 style={ui.groupTitle}>Terminy odnowienia</h4><div style={ui.dateGrid}>
        <label style={ui.field}><span>Początek okresu usługi</span><AppMonthInput ariaLabel="Początek okresu usługi" style={ui.input} disabled={busy} value={draft.pierwszy_okres.slice(0, 7)} onChange={value => change({ pierwszy_okres: value ? value + "-01" : "" })} /></label>
        <label style={ui.field}><span>Data faktury</span><CfoDateField ariaLabel="Data faktury za pierwsze odnowienie" disabled={busy} value={draft.data_faktury} onChange={value => change({ data_faktury: value })} /></label>
        <label style={ui.field}><span>Termin płatności</span><CfoDateField ariaLabel="Termin płatności za pierwsze odnowienie" disabled={busy} value={draft.termin_platnosci} onChange={value => change({ termin_platnosci: value })} /></label>
      </div></section>
      <p style={{ ...ui.text, margin: 0 }}>Daty powtarzają się co rok. Dokument źródłowy zostanie rozliczony w kosztach przez 12 miesięcy.</p>
      <footer style={ui.footer}><button style={{ ...ui.primaryButton, opacity: busy ? 0.6 : 1 }} disabled={busy} type="submit"><Save size={16} />{busy ? "Zapisywanie…" : "Zapisz harmonogram"}</button><button type="button" style={ui.secondaryButton} disabled={busy} onClick={() => setDraft(null)}><X size={16} />Anuluj</button></footer>
    </form>}
  </section>;
}
