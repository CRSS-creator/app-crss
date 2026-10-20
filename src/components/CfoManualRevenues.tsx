"use client";

import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import AppSelect from "./AppSelect";
import { AppMonthInput } from "./AppDateInputs";
import CfoDateField from "./CfoDateField";
import * as ui from "./cfoStyles";
import { businessDate } from "@/lib/cfoCashflow";
import type { ManualRevenue, ManualRevenueInput } from "@/lib/cfoManualRevenue";
import { saveManualRevenue, deleteManualRevenue } from "@/lib/cfoCashflowService";

const empty = (period: string): ManualRevenueInput => ({ opis: "", zrodlo: "", rodzaj: "dotacja", okres: period + "-01", data_dokumentu: businessDate(), numer_dokumentu: null, kwota_netto: 0, kwota_brutto: 0, termin_wplywu: null, data_wplywu: null });
const money = (value: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value);
export default function CfoManualRevenues({ rows, period, onUpdated }: { rows: ManualRevenue[]; period: string; onUpdated: () => Promise<void> }) {
  const [draft, setDraft] = useState(() => empty(period));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setDraft(empty(period)); setOpen(false); setError(""); }, [period]);
  async function save() {
    if (!draft.opis.trim() || !draft.zrodlo.trim() || !draft.data_dokumentu) return setError("Uzupełnij opis, źródło i datę dokumentu.");
    if (!Number.isFinite(draft.kwota_netto) || !Number.isFinite(draft.kwota_brutto) || draft.kwota_netto <= 0 || draft.kwota_brutto < draft.kwota_netto) return setError("Podaj dodatnią kwotę netto i kwotę wpływu nie mniejszą od netto.");
    if (draft.data_wplywu && draft.data_wplywu > businessDate()) return setError("Faktyczna data wpływu nie może być w przyszłości.");
    setSaving(true); setError("");
    try {
      const result = await saveManualRevenue({ ...draft, opis: draft.opis.trim(), zrodlo: draft.zrodlo.trim(), numer_dokumentu: draft.numer_dokumentu?.trim() || null });
      if (result.error) return setError("Nie udało się zapisać przychodu: " + result.error.message);
      setDraft(empty(period)); setOpen(false); await onUpdated();
    } catch { setError("Nie udało się zapisać przychodu. Spróbuj ponownie."); }
    finally { setSaving(false); }
  }
  async function remove(row: ManualRevenue) {
    if (!confirm(`Usunąć ręczny przychód „${row.opis}”?`)) return;
    setSaving(true); setError("");
    try { const result = await deleteManualRevenue(row.id); if (result.error) setError("Nie udało się usunąć przychodu."); else { if (draft.id === row.id) { setDraft(empty(period)); setOpen(false); } await onUpdated(); } }
    catch { setError("Nie udało się usunąć przychodu."); } finally { setSaving(false); }
  }
  return <section style={ui.panel}>
    <header style={ui.header}><h2 style={ui.title}>Przychody ręczne</h2><button type="button" style={ui.smallButton} disabled={saving} onClick={() => { setDraft(empty(period)); setError(""); setOpen(true); }}><Plus size={16} />Dodaj przychód</button></header>
    <p style={ui.text}>Dotacje i inne przychody bez faktury. Wpisz miesiąc ujęcia w wyniku i osobno datę wpływu pieniędzy. Nie dodawaj tu przychodu, który jest już w Fakturach. Kwoty w PLN; przy dotacji bez VAT netto i wpływ są takie same.</p>
    {error && <p role="alert" style={ui.error}>{error}</p>}
    {open && <div style={ui.form}>
      <div style={ui.fieldGrid}>
        <label style={ui.field}>Opis<input style={ui.input} disabled={saving} value={draft.opis} onChange={e => setDraft({ ...draft, opis: e.target.value })} /></label>
        <label style={ui.field}>Źródło / podmiot przekazujący<input style={ui.input} disabled={saving} value={draft.zrodlo} onChange={e => setDraft({ ...draft, zrodlo: e.target.value })} /></label>
        <label style={ui.field}>Rodzaj<AppSelect disabled={saving} value={draft.rodzaj} options={[{ value: "dotacja", label: "Dotacja" }, { value: "pozostale", label: "Pozostałe" }]} onChange={value => setDraft({ ...draft, rodzaj: value as ManualRevenue["rodzaj"] })} /></label>
        <label style={ui.field}>Miesiąc ujęcia<AppMonthInput disabled={saving} value={draft.okres.slice(0, 7)} onChange={value => setDraft({ ...draft, okres: value + "-01" })} /></label>
        <label style={ui.field}>Kwota netto (PLN)<input style={ui.input} disabled={saving} type="number" min="0.01" step="0.01" value={draft.kwota_netto} onChange={e => { const value = Number(e.target.value); setDraft({ ...draft, kwota_netto: value, kwota_brutto: draft.kwota_brutto === draft.kwota_netto ? value : draft.kwota_brutto }); }} /></label>
        <label style={ui.field}>Kwota wpływu (PLN)<input style={ui.input} disabled={saving} type="number" min="0.01" step="0.01" value={draft.kwota_brutto} onChange={e => setDraft({ ...draft, kwota_brutto: Number(e.target.value) })} /></label>
        <label style={ui.field}>Numer dokumentu (opcjonalnie)<input style={ui.input} disabled={saving} value={draft.numer_dokumentu || ""} onChange={e => setDraft({ ...draft, numer_dokumentu: e.target.value })} /></label>
      </div>
      <div style={ui.dateGrid}>
        <label style={ui.field}>Data dokumentu<CfoDateField ariaLabel="Data dokumentu przychodu" disabled={saving} value={draft.data_dokumentu} onChange={value => setDraft({ ...draft, data_dokumentu: value })} /></label>
        <label style={ui.field}>Planowany termin wpływu<CfoDateField ariaLabel="Termin wpływu przychodu" disabled={saving} value={draft.termin_wplywu || ""} onChange={value => setDraft({ ...draft, termin_wplywu: value || null })} /></label>
        <label style={ui.field}>Faktyczna data wpływu<CfoDateField ariaLabel="Faktyczna data wpływu przychodu" disabled={saving} max={businessDate()} value={draft.data_wplywu || ""} onChange={value => setDraft({ ...draft, data_wplywu: value || null })} /></label>
      </div>
      <div style={ui.actions}><button type="button" disabled={saving} style={ui.primaryButton} onClick={() => void save()}><Save size={16} />Zapisz przychód</button><button type="button" disabled={saving} style={ui.smallButton} onClick={() => setOpen(false)}>Anuluj</button></div>
    </div>}
    <div style={{ overflowX: "auto", marginTop: 16 }}><table style={ui.table}><thead><tr>{["Opis / źródło", "Miesiąc", "Netto", "Kwota wpływu", "Termin", "Wpłynęło", ""].map((label, index) => <th key={index} style={ui.th}>{label}</th>)}</tr></thead>
      <tbody>{!rows.length && <tr><td colSpan={7} style={ui.td}>Brak ręcznych przychodów w wybranym zakresie.</td></tr>}{rows.map(row => <tr key={row.id}>
        <td style={ui.td}><strong>{row.opis}</strong><div>{row.zrodlo} · {row.rodzaj === "dotacja" ? "Dotacja" : "Pozostałe"}{row.numer_dokumentu ? " · " + row.numer_dokumentu : ""}</div></td><td style={ui.td}>{row.okres.slice(0, 7)}</td><td style={ui.td}>{money(Number(row.kwota_netto))}</td><td style={ui.td}>{money(Number(row.kwota_brutto))}</td><td style={ui.td}>{ui.dateLabel(row.termin_wplywu)}</td><td style={ui.td}>{ui.dateLabel(row.data_wplywu)}</td><td style={ui.td}><div style={ui.actions}><button type="button" disabled={saving} style={ui.smallButton} onClick={() => { setDraft({ ...row, kwota_netto: Number(row.kwota_netto), kwota_brutto: Number(row.kwota_brutto) }); setError(""); setOpen(true); }}>Edytuj</button><button type="button" disabled={saving} style={ui.smallButton} onClick={() => void remove(row)}>Usuń</button></div></td>
      </tr>)}</tbody></table></div>
  </section>;
}
