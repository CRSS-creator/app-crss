"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { colors, radius } from "@/app/design";
import {
  createSettlementAdditionalFee,
  deleteSettlementAdditionalFee,
  fetchAdditionalFeeDefinitions,
  fetchSettlementAdditionalFees,
  updateSettlementAdditionalFee,
  type AdditionalFeeDefinition,
  type SettlementAdditionalFee,
} from "@/lib/settlementAdditionalFeesService";

export default function SettlementAdditionalFeesPanel({ settlementId }: { settlementId: string }) {
  const [definitions, setDefinitions] = useState<AdditionalFeeDefinition[]>([]);
  const [fees, setFees] = useState<SettlementAdditionalFee[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    loadFees();
  }, [settlementId]);

  async function loadFees() {
    setLoading(true);
    const [definitionsResult, feesResult] = await Promise.all([
      fetchAdditionalFeeDefinitions(false),
      fetchSettlementAdditionalFees(settlementId),
    ]);
    if (definitionsResult.error) console.error("Błąd pobierania słownika opłat:", definitionsResult.error);
    if (feesResult.error) console.error("Błąd pobierania opłat rozliczenia:", feesResult.error);
    setDefinitions((definitionsResult.data || []) as AdditionalFeeDefinition[]);
    setFees((feesResult.data || []) as SettlementAdditionalFee[]);
    setLoading(false);
  }

  async function addFee(definition: AdditionalFeeDefinition) {
    setSavingId(definition.id);
    const result = await createSettlementAdditionalFee({
      rozliczenie_id: settlementId,
      oplata_id: definition.id,
      nazwa: definition.nazwa,
      kwota_netto: definition.domyslna_kwota_netto || 0,
      ilosc: 1,
      uwagi: definition.opis || null,
    });
    setSavingId(null);

    if (result.error) {
      console.error("Błąd dodawania opłaty do rozliczenia:", result.error);
      alert("Nie udało się dodać opłaty do rozliczenia.");
      return;
    }
    setFees((current) => [...current, result.data as SettlementAdditionalFee]);
    setSearch("");
  }

  async function updateFee(fee: SettlementAdditionalFee, payload: Partial<SettlementAdditionalFee>) {
    setSavingId(fee.id);
    const result = await updateSettlementAdditionalFee(fee.id, payload);
    setSavingId(null);
    if (result.error) {
      console.error("Błąd zapisu opłaty rozliczenia:", result.error);
      alert("Nie udało się zapisać opłaty.");
      return;
    }
    const updated = result.data as SettlementAdditionalFee;
    setFees((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function removeFee(fee: SettlementAdditionalFee) {
    if (!confirm(`Usunąć opłatę: ${fee.nazwa}?`)) return;
    setSavingId(fee.id);
    const result = await deleteSettlementAdditionalFee(fee.id);
    setSavingId(null);
    if (result.error) {
      console.error("Błąd usuwania opłaty rozliczenia:", result.error);
      alert("Nie udało się usunąć opłaty.");
      return;
    }
    setFees((current) => current.filter((item) => item.id !== fee.id));
  }

  const suggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return definitions.slice(0, 8);
    return definitions
      .filter((definition) => [definition.nazwa, definition.opis].filter(Boolean).join(" ").toLowerCase().includes(query))
      .slice(0, 8);
  }, [definitions, search]);

  const total = fees.reduce((sum, fee) => sum + Number(fee.kwota_netto || 0) * Number(fee.ilosc || 0), 0);

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>Opłaty dodatkowe</h3>
        <span style={totalStyle}>{formatMoney(total)}</span>
      </div>

      <div style={searchBoxStyle}>
        <input style={inputStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj opłaty dodatkowej" />
        {search && suggestions.length > 0 && (
          <div style={suggestionsStyle}>
            {suggestions.map((definition) => (
              <button key={definition.id} type="button" style={suggestionButtonStyle} disabled={savingId === definition.id} onClick={() => addFee(definition)}>
                <span>{definition.nazwa}</span>
                <strong>{formatMoney(definition.domyslna_kwota_netto)}</strong>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <div style={emptyStateStyle}>Ładowanie opłat...</div> : fees.length === 0 ? <div style={emptyStateStyle}>Brak opłat dodatkowych w tym rozliczeniu.</div> : (
        <div style={listStyle}>
          {fees.map((fee) => (
            <article key={fee.id} style={itemStyle}>
              <div style={itemHeaderStyle}>
                <strong>{fee.nazwa}</strong>
                <button style={dangerButtonStyle} disabled={savingId === fee.id} onClick={() => removeFee(fee)}>Usuń</button>
              </div>
              <div style={rowStyle}>
                <label style={fieldStyle}><span>Kwota netto</span><input style={inputStyle} type="number" min={0} step="0.01" value={fee.kwota_netto} onChange={(event) => updateFee(fee, { kwota_netto: Number(event.target.value || 0) })} /></label>
                <label style={fieldStyle}><span>Ilość</span><input style={inputStyle} type="number" min={0} step="0.01" value={fee.ilosc} onChange={(event) => updateFee(fee, { ilosc: Number(event.target.value || 0) })} /></label>
                <label style={fieldStyle}><span>Razem</span><input style={inputStyle} value={formatMoney(Number(fee.kwota_netto || 0) * Number(fee.ilosc || 0))} readOnly /></label>
              </div>
              <label style={fieldStyle}><span>Uwagi</span><input style={inputStyle} value={fee.uwagi || ""} onChange={(event) => updateFee(fee, { uwagi: event.target.value })} placeholder="Opcjonalna informacja do rozliczenia" /></label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatMoney(value: number) {
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

const sectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.card, padding: "22px", background: colors.card };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center", marginBottom: "14px" };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const totalStyle: CSSProperties = { display: "inline-flex", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.10)", color: colors.navy, padding: "7px 10px", fontWeight: 850 };
const searchBoxStyle: CSSProperties = { position: "relative", marginBottom: "14px" };
const inputStyle: CSSProperties = { width: "100%", border: `1px solid ${colors.border}`, borderRadius: radius.input, color: colors.text, background: colors.inputBackground, padding: "10px 12px", fontWeight: 700, fontSize: "14px", minHeight: "42px" };
const suggestionsStyle: CSSProperties = { position: "absolute", zIndex: 4, inset: "calc(100% + 6px) 0 auto 0", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, boxShadow: "0 18px 44px rgba(23, 59, 115, 0.16)", padding: "8px", display: "grid", gap: "6px" };
const suggestionButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, color: colors.text, padding: "9px 10px", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: "10px", fontWeight: 800 };
const emptyStateStyle: CSSProperties = { padding: "16px", borderRadius: radius.input, background: colors.inputBackground, border: `1px dashed ${colors.border}`, color: colors.muted, textAlign: "center", fontWeight: 800 };
const listStyle: CSSProperties = { display: "grid", gap: "10px" };
const itemStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.inputBackground, padding: "12px", display: "grid", gap: "10px" };
const itemHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", color: colors.text };
const rowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", color: colors.muted, fontSize: "12px", fontWeight: 850 };
const dangerButtonStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.button, background: "#fff5f5", color: colors.danger, padding: "8px 11px", fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" };
