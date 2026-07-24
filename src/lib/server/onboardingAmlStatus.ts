import type { SupabaseClient } from "@supabase/supabase-js";

type OnboardingAmlStatus = "w_toku" | "gotowe";

type OnboardingAmlStage = {
  id: string;
  klient_id: string;
  etap: string;
  status: string;
};

type CompletionCheckResult = {
  verificationDone: boolean;
  initialFormDone: boolean;
  identificationStatementDone: boolean;
  riskAssessmentDone: boolean;
  riskLevelSet: boolean;
};

const DONE_STATUSES = new Set(["gotowe", "papierowo", "nowy_podmiot"]);

export async function markOnboardingAmlInProgress(admin: SupabaseClient, clientId: string, actorId: string | null = null) {
  await setOnboardingAmlStatus(admin, clientId, "w_toku", actorId, "Rozpoczęto weryfikację AML klienta.");
}

export async function completeOnboardingAmlIfReady(admin: SupabaseClient, clientId: string, actorId: string | null = null) {
  const completion = await getAmlCompletion(admin, clientId);
  if (!isAmlComplete(completion)) return;

  await setOnboardingAmlStatus(admin, clientId, "gotowe", actorId, "Wszystkie elementy AML są kompletne i poziom ryzyka został ustalony.");
}

async function setOnboardingAmlStatus(
  admin: SupabaseClient,
  clientId: string,
  status: OnboardingAmlStatus,
  actorId: string | null,
  description: string
) {
  const { data: stage } = await admin
    .from("onboarding_etapy")
    .select("id, klient_id, etap, status")
    .eq("klient_id", clientId)
    .eq("etap", "aml")
    .maybeSingle<OnboardingAmlStage>();

  if (!stage) return;
  if (stage.status === status) return;
  if (status === "w_toku" && DONE_STATUSES.has(stage.status)) return;

  const completedAt = status === "gotowe" ? new Date().toISOString() : null;
  await admin
    .from("onboarding_etapy")
    .update({
      status,
      updated_by: actorId,
      completed_at: completedAt,
      completed_by: status === "gotowe" ? actorId : null,
    })
    .eq("id", stage.id);

  await admin.from("onboarding_historia").insert({
    klient_id: clientId,
    onboarding_etap_id: stage.id,
    etap: "aml",
    akcja: "automatyczna_zmiana_statusu_aml",
    old_status: stage.status,
    new_status: status,
    opis: description,
    created_by: actorId,
  });
}

async function getAmlCompletion(admin: SupabaseClient, clientId: string): Promise<CompletionCheckResult> {
  const [registerResult, verificationsResult, initialFormsResult, statementsResult, riskAssessmentsResult] = await Promise.all([
    admin
      .from("aml_rejestr_klientow")
      .select("poziom_ryzyka")
      .eq("klient_id", clientId)
      .maybeSingle(),
    admin
      .from("aml_weryfikacje")
      .select("id, created_at, pdf_path")
      .eq("klient_id", clientId)
      .limit(1),
    admin
      .from("aml_formularze_wstepne")
      .select("id, completed_at, completed_pdf_document_id")
      .eq("klient_id", clientId)
      .or("completed_at.not.is.null,completed_pdf_document_id.not.is.null")
      .limit(1),
    admin
      .from("aml_oswiadczenia_weryfikacji")
      .select("id, completed_at, completed_pdf_document_id")
      .eq("klient_id", clientId)
      .or("completed_at.not.is.null,completed_pdf_document_id.not.is.null")
      .limit(1),
    admin
      .from("aml_oceny_ryzyka")
      .select("id, completed_at, completed_pdf_document_id, risk_level")
      .eq("klient_id", clientId)
      .or("completed_at.not.is.null,completed_pdf_document_id.not.is.null")
      .limit(1),
  ]);

  const riskAssessment = riskAssessmentsResult.data?.[0] as { risk_level?: string | null } | undefined;
  const register = registerResult.data as { poziom_ryzyka?: string | null } | null;

  return {
    verificationDone: Boolean(verificationsResult.data?.length),
    initialFormDone: Boolean(initialFormsResult.data?.length),
    identificationStatementDone: Boolean(statementsResult.data?.length),
    riskAssessmentDone: Boolean(riskAssessmentsResult.data?.length),
    riskLevelSet: Boolean(riskAssessment?.risk_level || register?.poziom_ryzyka),
  };
}

function isAmlComplete(completion: CompletionCheckResult) {
  return completion.verificationDone &&
    completion.initialFormDone &&
    completion.identificationStatementDone &&
    completion.riskAssessmentDone &&
    completion.riskLevelSet;
}
