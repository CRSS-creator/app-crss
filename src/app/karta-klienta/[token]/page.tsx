"use client";

import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { colors, radius, shadow } from "@/app/design";
import { emptyClientCardFormData, type ClientCardFormData, type PublicClientCardResponse } from "@/lib/clientCardTypes";

const YES_NO_OPTIONS = [
  { value: "", label: "Wybierz" },
  { value: "tak", label: "Tak" },
  { value: "nie", label: "Nie" },
];

const TAX_OPTIONS = [
  { value: "", label: "Wybierz" },
  { value: "Skala podatkowa", label: "Skala podatkowa" },
  { value: "Podatek liniowy", label: "Podatek liniowy" },
  { value: "Ryczałt", label: "Ryczałt" },
  { value: "CIT", label: "CIT" },
];

export default function ClientCardPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [response, setResponse] = useState<PublicClientCardResponse | null>(null);
  const [draft, setDraft] = useState<ClientCardFormData>(emptyClientCardFormData);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;

    let active = true;

    async function loadForm() {
      setLoading(true);
      const result = await fetch(`/api/public/client-card/${token}`);
      const data = (await result.json()) as PublicClientCardResponse;
      if (!active) return;

      setResponse(data);
      if (data.status === "active" && data.client) {
        setDraft({
          ...emptyClientCardFormData,
          osobaKontaktowa: data.client.osoba_kontaktowa || "",
          telefon: data.client.telefon || "",
          formaOpodatkowania: data.client.forma_opodatkowania || "",
          czynnyVat: data.client.czynny_vat === true ? "tak" : data.client.czynny_vat === false ? "nie" : "",
          vatUe: data.client.vat_ue === true ? "tak" : data.client.vat_ue === false ? "nie" : "",
        });
      }
      setLoading(false);
    }

    loadForm();

    return () => {
      active = false;
    };
  }, [token]);

  function updateDraft<K extends keyof ClientCardFormData>(key: K, value: ClientCardFormData[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleListValue(key: "vatZwolnieniePodstawy" | "vatUePowody", value: string) {
    setDraft((current) => {
      const currentList = current[key];
      return {
        ...current,
        [key]: currentList.includes(value)
          ? currentList.filter((item) => item !== value)
          : [...currentList, value],
      };
    });
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;

    if (!draft.osobaKontaktowa.trim() || !draft.potwierdzenie) {
      alert("Uzupełnij osobę kontaktową i potwierdź prawdziwość danych.");
      return;
    }

    setSaving(true);
    const result = await fetch(`/api/public/client-card/${token}`, {
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
    return <PublicShell><StatusMessage title="Ładowanie formularza..." text="Sprawdzamy indywidualny link do karty klienta." /></PublicShell>;
  }

  if (saved || response?.status === "completed") {
    return <PublicShell><StatusMessage title="Formularz został zapisany" text="Dziękujemy. Link do karty klienta został zamknięty." /></PublicShell>;
  }

  if (response?.status === "revoked") {
    return <PublicShell><StatusMessage title="Link jest nieważny" text="Ten link został unieważniony. Skontaktuj się z opiekunem księgowym." /></PublicShell>;
  }

  if (response?.status !== "active" || !response.client) {
    return <PublicShell><StatusMessage title="Nie znaleziono formularza" text="Sprawdź link albo skontaktuj się z opiekunem księgowym." /></PublicShell>;
  }

  return (
    <PublicShell>
      <form style={cardStyle} onSubmit={submitForm}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Aplikacja CRSS</p>
            <h1 style={titleStyle}>Karta klienta biura rachunkowego</h1>
            <p style={subtitleStyle}>{response.client.nazwa || "Klient"}{response.client.nip ? ` · NIP ${response.client.nip}` : ""}</p>
          </div>
        </div>

        <Section title="Dane podstawowe">
          <Field label="Osoba kontaktowa" required>
            <input style={inputStyle} value={draft.osobaKontaktowa} onChange={(event) => updateDraft("osobaKontaktowa", event.target.value)} />
          </Field>
          <Field label="Telefon">
            <input style={inputStyle} value={draft.telefon} onChange={(event) => updateDraft("telefon", event.target.value)} />
          </Field>
          <Field label="Adres działalności">
            <input style={inputStyle} value={draft.adresDzialalnosci} onChange={(event) => updateDraft("adresDzialalnosci", event.target.value)} />
          </Field>
          <Field label="Adres zamieszkania">
            <input style={inputStyle} value={draft.adresZamieszkania} onChange={(event) => updateDraft("adresZamieszkania", event.target.value)} disabled={draft.adresZamieszkaniaJakDzialalnosci} />
          </Field>
          <label style={inlineCheckboxStyle}>
            <input
              type="checkbox"
              checked={draft.adresZamieszkaniaJakDzialalnosci}
              onChange={(event) => {
                updateDraft("adresZamieszkaniaJakDzialalnosci", event.target.checked);
                if (event.target.checked) updateDraft("adresZamieszkania", draft.adresDzialalnosci);
              }}
            />
            <span>Adres zamieszkania taki sam jak adres działalności</span>
          </label>
          <Field label="Forma opodatkowania">
            <select style={inputStyle} value={draft.formaOpodatkowania} onChange={(event) => updateDraft("formaOpodatkowania", event.target.value)}>
              {TAX_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Właściwy Urząd Skarbowy">
            <input style={inputStyle} value={draft.urzadSkarbowy} onChange={(event) => updateDraft("urzadSkarbowy", event.target.value)} />
          </Field>
          <Field label="Usługi na rzecz byłego pracodawcy w bieżącym lub poprzednim roku">
            <select style={inputStyle} value={draft.uslugiBylyPracodawca} onChange={(event) => updateDraft("uslugiBylyPracodawca", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Sprzedaż na rzecz osób prywatnych z innych krajów UE">
            <select style={inputStyle} value={draft.sprzedazOsobyPrywatneUe} onChange={(event) => updateDraft("sprzedazOsobyPrywatneUe", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="VAT">
          <Field label="Czy firma jest czynnym podatnikiem VAT">
            <select style={inputStyle} value={draft.czynnyVat} onChange={(event) => updateDraft("czynnyVat", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {draft.czynnyVat === "tak" && (
            <Field label="Forma rozliczenia VAT">
              <select style={inputStyle} value={draft.vatFormaRozliczenia} onChange={(event) => updateDraft("vatFormaRozliczenia", event.target.value)}>
                <option value="">Wybierz</option>
                <option value="miesięczne">Miesięczne</option>
                <option value="kwartalne">Kwartalne</option>
                <option value="metoda kasowa">Metoda kasowa</option>
              </select>
            </Field>
          )}
          {draft.czynnyVat === "nie" && (
            <CheckboxGroup
              label="Podstawa zwolnienia z VAT"
              values={draft.vatZwolnieniePodstawy}
              options={["Zwolnienie podmiotowe do 240 tys.", "Zwolnienie przedmiotowe"]}
              onToggle={(value) => toggleListValue("vatZwolnieniePodstawy", value)}
            />
          )}
          <Field label="VAT-UE">
            <select style={inputStyle} value={draft.vatUe} onChange={(event) => updateDraft("vatUe", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {draft.vatUe === "tak" && (
            <CheckboxGroup
              label="Powód rejestracji VAT-UE"
              values={draft.vatUePowody}
              options={["Nabywanie towarów z UE", "Świadczenie usług na rzecz podmiotów z UE", "Import usług od podmiotów z UE"]}
              onToggle={(value) => toggleListValue("vatUePowody", value)}
            />
          )}
        </Section>

        <Section title="ZUS">
          <Field label="Ulgi ZUS dotyczące składek społecznych">
            <select style={inputStyle} value={draft.zusUlga} onChange={(event) => updateDraft("zusUlga", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {draft.zusUlga === "tak" && (
            <Field label="Tytuł ulgi ZUS">
              <select style={inputStyle} value={draft.zusUlgaTytul} onChange={(event) => updateDraft("zusUlgaTytul", event.target.value)}>
                <option value="">Wybierz</option>
                <option value="ulga na start">Ulga na start</option>
                <option value="składki preferencyjne">Składki preferencyjne</option>
                <option value="mały ZUS plus">Mały ZUS plus</option>
              </select>
            </Field>
          )}
          <Field label="Tylko składka zdrowotna z działalności">
            <select style={inputStyle} value={draft.tylkoZdrowotne} onChange={(event) => updateDraft("tylkoZdrowotne", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {draft.tylkoZdrowotne === "tak" && <Field label="Tytuł do składek z innego źródła"><input style={inputStyle} value={draft.tylkoZdrowotneTytul} onChange={(event) => updateDraft("tylkoZdrowotneTytul", event.target.value)} /></Field>}
          <Field label="Dobrowolne chorobowe">
            <select style={inputStyle} value={draft.chorobowe} onChange={(event) => updateDraft("chorobowe", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Orzeczenie o niepełnosprawności">
            <select style={inputStyle} value={draft.niepelnosprawnosc} onChange={(event) => updateDraft("niepelnosprawnosc", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {draft.niepelnosprawnosc === "tak" && <Field label="Stopień niepełnosprawności"><input style={inputStyle} value={draft.stopienNiepelnosprawnosci} onChange={(event) => updateDraft("stopienNiepelnosprawnosci", event.target.value)} /></Field>}
          <Field label="Prawo do emerytury lub renty">
            <select style={inputStyle} value={draft.emeryturaRenta} onChange={(event) => updateDraft("emeryturaRenta", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </Section>

        <Section title="Kasa fiskalna">
          <Field label="Czy firma posiada kasę fiskalną">
            <select style={inputStyle} value={draft.kasaFiskalna} onChange={(event) => updateDraft("kasaFiskalna", event.target.value)}>
              {YES_NO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          {draft.kasaFiskalna === "nie" && (
            <Field label="Powód zwolnienia z kasy fiskalnej">
              <select style={inputStyle} value={draft.kasaFiskalnaZwolnienie} onChange={(event) => updateDraft("kasaFiskalnaZwolnienie", event.target.value)}>
                <option value="">Wybierz</option>
                <option value="brak transakcji z osobami fizycznymi">Brak transakcji z osobami fizycznymi</option>
                <option value="sprzedaż zwolniona do limitu 20 tys.">Sprzedaż zwolniona do limitu 20 tys.</option>
                <option value="transakcje bezgotówkowe z osobami fizycznymi">Transakcje bezgotówkowe z osobami fizycznymi</option>
              </select>
            </Field>
          )}
        </Section>

        <label style={confirmationStyle}>
          <input type="checkbox" checked={draft.potwierdzenie} onChange={(event) => updateDraft("potwierdzenie", event.target.checked)} />
          <span>Potwierdzam, że podane dane są zgodne z prawdą, a zmiany zostaną przekazane do CRSS w terminie 7 dni.</span>
        </label>

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={gridStyle}>{children}</div>
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

function CheckboxGroup({ label, values, options, onToggle }: { label: string; values: string[]; options: string[]; onToggle: (value: string) => void }) {
  return (
    <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
      <span>{label}</span>
      <div style={checkboxGridStyle}>
        {options.map((option) => (
          <label key={option} style={inlineCheckboxStyle}>
            <input type="checkbox" checked={values.includes(option)} onChange={() => onToggle(option)} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "#f3f6fb",
  padding: "48px 20px",
  color: colors.text,
};

const shellStyle: CSSProperties = {
  width: "min(980px, 100%)",
  margin: "0 auto",
};

const logoStyle: CSSProperties = {
  width: "180px",
  height: "auto",
  display: "block",
  marginBottom: "22px",
};

const cardStyle: CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  boxShadow: shadow.soft,
  padding: "28px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "18px",
  marginBottom: "22px",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 6px",
  color: colors.red,
  fontWeight: 850,
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "34px",
  fontWeight: 500,
};

const subtitleStyle: CSSProperties = {
  margin: "10px 0 0",
  color: colors.muted,
  lineHeight: 1.55,
};

const sectionStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "18px",
  marginTop: "16px",
  background: "#f8fbff",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 16px",
  color: colors.navy,
  fontSize: "22px",
  fontWeight: 500,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "14px",
};

const fieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "7px",
  color: colors.muted,
  fontSize: "13px",
  fontWeight: 800,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: "46px",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  padding: "10px 12px",
  background: colors.card,
  color: colors.text,
  fontWeight: 700,
  outline: "none",
};

const checkboxGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
};

const inlineCheckboxStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: colors.text,
  fontWeight: 750,
};

const confirmationStyle: CSSProperties = {
  ...inlineCheckboxStyle,
  alignItems: "flex-start",
  margin: "20px 0",
  lineHeight: 1.5,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: radius.button,
  padding: "14px 22px",
  minHeight: "48px",
  background: colors.red,
  color: colors.white,
  fontWeight: 850,
  cursor: "pointer",
};

const disabledButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "#e8eef8",
  color: colors.muted,
  cursor: "not-allowed",
};
