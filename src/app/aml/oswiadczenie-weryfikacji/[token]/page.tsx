"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { colors, radius, shadow } from "@/app/design";
import {
  ACTION_TYPE_OPTIONS,
  BENEFICIAL_OWNER_SOURCE_OPTIONS,
  emptyAmlIdentificationStatementData,
  validateAmlIdentificationStatementData,
  type AmlIdentificationStatementData,
  type PublicAmlIdentificationStatementResponse,
  type YesNoValue,
} from "@/lib/amlIdentificationStatementTypes";

export default function AmlIdentificationStatementPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [response, setResponse] = useState<PublicAmlIdentificationStatementResponse | null>(null);
  const [draft, setDraft] = useState<AmlIdentificationStatementData>(emptyAmlIdentificationStatementData());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function loadStatement() {
      setLoading(true);
      const result = await fetch(`/api/public/aml-identification-statement/${token}`);
      const data = await result.json() as PublicAmlIdentificationStatementResponse;
      if (!active) return;
      setResponse(data);
      if (data.status === "active") {
        setDraft((current) => ({ ...current, ...(data.defaults || {}) }));
      }
      setLoading(false);
    }
    void loadStatement();
    return () => {
      active = false;
    };
  }, [token]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const missing = validateAmlIdentificationStatementData(draft);
    if (missing.length > 0) {
      alert(`Uzupełnij wymagane pola:\n\n${missing.join("\n")}`);
      return;
    }
    setSaving(true);
    const result = await fetch(`/api/public/aml-identification-statement/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!result.ok) {
      const data = await result.json().catch(() => null);
      alert(data?.error || "Nie udało się zapisać oświadczenia.");
      return;
    }
    setSaved(true);
    setResponse({ status: "completed" });
  }

  if (loading) return <PublicShell><StatusMessage title="Ładowanie oświadczenia..." text="Sprawdzamy indywidualny link do oświadczenia AML." /></PublicShell>;
  if (saved || response?.status === "completed") return <PublicShell><StatusMessage title="Oświadczenie zostało zapisane" text="PDF zapisano w dokumentach klienta. Link został zamknięty." /></PublicShell>;
  if (response?.status === "revoked") return <PublicShell><StatusMessage title="Link jest nieważny" text="Ten link został unieważniony." /></PublicShell>;
  if (response?.status !== "active") return <PublicShell><StatusMessage title="Nie znaleziono oświadczenia" text="Sprawdź link albo utwórz nowe oświadczenie w module AML." /></PublicShell>;

  return (
    <PublicShell>
      <form style={cardStyle} onSubmit={submitForm}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Aplikacja CRSS</p>
            <h1 style={titleStyle}>Potwierdzenie identyfikacji i weryfikacji klienta</h1>
            <p style={subtitleStyle}>{response.client?.nazwa || "Klient"}{response.client?.nip ? ` · NIP ${response.client.nip}` : ""}</p>
          </div>
          <span style={typeBadgeStyle}>Załącznik nr 4</span>
        </div>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Dane czynności</h2>
          <div style={gridStyle}>
            <Field label="Nazwa albo imię i nazwisko klienta" required><input style={inputStyle} value={draft.clientName} onChange={(event) => update("clientName", event.target.value)} /></Field>
            <Field label="NIP, PESEL, KRS albo inny identyfikator" required><input style={inputStyle} value={draft.clientIdentifier} onChange={(event) => update("clientIdentifier", event.target.value)} /></Field>
            <Field label="Data weryfikacji" required><input type="date" style={inputStyle} value={draft.verificationDate} onChange={(event) => update("verificationDate", event.target.value)} /></Field>
            <Field label="Osoba dokonująca weryfikacji" required><input style={inputStyle} value={draft.verifiedBy} onChange={(event) => update("verifiedBy", event.target.value)} /></Field>
          </div>
          <Field label="Rodzaj czynności" required>
            <select style={inputStyle} value={draft.actionType} onChange={(event) => update("actionType", event.target.value)}>
              {ACTION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Identyfikacja i weryfikacja klienta</h2>
          <Statement>Potwierdzam, że przeprowadzono identyfikację i weryfikację klienta w zakresie wymaganym dla jego formy prawnej.</Statement>
          <Field label="Źródła weryfikacji" required><textarea style={textareaStyle} value={draft.clientVerificationSources} onChange={(event) => update("clientVerificationSources", event.target.value)} /></Field>
          <Field label="Wynik weryfikacji klienta" required>
            <select style={inputStyle} value={draft.clientVerificationResult} onChange={(event) => update("clientVerificationResult", event.target.value as AmlIdentificationStatementData["clientVerificationResult"])}>
              <option value="">Wybierz</option>
              <option value="pozytywny">pozytywny</option>
              <option value="wymaga_wyjasnien">wymaga wyjaśnień</option>
              <option value="negatywny">negatywny</option>
            </select>
          </Field>
          <Field label="Uwagi"><textarea style={textareaStyle} value={draft.clientNotes} onChange={(event) => update("clientNotes", event.target.value)} /></Field>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Identyfikacja beneficjenta rzeczywistego</h2>
          <Statement>Potwierdzam, że przeprowadzono identyfikację beneficjenta rzeczywistego oraz podjęto uzasadnione czynności w celu weryfikacji jego tożsamości.</Statement>
          <div style={gridStyle}>
            <Field label="Imię i nazwisko beneficjenta rzeczywistego" required><input style={inputStyle} value={draft.beneficialOwnerName} onChange={(event) => update("beneficialOwnerName", event.target.value)} /></Field>
            <Field label="Rodzaj kontroli" required><input style={inputStyle} value={draft.beneficialOwnerControlType} onChange={(event) => update("beneficialOwnerControlType", event.target.value)} /></Field>
          </div>
          <div style={checkboxGridStyle}>
            {BENEFICIAL_OWNER_SOURCE_OPTIONS.map((source) => (
              <label key={source} style={checkboxStyle}>
                <input type="checkbox" checked={draft.beneficialOwnerSources.includes(source)} onChange={(event) => toggleSource(source, event.target.checked)} />
                <span>{source}</span>
              </label>
            ))}
          </div>
          <YesNoField label="Czy struktura własności i kontroli została ustalona?" value={draft.ownershipStructureEstablished} onChange={(value) => update("ownershipStructureEstablished", value)} />
          <YesNoField label="Czy dane beneficjenta rzeczywistego są spójne z danymi z rejestrów i dokumentów?" value={draft.beneficialOwnerDataConsistent} onChange={(value) => update("beneficialOwnerDataConsistent", value)} />
          <YesNoField label="Czy występują rozbieżności wymagające wyjaśnienia?" value={draft.discrepanciesRequireExplanation} onChange={(value) => update("discrepanciesRequireExplanation", value)} />
          <Field label="Opis rozbieżności albo uwag"><textarea style={textareaStyle} value={draft.discrepancyNotes} onChange={(event) => update("discrepancyNotes", event.target.value)} /></Field>
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Weryfikacja zdalna i podpis elektroniczny</h2>
          <YesNoField label="Czy umowa albo dokumenty zostały podpisane zdalnie?" value={draft.remoteSigned} onChange={(value) => update("remoteSigned", value)} />
          <Field label="Narzędzie podpisu elektronicznego"><input style={inputStyle} value={draft.electronicSignatureTool} onChange={(event) => update("electronicSignatureTool", event.target.value)} /></Field>
          <YesNoField label="Czy zastosowano weryfikację tożsamości przez mObywatel?" value={draft.mobywatelVerification} onChange={(value) => update("mobywatelVerification", value)} />
        </section>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Wynik potwierdzenia</h2>
          <YesNoField label="Pozytywnym" value={draft.finalPositive} onChange={(value) => update("finalPositive", value)} />
          <YesNoField label="Wymagającym uzupełnienia" value={draft.finalRequiresCompletion} onChange={(value) => update("finalRequiresCompletion", value)} />
          <YesNoField label="Negatywnym" value={draft.finalNegative} onChange={(value) => update("finalNegative", value)} />
          <Field label="Opis wymaganych uzupełnień albo decyzji"><textarea style={textareaStyle} value={draft.finalNotes} onChange={(event) => update("finalNotes", event.target.value)} /></Field>
          <label style={confirmationStyle}>
            <input type="checkbox" checked={draft.confirmation} onChange={(event) => update("confirmation", event.target.checked)} />
            <span>Potwierdzam, że dane w oświadczeniu odzwierciedlają przeprowadzone czynności identyfikacyjne i weryfikacyjne.</span>
          </label>
        </section>

        <button type="submit" style={saving ? disabledButtonStyle : primaryButtonStyle} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz oświadczenie i PDF"}</button>
      </form>
    </PublicShell>
  );

  function update<K extends keyof AmlIdentificationStatementData>(key: K, value: AmlIdentificationStatementData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleSource(source: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      beneficialOwnerSources: checked
        ? [...new Set([...current.beneficialOwnerSources, source])]
        : current.beneficialOwnerSources.filter((item) => item !== source),
    }));
  }
}

function YesNoField({ label, value, onChange }: { label: string; value: YesNoValue; onChange: (value: YesNoValue) => void }) {
  return (
    <div style={yesNoRowStyle}>
      <span style={fieldLabelStyle}>{label}</span>
      <div style={segmentedStyle}>
        <button type="button" style={value === "tak" ? segmentActiveStyle : segmentStyle} onClick={() => onChange("tak")}>TAK</button>
        <button type="button" style={value === "nie" ? segmentActiveStyle : segmentStyle} onClick={() => onChange("nie")}>NIE</button>
      </div>
    </div>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return <main style={pageStyle}>{children}</main>;
}

function StatusMessage({ title, text }: { title: string; text: string }) {
  return <section style={cardStyle}><h1 style={titleStyle}>{title}</h1><p style={subtitleStyle}>{text}</p></section>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label style={fieldStyle}><span style={fieldLabelStyle}>{label}{required ? <span style={requiredMarkStyle}>*</span> : null}</span>{children}</label>;
}

function Statement({ children }: { children: ReactNode }) {
  return <p style={statementStyle}>{children}</p>;
}

const pageStyle: CSSProperties = { minHeight: "100vh", background: colors.background, color: colors.navy, padding: "28px 18px" };
const cardStyle: CSSProperties = { maxWidth: "980px", margin: "0 auto", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.card, padding: "28px", display: "flex", flexDirection: "column", gap: "18px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", borderBottom: `1px solid ${colors.border}`, paddingBottom: "18px" };
const eyebrowStyle: CSSProperties = { margin: "0 0 6px", color: colors.red, fontWeight: 900, fontSize: "12px", textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px", lineHeight: 1.12, fontWeight: 700 };
const subtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.text, fontSize: "14px", lineHeight: 1.5 };
const typeBadgeStyle: CSSProperties = { flex: "0 0 auto", padding: "8px 12px", borderRadius: radius.badge, background: "rgba(23,59,115,0.08)", color: colors.navy, fontWeight: 900, fontSize: "12px" };
const sectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "18px", background: "#fff", display: "flex", flexDirection: "column", gap: "14px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px", fontWeight: 700 };
const gridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "14px", alignItems: "start" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "7px", color: colors.navy, fontWeight: 850, fontSize: "13px" };
const fieldLabelStyle: CSSProperties = { minHeight: "32px", color: colors.navy, fontWeight: 850, fontSize: "13px", lineHeight: 1.2, display: "inline-flex", alignItems: "flex-end", gap: "3px", flexWrap: "wrap" };
const requiredMarkStyle: CSSProperties = { color: colors.navy, fontWeight: 900 };
const inputStyle: CSSProperties = { width: "100%", minHeight: "44px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", color: colors.text, fontWeight: 700, background: "#fff" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "92px", resize: "vertical", lineHeight: 1.45 };
const statementStyle: CSSProperties = { margin: 0, color: colors.text, lineHeight: 1.55, fontSize: "14px" };
const checkboxGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" };
const checkboxStyle: CSSProperties = { display: "flex", gap: "8px", alignItems: "center", fontWeight: 800, color: colors.text, fontSize: "13px" };
const yesNoRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" };
const segmentedStyle: CSSProperties = { display: "inline-flex", border: `1px solid ${colors.border}`, borderRadius: radius.input, overflow: "hidden" };
const segmentStyle: CSSProperties = { border: 0, background: "#fff", color: colors.navy, padding: "10px 16px", fontWeight: 900, cursor: "pointer" };
const segmentActiveStyle: CSSProperties = { ...segmentStyle, background: colors.navy, color: "#fff" };
const confirmationStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-start", color: colors.text, fontWeight: 800, lineHeight: 1.45 };
const primaryButtonStyle: CSSProperties = { border: 0, background: colors.red, color: "#fff", borderRadius: radius.button, padding: "14px 18px", fontWeight: 900, cursor: "pointer", alignSelf: "flex-start" };
const disabledButtonStyle: CSSProperties = { ...primaryButtonStyle, opacity: 0.65, cursor: "not-allowed" };
