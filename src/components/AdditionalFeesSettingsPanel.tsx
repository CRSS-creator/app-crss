"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { colors, radius } from "@/app/design";
import {
  createAdditionalFeeDefinition,
  deleteAdditionalFeeDefinition,
  fetchAdditionalFeeDefinitions,
  updateAdditionalFeeDefinition,
  type AdditionalFeeDefinition,
} from "@/lib/settlementAdditionalFeesService";

type FeeDraft = {
  id: string | null;
  nazwa: string;
  domyslna_kwota_netto: string;
  opis: string;
};

const emptyDraft: FeeDraft = {
  id: null,
  nazwa: "",
  domyslna_kwota_netto: "0",
  opis: "",
};

export default function AdditionalFeesSettingsPanel() {
  const [fees, setFees] = useState<AdditionalFeeDefinition[]>([]);
  const [draft, setDraft] = useState<FeeDraft>(emptyDraft);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadFees();
  }, []);

  async function loadFees() {
    setLoading(true);
    const result = await fetchAdditionalFeeDefinitions(true);
    if (result.error) console.error("Błąd pobierania opłat dodatkowych:", result.error);
    setFees((result.data || []) as AdditionalFeeDefinition[]);
    setLoading(false);
  }

  async function saveFee() {
    if (!draft.nazwa.trim()) return alert("Wpisz nazwę opłaty dodatkowej.");
    const payload = {
      nazwa: draft.nazwa.trim(),
      domyslna_kwota_netto: Math.max(0, Number(draft.domyslna_kwota_netto || 0)),
      opis: draft.opis.trim() || null,
      aktywna: true,
    };

    setSaving(true);
    const result = draft.id
      ? await updateAdditionalFeeDefinition(draft.id, payload)
      : await createAdditionalFeeDefinition(payload);
    setSaving(false);

    if (result.error) {
      console.error("Błąd zapisu opłaty dodatkowej:", result.error);
      alert("Nie udało się zapisać opłaty dodatkowej.");
      return;
    }

    const saved = result.data as AdditionalFeeDefinition;
    setFees((current) => draft.id ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]);
    setDraft(emptyDraft);
  }

  async function toggleFee(fee: AdditionalFeeDefinition) {
    const result = await updateAdditionalFeeDefinition(fee.id, { aktywna: !fee.aktywna });
    if (result.error) return alert("Nie udało się zmienić statusu opłaty.");
    const updated = result.data as AdditionalFeeDefinition;
    setFees((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function removeFee(fee: AdditionalFeeDefinition) {
    if (!confirm(`Usunąć opłatę: ${fee.nazwa}?`)) return;
    const result = await deleteAdditionalFeeDefinition(fee.id);
    if (result.error) return alert("Nie udało się usunąć opłaty. Jeśli była użyta w rozliczeniach, wyłącz ją zamiast usuwać.");
    setFees((current) => current.filter((item) => item.id !== fee.id));
    if (draft.id === fee.id) setDraft(emptyDraft);
  }

  const visibleFees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return fees.filter((fee) => !query || [fee.nazwa, fee.opis].filter(Boolean).join(" ").toLowerCase().includes(query));
  }, [fees, search]);

  return (
    <section style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={sectionTitleStyle}>Opłaty dodatkowe</h2>
          <p style={hintStyle}>Słownik opłat, które można później przypisać do rozliczenia konkretnego klienta.</p>
        </div>
      </div>

      <div style={formStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>Nazwa opłaty</span>
          <input style={inputStyle} value={draft.nazwa} onChange={(event) => setDraft((current) => ({ ...current, nazwa: event.target.value }))} placeholder="np. Korekta JPK" />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Domyślna kwota netto</span>
          <input style={inputStyle} type="number" min={0} step="0.01" value={draft.domyslna_kwota_netto} onChange={(event) => setDraft((current) => ({ ...current, domyslna_kwota_netto: event.target.value }))} />
        </label>
        <label style={fieldStyle}>
          <span style={labelStyle}>Opis</span>
          <input style={inputStyle} value={draft.opis} onChange={(event) => setDraft((current) => ({ ...current, opis: event.target.value }))} placeholder="Krótka informacja wewnętrzna" />
        </label>
        <button style={primaryButtonStyle} disabled={saving} onClick={saveFee}>{draft.id ? "Zapisz zmianę" : "Dodaj opłatę"}</button>
        {draft.id && <button style={secondaryButtonStyle} onClick={() => setDraft(emptyDraft)}>Anuluj</button>}
      </div>

      <input style={searchStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj po nazwie lub opisie" />

      <div style={tableShellStyle}>
        <table style={tableStyle}>
          <thead><tr><Th>Nazwa</Th><Th>Kwota netto</Th><Th>Status</Th><Th>Akcje</Th></tr></thead>
          <tbody>
            {loading ? <tr><Td colSpan={4}>Ładowanie opłat...</Td></tr> : visibleFees.length === 0 ? <tr><Td colSpan={4}>Brak opłat dodatkowych.</Td></tr> : visibleFees.map((fee) => (
              <tr key={fee.id} style={rowStyle}>
                <Td strong>{fee.nazwa}<Small>{fee.opis || "Brak opisu"}</Small></Td>
                <Td>{formatMoney(fee.domyslna_kwota_netto)}</Td>
                <Td><span style={fee.aktywna ? activeBadgeStyle : inactiveBadgeStyle}>{fee.aktywna ? "Aktywna" : "Wyłączona"}</span></Td>
                <Td><div style={actionsStyle}><button style={secondaryButtonStyle} onClick={() => setDraft({ id: fee.id, nazwa: fee.nazwa, domyslna_kwota_netto: String(fee.domyslna_kwota_netto), opis: fee.opis || "" })}>Edytuj</button><button style={secondaryButtonStyle} onClick={() => toggleFee(fee)}>{fee.aktywna ? "Wyłącz" : "Włącz"}</button><button style={dangerButtonStyle} onClick={() => removeFee(fee)}>Usuń</button></div></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

function Th({ children }: { children: React.ReactNode }) { return <th style={thStyle}>{children}</th>; }
function Td({ children, strong, colSpan }: { children: React.ReactNode; strong?: boolean; colSpan?: number }) { return <td colSpan={colSpan} style={{ ...tdStyle, fontWeight: strong ? 800 : 600 }}>{children}</td>; }
function Small({ children }: { children: React.ReactNode }) { return <small style={smallTextStyle}>{children}</small>; }

const panelStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, background: colors.card, padding: "26px" };
const panelHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", marginBottom: "18px", flexWrap: "wrap" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "24px" };
const hintStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.65 };
const formStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(240px, 1.6fr) minmax(160px, 0.7fr) minmax(240px, 1.6fr) auto auto", gap: "12px", alignItems: "end", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "14px", marginBottom: "14px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "7px" };
const labelStyle: CSSProperties = { color: colors.muted, fontSize: "13px", fontWeight: 850 };
const inputStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, padding: "10px 12px", fontWeight: 700, minHeight: "42px", width: "100%" };
const searchStyle: CSSProperties = { ...inputStyle, marginBottom: "14px" };
const primaryButtonStyle: CSSProperties = { border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, padding: "11px 15px", minHeight: "42px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const secondaryButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.white, color: colors.navy, padding: "9px 12px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: colors.danger, background: "#fff5f5" };
const tableShellStyle: CSSProperties = { overflowX: "auto", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse" };
const thStyle: CSSProperties = { textAlign: "left", padding: "13px 14px", color: colors.muted, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${colors.border}`, whiteSpace: "nowrap" };
const tdStyle: CSSProperties = { padding: "14px", borderBottom: `1px solid ${colors.border}`, color: colors.text, verticalAlign: "middle" };
const rowStyle: CSSProperties = { background: colors.white };
const badgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: radius.badge, padding: "6px 10px", fontSize: "12px", fontWeight: 850, whiteSpace: "nowrap" };
const activeBadgeStyle: CSSProperties = { ...badgeStyle, background: "#dcfce7", color: colors.success };
const inactiveBadgeStyle: CSSProperties = { ...badgeStyle, background: "#f1f5f9", color: colors.muted };
const smallTextStyle: CSSProperties = { display: "block", marginTop: "5px", color: colors.muted, fontSize: "12px", fontWeight: 650, lineHeight: 1.35 };
const actionsStyle: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap" };
