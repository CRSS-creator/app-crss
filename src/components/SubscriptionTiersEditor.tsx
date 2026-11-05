"use client";

import { Plus, X } from "lucide-react";
import { colors, radius } from "@/app/design";
import { AppFormInput } from "@/components/AppFormControls";
import type { SubscriptionPricingDraft, SubscriptionTierDraft } from "@/lib/subscriptionPricing";

export default function SubscriptionTiersEditor({ value, onChange }: {
  value: SubscriptionPricingDraft;
  onChange: (value: SubscriptionPricingDraft) => void;
}) {
  function changeTiers(tiers: SubscriptionTierDraft[]) {
    onChange({ ...value, abonamenty_progi: tiers,
      abonament: tiers[0]?.abonament || "", limit_dokumentow: tiers[0]?.limit_dokumentow || "" });
  }
  return <div style={{ padding: "12px 0", borderBottom: `1px solid ${colors.border}` }}>
    <label style={{ display: "flex", alignItems: "center", gap: 8, color: colors.navy, fontWeight: 650, cursor: "pointer" }}>
      <input type="checkbox" checked={value.kilka_abonamentow} onChange={event => {
        const enabled = event.target.checked;
        onChange({ ...value, kilka_abonamentow: enabled,
          abonamenty_progi: enabled ? (value.abonamenty_progi.length ? value.abonamenty_progi : [
            { abonament: value.abonament, limit_dokumentow: value.limit_dokumentow },
            { abonament: "", limit_dokumentow: "" },
          ]) : value.abonamenty_progi });
      }} />
      Kilka abonamentów
    </label>
    {value.kilka_abonamentow && <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
      {value.abonamenty_progi.map((tier, index) => <div key={index} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <label style={{ flex: "1 1 150px", color: colors.navy, fontSize: 13 }}>
          Abonament netto (zł)
          <AppFormInput type="number" min="0.01" step="0.01" value={tier.abonament}
            aria-label={`Abonament ${index + 1} netto`}
            onChange={event => changeTiers(value.abonamenty_progi.map((item, i) => i === index ? { ...item, abonament: event.target.value } : item))}
            style={{ display: "block", width: "100%", minHeight: 40, marginTop: 6, padding: "8px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.input }} />
        </label>
        <label style={{ flex: "1 1 150px", color: colors.navy, fontSize: 13 }}>
          Do ilu dokumentów
          <AppFormInput type="number" min="1" step="1" value={tier.limit_dokumentow}
            aria-label={`Limit dokumentów abonamentu ${index + 1}`}
            onChange={event => changeTiers(value.abonamenty_progi.map((item, i) => i === index ? { ...item, limit_dokumentow: event.target.value } : item))}
            style={{ display: "block", width: "100%", minHeight: 40, marginTop: 6, padding: "8px 10px", border: `1px solid ${colors.border}`, borderRadius: radius.input }} />
        </label>
        <button type="button" aria-label={`Usuń abonament ${index + 1}`} disabled={value.abonamenty_progi.length <= 2}
          onClick={() => changeTiers(value.abonamenty_progi.filter((_, i) => i !== index))}
          style={{ minWidth: 40, minHeight: 40, border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, cursor: "pointer" }}><X size={16} /></button>
      </div>)}
      <button type="button" onClick={() => changeTiers([...value.abonamenty_progi, { abonament: "", limit_dokumentow: "" }])}
        style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.navy, cursor: "pointer" }}>
        <Plus size={16} /> Dodaj abonament
      </button>
      <p style={{ margin: 0, color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>
        Progi obejmują dokumenty do podanego limitu włącznie. Powyżej najwyższego limitu obowiązuje koszt dodatkowego dokumentu.
        Przy płatności z góry dopłata do wyższego progu jest rozliczana później.
      </p>
    </div>}
  </div>;
}
