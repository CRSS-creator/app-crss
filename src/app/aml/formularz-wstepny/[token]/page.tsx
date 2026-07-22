"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { colors, radius, shadow } from "@/app/design";
import {
  emptyAmlInitialFormData,
  validateAmlInitialFormData,
  type AmlInitialFormData,
  type PublicAmlInitialFormResponse,
} from "@/lib/amlInitialFormTypes";

export default function AmlInitialFormPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [response, setResponse] = useState<PublicAmlInitialFormResponse | null>(null);
  const [draft, setDraft] = useState<AmlInitialFormData>(emptyAmlInitialFormData);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;

    let active = true;

    async function loadForm() {
      setLoading(true);
      const result = await fetch(`/api/public/aml-initial-form/${token}`);
      const data = (await result.json()) as PublicAmlInitialFormResponse;
      if (!active) return;

      setResponse(data);
      setLoading(false);
    }

    loadForm();

    return () => {
      active = false;
    };
  }, [token]);

  function updateDraft<K extends keyof AmlInitialFormData>(key: K, value: AmlInitialFormData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    const missing = validateAmlInitialFormData(draft);
    if (missing.length > 0) {
      alert(`Uzupełnij wymagane pola:\n\n${missing.join("\n")}`);
      return;
    }

    setSaving(true);
    const result = await fetch(`/api/public/aml-initial-form/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });

    setSaving(false);

    if (!result.ok) {
      const data = await result.json().catch(() => null);
      alert(data?.error || "Nie udało się zapisać formularza.");
      return;
    }

    setSaved(true);
    setResponse({ status: "completed" });
  }

  if (loading) {
    return <PublicShell><StatusMessage title="Ładowanie formularza..." text="Sprawdzamy indywidualny link do formularza wstępnego AML." /></PublicShell>;
  }

  if (saved || response?.status === "completed") {
    return <PublicShell><StatusMessage title="Formularz został zapisany" text="Dziękujemy. Link do formularza wstępnego AML został zamknięty." /></PublicShell>;
  }

  if (response?.status === "revoked") {
    return <PublicShell><StatusMessage title="Link jest nieważny" text="Ten link został unieważniony. Skontaktuj się z opiekunem." /></PublicShell>;
  }

  if (response?.status !== "active" || !response.client) {
    return <PublicShell><StatusMessage title="Nie znaleziono formularza" text="Sprawdź link albo skontaktuj się z opiekunem." /></PublicShell>;
  }

  return (
    <PublicShell>
      <form style={cardStyle} onSubmit={submitForm}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Aplikacja CRSS</p>
            <h1 style={titleStyle}>Formularz wstępny AML</h1>
            <p style={subtitleStyle}>{response.client.nazwa || "Klient"}{response.client.nip ? ` · NIP ${response.client.nip}` : ""}</p>
          </div>
        </div>

        <section style={sectionStyle}>
          <h2 style={sectionTitleStyle}>Odpowiedzi</h2>
          <Field label="Imię i nazwisko osoby wypełniającej" required>
            <input style={inputStyle} value={draft.completedBy} onChange={(event) => updateDraft("completedBy", event.target.value)} />
          </Field>
          <Field label="Odpowiedzi formularza wstępnego" required>
            <textarea
              style={textareaStyle}
              value={draft.answers}
              onChange={(event) => updateDraft("answers", event.target.value)}
              placeholder="To pole zostanie zastąpione docelowymi pytaniami formularza. Na tym etapie zapisuje odpowiedzi do PDF i zamyka link po wysłaniu."
            />
          </Field>
          <label style={confirmationStyle}>
            <input type="checkbox" checked={draft.confirmation} onChange={(event) => updateDraft("confirmation", event.target.checked)} />
            <span>Potwierdzam, że podane odpowiedzi są zgodne ze stanem faktycznym na dzień zapisu formularza.</span>
          </label>
        </section>

        <button type="submit" style={saving ? disabledButtonStyle : primaryButtonStyle} disabled={saving}>
          {saving ? "Zapisywanie..." : "Zapisz formularz"}
        </button>
      </form>
    </PublicShell>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <img src="/logo-crss-mail.png?v=6" alt="CRSS" style={logoStyle} />
        {children}
      </div>
    </main>
  );
}

function StatusMessage({ title, text }: { title: string; text: string }) {
  return (
    <section style={cardStyle}>
      <h1 style={titleStyle}>{title}</h1>
      <p style={subtitleStyle}>{text}</p>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span>{label}{required ? " *" : ""}</span>
      {children}
    </label>
  );
}

const pageStyle: CSSProperties = { minHeight: "100vh", background: "#eef3fb", padding: "32px 16px", color: colors.text };
const shellStyle: CSSProperties = { maxWidth: "860px", margin: "0 auto", display: "grid", gap: "18px" };
const logoStyle: CSSProperties = { width: "180px", height: "auto" };
const cardStyle: CSSProperties = { background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "18px", padding: "28px", boxShadow: shadow.card, display: "grid", gap: "22px" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start" };
const eyebrowStyle: CSSProperties = { margin: "0 0 6px", color: colors.danger, fontSize: "12px", fontWeight: 900, letterSpacing: "1px", textTransform: "uppercase" };
const titleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "30px", lineHeight: 1.15 };
const subtitleStyle: CSSProperties = { margin: "8px 0 0", color: colors.muted, lineHeight: 1.5 };
const sectionStyle: CSSProperties = { borderTop: `1px solid ${colors.border}`, paddingTop: "20px", display: "grid", gap: "16px" };
const sectionTitleStyle: CSSProperties = { margin: 0, color: colors.navy, fontSize: "20px" };
const fieldStyle: CSSProperties = { display: "grid", gap: "8px", color: colors.navy, fontWeight: 850 };
const inputStyle: CSSProperties = { minHeight: "44px", border: `1px solid ${colors.border}`, borderRadius: radius.button, background: colors.inputBackground, padding: "0 12px", color: colors.text, fontSize: "15px", outline: "none" };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: "220px", resize: "vertical", padding: "12px", lineHeight: 1.5 };
const confirmationStyle: CSSProperties = { display: "flex", gap: "10px", alignItems: "flex-start", color: colors.text, lineHeight: 1.5, fontWeight: 750 };
const primaryButtonStyle: CSSProperties = { minHeight: "48px", border: 0, borderRadius: radius.button, background: colors.danger, color: colors.white, fontWeight: 900, fontSize: "16px", cursor: "pointer" };
const disabledButtonStyle: CSSProperties = { ...primaryButtonStyle, opacity: 0.65, cursor: "not-allowed" };
