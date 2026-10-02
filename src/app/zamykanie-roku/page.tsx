"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AppLayout from "@/components/AppLayout";
import AccessGuard from "@/components/AccessGuard";
import { fetchClients } from "@/lib/clientService";
import { colors, radius } from "@/app/design";

type Client = { id: string; nazwa: string | null; nip: string | null; forma_prawna: string | null };
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
    <h1 style={{ color: colors.navy }}>Zamykanie roku</h1>
    <section style={{ background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, overflow: "hidden" }}>
      <nav aria-label="Rodzaj księgowości" style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 24 }}>
        {([{ value: "jdg", label: "JDG" }, { value: "full", label: "Pełna księgowość" }] as const).map(item => <button key={item.value} type="button" aria-pressed={tab === item.value} onClick={() => setTab(item.value)} style={{ padding: "10px 18px", borderRadius: 14, border: `1px solid ${colors.border}`, fontWeight: 700, cursor: "pointer", background: tab === item.value ? colors.navy : colors.white, color: tab === item.value ? colors.white : colors.navy }}>{item.label}</button>)}
      </nav>
      {loading ? <p style={{ padding: 24 }}>Ładowanie klientów…</p> : error ? <p role="alert" style={{ padding: 24, color: colors.danger }}>{error}</p> : <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead><tr><th scope="col" style={cell}>Klient</th></tr></thead>
          <tbody>{rows.map(client => <tr key={client.id}><td style={cell}>
            <strong>{client.nazwa || "Klient bez nazwy"}</strong>
            <div style={{ marginTop: 5, fontSize: 12, color: colors.muted }}>NIP: {client.nip || "—"} · {client.forma_prawna || "—"}</div>
          </td></tr>)}</tbody>
        </table>
        {rows.length === 0 && <p style={{ padding: 24 }}>Brak klientów w tej kategorii.</p>}
      </div>}
    </section>
  </>;
}

const cell: CSSProperties = { padding: "16px 24px", borderTop: `1px solid ${colors.border}`, color: colors.navy, fontSize: 14 };
