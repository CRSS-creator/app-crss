"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import AppSelect from "@/components/AppSelect";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { fetchClients } from "@/lib/clientService";
import { colors, radius } from "@/app/design";

type Client = { id: string; nazwa: string | null; nip: string | null; forma_prawna: string | null };
type Jpk = { klient_id: string; rok: number; rodzaj: string; status: string };
const options = [
  { value: "", label: "Wybierz status" },
  { value: "do_wyslania", label: "Do wysłania", tone: "danger" },
  { value: "wyslane", label: "Wysłane", tone: "success" },
  { value: "brak_wysylki", label: "Brak wysyłki", tone: "success" },
  { value: "potrzebne_dane", label: "Potrzebne dane z poprzedniej księgowości", tone: "warning" },
] as const;
function group(client: Client) {
  const form = (client.forma_prawna || "").toLowerCase().trim();
  if (form === "jdg" || form.includes("jednoosob")) return "jdg";
  if (/spół|spol|sp\.|organizac|fundac|stowarzysz/.test(form)) return "full";
  return null;
}

export default function YearClosingPage() {
  return <AppLayout activePage="zamykanie-roku"><AccessGuard moduleName="zamykanie-roku"><YearClosingList /></AccessGuard></AppLayout>;
}

function YearClosingList() {
  const [tab, setTab] = useState<"jdg" | "full">("jdg");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Warsaw" }).format(new Date())));
  const [statuses, setStatuses] = useState<Jpk[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await supabase.from("zamykanie_roku_jpk").select("*").eq("rok", year);
        if (!active) return;
        setStatuses(result.data || []);
        setStatusError(result.error ? "Nie udało się pobrać statusów JPK. Odśwież stronę." : "");
      } catch { if (active) setStatusError("Nie udało się pobrać statusów JPK. Odśwież stronę."); }
      finally { if (active) setStatusLoading(false); }
    })();
    return () => { active = false; };
  }, [year]);
  async function saveStatus(clientId: string, status: string) {
    if (!status || saveLock.current || statusLoading || statusError) return;
    saveLock.current = true; setSaving(true);
    const record = { klient_id: clientId, rok: year, rodzaj: tab, status };
    try {
      const result = await supabase.from("zamykanie_roku_jpk").upsert(record).select("*").single();
      if (result.error) throw result.error;
      setStatuses(current => [...current.filter(item => !(item.klient_id === clientId && item.rodzaj === record.rodzaj)), result.data]);
    } catch { window.alert("Nie udało się zapisać statusu JPK. Spróbuj ponownie."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await fetchClients();
        if (!active) return;
        if (result.error) setError("Nie udało się pobrać klientów. Odśwież stronę.");
        else setClients((result.data || []) as Client[]);
      } catch {
        if (active) setError("Nie udało się pobrać klientów. Odśwież stronę.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, []);
  const rows = clients.filter(client => group(client) === tab).sort((a, b) => (a.nazwa || "").localeCompare(b.nazwa || "", "pl"));
  return <>
    <h1 style={{ color: colors.navy, fontSize: 30, fontWeight: 700, lineHeight: 1.25, margin: "0 0 24px" }}>Zamykanie roku</h1>
    <section style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, overflow: "hidden" }}>
      <nav aria-label="Rodzaj księgowości" style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 24 }}>
        {([{ value: "jdg", label: "JDG" }, { value: "full", label: "Pełna księgowość" }] as const).map(item => <button key={item.value} type="button" aria-pressed={tab === item.value} onClick={() => setTab(item.value)} style={{ padding: "10px 18px", borderRadius: 14, border: `1px solid ${colors.border}`, fontWeight: 700, cursor: "pointer", background: tab === item.value ? colors.navy : colors.white, color: tab === item.value ? colors.white : colors.navy }}>{item.label}</button>)}
      </nav>
      <label style={{ display: "flex", gap: 12, alignItems: "center", padding: "0 24px 20px" }}>Rok
        <select value={year} disabled={saving} onChange={event => { setStatusLoading(true); setStatuses([]); setYear(Number(event.target.value)); }} style={{ padding: 10, borderRadius: 12, border: `1px solid ${colors.border}` }}>
          {Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {statusError && <p role="alert" style={{ padding: "0 24px", color: colors.danger }}>{statusError}</p>}
      {loading ? <p style={{ padding: 24 }}>Ładowanie klientów…</p> : error ? <p role="alert" style={{ padding: 24, color: colors.danger }}>{error}</p> : <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead><tr><th scope="col" style={cell}>Klient</th><th scope="col" style={cell}>Czy {tab === "jdg" ? "JPK_PIT" : "JPK_CIT"}?</th></tr></thead>
          <tbody>{rows.map(client => <tr key={client.id}><td style={cell}>
            <strong>{client.nazwa || "Klient bez nazwy"}</strong>
            <div style={{ marginTop: 5, fontSize: 12, color: colors.muted }}>NIP: {client.nip || "—"} · {client.forma_prawna || "—"}</div>
          </td><td style={{ ...cell, width: 390 }}><AppSelect style={{ width: "100%", ...jpkStatusStyle(statuses.find(item => item.klient_id === client.id && item.rodzaj === tab)?.status) }} options={options} value={statuses.find(item => item.klient_id === client.id && item.rodzaj === tab)?.status || ""} disabled={saving || statusLoading || Boolean(statusError)} onChange={value => void saveStatus(client.id, value)} /></td></tr>)}</tbody>
        </table>
        {rows.length === 0 && <p style={{ padding: 24 }}>Brak klientów w tej kategorii.</p>}
      </div>}
    </section>
  </>;
}

const cell: CSSProperties = { padding: "16px 24px", borderTop: `1px solid ${colors.border}`, color: colors.navy, fontSize: 14 };

function jpkStatusStyle(status?: string): CSSProperties {
  if (status === "wyslane" || status === "brak_wysylki") return { background: "rgba(22, 163, 74, 0.12)", borderColor: "rgba(22, 163, 74, 0.24)" };
  if (status === "do_wyslania") return { background: "rgba(239, 68, 68, 0.12)", borderColor: "rgba(239, 68, 68, 0.24)" };
  if (status === "potrzebne_dane") return { background: "rgba(245, 158, 11, 0.12)", borderColor: "rgba(245, 158, 11, 0.24)" };
  return {};
}
