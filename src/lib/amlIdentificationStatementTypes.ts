export type YesNoValue = "" | "tak" | "nie";

export type AmlIdentificationStatementData = {
  clientName: string;
  clientIdentifier: string;
  verificationDate: string;
  verifiedBy: string;
  actionType: string;
  clientVerificationSources: string;
  clientVerificationResult: "pozytywny" | "wymaga_wyjasnien" | "negatywny" | "";
  clientNotes: string;
  beneficialOwnerName: string;
  beneficialOwnerControlType: string;
  beneficialOwnerSources: string[];
  ownershipStructureEstablished: YesNoValue;
  beneficialOwnerDataConsistent: YesNoValue;
  discrepanciesRequireExplanation: YesNoValue;
  discrepancyNotes: string;
  remoteSigned: YesNoValue;
  electronicSignatureTool: string;
  mobywatelVerification: YesNoValue;
  finalPositive: YesNoValue;
  finalRequiresCompletion: YesNoValue;
  finalNegative: YesNoValue;
  finalNotes: string;
  confirmation: boolean;
};

export type PublicAmlIdentificationStatementResponse = {
  status: "active" | "completed" | "revoked" | "missing";
  client?: {
    id: string;
    nazwa: string | null;
    nip: string | null;
  };
  defaults?: Partial<AmlIdentificationStatementData>;
};

export const ACTION_TYPE_OPTIONS = [
  { value: "pierwsza_weryfikacja", label: "pierwsza weryfikacja" },
  { value: "aktualizacja", label: "aktualizacja" },
  { value: "weryfikacja_po_zmianie_danych", label: "weryfikacja po zmianie danych" },
  { value: "weryfikacja_dodatkowa", label: "weryfikacja dodatkowa" },
];

export const BENEFICIAL_OWNER_SOURCE_OPTIONS = ["formularz klienta", "CEIDG", "CRBR", "KRS", "inne źródła"];

export function emptyAmlIdentificationStatementData(): AmlIdentificationStatementData {
  return {
    clientName: "",
    clientIdentifier: "",
    verificationDate: new Date().toISOString().slice(0, 10),
    verifiedBy: "",
    actionType: "",
    clientVerificationSources: "",
    clientVerificationResult: "",
    clientNotes: "",
    beneficialOwnerName: "",
    beneficialOwnerControlType: "",
    beneficialOwnerSources: [],
    ownershipStructureEstablished: "",
    beneficialOwnerDataConsistent: "",
    discrepanciesRequireExplanation: "",
    discrepancyNotes: "",
    remoteSigned: "",
    electronicSignatureTool: "",
    mobywatelVerification: "",
    finalPositive: "",
    finalRequiresCompletion: "",
    finalNegative: "",
    finalNotes: "",
    confirmation: false,
  };
}

export function validateAmlIdentificationStatementData(data: AmlIdentificationStatementData) {
  const missing: string[] = [];
  requireText(data.clientName, "Nazwa albo imię i nazwisko klienta", missing);
  requireText(data.clientIdentifier, "NIP, PESEL, KRS albo inny identyfikator", missing);
  requireText(data.verificationDate, "Data weryfikacji", missing);
  requireText(data.verifiedBy, "Osoba dokonująca weryfikacji", missing);
  requireText(data.actionType, "Rodzaj czynności", missing);
  requireText(data.clientVerificationSources, "Źródła weryfikacji klienta", missing);
  requireText(data.clientVerificationResult, "Wynik weryfikacji klienta", missing);
  requireText(data.beneficialOwnerName, "Imię i nazwisko beneficjenta rzeczywistego", missing);
  requireText(data.beneficialOwnerControlType, "Rodzaj kontroli beneficjenta rzeczywistego", missing);
  if (!data.beneficialOwnerSources?.length) missing.push("Źródła danych beneficjenta rzeczywistego");
  requireYesNo(data.ownershipStructureEstablished, "Czy struktura własności i kontroli została ustalona", missing);
  requireYesNo(data.beneficialOwnerDataConsistent, "Czy dane beneficjenta są spójne z rejestrami i dokumentami", missing);
  requireYesNo(data.discrepanciesRequireExplanation, "Czy występują rozbieżności wymagające wyjaśnienia", missing);
  if (data.discrepanciesRequireExplanation === "tak") requireText(data.discrepancyNotes, "Opis rozbieżności albo uwag", missing);
  requireYesNo(data.remoteSigned, "Czy umowa albo dokumenty zostały podpisane zdalnie", missing);
  requireYesNo(data.mobywatelVerification, "Czy zastosowano weryfikację przez mObywatel", missing);
  requireYesNo(data.finalPositive, "Wynik pozytywny", missing);
  requireYesNo(data.finalRequiresCompletion, "Wynik wymagający uzupełnienia", missing);
  requireYesNo(data.finalNegative, "Wynik negatywny", missing);
  if ((data.finalRequiresCompletion === "tak" || data.finalNegative === "tak") && !data.finalNotes.trim()) missing.push("Opis wymaganych uzupełnień albo decyzji");
  if (!data.confirmation) missing.push("Potwierdzenie zakończenia oświadczenia");
  return missing;
}

export function actionTypeLabel(value: string) {
  return ACTION_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || "-";
}

function requireText(value: string | null | undefined, label: string, missing: string[]) {
  if (!value?.trim()) missing.push(label);
}

function requireYesNo(value: YesNoValue | undefined, label: string, missing: string[]) {
  if (value !== "tak" && value !== "nie") missing.push(label);
}
