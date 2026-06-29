"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import AppSelect from "@/components/AppSelect";
import { colors, radius, shadow } from "@/app/design";
import { LEGAL_FORM_OPTIONS, TAXATION_FORM_OPTIONS } from "@/lib/clientDictionaries";
import { createClient as createClientRecord, fetchClientCaregivers } from "@/lib/clientService";
import { updateCrmContract, type CrmContract } from "@/lib/crmContractService";

type Caregiver = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type ClientOnboardingDraft = {
  telefon: string;
  forma_prawna: string;
  forma_opodatkowania: string;
  status_klienta: string;
  opiekun_id: string;
  czynny_vat: boolean;
  vat_ue: boolean;
  schemat_zus: string;
  model_fakturowania: string;
  ostatni_okres_rozliczeniowy: string;
  koszt_obslugi_pracownika: string;
  koszt_obslugi_zleceniobiorcy: string;
  koszt_dodatkowego_dokumentu: string;
  notatki: string;
};

type SelectOption = { value: string; label: string };

type Props = {
  contract: CrmContract;
  onCreated: (contract: CrmContract) => void;
};

const CLIENT_STATUSES = ["Onboarding", "Aktywny", "Zawieszony", "Do zamknięcia", "Archiwalny"];
const ZUS_OPTIONS = ["", "Brak", "Preferencyjny", "Mały ZUS Plus", "Pełny ZUS", "Tylko zdrowotna"];
const BILLING_MODEL_OPTIONS = [
  { value: "z_dolu", label: "Z dołu" },
  { value: "z_gory", label: "Z góry" },
];

