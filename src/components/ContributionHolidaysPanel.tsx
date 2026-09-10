"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MailCheck } from "lucide-react";
import AppSelect from "@/components/AppSelect";
import { colors, radius } from "@/app/design";
import {
  fetchContributionHolidayNotifications, type ContributionHolidayNotification,
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
  const [notifications, setNotifications] = useState<ContributionHolidayNotification[]>([]);
  const [notificationError, setNotificationError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const saveLock = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [result, historyResult] = await Promise.all([fetchContributionHolidays(year), fetchContributionHolidayNotifications(year)]);
      if (cancelled) return;
      setNotifications((historyResult.data || []) as ContributionHolidayNotification[]);
      setNotificationError(historyResult.error ? "Nie udało się pobrać historii powiadomień." : "");
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
    <div style={{ padding: "22px 24px 24px" }}>
      <div style={controlsStyle}>
        <div style={{ ...labelStyle, width: "112px" }}>
          <span>Rok</span>
          <AppSelect style={selectStyle} value={String(year)} disabled={saving !== null}
            options={Array.from({ length: currentYear - 2024 + 2 }, (_, index) => ({ value: String(2024 + index), label: String(2024 + index) }))}
            onChange={value => { if (Number(value) === year) return; setLoading(true); setRecords([]); setNotifications([]); setSelected([]); setError(""); setNotificationError(""); setYear(Number(value)); }} />
        </div>
        <input type="search" aria-label="Szukaj klienta" placeholder="Szukaj klienta, NIP lub schematu ZUS" style={{ ...inputStyle, flex: 1, minWidth: "220px" }}
          value={search} onChange={event => setSearch(event.target.value)} />
        <span style={{ color: colors.muted, fontSize: "13px" }}>Zaznaczono: {selectedVisible.length}</span>
      </div>
      <p style={{ color: colors.muted, fontSize: "13px", margin: "0 0 16px" }}>Statusy uzupełniamy osobno dla każdego roku. Wysyłka powiadomień będzie dostępna po ustaleniu treści.</p>
      {error && <p role="alert" style={{ color: colors.danger }}>{error}</p>}
      {notificationError && <p role="alert" style={{ color: colors.danger }}>{notificationError}</p>}
      {loading || clientsLoading ? <p>Ładowanie klientów...</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <colgroup><col style={{ width: "42px" }} /><col /><col style={{ width: "120px" }} /><col style={{ width: "160px" }} /><col style={{ width: "165px" }} /><col style={{ width: "165px" }} /><col style={{ width: "220px" }} /></colgroup>
            <thead><tr>
              <th style={headCellStyle}><input type="checkbox" aria-label="Zaznacz wszystkich widocznych klientów" checked={allSelected} disabled={visible.length === 0}
                onChange={event => setSelected(current => event.target.checked ? Array.from(new Set([...current, ...visible.map(c => c.id)])) : current.filter(id => !visible.some(c => c.id === id)))} /></th>
              {["Klient", "NIP", "Schemat ZUS", "Czy już skorzystał", "Czy może skorzystać", "Powiadomienie"].map(label => <th key={label} style={headCellStyle}>{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(client => {
              const record = records.find(row => row.klient_id === client.id);
              return <tr key={client.id}>
                <td style={cellStyle}><input type="checkbox" aria-label={`Zaznacz ${client.nazwa || "klienta"}`} checked={selected.includes(client.id)}
                  onChange={event => setSelected(current => event.target.checked ? [...current, client.id] : current.filter(id => id !== client.id))} /></td>
                <td style={{ ...cellStyle, fontWeight: 500, overflowWrap: "anywhere" }}>{client.nazwa || "Klient bez nazwy"}</td>
                <td style={{ ...cellStyle, whiteSpace: "nowrap" }}>{client.nip || "—"}</td>
                <td style={cellStyle}>{client.schemat_zus || "Nie ustawiono"}</td>
                {(["skorzystal", "moze_skorzystac"] as const).map(field => <td key={field} style={cellStyle}>
                  <AppSelect style={selectStyle}
                    value={record?.[field] == null ? "" : String(record[field])} disabled={saving !== null || Boolean(error)}
                    onChange={value => void save(client.id, field, value)}
                    options={[{ value: "", label: "Nie ustalono" }, { value: "true", label: "Tak" }, { value: "false", label: "Nie" }]} />
                  {saving === client.id && <span style={{ fontSize: "12px", color: colors.muted }}>Zapisywanie...</span>}
                </td>)}
                <td style={cellStyle}><NotificationStatus notification={notifications.find(item => item.klient_id === client.id)} error={Boolean(notificationError)} /></td>
              </tr>;
            })}</tbody>
          </table>
          {visible.length === 0 && <p style={{ color: colors.muted }}>Brak klientów spełniających wybrane kryteria.</p>}
        </div>
      )}
    </div>
  );
}

function NotificationStatus({ notification, error }: { notification?: ContributionHolidayNotification; error: boolean }) {
  if (error) return <span style={{ color: colors.muted, fontSize: "13px" }}>Brak danych</span>;
  if (!notification) return <span style={{ color: colors.muted, fontSize: "13px" }}>Nie wysłano</span>;
  const date = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(notification.sent_at));
  return <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
    <span title="Powiadomienie wysłane" style={{ display: "inline-flex", padding: "8px", background: "#e9f7ef", borderRadius: "10px", color: colors.success, flexShrink: 0 }}>
      <MailCheck size={20} aria-label="Wysłano" />
    </span>
    <div style={{ minWidth: 0, display: "grid", gap: "3px", fontSize: "12px", lineHeight: 1.4 }}>
      <span style={{ color: colors.text, overflowWrap: "anywhere" }}>{notification.sent_by_name}</span>
      <time dateTime={notification.sent_at} style={{ color: colors.muted }}>{date}</time>
    </div>
  </div>;
}

const controlsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "end", gap: "14px", marginBottom: "14px" };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: colors.muted };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "9px 10px", minHeight: "40px", fontSize: "14px", fontWeight: 400 };
const tableStyle: CSSProperties = { width: "100%", minWidth: "1200px", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "14px", color: colors.text };
const cellStyle: CSSProperties = { padding: "12px 10px", borderBottom: `1px solid ${colors.border}`, textAlign: "left", fontWeight: 400, verticalAlign: "middle" };

const selectStyle: CSSProperties = { minHeight: "40px", fontSize: "13px", fontWeight: 500, padding: "9px 11px" };
const headCellStyle: CSSProperties = { ...cellStyle, background: colors.inputBackground, color: colors.muted, fontSize: "12px", fontWeight: 600, padding: "13px 10px" };
