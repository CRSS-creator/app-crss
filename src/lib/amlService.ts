import { supabase } from "@/lib/supabaseClient";

export type AmlRegisterRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  status: string;
  poziom_ryzyka: string | null;
  pep_status: string | null;
  sankcje_status: string | null;
  ostatnia_weryfikacja_at: string | null;
  ostatnia_weryfikacja_by: string | null;
  ostatnia_weryfikacja_id: string | null;
  nastepna_weryfikacja_at: string | null;
  dane_rejestrowe: Record<string, unknown>;
  beneficjenci_rzeczywisci: Array<Record<string, unknown>>;
  numer_regon: string | null;
  numer_krs: string | null;
  gus_status: string | null;
  krs_status: string | null;
  crbr_status: string | null;
  kody_pkd: Array<Record<string, unknown>>;
  uwagi: string | null;
};

export type AmlVerificationRecord = {
  id: string;
  created_at: string;
  klient_id: string;
  aml_rejestr_id: string | null;
  wykonana_by: string | null;
  status: string;
  wynik: string;
  zrodla: Array<Record<string, unknown>>;
  dane: Record<string, unknown>;
  vat_status: string | null;
  vies_status: string | null;
  krs_status: string | null;
  pep_status: string | null;
  sankcje_status: string | null;
  numer_krs: string | null;
  numer_regon: string | null;
  identyfikator_zapytania: string | null;
  pdf_path: string | null;
  pdf_name: string | null;
};

export type AmlHistoryRecord = {
  id: string;
  created_at: string;
  klient_id: string;
  aml_rejestr_id: string | null;
  aml_weryfikacja_id: string | null;
  akcja: string;
  opis: string;
  zmiany: Record<string, unknown>;
  created_by: string | null;
};

export type AmlInitialFormRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  aml_rejestr_id: string | null;
  public_token: string;
  status: "active" | "completed" | "revoked";
  recipient_email: string | null;
  recipient_name: string | null;
  sent_at: string | null;
  sent_by: string | null;
  sent_by_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  completed_pdf_document_id: string | null;
  form_data: Record<string, unknown>;
};

export async function fetchAmlRegisters() {
  return supabase
    .from("aml_rejestr_klientow")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function fetchAmlVerifications() {
  return supabase
    .from("aml_weryfikacje")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function fetchAmlHistory() {
  return supabase
    .from("aml_historia")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function verifyClientAml(clientId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się wykonać weryfikacji AML.") };
  }

  return { data: body?.verification || null, error: null };
}

export async function fetchAmlInitialForms() {
  return supabase
    .from("aml_formularze_wstepne")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function updateNextAmlVerificationDate(clientId: string, nextVerificationDate: string | null) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/next-verification", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId, nextVerificationDate }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się zapisać daty następnej weryfikacji AML.") };
  }

  return { data: body?.register || null, error: null };
}

export async function updateAmlBeneficialOwner(
  clientId: string,
  ownerIndex: number,
  changes: {
    rola: string;
    reprezentant: boolean;
    udzialowiec: boolean;
    procentUdzialow: string | null;
    wartoscUdzialow: string | null;
  }
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji u\u017cytkownika.") };

  const response = await fetch("/api/aml/beneficial-owner", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId, ownerIndex, changes }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie uda\u0142o si\u0119 zapisa\u0107 danych beneficjenta rzeczywistego.") };
  }

  return { data: body?.register || null, error: null };
}

export async function sendAmlInitialForm(clientId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/initial-form-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się wysłać formularza wstępnego AML.") };
  }

  return { data: body as { ok: boolean; formUrl?: string }, error: null };
}

export async function uploadArchivedAmlReport(clientId: string, file: File) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const formData = new FormData();
  formData.append("clientId", clientId);
  formData.append("file", file);

  const response = await fetch("/api/aml/archive-report", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się dodać archiwalnego raportu AML.") };
  }

  return { data: body?.verification || null, error: null };
}

export async function uploadCrbrAmlPdf(clientId: string, file: File) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const formData = new FormData();
  formData.append("clientId", clientId);
  formData.append("file", file);

  const response = await fetch("/api/aml/crbr-report", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się dodać PDF z CRBR.") };
  }

  return { data: body?.verification || null, error: null };
}

export async function runPepOsintCheck(clientId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/pep-osint", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się wykonać sprawdzenia PEP OSINT.") };
  }

  return { data: body?.pepOsint || null, error: null };
}

export async function getAmlReportUrl(verificationId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/report-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ verificationId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się pobrać linku do raportu AML.") };
  }

  return { data: body as { url: string; fileName: string }, error: null };
}
