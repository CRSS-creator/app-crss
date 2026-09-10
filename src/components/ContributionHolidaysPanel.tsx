"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { colors, radius } from "@/app/design";
import {
  fetchContributionHolidays, isContributionHolidayClient, saveContributionHoliday,
  type ContributionHolidayClient, type ContributionHolidayRecord,
} from "@/lib/contributionHolidaysService";

export default function ContributionHolidaysPanel({ clients, loading: clientsLoading }: {
  clients: ContributionHolidayClient[];
  loading: boolean;
}) {
  const currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Warsaw" }).format(new Date()));
  const [year, setYear] = useState(currentYear);
  const [records, setRecords] = useState<ContributionHolidayRecord[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const saveLock = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchContributionHolidays(year);
      if (cancelled) return;
      if (result.error) {
        setRecords([]);
        setError("Nie udało się pobrać statusów. Odśwież stronę przed edycją.");
      } else {
        setRecords((result.data || []) as ContributionHolidayRecord[]);
        setError("");
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [year]);

  const query = search.trim().toLowerCase();
  const eligible = clients.filter(isContributionHolidayClient);
  const visible = eligible.filter(client => [client.nazwa, client.nip, client.schemat_zus].join(" ").toLowerCase().includes(query));
  const selectedVisible = visible.filter(client => selected.includes(client.id));
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length;

  async function save(clientId: string, field: "skorzystal" | "moze_skorzystac", value: string) {
    if (saveLock.current || loading || error) return;
    saveLock.current = true;
    setSaving(clientId);
    try {
      const current = records.find(row => row.klient_id === clientId);
      const record: ContributionHolidayRecord = {
        klient_id: clientId, rok: year,
        skorzystal: current?.skorzystal ?? null,
        moze_skorzystac: current?.moze_skorzystac ?? null,
        [field]: value === "" ? null : value === "true",
      };
      const result = await saveContributionHoliday(record);
      if (result.error) {
        window.alert("Nie udało się zapisać statusu wakacji składkowych.");
        return;
      }
      setRecords(rows => [...rows.filter(row => row.klient_id !== clientId), result.data]);
    } finally {
      saveLock.current = false;
      setSaving(null);
    }
  }

  return (
    <div>
      <div style={controlsStyle}>
        <label style={labelStyle}>Rok
          <select aria-label="Rok wakacji składkowych" style={inputStyle} value={year} disabled={saving !== null}
            onChange={event => { setLoading(true); setRecords([]); setSelected([]); setError(""); setYear(Number(event.target.value)); }}>
            {Array.from({ length: currentYear - 2024 + 2 }, (_, index) => 2024 + index).map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <input type="search" aria-label="Szukaj klienta" placeholder="Szukaj klienta, NIP lub schematu ZUS" style={{ ...inputStyle, flex: 1, minWidth: "220px" }}
          value={search} onChange={event => setSearch(event.target.value)} />
        <span style={{ color: colors.muted, fontSize: "13px" }}>Zaznaczono: {selectedVisible.length}</span>
      </div>
      <p style={{ color: colors.muted, fontSize: "13px", margin: "0 0 16px" }}>Statusy uzupełniamy osobno dla każdego roku. Wysyłka powiadomień będzie dostępna po ustaleniu treści.</p>
      {error && <p role="alert" style={{ color: colors.danger }}>{error}</p>}
      {loading || clientsLoading ? <p>Ładowanie klientów...</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead><tr>
              <th style={cellStyle}><input type="checkbox" aria-label="Zaznacz wszystkich widocznych klientów" checked={allSelected} disabled={visible.length === 0}
                onChange={event => setSelected(current => event.target.checked ? Array.from(new Set([...current, ...visible.map(c => c.id)])) : current.filter(id => !visible.some(c => c.id === id)))} /></th>
              {["Klient", "NIP", "Schemat ZUS", "Czy już skorzystał", "Czy może skorzystać"].map(label => <th key={label} style={cellStyle}>{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(client => {
              const record = records.find(row => row.klient_id === client.id);
              return <tr key={client.id}>
                <td style={cellStyle}><input type="checkbox" aria-label={`Zaznacz ${client.nazwa || "klienta"}`} checked={selected.includes(client.id)}
                  onChange={event => setSelected(current => event.target.checked ? [...current, client.id] : current.filter(id => id !== client.id))} /></td>
                <td style={cellStyle}>{client.nazwa || "Klient bez nazwy"}</td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{client.nip || "—"}</td>
                <td style={cellStyle}>{client.schemat_zus || "Nie ustawiono"}</td>
                {(["skorzystal", "moze_skorzystac"] as const).map(field => <td key={field} style={cellStyle}>
                  <select style={inputStyle} aria-label={`${field === "skorzystal" ? "Czy już skorzystał" : "Czy może skorzystać"} — ${client.nazwa}`}
                    value={record?.[field] == null ? "" : String(record[field])} disabled={saving !== null || Boolean(error)}
                    onChange={event => void save(client.id, field, event.target.value)}>
                    <option value="">Nie ustalono</option><option value="true">Tak</option><option value="false">Nie</option>
                  </select>
                  {saving === client.id && <span style={{ fontSize: "12px", color: colors.muted }}>Zapisywanie...</span>}
                </td>)}
              </tr>;
            })}</tbody>
          </table>
          {visible.length === 0 && <p style={{ color: colors.muted }}>Brak klientów spełniających wybrane kryteria.</p>}
        </div>
      )}
    </div>
  );
}

const controlsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "end", gap: "14px", marginBottom: "14px" };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: colors.muted };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "9px 10px", minHeight: "40px", fontSize: "14px", fontWeight: 400 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "14px", color: colors.text };
const cellStyle: CSSProperties = { padding: "12px 10px", borderBottom: `1px solid ${colors.border}`, textAlign: "left", fontWeight: 400, verticalAlign: "middle" };
