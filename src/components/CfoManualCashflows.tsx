"use client";

import { useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import AppSelect from "./AppSelect";
import CfoDateField from "./CfoDateField";
import * as ui from "./cfoStyles";
import { businessDate } from "@/lib/cfoCashflow";
import type { ManualCashflow, ManualCashflowInput } from "@/lib/cfoManualCashflow";
import { saveManualCashflow, deleteManualCashflow } from "@/lib/cfoCashflowService";

const empty = (): ManualCashflowInput => ({ opis: "", kierunek: "wydatek", kwota: 0, termin: businessDate(), data_realizacji: null });
const money = (value: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value);

export default function CfoManualCashflows({ rows, onUpdated }: { rows: ManualCashflow[]; onUpdated: () => Promise<void> }) {
  const [draft, setDraft] = useState<ManualCashflowInput>(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save() {
    if (lock.current) return;
    if (!draft.opis.trim() || !draft.termin) return setError("Uzupełnij opis i planowany termin.");
    if (!Number.isFinite(draft.kwota) || draft.kwota <= 0) return setError("Podaj dodatnią kwotę.");
    if (draft.data_realizacji && draft.data_realizacji > businessDate()) return setError("Data realizacji nie może być w przyszłości.");
    lock.current = true; setSaving(true); setError("");
    try {
      const result = await saveManualCashflow({ ...draft, opis: draft.opis.trim() });
      if (result.error) throw result.error;
      setOpen(false); setDraft(empty()); await onUpdated();
    } catch { setError("Nie udało się zapisać przepływu. Spróbuj ponownie."); }
    finally { lock.current = false; setSaving(false); }
  }
  async function remove(row: ManualCashflow) {
    if (lock.current || !window.confirm("Czy na pewno usunąć przepływ „" + row.opis + "”?")) return;
    lock.current = true; setSaving(true); setError("");
    try {
      const result = await deleteManualCashflow(row.id);
      if (result.error) throw result.error;
      if (draft.id === row.id) { setOpen(false); setDraft(empty()); }
      await onUpdated();
    } catch { setError("Nie udało się usunąć przepływu. Spróbuj ponownie."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <section style={ui.panel}>
    <header style={ui.header}><h2 style={ui.title}>Przepływy poza wynikiem</h2>
      <button type="button" style={ui.primaryButton} disabled={saving} onClick={() => { setDraft(empty()); setError(""); setOpen(true); }}><Plus size={16} />Dodaj przepływ</button>
    </header>
    <p style={ui.text}>Wpływy i wydatki, które nie są przychodem ani kosztem CFO, np. kapitał pożyczki lub wypłata dla właściciela. Kwoty w PLN. Termin uwzględniamy w prognozie, a datę realizacji w historii cashflow. Ten sam przelew wpisz tylko raz — nie dodawaj tu płatności już ujętej przy fakturze, koszcie lub przychodzie ręcznym.</p>
    {error && <p role="alert" style={ui.error}>{error}</p>}
    {open && <div style={ui.form}>
      <div style={ui.fieldGrid}>
        <label style={ui.field}>Opis<input style={ui.input} disabled={saving} value={draft.opis} onChange={e => setDraft({ ...draft, opis: e.target.value })} placeholder="Np. spłata kapitału pożyczki" /></label>
        <label style={ui.field}>Kierunek<AppSelect disabled={saving} value={draft.kierunek} options={[{ value: "wydatek", label: "Wydatek" }, { value: "wplyw", label: "Wpływ" }]} onChange={value => setDraft({ ...draft, kierunek: value as ManualCashflow["kierunek"] })} /></label>
        <label style={ui.field}>Kwota (PLN)<input style={ui.input} type="number" min="0.01" step="0.01" disabled={saving} value={draft.kwota} onChange={e => setDraft({ ...draft, kwota: Number(e.target.value) })} /></label>
      </div>
      <div style={ui.dateGrid}>
        <label style={ui.field}>Planowany termin<CfoDateField ariaLabel="Planowany termin przepływu" value={draft.termin} disabled={saving} onChange={value => setDraft({ ...draft, termin: value })} /></label>
        <label style={ui.field}>Data realizacji<CfoDateField ariaLabel="Data realizacji przepływu" value={draft.data_realizacji || ""} max={businessDate()} disabled={saving} onChange={value => setDraft({ ...draft, data_realizacji: value || null })} /></label>
      </div>
      <div style={ui.actions}><button type="button" style={ui.primaryButton} disabled={saving} onClick={() => void save()}><Save size={16} />Zapisz przepływ</button><button type="button" style={ui.smallButton} disabled={saving} onClick={() => setOpen(false)}>Anuluj</button></div>
    </div>}
    <div style={{ overflowX: "auto", marginTop: 16 }}><table style={ui.table}>
      <thead><tr>{["Opis", "Kierunek", "Kwota", "Planowany termin", "Realizacja", "Status", ""].map((label, i) => <th key={i} style={ui.th}>{label}</th>)}</tr></thead>
      <tbody>{!rows.length && <tr><td colSpan={7} style={ui.td}>Brak ręcznych przepływów.</td></tr>}
        {[...rows].sort((a, b) => (b.data_realizacji || b.termin).localeCompare(a.data_realizacji || a.termin)).map(row => <tr key={row.id}>
          <td style={ui.td}>{row.opis}</td><td style={ui.td}>{row.kierunek === "wplyw" ? "Wpływ" : "Wydatek"}</td>
          <td style={ui.td}>{money(Number(row.kwota))}</td><td style={ui.td}>{ui.dateLabel(row.termin)}</td><td style={ui.td}>{ui.dateLabel(row.data_realizacji)}</td>
          <td style={ui.td}>{row.data_realizacji ? "Zrealizowany" : row.termin < businessDate() ? "Po terminie" : "Planowany"}</td>
          <td style={ui.td}><div style={ui.actions}><button type="button" style={ui.smallButton} disabled={saving} onClick={() => { setDraft({ id: row.id, opis: row.opis, kierunek: row.kierunek, kwota: Number(row.kwota), termin: row.termin, data_realizacji: row.data_realizacji }); setError(""); setOpen(true); }}>Edytuj</button>
            <button type="button" style={ui.smallButton} disabled={saving} aria-label={"Usuń przepływ — " + row.opis} onClick={() => void remove(row)}><Trash2 size={14} /></button></div></td>
        </tr>)}
      </tbody>
    </table></div>
  </section>;
}
