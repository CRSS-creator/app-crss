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
  wazny_do: string | null;
  form_data: Record<string, unknown>;
};

export type AmlIdentificationStatementRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  aml_rejestr_id: string | null;
  public_token: string;
  status: "active" | "completed" | "revoked";
  created_by: string | null;
  created_by_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  completed_pdf_document_id: string | null;
  verification_date: string | null;
  action_type: string | null;
  form_data: Record<string, unknown>;
};

export type AmlRiskAssessmentRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  aml_rejestr_id: string | null;
  public_token: string;
  status: "active" | "completed" | "revoked";
  created_by: string | null;
  created_by_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  completed_pdf_document_id: string | null;
  assessment_date: string | null;
  assessment_basis: string | null;
  risk_level: string | null;
  next_update_date: string | null;
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

export async function fetchAmlIdentificationStatements() {
  return supabase
    .from("aml_oswiadczenia_weryfikacji")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function fetchAmlRiskAssessments() {
  return supabase
    .from("aml_oceny_ryzyka")
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

export async function uploadArchivedAmlInitialForm(clientId: string, file: File, completedDate: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const formData = new FormData();
  formData.append("clientId", clientId);
  formData.append("completedDate", completedDate);
  formData.append("file", file);

  const response = await fetch("/api/aml/initial-form-archive", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się dodać archiwalnego formularza wstępnego AML.") };
  }

  return { data: body?.form || null, error: null };
}

export async function createAmlIdentificationStatement(clientId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/identification-statement-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się utworzyć linku do oświadczenia AML.") };
  }

  return { data: body as { ok: boolean; statementUrl?: string }, error: null };
}

export async function uploadArchivedAmlIdentificationStatement(clientId: string, file: File, completedDate: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const formData = new FormData();
  formData.append("clientId", clientId);
  formData.append("completedDate", completedDate);
  formData.append("file", file);

  const response = await fetch("/api/aml/identification-statement-archive", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się dodać archiwalnego oświadczenia AML.") };
  }

  return { data: body?.statement || null, error: null };
}

export async function createAmlRiskAssessment(clientId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/risk-assessment-request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ clientId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się utworzyć oceny ryzyka AML.") };
  }

  return { data: body as { ok: boolean; assessmentUrl?: string }, error: null };
}

export async function uploadArchivedAmlRiskAssessment(clientId: string, file: File, completedDate: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const formData = new FormData();
  formData.append("clientId", clientId);
  formData.append("completedDate", completedDate);
  formData.append("file", file);

  const response = await fetch("/api/aml/risk-assessment-archive", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się dodać archiwalnej oceny ryzyka AML.") };
  }

  return { data: body?.assessment || null, error: null };
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

export async function getAmlInitialFormPdfUrl(formId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/initial-form-pdf-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ formId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się pobrać linku do formularza wstępnego AML.") };
  }

  return { data: body as { url: string; fileName: string }, error: null };
}

export async function getAmlIdentificationStatementPdfUrl(statementId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/identification-statement-pdf-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ statementId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się pobrać linku do oświadczenia AML.") };
  }

  return { data: body as { url: string; fileName: string }, error: null };
}

export async function getAmlRiskAssessmentPdfUrl(assessmentId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/risk-assessment-pdf-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ assessmentId }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return { data: null, error: new Error(body?.error || "Nie udało się pobrać linku do oceny ryzyka AML.") };
  }

  return { data: body as { url: string; fileName: string }, error: null };
}

export async function generateAmlInstitutionRiskPdf() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { data: null, error: new Error("Brak aktywnej sesji użytkownika.") };

  const response = await fetch("/api/aml/institution-risk-pdf", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return { data: null, error: new Error(body?.error || "Nie udało się wygenerować weryfikacji instytucji obowiązanej.") };
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const encodedFileName = disposition.match(/filename="([^"]+)"/)?.[1];
  const fileName = encodedFileName ? decodeURIComponent(encodedFileName) : "Weryfikacja instytucji obowiązanej.pdf";

  return { data: { blob, fileName }, error: null };
}
