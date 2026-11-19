"use client";

import { useState, type CSSProperties } from "react";
import { AppDateInput } from "@/components/AppDateInputs";
import { colors, radius } from "@/app/design";
import type { TimeEntry, ProfileSummary } from "@/lib/taskService";
import { updateIndividualTaskTime } from "@/lib/taskTimeEntryService";

export default function TaskTimeDetails({ entries, userId, role, people, onSaved }: {
  entries: TimeEntry[]; userId: string | null; role: string | null;
  people: ProfileSummary[]; onSaved: (entry: TimeEntry) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [correction, setCorrection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const total = entries.reduce((sum, row) => sum + Number(row.duration_seconds || 0), 0);
  const sorted = [...entries].sort((a, b) => b.started_at.localeCompare(a.started_at));

  function edit(row: TimeEntry) {
    setEditing(row.id);
    setStart(localDateTime(row.started_at));
    setEnd(localDateTime(row.ended_at || row.started_at));
    setNote(row.opis || "");
    setCorrection(String(Number(row.duration_seconds || 0) / 60));
    setError("");
  }

  async function save(row: TimeEntry) {
    if (saving) return;
    setError("");
    try {
      const seconds = row.is_time_correction ? Math.round(Number(correction) * 60) : Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000);
      if ((row.is_time_correction && !correction.trim()) || !Number.isFinite(seconds) || total - Number(row.duration_seconds || 0) + seconds < 0)
        throw new Error("Łączny czas zadania nie może być ujemny. Sprawdź również korekty czasu.");
      setSaving(true);
      const updated = await updateIndividualTaskTime(row, row.is_time_correction
        ? { correctionSeconds: seconds }
        : { startedAt: start, endedAt: end, description: note });
      onSaved(updated);
      setEditing(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Nie udało się zapisać czasu.");
    } finally { setSaving(false); }
  }

  return <div id="task-time-details" style={{ display: "grid", gap: 12, marginTop: 18 }}>
    <h4 style={{ margin: 0, color: colors.navy }}>Zapisy czasu pracy</h4>
    {entries.length === 0 && <p style={{ color: colors.muted }}>Brak zapisów czasu.</p>}
    {sorted.map(row => {
      const ownOrManagement = row.osoba_id === userId || role === "owner" || role === "manager";
      const person = people.find(p => p.id === row.osoba_id);
      return <article key={row.id} style={{ border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ color: colors.navy }}>{row.is_time_correction ? "Korekta czasu" : "Czas pracy"} · {duration(row.duration_seconds)}</strong>
            <p style={meta}>{person?.full_name || person?.email || "Użytkownik"} · {dateLabel(row.started_at)}{!row.is_time_correction && row.ended_at ? " – " + dateLabel(row.ended_at) : ""}</p>
            {!row.ended_at && <p style={meta}>Licznik w trakcie — zatrzymaj go, aby edytować zapis.</p>}
            {!row.is_time_correction && row.opis && <p style={{ ...meta, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{row.opis}</p>}
          </div>
          {ownOrManagement && row.ended_at && <button type="button" style={button} disabled={saving} onClick={() => edit(row)}>Edytuj</button>}
        </div>
        {editing === row.id && <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {row.is_time_correction ? <label style={label}>Korekta w minutach (może być ujemna)
            <input type="number" step="any" value={correction} disabled={saving} onChange={e => setCorrection(e.target.value)} style={input} />
          </label> : <>
            <DateTimeField label="Początek pracy" value={start} onChange={setStart} disabled={saving} />
            <DateTimeField label="Koniec pracy" value={end} onChange={setEnd} disabled={saving} />
            <label style={label}>Opis pracy<textarea value={note} disabled={saving} onChange={e => setNote(e.target.value)} style={{ ...input, minHeight: 70 }} /></label>
          </>}
          {error && <p role="alert" style={{ color: colors.danger, margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ ...button, background: colors.red, borderColor: colors.red, color: colors.white }} disabled={saving} onClick={() => void save(row)}>{saving ? "Zapisywanie…" : "Zapisz"}</button>
            <button type="button" style={button} disabled={saving} onClick={() => { setEditing(null); setError(""); }}>Anuluj</button>
          </div>
        </div>}
      </article>;
    })}
  </div>;
}

function DateTimeField({ label: title, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return <div style={label}><span>{title}</span><fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px", gap: 8 }}>
    <AppDateInput value={value.slice(0,10)} onChange={date => onChange(date + "T" + (value.slice(11) || "09:00:00"))} ariaLabel={title + " — data"} style={input} />
    <input type="time" step="1" value={value.slice(11)} onChange={e => onChange(value.slice(0,10) + "T" + e.target.value)} aria-label={title + " — godzina"} style={input} />
  </fieldset></div>;
}
function localDateTime(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2,"0");
  return date.getFullYear() + "-" + pad(date.getMonth()+1) + "-" + pad(date.getDate()) + "T" + pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
}
function dateLabel(value: string) { return new Date(value).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }); }
function duration(value: number | null) { const seconds = Number(value || 0); return (seconds < 0 ? "−" : "") + Math.floor(Math.abs(seconds)/3600) + "h " + Math.floor(Math.abs(seconds)%3600/60) + "m"; }
const meta: CSSProperties = { margin: "6px 0 0", fontSize: 13, color: colors.muted };
const label: CSSProperties = { display: "grid", gap: 6, color: colors.navy, fontSize: 13 };
const input: CSSProperties = { boxSizing: "border-box", width: "100%", padding: "10px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.input, color: colors.text, background: colors.white };
const button: CSSProperties = { padding: "9px 14px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, fontWeight: 700, cursor: "pointer" };
