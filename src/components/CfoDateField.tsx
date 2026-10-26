"use client";

import { useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { AppDateInput } from "./AppDateInputs";
import { colors } from "@/app/design";
import * as ui from "./cfoStyles";

export default function CfoDateField({ value, onChange, disabled = false, max, ariaLabel, compact = false, style }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; max?: string;
  ariaLabel: string; compact?: boolean; style?: CSSProperties;
}) {
  const [invalid, setInvalid] = useState(false);
  return <div style={{ minWidth: 0 }}>
    <div style={{ display: "grid", gridTemplateColumns: value ? "minmax(0, 1fr) 24px" : "minmax(0, 1fr)", alignItems: "center", gap: "4px" }}>
      <AppDateInput ariaLabel={ariaLabel} value={value} max={max} disabled={disabled} style={{ ...(compact ? ui.compactInput : ui.input), ...style }} onChange={date => {
        if (max && date > max) { setInvalid(true); return; }
        setInvalid(false); onChange(date);
      }} />
      {value && <button type="button" disabled={disabled} aria-label={`Wyczyść: ${ariaLabel}`} title="Wyczyść datę" onClick={() => { setInvalid(false); onChange(""); }} style={{ border: 0, background: "transparent", color: colors.muted, display: "inline-flex", justifyContent: "center", padding: "4px", cursor: "pointer" }}><X size={14} /></button>}
    </div>
    {invalid && <small role="alert" style={{ color: colors.danger, fontSize: "11px" }}>Data zapłaty nie może być przyszła.</small>}
  </div>;
}
