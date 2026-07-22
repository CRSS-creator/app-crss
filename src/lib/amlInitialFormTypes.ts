export type AmlInitialFormData = {
  completedBy: string;
  answers: string;
  confirmation: boolean;
};

export const emptyAmlInitialFormData: AmlInitialFormData = {
  completedBy: "",
  answers: "",
  confirmation: false,
};

export type PublicAmlInitialFormResponse = {
  status: "active" | "completed" | "revoked" | "missing";
  client?: {
    id: string;
    nazwa: string | null;
    nip: string | null;
    email: string | null;
  };
};

export function validateAmlInitialFormData(data: AmlInitialFormData) {
  const missing: string[] = [];
  if (!data.completedBy?.trim()) missing.push("Imię i nazwisko osoby wypełniającej");
  if (!data.answers?.trim()) missing.push("Odpowiedzi formularza");
  if (!data.confirmation) missing.push("Potwierdzenie zgodności danych");
  return missing;
}
