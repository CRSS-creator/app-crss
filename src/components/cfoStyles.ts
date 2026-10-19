import type { CSSProperties } from "react";
import { colors, radius, shadow } from "@/app/design";

export const panel: CSSProperties = { background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.soft, padding: "20px", minWidth: 0 };
export const header: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" };
export const titleGroup: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 };
export const title: CSSProperties = { margin: 0, color: colors.navy, fontSize: "21px", fontWeight: 750 };
export const text: CSSProperties = { color: colors.muted, fontSize: "13px", lineHeight: 1.65, margin: "0 0 14px" };
export const field: CSSProperties = { display: "grid", gap: "7px", minWidth: 0, color: colors.navy, fontSize: "12px", fontWeight: 750, alignContent: "start" };
export const input: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, background: colors.white, color: colors.text, minHeight: "42px", padding: "9px 12px", fontSize: "13px", fontFamily: "inherit", fontWeight: 600, width: "100%", minWidth: 0, boxSizing: "border-box" };
export const compactInput: CSSProperties = { ...input, minHeight: "36px", padding: "7px 10px", fontSize: "12px" };
export const primaryButton: CSSProperties = { border: `1px solid ${colors.red}`, borderRadius: radius.button, background: colors.red, color: colors.white, minHeight: "42px", padding: "9px 16px", fontSize: "13px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer", whiteSpace: "nowrap" };
export const secondaryButton: CSSProperties = { ...primaryButton, borderColor: colors.border, background: colors.white, color: colors.navy };
export const smallButton: CSSProperties = { ...secondaryButton, minHeight: "34px", padding: "6px 10px", fontSize: "12px" };
export const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "13px", lineHeight: 1.5 };
export const th: CSSProperties = { color: colors.muted, borderBottom: `1px solid ${colors.border}`, padding: "11px 9px", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", textAlign: "left", whiteSpace: "nowrap" };
export const td: CSSProperties = { color: colors.text, borderBottom: `1px solid ${colors.border}`, padding: "12px 9px", textAlign: "left", verticalAlign: "middle" };
export const badge: CSSProperties = { display: "inline-flex", alignItems: "center", borderRadius: radius.badge, background: "rgba(23, 59, 115, 0.08)", color: colors.navy, padding: "5px 9px", fontSize: "11px", fontWeight: 750, whiteSpace: "nowrap" };
export const form: CSSProperties = { marginTop: "20px", padding: "22px", border: `1px solid ${colors.border}`, borderRadius: "22px", background: colors.inputBackground, maxWidth: "1040px", display: "grid", gap: "22px" };
export const fieldGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 350px), 1fr))", gap: "16px" };
export const dateGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: "16px" };
export const groupTitle: CSSProperties = { margin: "0 0 12px", color: colors.navy, fontSize: "14px", fontWeight: 800 };
export const actions: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" };
export const footer: CSSProperties = { ...actions, borderTop: `1px solid ${colors.border}`, paddingTop: "18px" };
export const empty: CSSProperties = { border: `1px dashed ${colors.border}`, borderRadius: radius.input, padding: "22px", textAlign: "center", color: colors.muted, fontSize: "13px", background: colors.inputBackground };
export const details: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "12px 14px", marginTop: "16px", color: colors.navy, fontSize: "13px" };
export const summary: CSSProperties = { cursor: "pointer", fontWeight: 750 };
export const error: CSSProperties = { border: `1px solid ${colors.danger}`, borderRadius: radius.input, padding: "12px 14px", color: colors.danger, fontSize: "13px", marginBottom: "14px" };

export function dateLabel(value: string | null | undefined) {
  return value ? value.slice(0, 10).split("-").reverse().join(".") : "—";
}
