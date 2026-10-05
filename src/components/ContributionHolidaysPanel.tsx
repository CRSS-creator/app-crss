"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import NotificationDeliveryStatus from "@/components/NotificationDeliveryStatus";
import { supabase } from "@/lib/supabaseClient";
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
  const sendLock = useRef(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");
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
  const recordsByClient = new Map(records.map(record => [record.klient_id, record]));
  const hasColoredRow = (clientId: string) => {
    const record = recordsByClient.get(clientId);
    return Boolean(record?.nie_chce_skorzystac || record?.skorzystal);
  };
  const visible = eligible
    .filter(client => [client.nazwa, client.nip, client.schemat_zus, caregiverLabel(client)].join(" ").toLowerCase().includes(query))
    .sort((a, b) => Number(hasColoredRow(a.id)) - Number(hasColoredRow(b.id)));
  const selectedVisible = visible.filter(client => selected.includes(client.id));
  const allSelected = visible.length > 0 && selectedVisible.length === visible.length;

  async function send() {
    if (sendLock.current || loading || clientsLoading) return;
    if (!selectedVisible.length) { setSendResult("Zaznacz klientów, do których chcesz wysłać powiadomienie."); return; }
    if (!window.confirm(`Wysłać powiadomienie o wakacjach składkowych za ${year} rok do ${selectedVisible.length} zaznaczonych klientów? Adresy będą ukryte w UDW.`)) return;
    sendLock.current = true;
    setSending(true);
    setSendResult("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Sesja wygasła. Zaloguj się ponownie.");
      const response = await fetch("/api/komunikaty/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ kind: "contribution_holidays", year, clientIds: selectedVisible.map(client => client.id) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nie udało się potwierdzić wysyłki.");
      setSelected([]);
      setSendResult(result.warning || `Wysłano na ${result.sent} adresów e-mail. Pominięto klientów bez adresu: ${result.skipped}.`);
      const history = await fetchContributionHolidayNotifications(year);
      setNotifications(history.data || []);
      setNotificationError(history.error ? "Nie udało się odświeżyć historii powiadomień." : "");
    } catch (error) {
      setSendResult(error instanceof Error ? error.message : "Nie udało się potwierdzić wysyłki. Sprawdź historię n8n przed ponowieniem.");
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  }

  async function save(clientId: string, changes: Partial<Pick<ContributionHolidayRecord, "skorzystal" | "moze_skorzystac" | "nie_chce_skorzystac" | "miesiac_skorzystania">>) {
    if (saveLock.current || loading || error) return;
    saveLock.current = true;
    setSaving(clientId);
    try {
      const current = records.find(row => row.klient_id === clientId);
      const record: ContributionHolidayRecord = {
        klient_id: clientId, rok: year,
        skorzystal: current?.skorzystal ?? null,
        moze_skorzystac: current?.moze_skorzystac ?? null,
        nie_chce_skorzystac: current?.nie_chce_skorzystac ?? false,
        miesiac_skorzystania: current?.miesiac_skorzystania ?? null,
        ...changes,
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
    <form id="contribution-holidays-send" onSubmit={event => { event.preventDefault(); void send(); }}>
      {sending && <p role="status">Wysyłanie powiadomienia…</p>}
      {sendResult && <p role="status" style={{ margin: "16px 24px" }}>{sendResult}</p>}
      <div style={controlsStyle}>
        <div style={{ ...labelStyle, width: "112px" }}>
          <span>Rok</span>
          <AppSelect style={selectStyle} value={String(year)} disabled={sending || saving !== null}
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
            <colgroup><col style={{ width: "42px" }} /><col /><col style={{ width: "160px" }} /><col style={{ width: "165px" }} /><col style={{ width: "165px" }} /><col style={{ width: "180px" }} /><col style={{ width: "135px" }} /><col style={{ width: "220px" }} /></colgroup>
            <thead><tr>
              <th style={{ ...headCellStyle, textAlign: "center" }}><input style={checkboxStyle} type="checkbox" aria-label="Zaznacz wszystkich widocznych klientów" checked={allSelected} disabled={visible.length === 0}
                onChange={event => setSelected(current => event.target.checked ? Array.from(new Set([...current, ...visible.map(c => c.id)])) : current.filter(id => !visible.some(c => c.id === id)))} /></th>
              {["Klient", "Schemat ZUS", "Czy już skorzystał", "Czy może skorzystać", "Miesiąc skorzystania", "Nie chce skorzystać", "Powiadomienie"].map(label => <th key={label} style={{ ...headCellStyle, textAlign: label === "Klient" || label === "Schemat ZUS" ? "left" : "center" }}>{label}</th>)}
            </tr></thead>
            <tbody>{visible.map(client => {
              const record = recordsByClient.get(client.id);
              return <tr key={client.id} style={{ background: record?.nie_chce_skorzystac ? "rgba(100, 116, 139, 0.10)" : record?.skorzystal ? "rgba(22, 163, 74, 0.10)" : undefined }}>
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
                    onChange={value => void save(client.id, { [field]: value === "" ? null : value === "true" })}
                    options={[{ value: "", label: "Nie ustalono" }, { value: "true", label: "TAK", tone: "success" }, { value: "false", label: "NIE", tone: "danger" }]} />
                  {saving === client.id && <span style={{ fontSize: "12px", color: colors.muted }}>Zapisywanie...</span>}
                </td>)}
                <td style={cellStyle}>
                  <AppSelect style={selectStyle} value={record?.miesiac_skorzystania == null ? "" : String(record.miesiac_skorzystania)}
                    disabled={saving !== null || Boolean(error)} options={monthOptions}
                    onChange={value => void save(client.id, { miesiac_skorzystania: value === "" ? null : Number(value) })} />
                </td>
                <td style={{ ...cellStyle, textAlign: "center" }}>
                  <input style={checkboxStyle} type="checkbox" aria-label={`Nie chce skorzystać — ${client.nazwa || "Klient bez nazwy"}`}
                    checked={record?.nie_chce_skorzystac ?? false} disabled={saving !== null || Boolean(error)}
                    onChange={event => void save(client.id, { nie_chce_skorzystac: event.target.checked })} />
                </td>
                <td style={{ ...cellStyle, textAlign: "center" }}><NotificationStatus notification={notifications.find(item => item.klient_id === client.id)} error={Boolean(notificationError)} /></td>
              </tr>;
            })}</tbody>
          </table>
          {visible.length === 0 && <p style={{ color: colors.muted }}>Brak klientów spełniających wybrane kryteria.</p>}
        </div>
      )}
    </form>
  );
}

