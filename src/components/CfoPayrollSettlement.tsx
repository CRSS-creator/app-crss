"use client";

import { useState } from "react";
import AppSelect from "./AppSelect";
import * as ui from "./cfoStyles";
import { payrollSettlement, type CashflowSnapshot } from "@/lib/cfoCashflow";
import { updateCfoCost } from "@/lib/cfoService";

const money = (value: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value);

export default function CfoPayrollSettlement({ snapshot, period, onUpdated }: {
  snapshot: CashflowSnapshot; period: string; onUpdated: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const settlement = payrollSettlement(snapshot, period);
  const candidates = snapshot.costs.filter(cost => !cost.ignoruj && !cost.harmonogram_id && !cost.rozliczenie_wynagrodzen_okres);
  async function link(id: string, enabled: boolean) {
    if (!id) return;
    setSaving(true); setError("");
    try {
      const result = await updateCfoCost(id, { rozliczenie_wynagrodzen_okres: enabled ? period + "-01" : null });
      if (result.error) { setError("Nie udało się zapisać powiązania: " + result.error.message); return; }
      await onUpdated();
    } catch { setError("Nie udało się zapisać powiązania. Spróbuj ponownie."); }
    finally { setSaving(false); }
  }
  return <div style={{ ...ui.details, padding: "16px", marginBottom: "18px" }}>
    <strong>Powiązane koszty wynagrodzeń</strong>
    <p style={{ ...ui.text, margin: "8px 0 12px" }}>Przypnij umowy zlecenia, powołanie lub inne koszty płacowe do tego miesiąca. Pełny koszt pozostaje w swoim okresie. Przelewy zapisujesz poniżej jako netto, ZUS i PIT — tylko one trafiają do cash flow i planu płatności.</p>
    <AppSelect ariaLabel="Powiąż koszt z rozliczeniem wynagrodzeń" value="" disabled={saving} searchable searchPlaceholder="Szukaj dokumentu lub osoby…" options={[
      { value: "", label: "Powiąż koszt z tym miesiącem…" },
      ...candidates.map(cost => ({ value: cost.id, label: `${cost.numer_dokumentu || "Bez numeru"} · ${cost.kontrahent} · ${cost.okres_start.slice(0, 7)} · ${money(Number(cost.kwota_brutto ?? cost.kwota_netto_cfo))}` })),
    ]} onChange={id => void link(id, true)} style={{ width: "100%" }} />
    {error && <p role="alert" style={ui.error}>{error}</p>}
    {settlement.costs.length > 0 && <>
      <div style={{ display: "grid", gap: "8px", marginTop: "14px" }}>
        {settlement.costs.map(cost => <div key={cost.id} style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", fontSize: "13px" }}>
          <span style={{ flex: 1 }}>{cost.numer_dokumentu || "Bez numeru"} · {cost.kontrahent}</span>
          <strong>{money(Number(cost.kwota_brutto ?? cost.kwota_netto_cfo))}</strong>
          <button type="button" style={ui.smallButton} disabled={saving} onClick={() => void link(cost.id, false)}>Odłącz</button>
        </div>)}
      </div>
      <p style={{ ...ui.text, margin: "14px 0 0" }}>Powiązane koszty: <strong>{money(settlement.costTotal)}</strong> · Podział netto + ZUS + PIT: <strong>{money(settlement.paymentTotal)}</strong> · Różnica: <strong>{money(settlement.difference)}</strong></p>
      <p style={{ ...ui.text, margin: "8px 0 0" }}>{settlement.missing.length ? `Uzupełnij podział: ${settlement.missing.join(", ")}. Kwota 0 oznacza brak danej płatności.` : Math.abs(settlement.difference) < 0.01 ? "Podział płatności zgadza się z sumą powiązanych kosztów." : "Sprawdź podział płatności i kompletność powiązanych kosztów. VAT i CIT nie należą do tego rozliczenia."}</p>
      <p style={{ ...ui.text, margin: "8px 0 0" }}>Po odłączeniu dokument będzie ponownie rozliczany według własnej daty zapłaty.</p>
    </>}
  </div>;
}
