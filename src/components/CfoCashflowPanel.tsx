"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import CfoAnnualSchedules from "./CfoAnnualSchedules";
import { OBLIGATION_TYPES, businessDate, type CashflowSnapshot, type CfoObligation } from "@/lib/cfoCashflow";
import { saveObligation } from "@/lib/cfoCashflowService";
import { updateCfoCost } from "@/lib/cfoService";

const money = (n: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
const box: CSSProperties = { background: "white", border: "1px solid #dce3eb", borderRadius: 18, padding: 20, marginBottom: 18 };
const input: CSSProperties = { border: "1px solid #cbd5e1", borderRadius: 8, padding: 8, maxWidth: "100%" };
const cell: CSSProperties = { padding: "10px 8px", textAlign: "left", borderBottom: "1px solid #e2e8f0" };

function status(paid: string | null | undefined, due: string | null | undefined) {
  return paid ? "Zapłacone" : due && due < businessDate() ? "Zaległe" : "Do zapłaty";
}

export default function CfoCashflowPanel({ snapshot, period, onUpdated }: {
  snapshot: CashflowSnapshot; period: string; onUpdated: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Omit<CfoObligation, "id"> & { id?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showPaid, setShowPaid] = useState(false);
  const change = (row: Omit<CfoObligation, "id"> & { id?: string }, patch: Partial<CfoObligation>) => {
    setDrafts(current => ({ ...current, [period + row.typ]: { ...row, ...patch } }));
  };
  async function save(row: Omit<CfoObligation, "id"> & { id?: string }) {
    if (!Number.isFinite(Number(row.kwota)) || Number(row.kwota) < 0) return setError("Podaj poprawną kwotę.");
    setSaving(true); setError("");
    try {
      const result = await saveObligation(row);
      if (result.error) return setError("Nie udało się zapisać zobowiązania: " + result.error.message);
      setDrafts(current => { const next = { ...current }; delete next[period + row.typ]; return next; });
      await onUpdated();
    } finally { setSaving(false); }
  }
  async function costDate(id: string, field: "data_zaplaty" | "termin_platnosci", date: string) {
    setSaving(true); setError("");
    try {
      const result = await updateCfoCost(id, { [field]: date || null });
      if (result.error) return setError("Nie udało się zapisać daty: " + result.error.message);
      await onUpdated();
    } finally { setSaving(false); }
  }
  const matches = (label: string) => label.toLocaleLowerCase("pl").includes(search.toLocaleLowerCase("pl"));
  const invoices = snapshot.invoices.filter(i => matches(`${i.numer || ""} ${i.kontrahent_nazwa || ""}`) && (showPaid || i.status !== "oplacona"));
  const costs = snapshot.costs.filter(c => !c.ignoruj && matches(`${c.numer_dokumentu || ""} ${c.kontrahent}`) && (showPaid || !c.data_zaplaty));
  return <div>
    <CfoAnnualSchedules snapshot={snapshot} onUpdated={onUpdated} />
    <section style={box}>
      <h2>Wynagrodzenia i podatki — {period}</h2>
      <p>Wprowadź łączne kwoty za wybrany miesiąc. ZUS obejmuje całą płatność do ZUS. Termin oznacza plan, a data zapłaty potwierdza wykonanie. VAT i CIT wpisuj w wysokości rzeczywiście należnej — system nie wylicza deklaracji podatkowych.</p>
      <p>Budżet powtarza ostatnią zapisaną kwotę i termin osobno dla każdego rodzaju. Zapis konkretnego miesiąca zastępuje tę prognozę. Kwota 0 oznacza brak zobowiązania. Nie dodawaj tych samych płatności ponownie jako faktur kosztowych.</p>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%" }}>
        <thead><tr>{["Rodzaj", "Kwota", "Termin płatności", "Data zapłaty", "Status", ""].map((h, i) => <th key={i} style={cell}>{h}</th>)}</tr></thead>
        <tbody>{OBLIGATION_TYPES.map(kind => {
          const row = drafts[period + kind.value] || snapshot.obligations.find(o => o.okres.slice(0, 7) === period && o.typ === kind.value)
            || { okres: period + "-01", typ: kind.value, kwota: 0, termin_platnosci: null, data_zaplaty: null };
          const stored = snapshot.obligations.some(o => o.okres.slice(0, 7) === period && o.typ === kind.value);
          return <tr key={kind.value}>
            <td style={cell}>{kind.label}</td>
            <td style={cell}><input aria-label={`Kwota ${kind.label}`} style={{ ...input, width: 130 }} type="number" min="0" step="0.01" value={row.kwota} disabled={saving} onChange={e => change(row, { kwota: Number(e.target.value) })} /></td>
            <td style={cell}><input aria-label={`Termin ${kind.label}`} style={input} type="date" value={row.termin_platnosci || ""} disabled={saving} onChange={e => change(row, { termin_platnosci: e.target.value || null })} /></td>
            <td style={cell}><input aria-label={`Zapłata ${kind.label}`} style={input} type="date" max={businessDate()} value={row.data_zaplaty || ""} disabled={saving} onChange={e => change(row, { data_zaplaty: e.target.value || null })} /></td>
            <td style={cell}>{!stored ? "Brak danych" : Number(row.kwota) === 0 ? "Brak zobowiązania" : status(row.data_zaplaty, row.termin_platnosci)}</td>
            <td style={cell}><button disabled={saving} style={input} onClick={() => void save(row)}>Zapisz</button></td>
          </tr>;
        })}</tbody>
      </table></div>
    </section>
    <section style={box}>
      <input style={input} placeholder="Szukaj dokumentu lub kontrahenta" aria-label="Szukaj rozrachunków" value={search} onChange={e => setSearch(e.target.value)} />
      <label style={{ marginLeft: 16 }}><input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} /> Pokaż również zapłacone</label>
      <h2>Należności z zakładki Faktury</h2>
      <p>Statusy, terminy i rzeczywiste daty wpłat pochodzą z <Link href="/faktury">Faktur</Link>. Opłacone dokumenty bez daty wpłaty wymagają jej uzupełnienia; nie są próbkami średniego czasu zapłaty.</p>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%" }}><thead><tr>{["Faktura", "Klient", "Brutto", "Termin", "Zapłata", "Status"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>{invoices.map(i => <tr key={i.id}><td style={cell}>{i.numer || "—"}</td><td style={cell}>{i.kontrahent_nazwa}</td><td style={cell}>{new Intl.NumberFormat("pl-PL", { style: "currency", currency: i.waluta || "PLN" }).format(Number(i.kwota_brutto))}</td><td style={cell}>{i.termin_platnosci || "—"}</td><td style={cell}>{i.data_zaplaty || "—"}</td><td style={cell}>{i.status === "oplacona" ? "Zapłacona" : i.status === "przeterminowana" ? "Zaległa" : status(null, i.termin_platnosci)}</td></tr>)}</tbody>
      </table></div>
      <h2>Faktury kosztowe</h2>
      <p>Datę zapłaty uzupełnij po opłaceniu całego dokumentu. Import i kategorie kosztów pozostają w zakładce Koszty.</p>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%" }}><thead><tr>{["Dokument", "Dostawca", "Brutto", "Termin", "Data zapłaty", "Status"].map(h => <th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>{costs.map(c => <tr key={c.id}><td style={cell}>{c.numer_dokumentu || "—"}</td><td style={cell}>{c.kontrahent}</td><td style={cell}>{money(Number(c.kwota_brutto ?? c.kwota_netto_cfo))}</td><td style={cell}><input aria-label={`Termin ${c.numer_dokumentu || c.kontrahent}`} style={input} type="date" disabled={saving} value={c.termin_platnosci || ""} onChange={e => void costDate(c.id, "termin_platnosci", e.target.value)} /></td><td style={cell}><input aria-label={`Zapłata ${c.numer_dokumentu || c.kontrahent}`} style={input} type="date" max={businessDate()} disabled={saving} value={c.data_zaplaty || ""} onChange={e => void costDate(c.id, "data_zaplaty", e.target.value)} /></td><td style={cell}>{status(c.data_zaplaty, c.termin_platnosci)}</td></tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