export default function ContractClientOnboardingPanel({ contract, onCreated }: Props) {
  const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ClientOnboardingDraft>(() => createEmptyDraft(contract));
  const isDraftJdg = isJdgLegalForm(draft.forma_prawna);

  useEffect(() => {
    setDraft(createEmptyDraft(contract));
  }, [contract.id]);

  useEffect(() => {
    let active = true;

    fetchClientCaregivers().then((result) => {
      if (!active) return;
      if (result.error) {
        console.error("Błąd pobierania opiekunów klienta:", result.error);
        return;
      }
      setCaregivers((result.data || []) as Caregiver[]);
    });

    return () => {
      active = false;
    };
  }, []);

  const canCreate = useMemo(() => contract.status === "podpisana" && !contract.klient_id, [contract.status, contract.klient_id]);

  if (!canCreate) return null;

  function updateDraft<K extends keyof ClientOnboardingDraft>(key: K, value: ClientOnboardingDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function createClientFromContract() {
    if (!contract.nazwa_klienta.trim()) {
      alert("Umowa nie ma nazwy klienta. Uzupełnij ją w danych umowy.");
      return;
    }

    setSaving(true);

    const clientResult = await createClientRecord({
      nazwa: contract.nazwa_klienta.trim(),
      nip: nullableToNull(contract.nip),
      telefon: emptyToNull(draft.telefon),
      email: nullableToNull(contract.email_klienta),
      forma_prawna: emptyToNull(draft.forma_prawna),
      forma_opodatkowania: emptyToNull(draft.forma_opodatkowania),
      status_klienta: draft.status_klienta || "Onboarding",
      opiekun_id: emptyToNull(draft.opiekun_id),
      obsluga_kadrowa: Boolean(contract.obsluga_kadrowa),
      czynny_vat: draft.czynny_vat,
      vat_ue: draft.vat_ue,
      schemat_zus: isDraftJdg ? emptyToNull(draft.schemat_zus) : null,
      model_fakturowania: draft.model_fakturowania || "z_dolu",
      abonament: contract.abonament_netto ?? null,
      limit_dokumentow: contract.limit_dokumentow ?? null,
      pierwszy_okres_rozliczeniowy: normalizeMonth(monthInputFromText(contract.pierwszy_okres)),
      ostatni_okres_rozliczeniowy: normalizeMonth(draft.ostatni_okres_rozliczeniowy),
      koszt_obslugi_pracownika: numberOrNull(draft.koszt_obslugi_pracownika),
      koszt_obslugi_zleceniobiorcy: numberOrNull(draft.koszt_obslugi_zleceniobiorcy),
      koszt_dodatkowego_dokumentu: numberOrNull(draft.koszt_dodatkowego_dokumentu),
      dodatkowe_uslugi: nullableToNull(contract.ustalenia_indywidualne),
      notatki: emptyToNull(draft.notatki),
    });

    if (clientResult.error || !clientResult.data) {
      setSaving(false);
      console.error("Błąd tworzenia klienta z umowy:", clientResult.error);
      alert("Nie udało się utworzyć klienta z umowy.");
      return;
    }

    const createdClient = clientResult.data as { id: string };
    const contractResult = await updateCrmContract(contract.id, {
      klient_id: createdClient.id,
    });

    setSaving(false);

    if (contractResult.error || !contractResult.data) {
      console.error("Klient został utworzony, ale nie udało się powiązać umowy:", contractResult.error);
      alert("Klient został utworzony, ale nie udało się powiązać go z umową.");
      return;
    }

    onCreated(contractResult.data as CrmContract);
    alert("Klient został utworzony i powiązany z podpisaną umową.");
  }

  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <p style={eyebrowStyle}>Onboarding klienta</p>
          <h3 style={titleStyle}>Uzupełnij dane operacyjne klienta</h3>
        </div>
        <button type="button" style={primaryButtonStyle} onClick={createClientFromContract} disabled={saving}>
          {saving ? "Tworzenie..." : "Utwórz klienta"}
        </button>
      </div>

      <div style={gridStyle}>
        <TextField label="Telefon" value={draft.telefon} onChange={(value) => updateDraft("telefon", value)} />
        <SelectField label="Opiekun" value={draft.opiekun_id} onChange={(value) => updateDraft("opiekun_id", value)} options={[{ value: "", label: "Do uzupełnienia" }, ...caregivers.map((caregiver) => ({ value: caregiver.id, label: caregiver.full_name || caregiver.email || "Użytkownik" }))]} />
        <SelectField label="Forma prawna" value={draft.forma_prawna} onChange={(value) => { updateDraft("forma_prawna", value); if (!isJdgLegalForm(value)) updateDraft("schemat_zus", ""); }} options={[{ value: "", label: "Do uzupełnienia" }, ...LEGAL_FORM_OPTIONS]} />
        <SelectField label="Opodatkowanie" value={draft.forma_opodatkowania} onChange={(value) => updateDraft("forma_opodatkowania", value)} options={[{ value: "", label: "Do uzupełnienia" }, ...TAXATION_FORM_OPTIONS]} />
        <SelectField label="Status klienta" value={draft.status_klienta} onChange={(value) => updateDraft("status_klienta", value)} options={CLIENT_STATUSES.map((status) => ({ value: status, label: status }))} />
        {isDraftJdg && <SelectField label="Schemat ZUS" value={draft.schemat_zus} onChange={(value) => updateDraft("schemat_zus", value)} options={ZUS_OPTIONS.map((option) => ({ value: option, label: option || "Do uzupełnienia" }))} />}
        <SelectField label="Schemat płatności faktury" value={draft.model_fakturowania} onChange={(value) => updateDraft("model_fakturowania", value)} options={BILLING_MODEL_OPTIONS} />
        <TextField label="Ostatni okres" type="month" value={draft.ostatni_okres_rozliczeniowy} onChange={(value) => updateDraft("ostatni_okres_rozliczeniowy", value)} />
        <TextField label="Koszt pracownika" type="number" value={draft.koszt_obslugi_pracownika} onChange={(value) => updateDraft("koszt_obslugi_pracownika", value)} />
        <TextField label="Koszt zleceniobiorcy" type="number" value={draft.koszt_obslugi_zleceniobiorcy} onChange={(value) => updateDraft("koszt_obslugi_zleceniobiorcy", value)} />
        <TextField label="Koszt dodatkowego dokumentu" type="number" value={draft.koszt_dodatkowego_dokumentu} onChange={(value) => updateDraft("koszt_dodatkowego_dokumentu", value)} />
        <div style={checkboxGroupStyle}>
          <CheckboxField label="Czynny VAT" checked={draft.czynny_vat} onChange={(value) => updateDraft("czynny_vat", value)} />
          <CheckboxField label="VAT-UE" checked={draft.vat_ue} onChange={(value) => updateDraft("vat_ue", value)} />
        </div>
        <TextareaField label="Notatki" value={draft.notatki} onChange={(value) => updateDraft("notatki", value)} />
      </div>
    </section>
  );
}

