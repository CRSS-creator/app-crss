"use client";

import { useState, type CSSProperties } from "react";
import type { AnnualCostInput } from "@/lib/cfoAnnualCosts";
import { nextAnnualRenewal } from "@/lib/cfoAnnualCosts";
import type { CashflowSnapshot } from "@/lib/cfoCashflow";
import { businessDate, shiftDateMonth } from "@/lib/cfoCashflow";
import { saveAnnualSchedule } from "@/lib/cfoCashflowService";
import { updateCfoCost, type CfoCostCategory } from "@/lib/cfoService";

const categories: [CfoCostCategory, string][] = [
  ["koszty_zespolu", "Koszty zespołu"], ["lokal_infrastruktura", "Lokal i infrastruktura"],
  ["systemy_technologia", "Systemy i technologia"], ["marketing_sprzedaz", "Marketing i sprzedaż"],
  ["administracja_ogolne", "Administracja i ogólne"], ["zarzad_wlasciciel", "Zarząd / właściciel"],
  ["jednorazowe_nadzwyczajne", "Jednorazowe i nadzwyczajne"],
];
const box: CSSProperties = { background: "white", border: "1px solid #dce3eb", borderRadius: 18, padding: 20, marginBottom: 18 };
const input: CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, width: "100%", minWidth: 0 };
const cell: CSSProperties = { padding: "10px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" };
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
  async function link(costId: string, scheduleId: string) {
    setBusy(true); setError("");
    try {
      const result = await updateCfoCost(costId, { harmonogram_id: scheduleId || null });
      if (result.error) { setError("Nie udało się powiązać faktury: " + result.error.message); return; }
      await onUpdated();
    } finally { setBusy(false); }
  }
  return <section style={box}>
    <h2>Harmonogram kosztów rocznych</h2>
    <p>Odnowienie co 12 miesięcy: koszt netto rozłożony na rok, pełna płatność brutto w terminie. Kwoty możesz zmienić przed kolejnym odnowieniem. Wyłączenie harmonogramu zatrzymuje prognozę kolejnych odnowień.</p>
    <p>Nowa faktura zastępuje prognozę, gdy zgadzają się dostawca, kategoria, podkategoria, kwota brutto (różnica do 1%) i data wystawienia (do 45 dni). Przy zmianie ceny lub kilku możliwych dopasowaniach wskaż harmonogram ręcznie poniżej. Powiązana faktura jest rozliczana w kosztach przez 12 miesięcy.</p>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
    <button style={{ ...input, width: "auto" }} disabled={busy} onClick={() => { setDraft(emptySchedule()); setSourceId(""); }}>Dodaj harmonogram</button>
    <div style={{ overflowX: "auto" }}><table style={{ width: "100%" }}><thead><tr>{["Koszt / dostawca", "Netto / rok", "Brutto / płatność", "Pierwszy okres", "Kolejna faktura / termin", "Stan", ""].map((h, i) => <th style={cell} key={i}>{h}</th>)}</tr></thead>
      <tbody>{schedules.map(row => { const next = nextAnnualRenewal(row, snapshot.costs, businessDate()); return <tr key={row.id}>
        <td style={cell}>{row.nazwa}<br /><small>{row.kontrahent}</small></td><td style={cell}>{money(Number(row.kwota_netto))}<br /><small>{money(Number(row.kwota_netto) / 12)} / miesiąc</small></td>
        <td style={cell}>{money(Number(row.kwota_brutto))}</td><td style={cell}>{row.pierwszy_okres.slice(0, 7)}</td><td style={cell}>{next?.issue || "—"}<br />{next?.due || "—"}</td>
        <td style={cell}>{row.aktywny ? "Aktywny" : "Wyłączony"}</td><td style={cell}><button disabled={busy} onClick={() => { setDraft({ ...row }); setSourceId(""); }}>Edytuj</button> <button disabled={busy} onClick={() => void save({ ...row, aktywny: !row.aktywny })}>{row.aktywny ? "Wyłącz" : "Włącz"}</button></td>
      </tr>; })}</tbody>
    </table></div>
    {draft && <form onSubmit={event => { event.preventDefault(); void save(draft, sourceId || undefined); }} style={{ marginTop: 20 }}>
      {!draft.id && <label>Na podstawie kosztu (opcjonalnie)<select style={input} disabled={busy} value={sourceId} onChange={event => source(event.target.value)}><option value="">Nowy koszt</option>{snapshot.costs.filter(c => !c.ignoruj && !c.harmonogram_id).map(c => <option key={c.id} value={c.id}>{c.kontrahent} — {c.numer_dokumentu || c.opis || c.data_dokumentu}</option>)}</select></label>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginTop: 12 }}>
        <label>Nazwa kosztu<input style={input} required disabled={busy} value={draft.nazwa} onChange={e => change({ nazwa: e.target.value })} /></label>
        <label>Dostawca<input style={input} required disabled={busy} value={draft.kontrahent} onChange={e => change({ kontrahent: e.target.value })} /></label>
        <label>Kategoria<select style={input} disabled={busy} value={draft.kategoria} onChange={e => change({ kategoria: e.target.value as CfoCostCategory, podkategoria: null })}>{categories.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Podkategoria<input style={input} disabled={busy} value={draft.podkategoria || ""} onChange={e => change({ podkategoria: e.target.value || null })} /></label>
        <label>Netto za rok<input style={input} type="number" min="0" step="0.01" required disabled={busy} value={draft.kwota_netto} onChange={e => change({ kwota_netto: Number(e.target.value) })} /></label>
        <label>Brutto za płatność<input style={input} type="number" min={draft.kwota_netto} step="0.01" required disabled={busy} value={draft.kwota_brutto} onChange={e => change({ kwota_brutto: Number(e.target.value) })} /></label>
        <label>Pierwszy miesiąc nowego okresu usługi<input style={input} type="month" required disabled={busy} value={draft.pierwszy_okres.slice(0, 7)} onChange={e => change({ pierwszy_okres: e.target.value ? e.target.value + "-01" : "" })} /></label>
        <label>Data faktury za pierwsze odnowienie<input style={input} type="date" required disabled={busy} value={draft.data_faktury} onChange={e => change({ data_faktury: e.target.value })} /></label>
        <label>Termin płatności za pierwsze odnowienie<input style={input} type="date" required disabled={busy} value={draft.termin_platnosci} onChange={e => change({ termin_platnosci: e.target.value })} /></label>
      </div>
      <p>Harmonogram powtarza te daty co rok, bez przesuwania okresu kosztu na miesiąc zapłaty. Przy tworzeniu z dokumentu źródłowego ten dokument także zostanie rozłożony na 12 miesięcy.</p>
      <button style={{ ...input, width: "auto" }} disabled={busy} type="submit">Zapisz harmonogram</button> <button type="button" disabled={busy} onClick={() => setDraft(null)}>Anuluj</button>
    </form>}
    {schedules.length > 0 && <details style={{ marginTop: 18 }}><summary>Powiązania faktur kosztowych z harmonogramami</summary>
      <div style={{ overflowX: "auto", maxHeight: 400 }}><table style={{ width: "100%" }}><thead><tr><th style={cell}>Dokument</th><th style={cell}>Dostawca</th><th style={cell}>Harmonogram</th></tr></thead>
        <tbody>{snapshot.costs.filter(c => !c.ignoruj).map(c => <tr key={c.id}><td style={cell}>{c.numer_dokumentu || c.opis || "Bez numeru"}<br /><small>{c.okres_start} — {c.okres_end}</small></td><td style={cell}>{c.kontrahent}</td><td style={cell}><select style={input} aria-label={`Harmonogram ${c.numer_dokumentu || c.kontrahent}`} value={c.harmonogram_id || ""} disabled={busy} onChange={e => void link(c.id, e.target.value)}><option value="">Bez harmonogramu</option>{schedules.filter(s => s.aktywny || s.id === c.harmonogram_id).map(s => <option key={s.id} value={s.id}>{s.nazwa}</option>)}</select></td></tr>)}</tbody>
      </table></div>
    </details>}
  </section>;
}
