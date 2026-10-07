export const LEGAL_FORM_OPTIONS = [
  { value: "JDG", label: "JDG" },
  { value: "spółka z o.o.", label: "spółka z o.o." },
  { value: "prosta spółka akcyjna", label: "prosta spółka akcyjna" },
  { value: "organizacja", label: "organizacja" },
] as const;

export const TAXATION_FORM_OPTIONS = [
  { value: "Skala podatkowa", label: "Skala podatkowa" },
  { value: "Podatek liniowy", label: "Podatek liniowy" },
  { value: "Ryczałt", label: "Ryczałt" },
  { value: "CIT", label: "CIT" },
] as const;

export type LegalForm = typeof LEGAL_FORM_OPTIONS[number]["value"];
export type TaxationForm = typeof TAXATION_FORM_OPTIONS[number]["value"];

export function normalizeLegalForm(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "jdg") return "JDG";
  if (["sp. z o.o.", "sp z oo", "spółka z o.o.", "spolka z o.o.", "sp zoo"].includes(normalized)) return "spółka z o.o.";
  if (["psa", "prosta spolka akcyjna", "prosta spółka akcyjna"].includes(normalized)) return "prosta spółka akcyjna";
  if (["spółka cywilna", "spolka cywilna", "inna", "inne", "organizacja"].includes(normalized)) return "organizacja";
  return value?.trim() || "";
}

export function normalizeTaxationForm(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized || normalized === "Karta podatkowa" || normalized === "Inne") return "";
  return normalized;
}

export const ZUS_SCHEME_OPTIONS = [
  { value: "Duży ZUS", label: "Duży ZUS" },
  { value: "Preferencyjny ZUS", label: "Preferencyjny ZUS" },
  { value: "Mały ZUS Plus", label: "Mały ZUS Plus" },
  { value: "Ulga na start", label: "Ulga na start" },
  { value: "Tylko zdrowotna", label: "Tylko zdrowotna" },
  { value: "Brak ZUS", label: "Brak ZUS" },
  { value: "Inny", label: "Inny" },
] as const;

// Older contract forms used shortened labels for these same schemes.
export function normalizeZusScheme(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  if (trimmed.toLowerCase() === "brak") return "Brak ZUS";
  if (trimmed.toLowerCase() === "preferencyjny") return "Preferencyjny ZUS";
  return ZUS_SCHEME_OPTIONS.find(option => option.value.toLowerCase() === trimmed.toLowerCase())?.value || trimmed;
}
