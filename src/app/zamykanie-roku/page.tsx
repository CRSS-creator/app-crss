"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import AppSelect from "@/components/AppSelect";
import { supabase } from "@/lib/supabaseClient";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { fetchClients } from "@/lib/clientService";
import { isYearClosingClient, type YearClosingClientPeriod } from "@/lib/yearClosing";
import { colors, radius } from "@/app/design";

type Client = YearClosingClientPeriod & { id: string; nazwa: string | null; nip: string | null; forma_prawna: string | null; obsluga_kadrowa: boolean | null };
const payrollColumns = [
  { key: "pit11_us", label: "PITy-11 wysłane do US" },
  { key: "pit11_klient", label: "PITy-11 przesłane do Klienta" },
  { key: "pit4r", label: "PIT-4R" },
  { key: "zus_roczna", label: "Informacja roczna ZUS dla osoby ubezpieczonej" },
] as const;
type PayrollTask = typeof payrollColumns[number]["key"];
type PayrollStatus = { klient_id: string; rok: number; zadanie: PayrollTask; zrobione: boolean };
type BalanceConfirmation = { klient_id: string; rok: number; zrobione: boolean };
type Jpk = { klient_id: string; rok: number; rodzaj: string; status: string };
const options = [
  { value: "", label: "Wybierz status" },
  { value: "do_wyslania", label: "Do wysłania", tone: "danger" },
  { value: "wyslane", label: "Wysłane", tone: "success" },
  { value: "brak_wysylki", label: "Brak wysyłki", tone: "success" },
  { value: "potrzebne_dane", label: "Potrzebne dane z poprzedniej księgowości", tone: "warning" },
] as const;
const iftOptions = [
  { value: "", label: "Wybierz status" },
  { value: "wyslane", label: "Wysłane", tone: "success" },
  { value: "do_wyslania", label: "Do wysłania", tone: "danger" },
  { value: "brak_wysylki", label: "Brak", tone: "success" },
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
  const [tab, setTab] = useState<"jdg" | "full" | "kadry">("jdg");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState(Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Europe/Warsaw" }).format(new Date())));
  const [statuses, setStatuses] = useState<Jpk[]>([]);
  const [iftStatuses, setIftStatuses] = useState<Jpk[]>([]);
  const [balances, setBalances] = useState<BalanceConfirmation[]>([]);
  const [payrollStatuses, setPayrollStatuses] = useState<PayrollStatus[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [result, balanceResult, iftResult, payrollResult] = await Promise.all([
          supabase.from("zamykanie_roku_jpk").select("*").eq("rok", year),
          supabase.from("zamykanie_roku_salda").select("*").eq("rok", year),
          supabase.from("zamykanie_roku_ift2r").select("*").eq("rok", year),
          supabase.from("zamykanie_roku_kadry").select("*").eq("rok", year),
        ]);
        if (!active) return;
        setStatuses(result.data || []);
        setBalances(balanceResult.data || []);
        setIftStatuses(iftResult.data || []);
        setPayrollStatuses(payrollResult.data || []);
        setStatusError(result.error || balanceResult.error || iftResult.error || payrollResult.error ? "Nie udało się pobrać statusów zamykania roku. Odśwież stronę." : "");
      } catch { if (active) setStatusError("Nie udało się pobrać statusów zamykania roku. Odśwież stronę."); }
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
  async function saveIftStatus(clientId: string, status: string) {
    if (!status || saveLock.current || statusLoading || statusError) return;
    saveLock.current = true; setSaving(true);
    const record = { klient_id: clientId, rok: year, rodzaj: tab, status };
    try {
      const result = await supabase.from("zamykanie_roku_ift2r").upsert(record).select("*").single();
      if (result.error) throw result.error;
      setIftStatuses(current => [...current.filter(item => !(item.klient_id === clientId && item.rodzaj === record.rodzaj)), result.data]);
    } catch { window.alert("Nie udało się zapisać statusu IFT-2R. Spróbuj ponownie."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function savePayroll(clientId: string, zadanie: PayrollTask, zrobione: boolean) {
    if (saveLock.current || statusLoading || statusError) return;
    saveLock.current = true; setSaving(true);
    const record = { klient_id: clientId, rok: year, zadanie, zrobione };
    try {
      const result = await supabase.from("zamykanie_roku_kadry").upsert(record).select("*").single();
      if (result.error) throw result.error;
      setPayrollStatuses(current => [...current.filter(item => !(item.klient_id === clientId && item.zadanie === zadanie)), result.data]);
    } catch { window.alert("Nie udało się zapisać statusu kadrowego. Spróbuj ponownie."); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function saveBalance(clientId: string, zrobione: boolean) {
    if (saveLock.current || statusLoading || statusError) return;
    saveLock.current = true; setSaving(true);
    const record = { klient_id: clientId, rok: year, zrobione };
    try {
      const result = await supabase.from("zamykanie_roku_salda").upsert(record).select("*").single();
      if (result.error) throw result.error;
      setBalances(current => [...current.filter(item => item.klient_id !== clientId), result.data]);
    } catch { window.alert("Nie udało się zapisać potwierdzenia sald. Spróbuj ponownie."); }
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
  const rows = clients.filter(client => (tab === "kadry" ? client.obsluga_kadrowa === true : group(client) === tab) && isYearClosingClient(client, year)).sort((a, b) => (a.nazwa || "").localeCompare(b.nazwa || "", "pl"));
  return <>
    <h1 style={{ color: colors.navy, fontSize: 30, fontWeight: 700, lineHeight: 1.25, margin: "0 0 24px" }}>Zamykanie roku</h1>
    <section style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, overflow: "hidden" }}>
      <nav aria-label="Rodzaj księgowości" style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 24 }}>
        {([{ value: "jdg", label: "JDG" }, { value: "full", label: "Pełna księgowość" }, { value: "kadry", label: "Kadry" }] as const).map(item => <button key={item.value} type="button" aria-pressed={tab === item.value} onClick={() => setTab(item.value)} style={{ padding: "10px 18px", borderRadius: 14, border: `1px solid ${colors.border}`, fontWeight: 700, cursor: "pointer", background: tab === item.value ? colors.navy : colors.white, color: tab === item.value ? colors.white : colors.navy }}>{item.label}</button>)}
      </nav>
      <label style={{ display: "flex", gap: 12, alignItems: "center", padding: "0 24px 20px" }}>Rok
        <select value={year} disabled={saving} onChange={event => { setStatusLoading(true); setStatuses([]); setBalances([]); setIftStatuses([]); setPayrollStatuses([]); setYear(Number(event.target.value)); }} style={{ padding: 10, borderRadius: 12, border: `1px solid ${colors.border}` }}>
          {Array.from({ length: 5 }, (_, index) => new Date().getFullYear() - 2 + index).map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      {statusError && <p role="alert" style={{ padding: "0 24px", color: colors.danger }}>{statusError}</p>}
      {loading ? <p style={{ padding: 24 }}>Ładowanie klientów…</p> : error ? <p role="alert" style={{ padding: 24, color: colors.danger }}>{error}</p> : <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead><tr><th scope="col" style={cell}>Klient</th>{tab === "kadry" ? payrollColumns.map(column => <th key={column.key} scope="col" style={{ ...cell, minWidth: 170 }}>{column.label}</th>) : <><th scope="col" style={cell}>Czy {tab === "jdg" ? "JPK_PIT" : "JPK_CIT"}?</th>{tab === "full" && <th scope="col" style={cell}>Potwierdzenia sald</th>}<th scope="col" style={cell}>IFT-2R</th></>}</tr></thead>
          <tbody>{rows.map(client => <tr key={client.id}><td style={cell}>
            <strong>{client.nazwa || "Klient bez nazwy"}</strong>
            <div style={{ marginTop: 5, fontSize: 12, color: colors.muted }}>NIP: {client.nip || "—"} · {client.forma_prawna || "—"}</div>
          </td>{tab === "kadry" ? payrollColumns.map(column => <td key={column.key} style={cell}><label style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
            <input type="checkbox" aria-label={`${column.label} — ${client.nazwa || "Klient bez nazwy"} — Zrobione`} checked={payrollStatuses.find(item => item.klient_id === client.id && item.zadanie === column.key)?.zrobione ?? false} disabled={saving || statusLoading || Boolean(statusError)} onChange={event => void savePayroll(client.id, column.key, event.target.checked)} /> Zrobione
          </label></td>) : <><td style={{ ...cell, width: 390 }}><AppSelect style={{ width: "100%", ...jpkStatusStyle(statuses.find(item => item.klient_id === client.id && item.rodzaj === tab)?.status) }} options={options} value={statuses.find(item => item.klient_id === client.id && item.rodzaj === tab)?.status || ""} disabled={saving || statusLoading || Boolean(statusError)} onChange={value => void saveStatus(client.id, value)} /></td>
            {tab === "full" && <td style={{ ...cell, width: 200 }}><label style={{ display: "flex", gap: 8, alignItems: "center", whiteSpace: "nowrap" }}>
              <input type="checkbox" aria-label={`Potwierdzenia sald — ${client.nazwa || "Klient bez nazwy"} — Zrobione`} checked={balances.find(item => item.klient_id === client.id)?.zrobione ?? false} disabled={saving || statusLoading || Boolean(statusError)} onChange={event => void saveBalance(client.id, event.target.checked)} /> Zrobione
            </label></td>}
            <td style={{ ...cell, width: 220 }}><AppSelect aria-label={`IFT-2R — ${client.nazwa || "Klient bez nazwy"}`} style={{ width: "100%", ...jpkStatusStyle(iftStatuses.find(item => item.klient_id === client.id && item.rodzaj === tab)?.status) }} options={iftOptions} value={iftStatuses.find(item => item.klient_id === client.id && item.rodzaj === tab)?.status || ""} disabled={saving || statusLoading || Boolean(statusError)} onChange={value => void saveIftStatus(client.id, value)} /></td></>}
          </tr>)}</tbody>
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