function NotificationStatus({ notification, error }: { notification?: ContributionHolidayNotification; error: boolean }) {
  if (error) return <span style={{ color: colors.muted, fontSize: "13px" }}>Brak danych</span>;
  return <NotificationDeliveryStatus sentAt={notification?.sent_at} sender={notification?.sent_by_name} />;
}

function caregiverLabel(client: ContributionHolidayClient) {
  const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  return profile?.full_name || profile?.email || "Brak opiekuna";
}

const controlsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "end", gap: "12px", padding: "18px 24px" };
const labelStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: colors.muted };
const inputStyle: CSSProperties = { width: "100%", flex: "1 1 auto", minWidth: 0, border: `1px solid ${colors.border}`, borderRadius: radius.button, padding: "13px 16px", background: colors.inputBackground, color: colors.text, fontSize: "15px", fontWeight: 650, outline: "none" };
const monthOptions = [
  { value: "", label: "Nie wybrano" },
  ...["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"]
    .map((label, index) => ({ value: String(index + 1), label })),
];
const tableStyle: CSSProperties = { width: "100%", minWidth: "1415px", tableLayout: "fixed", borderCollapse: "collapse" };
const cellStyle: CSSProperties = { padding: "16px 12px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle", fontSize: "14px", wordBreak: "break-word" };
const headCellStyle: CSSProperties = { padding: "14px 12px", textAlign: "left", fontSize: "12px", color: colors.text, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "normal", lineHeight: 1.25 };
const clientNameStyle: CSSProperties = { display: "block", color: colors.navy, fontSize: "15px", lineHeight: 1.35 };
const clientMetaStyle: CSSProperties = { display: "block", marginTop: "4px", color: colors.muted, fontSize: "12px", fontWeight: 750 };
const checkboxStyle: CSSProperties = { width: "18px", height: "18px", accentColor: colors.navy, cursor: "pointer" };
const missingStyle: CSSProperties = { display: "inline-flex", alignItems: "center", minHeight: "30px", padding: "6px 10px", borderRadius: radius.badge, background: "rgba(100, 116, 139, 0.12)", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const selectStyle: CSSProperties = { minHeight: "38px", fontSize: "13px", fontWeight: 850, background: colors.white, padding: "9px 11px" };
