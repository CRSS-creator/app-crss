"use client";

import { Children, isValidElement, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { X } from "lucide-react";
import { AppDateInput, AppMonthInput } from "./AppDateInputs";
import AppSelect from "./AppSelect";
import { colors } from "@/app/design";

type ValueChange = (event: { target: { value: string } }) => void;

// Preserve the value-based handlers used by existing forms while sharing the app's pickers.
export function AppFormInput({ type, value, onChange, min, max, style, disabled, required, id, className, "aria-label": ariaLabel, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange?: ValueChange }) {
  if (type !== "date" && type !== "month") return <input {...rest} type={type} value={value} onChange={onChange} min={min} max={max} style={style} disabled={disabled} required={required} id={id} className={className} aria-label={ariaLabel} />;
  const Picker = type === "month" ? AppMonthInput : AppDateInput;
  return <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, width: style?.width || (type === "month" ? "auto" : "100%") }}>
    <Picker value={String(value || "")} onChange={next => onChange?.({ target: { value: next } })} min={min ? String(min) : undefined} max={max ? String(max) : undefined} disabled={disabled} id={id} className={className} ariaLabel={ariaLabel} style={{ ...style, flex: 1, minWidth: 0 }} />
    {type === "date" && value && !required ? <button type="button" disabled={disabled} aria-label={ariaLabel ? `Wyczyść: ${ariaLabel}` : "Wyczyść datę"} onClick={() => onChange?.({ target: { value: "" } })} style={{ border: 0, background: "transparent", color: colors.muted, cursor: disabled ? "default" : "pointer", padding: 4, display: "flex" }}><X size={14} /></button> : null}
  </div>;
}

function optionText(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child) ? optionText(child.props.children) : String(child)).join("");
}

export function AppFormSelect({ value, onChange, children, style, disabled, id, className, "aria-label": ariaLabel }: Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & { onChange?: ValueChange }) {
  const options = Children.toArray(children).filter(isValidElement<{ value?: string | number; children?: ReactNode }>).map(option => ({ value: String(option.props.value ?? optionText(option.props.children)), label: optionText(option.props.children) }));
  return <AppSelect value={String(value ?? "")} options={options} onChange={next => onChange?.({ target: { value: next } })} style={style} disabled={disabled} id={id} className={className} ariaLabel={ariaLabel} />;
}
