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
  const visible = eligible.filter(client => [client.nazwa, client.nip, client.schemat_zus, caregiverLabel(client)].join(" ").toLowerCase().includes(query));
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
        <div style={{ ...labelStyle, width: "112px" }}>
          <span>Rok</span>
          <AppSelect style={selectStyle} value={String(year)} disabled={saving !== null}
            options={Array.from({ length: currentYear - 2024 + 2 }, (_, index) => ({ value: String(2024 + index), label: String(2024 + index) }))}
            onChange={value => { if (Number(value) === year) return; setLoading(true); setRecords([]); setNotifications([]); setSelected([]); setError(""); setNotificationError(""); setYear(Number(value)); }} />
        </div>
        <input type="search" aria-label="Szukaj klienta" placeholder="Szukaj klienta, NIP, opiekuna" style={{ ...inputStyle, flex: 1, minWidth: "220px" }}
          value={search} onChange={event => setSearch(event.target.value)} />
        <span style={{ color: colors.muted, fontSize: "13px" }}>Zaznaczono: {selectedVisible.length}</span>
      </div>
      <p style={{ color: colors.muted, fontSize: "13px", margin: "0 24px 18px" }}>Wybierz rok i uzupełnij status wakacji składkowych dla każdego klienta.</p>
      {error && <p role="alert" style={{ color: colors.danger }}>{error}</p>}
      {notificationError && <p role="alert" style={{ color: colors.danger }}>{notificationError}</p>}
      {loading || clientsLoading ? <p>Ładowanie klientów...</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <colgroup><col style={{ width: "42px" }} /><col /><col style={{ width: "160px" }} /><col style={{ width: "165px" }} /><col style={{ width: "165px" }} /><col style={{ width: "220px" }} /></colgroup>
            <thead><tr>
              <th style={{ ...headCellStyle, textAlign: "center" }}><input style={checkboxStyle} type="checkbox" aria-label="Zaznacz wszystkich widocznych klientów" checked={allSelected} disabled={visible.length === 0}
                onChange={event => setSelected(current => event.target.checked ? Array.from(new Set([...current, ...visible.map(c => c.id)])) : current.filter(id => !visible.some(c => c.id === id)))} /></th>
              {["Klient", "Schemat ZUS", "Czy już skorzystał", "Czy może skorzystać", "Powiadomienie"].map(label => <th key={label} style={{ ...headCellStyle, textAlign: label === "Klient" || label === "Schemat ZUS" ? "left" : "center" }}>{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(client => {
              const record = records.find(row => row.klient_id === client.id);
              return <tr key={client.id}>
                <td style={{ ...cellStyle, textAlign: "center" }}><input style={checkboxStyle} type="checkbox" aria-label={`Zaznacz ${client.nazwa || "klienta"}`} checked={selected.includes(client.id)}
                  onChange={event => setSelected(current => event.target.checked ? [...current, client.id] : current.filter(id => id !== client.id))} /></td>
                <td style={cellStyle}>
                  <strong style={clientNameStyle}>{client.nazwa || "Klient bez nazwy"}</strong>
                  <span style={clientMetaStyle}>{client.nip || "Brak NIP"} · {caregiverLabel(client)}</span>
                </td>
                <td style={cellStyle}>{client.schemat_zus || "Nie ustawiono"}</td>
                {(["skorzystal", "moze_skorzystac"] as const).map(field => <td key={field} style={cellStyle}>
                  <AppSelect style={{ ...selectStyle, ...(record?.[field] === true ? { background: "rgba(22, 163, 74, 0.12)", borderColor: "rgba(22, 163, 74, 0.24)" } : record?.[field] === false ? { background: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.24)" } : {}) }}
                    value={record?.[field] == null ? "" : String(record[field])} disabled={saving !== null || Boolean(error)}
                    onChange={value => void save(client.id, field, value)}
                    options={[{ value: "", label: "Nie ustalono" }, { value: "true", label: "TAK", tone: "success" }, { value: "false", label: "NIE", tone: "danger" }]} />
                  {saving === client.id && <span style={{ fontSize: "12px", color: colors.muted }}>Zapisywanie...</span>}
                </td>)}
                <td style={{ ...cellStyle, textAlign: "center" }}><NotificationStatus notification={notifications.find(item => item.klient_id === client.id)} error={Boolean(notificationError)} /></td>
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
  if (!notification) return <span style={missingStyle}>Nie wysłano</span>;
  const date = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(notification.sent_at));
  return <div style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
    <span title="Powiadomienie wysłane" style={{ display: "inline-flex", padding: "8px", background: "#e9f7ef", borderRadius: "10px", color: colors.success, flexShrink: 0 }}>
      <MailCheck size={20} aria-label="Wysłano" />
    </span>
    <div style={{ minWidth: 0, display: "grid", gap: "3px", fontSize: "12px", lineHeight: 1.4 }}>
      <span style={{ color: colors.text, overflowWrap: "anywhere" }}>{notification.sent_by_name}</span>
      <time dateTime={notification.sent_at} style={{ color: colors.muted }}>{date}</time>
    </div>
  </div>;
}

function caregiverLabel(client: ContributionHolidayClient) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

const controlsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "end", gap: "12px", padding: "18px 24px" };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: colors.muted };
const inputStyle: CSSProperties = { width: "100%", flex: "1 1 auto", minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "13px 16px", background: colors.inputBackground, color: colors.text, fontSize: "15px", fontWeight: 650, outline: "none" };
const tableStyle: CSSProperties = { width: "100%", minWidth: "1100px", tableLayout: "fixed", borderCollapse: "collapse" };
const cellStyle: CSSProperties = { padding: "16px 12px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle", fontSize: "14px", wordBreak: "break-word" };
const headCellStyle: CSSProperties = { padding: "14px 12px", textAlign: "left", fontSize: "12px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "normal", lineHeight: 1.25 };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "15px", lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.muted, fontSize: "12px", fontWeight: 750 };
const checkboxStyle: CSSProperties = { width: "18px", height: "18px", accentColor: colors.navy, cursor: "pointer" };
const missingStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: "30px", padding: "6px 10px", borderRadius: radius.badge, background: "rgba(100, 116, 139, 0.12)", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const selectStyle: CSSProperties = { minHeight: "38px", fontSize: "13px", fontWeight: 850, background: colors.white, padding: "9px 11px" };
