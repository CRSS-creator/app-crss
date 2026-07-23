"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { colors, radius, shadow } from "@/app/design";
import {
  ASSESSMENT_BASIS_OPTIONS,
  BEHAVIORAL_FACTOR_FIELDS,
  CHANNEL_FACTOR_FIELDS,
  CLIENT_FACTOR_FIELDS,
  DATA_SOURCE_FIELDS,
  DECISION_FIELDS,
  GEOGRAPHIC_FACTOR_FIELDS,
  INDUSTRY_FACTOR_FIELDS,
  PEP_SANCTIONS_FIELDS,
  emptyAmlRiskAssessmentData,
  validateAmlRiskAssessmentData,
  type AmlRiskAssessmentData,
  type PublicAmlRiskAssessmentResponse,
  type YesNoNaValue,
} from "@/lib/amlRiskAssessmentTypes";

export default function AmlRiskAssessmentPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [response, setResponse] = useState<PublicAmlRiskAssessmentResponse | null>(null);
  const [draft, setDraft] = useState<AmlRiskAssessmentData>(emptyAmlRiskAssessmentData());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    async function loadAssessment() {
      setLoading(true);
      const result = await fetch(`/api/public/aml-risk-assessment/${token}`);
      const data = await result.json() as PublicAmlRiskAssessmentResponse;
      if (!active) return;
      setResponse(data);
      if (data.status === "active") {
        setDraft((current) => mergeDefaults(current, data.defaults || {}));
      }
      setLoading(false);
    }
    void loadAssessment();
    return () => {
      active = false;
    };
  }, [token]);

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const missing = validateAmlRiskAssessmentData(draft);
    if (missing.length > 0) {
      alert(`Uzupełnij wymagane pola:\n\n${missing.join("\n")}`);
      return;
    }
    setSaving(true);
    const result = await fetch(`/api/public/aml-risk-assessment/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!result.ok) {
      const data = await result.json().catch(() => null);
      alert(data?.error || "Nie udało się zapisać oceny ryzyka.");
      return;
    }
    setSaved(true);
    setResponse({ status: "completed" });
  }

  if (loading) return <PublicShell><StatusMessage title="Ładowanie oceny ryzyka..." text="Sprawdzamy indywidualny link do karty AML." /></PublicShell>;
  if (saved || response?.status === "completed") return <PublicShell><StatusMessage title="Ocena ryzyka została zapisana" text="PDF zapisano w dokumentach klienta. Link został zamknięty." /></PublicShell>;
  if (response?.status === "revoked") return <PublicShell><StatusMessage title="Link jest nieważny" text="Ten link został unieważniony." /></PublicShell>;
  if (response?.status !== "active") return <PublicShell><StatusMessage title="Nie znaleziono oceny ryzyka" text="Sprawdź link albo utwórz nową ocenę w module AML." /></PublicShell>;

  return (
    <PublicShell>
      <form style={cardStyle} onSubmit={submitForm}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Aplikacja CRSS</p>
            <h1 style={titleStyle}>Karta oceny ryzyka AML</h1>
            <p style={subtitleStyle}>{response.client?.nazwa || "Klient"}{response.client?.nip ? ` · NIP ${response.client.nip}` : ""}</p>
            <p style={riskInfoStyle}>Przypisane ryzyko: <strong>{riskLevelDisplay(draft.finalRiskLevel)}</strong></p>
          </div>
          <span style={typeBadgeStyle}>Ocena ryzyka</span>
        </div>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Dane identyfikacyjne karty</h2>
          <div style={twoColumnGridStyle}>
            <Field label="Nazwa albo imię i nazwisko klienta" required><input style={inputStyle} value={draft.clientName} onChange={(event) => update("clientName", event.target.value)} /></Field>
            <Field label="NIP, PESEL, KRS albo inny identyfikator" required><input style={inputStyle} value={draft.clientIdentifier} onChange={(event) => update("clientIdentifier", event.target.value)} /></Field>
          </div>
          <div style={twoColumnGridStyle}>
            <Field label="Data sporządzenia oceny ryzyka" required><input type="date" style={inputStyle} value={draft.assessmentDate} onChange={(event) => update("assessmentDate", event.target.value)} /></Field>
            <Field label="Osoba sporządzająca ocenę ryzyka" required><input style={inputStyle} value={draft.assessedBy} onChange={(event) => update("assessedBy", event.target.value)} /></Field>
          </div>
          <Field label="Podstawa sporządzenia oceny" required>
            <select style={inputStyle} value={draft.assessmentBasis} onChange={(event) => update("assessmentBasis", event.target.value)}>
              <option value="">Wybierz</option>
              {ASSESSMENT_BASIS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </section>

        <FactorSection title="Źródła danych wykorzystane do oceny">
          {DATA_SOURCE_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.dataSources[field.key] || ""} onChange={(value) => updateMap("dataSources", field.key, value)} />
          ))}
          <Field label="Inne źródła"><textarea style={textareaStyle} value={draft.otherSources} onChange={(event) => update("otherSources", event.target.value)} /></Field>
        </FactorSection>

        <FactorSection title="Czynniki dotyczące klienta">
          {CLIENT_FACTOR_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.clientFactors[field.key] || ""} onChange={(value) => updateMap("clientFactors", field.key, value)} />
          ))}
          <Field label="Opis niespójności albo uwag"><textarea style={textareaStyle} value={draft.clientFactorNotes} onChange={(event) => update("clientFactorNotes", event.target.value)} /></Field>
        </FactorSection>

        <FactorSection title="Czynniki geograficzne">
          {GEOGRAPHIC_FACTOR_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.geographicFactors[field.key] || ""} onChange={(value) => updateMap("geographicFactors", field.key, value)} />
          ))}
          <Field label="Opis powiązań geograficznych"><textarea style={textareaStyle} value={draft.geographicNotes} onChange={(event) => update("geographicNotes", event.target.value)} /></Field>
        </FactorSection>

        <FactorSection title="Czynniki dotyczące branży i rodzaju działalności">
          {INDUSTRY_FACTOR_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.industryFactors[field.key] || ""} onChange={(value) => updateMap("industryFactors", field.key, value)} />
          ))}
          <Field label="Opis czynników branżowych"><textarea style={textareaStyle} value={draft.industryNotes} onChange={(event) => update("industryNotes", event.target.value)} /></Field>
        </FactorSection>

        <FactorSection title="Czynniki dotyczące kanału nawiązania współpracy">
          {CHANNEL_FACTOR_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.channelFactors[field.key] || ""} onChange={(value) => updateMap("channelFactors", field.key, value)} />
          ))}
          <Field label="Opis metody ograniczenia ryzyka zdalnego zawarcia umowy"><textarea style={textareaStyle} value={draft.remoteRiskMitigationNotes} onChange={(event) => update("remoteRiskMitigationNotes", event.target.value)} /></Field>
        </FactorSection>

        <FactorSection title="Status PEP i sankcje">
          {PEP_SANCTIONS_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.pepSanctionsFactors[field.key] || ""} onChange={(value) => updateMap("pepSanctionsFactors", field.key, value)} />
          ))}
          <Field label="Opis wyniku weryfikacji PEP i sankcyjnej"><textarea style={textareaStyle} value={draft.pepSanctionsNotes} onChange={(event) => update("pepSanctionsNotes", event.target.value)} /></Field>
        </FactorSection>

        <FactorSection title="Czynniki behawioralne i organizacyjne">
          {BEHAVIORAL_FACTOR_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.behavioralFactors[field.key] || ""} onChange={(value) => updateMap("behavioralFactors", field.key, value)} />
          ))}
          <Field label="Opis okoliczności behawioralnych"><textarea style={textareaStyle} value={draft.behavioralNotes} onChange={(event) => update("behavioralNotes", event.target.value)} /></Field>
        </FactorSection>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Ocena końcowa</h2>
          <Field label="Poziom ryzyka" required>
            <select style={inputStyle} value={draft.finalRiskLevel} onChange={(event) => update("finalRiskLevel", event.target.value as AmlRiskAssessmentData["finalRiskLevel"])}>
              <option value="">Wybierz</option>
              <option value="niskie">Ryzyko niskie</option>
              <option value="standardowe">Ryzyko standardowe</option>
              <option value="podwyzszone">Ryzyko podwyższone</option>
              <option value="wysokie">Ryzyko wysokie</option>
            </select>
          </Field>
          <Field label="Uzasadnienie oceny ryzyka" required><textarea style={textareaStyle} value={draft.riskJustification} onChange={(event) => update("riskJustification", event.target.value)} /></Field>
        </section>

        <FactorSection title="Decyzja CRSS">
          {DECISION_FIELDS.map((field) => (
            <ChoiceField key={field.key} label={field.label} value={draft.decisions[field.key] || ""} onChange={(value) => updateMap("decisions", field.key, value)} />
          ))}
          <Field label="Opis decyzji i ewentualnych warunków"><textarea style={textareaStyle} value={draft.decisionNotes} onChange={(event) => update("decisionNotes", event.target.value)} /></Field>
        </FactorSection>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Termin kolejnej aktualizacji</h2>
          <div style={singleFieldGridStyle}>
            <Field label="Termin kolejnej aktualizacji danych i oceny ryzyka" required><input type="date" style={inputStyle} value={draft.nextUpdateDate} onChange={(event) => update("nextUpdateDate", event.target.value)} /></Field>
          </div>
          <div style={twoColumnGridStyle}>
            <Field label="Osoba zatwierdzająca ocenę" required><input style={inputStyle} value={draft.approvedBy} onChange={(event) => update("approvedBy", event.target.value)} /></Field>
            <Field label="Data zatwierdzenia" required><input type="date" style={inputStyle} value={draft.approvalDate} onChange={(event) => update("approvalDate", event.target.value)} /></Field>
          </div>
          <label style={confirmationStyle}>
            <input type="checkbox" checked={draft.confirmation} onChange={(event) => update("confirmation", event.target.checked)} />
            <span>Potwierdzam, że dane w karcie odzwierciedlają przeprowadzoną ocenę ryzyka AML.</span>
          </label>
        </section>

        <button type="submit" style={saving ? disabledButtonStyle : primaryButtonStyle} disabled={saving}>{saving ? "Zapisywanie..." : "Zapisz ocenę ryzyka i PDF"}</button>
      </form>
    </PublicShell>
  );

  function update<K extends keyof AmlRiskAssessmentData>(key: K, value: AmlRiskAssessmentData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateMap<K extends keyof Pick<AmlRiskAssessmentData, "dataSources" | "clientFactors" | "geographicFactors" | "industryFactors" | "channelFactors" | "pepSanctionsFactors" | "behavioralFactors" | "decisions">>(
    key: K,
    field: string,
    value: AmlRiskAssessmentData[K][string]
  ) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }
}

function mergeDefaults(current: AmlRiskAssessmentData, defaults: Partial<AmlRiskAssessmentData>): AmlRiskAssessmentData {
  return {
    ...current,
    ...defaults,
    dataSources: { ...current.dataSources, ...(defaults.dataSources || {}) },
    clientFactors: { ...current.clientFactors, ...(defaults.clientFactors || {}) },
    geographicFactors: { ...current.geographicFactors, ...(defaults.geographicFactors || {}) },
    industryFactors: { ...current.industryFactors, ...(defaults.industryFactors || {}) },
    channelFactors: { ...current.channelFactors, ...(defaults.channelFactors || {}) },
    pepSanctionsFactors: { ...current.pepSanctionsFactors, ...(defaults.pepSanctionsFactors || {}) },
    behavioralFactors: { ...current.behavioralFactors, ...(defaults.behavioralFactors || {}) },
    decisions: { ...current.decisions, ...(defaults.decisions || {}) },
  };
}

function ChoiceField({ label, value, onChange }: { label: string; value: YesNoNaValue; onChange: (value: YesNoNaValue) => void }) {
  return (
    <div style={choiceRowStyle}>
      <span style={choiceLabelStyle}>{label}</span>
      <div style={segmentedStyle}>
        <button type="button" style={value === "tak" ? segmentActiveStyle : segmentStyle} onClick={() => onChange("tak")}>TAK</button>
        <button type="button" style={value === "nie" ? segmentActiveStyle : segmentStyle} onClick={() => onChange("nie")}>NIE</button>
        <button type="button" style={value === "nie_dotyczy" ? segmentActiveStyle : segmentStyle} onClick={() => onChange("nie_dotyczy")}>Nie dotyczy</button>
      </div>
    </div>
  );
}

function riskLevelDisplay(value: string) {
  if (value === "niskie") return "niskie";
  if (value === "standardowe") return "standardowe";
  if (value === "podwyzszone") return "podwyższone";
  if (value === "wysokie") return "wysokie";
  return "nie przypisano";
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

function FactorSection({ title, children }: { title: string; children: ReactNode }) {
  return <section style={sectionStyle}><h2 style={sectionTitleStyle}>{title}</h2><div style={choiceListStyle}>{children}</div></section>;
}

const pageStyle: CSSProperties = { minHeight: "100vh", background: colors.background, color: colors.navy, padding: "28px 18px" };
const cardStyle: CSSProperties = { maxWidth: "1040px", margin: "0 auto", background: colors.card, border: `1px solid ${colors.border}`, borderRadius: radius.card, boxShadow: shadow.card, padding: "28px", display: "flex", flexDirection: "column", gap: "18px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-start", borderBottom: `1px solid ${colors.border}`, paddingBottom: "18px" };
const eyebrowStyle: CSSProperties = { margin: "0 0 6px", color: colors.red, fontWeight: 900, fontSize: "12px", textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px", lineHeight: 1.12, fontWeight: 700 };
const subtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.text, fontSize: "14px", lineHeight: 1.5 };
const riskInfoStyle: CSSProperties = { margin: "8px 0 0", color: colors.navy, fontSize: "14px", lineHeight: 1.5, fontWeight: 750 };
const typeBadgeStyle: CSSProperties = { flex: "0 0 auto", padding: "8px 12px", borderRadius: radius.badge, background: "rgba(23,59,115,0.08)", color: colors.navy, fontWeight: 900, fontSize: "12px" };
const sectionStyle: CSSProperties = { border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "18px", background: "#fff", display: "flex", flexDirection: "column", gap: "14px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px", fontWeight: 700 };
const twoColumnGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px", alignItems: "start" };
const singleFieldGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", maxWidth: "520px", gap: "14px", alignItems: "start" };
const fieldStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "7px", color: colors.navy, fontWeight: 850, fontSize: "13px", minWidth: 0 };
const fieldLabelStyle: CSSProperties = { minHeight: "20px", color: colors.navy, fontWeight: 850, fontSize: "13px", lineHeight: 1.25, display: "inline-flex", alignItems: "flex-end", gap: "3px", flexWrap: "wrap" };
const requiredMarkStyle: CSSProperties = { color: colors.navy, fontWeight: 900 };
const inputStyle: CSSProperties = { width: "100%", minHeight: "44px", border: `1px solid ${colors.border}`, borderRadius: radius.input, padding: "10px 12px", color: colors.text, fontWeight: 700, background: "#fff" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "92px", resize: "vertical", lineHeight: 1.45 };
const choiceListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const choiceRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, auto)", gap: "12px", alignItems: "center", borderBottom: `1px solid ${colors.border}`, paddingBottom: "10px" };
const choiceLabelStyle: CSSProperties = { color: colors.text, fontWeight: 800, fontSize: "13px", lineHeight: 1.35 };
const segmentedStyle: CSSProperties = { display: "inline-flex", border: `1px solid ${colors.border}`, borderRadius: radius.button, overflow: "hidden", background: colors.white, flex: "0 0 auto" };
const segmentStyle: CSSProperties = { minWidth: "54px", minHeight: "38px", border: "none", borderRight: `1px solid ${colors.border}`, background: colors.white, color: colors.navy, fontWeight: 900, cursor: "pointer", padding: "0 12px", whiteSpace: "nowrap" };
const segmentActiveStyle: CSSProperties = { ...segmentStyle, background: colors.navy, color: colors.white };
const confirmationStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-start", color: colors.text, fontWeight: 800, lineHeight: 1.45 };
const primaryButtonStyle: CSSProperties = { minHeight: "48px", padding: "0 20px", border: "none", borderRadius: radius.button, background: colors.red, color: colors.white, fontWeight: 900, cursor: "pointer", alignSelf: "flex-start" };
const disabledButtonStyle: CSSProperties = { ...primaryButtonStyle, opacity: 0.65, cursor: "not-allowed" };