function createEmptyDraft(contract: CrmContract): ClientOnboardingDraft {
  return {
    telefon: "",
    forma_prawna: "",
    forma_opodatkowania: contract.typ_umowy === "KH" ? "CIT" : "",
    status_klienta: "Onboarding",
    opiekun_id: "",
    czynny_vat: false,
    vat_ue: false,
    schemat_zus: "",
    model_fakturowania: "z_dolu",
    ostatni_okres_rozliczeniowy: "",
    koszt_obslugi_pracownika: "",
    koszt_obslugi_zleceniobiorcy: "",
    koszt_dodatkowego_dokumentu: "",
    notatki: "",
  };
}

function monthInputFromText(value: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7);

  const match = trimmed.toLowerCase().match(/^([a-ząćęłńóśźż]+)\s+(\d{4})$/);
  if (!match) return "";

  const month = POLISH_MONTHS[match[1]];
  return month ? `${match[2]}-${month}` : "";
}

function normalizeMonth(value: string) {
  return value ? `${value}-01` : null;
}

function emptyToNull(value: string) {
  return value.trim() ? value.trim() : null;
}

function nullableToNull(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isJdgLegalForm(value: string) {
  const normalized = value.toLowerCase();
  return normalized.includes("jdg") || normalized.includes("jednoosob");
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "email" | "number" | "month" }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly SelectOption[] }) {
  return (
    <label style={fieldStyle}>
      <span>{label}</span>
      <AppSelect value={value} onChange={onChange} style={inputStyle} options={options} />
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label style={checkboxStyle}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TextareaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} style={textareaStyle} rows={3} />
    </label>
  );
}

const POLISH_MONTHS: Record<string, string> = {
  styczeń: "01",
  stycznia: "01",
  luty: "02",
  lutego: "02",
  marzec: "03",
  marca: "03",
  kwiecień: "04",
  kwietnia: "04",
  maj: "05",
  maja: "05",
  czerwiec: "06",
  czerwca: "06",
  lipiec: "07",
  lipca: "07",
  sierpień: "08",
  sierpnia: "08",
  wrzesień: "09",
  września: "09",
  październik: "10",
  października: "10",
  listopad: "11",
  listopada: "11",
  grudzień: "12",
  grudnia: "12",
};

const sectionStyle: CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: radius.card,
  padding: "20px",
  background: colors.card,
  boxShadow: shadow.soft,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "flex-start",
  marginBottom: "18px",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 6px",
  color: colors.red,
  fontWeight: 850,
  fontSize: "13px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: colors.navy,
  fontSize: "20px",
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
  fontWeight: 800,
  fontSize: "13px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: `1px solid ${colors.border}`,
  borderRadius: radius.input,
  padding: "11px 12px",
  background: colors.inputBackground,
  color: colors.text,
  fontWeight: 650,
  outline: "none",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "88px",
  resize: "vertical",
  lineHeight: 1.55,
};

const checkboxGroupStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "10px",
  alignItems: "center",
  alignSelf: "end",
};

const checkboxStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  minHeight: "44px",
  color: colors.text,
  fontWeight: 800,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: radius.button,
  padding: "11px 15px",
  minHeight: "42px",
  background: colors.red,
  color: colors.white,
  fontWeight: 850,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};
