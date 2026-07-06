import { supabase } from "@/lib/supabaseClient";

export type OnboardingStageKey = "contract" | "rodo" | "aml" | "client_card" | "powers" | "wfirma_account" | "wfirma" | "documents_takeover" | "drive" | "recurring";
export type OnboardingStageStatus = "do_wykonania" | "w_toku" | "gotowe" | "zablokowane" | "papierowo" | "nowy_podmiot";

export type OnboardingStageRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  etap: OnboardingStageKey;
  status: OnboardingStageStatus;
  uwagi: string | null;
  completed_at: string | null;
  completed_by: string | null;
  updated_by: string | null;
};

export type OnboardingHistoryRecord = {
  id: string;
  created_at: string;
  klient_id: string;
  onboarding_etap_id: string | null;
  etap: OnboardingStageKey | null;
  akcja: string;
  old_status: OnboardingStageStatus | null;
  new_status: OnboardingStageStatus | null;
  opis: string;
  created_by: string | null;
};

export const ONBOARDING_STAGE_KEYS: OnboardingStageKey[] = [
  "contract",
  "rodo",
  "aml",
  "client_card",
  "powers",
  "wfirma_account",
  "wfirma",
  "documents_takeover",
];

export async function fetchOnboardingStages() {
  return supabase
    .from("onboarding_etapy")
    .select("*")
    .order("created_at", { ascending: true });
}

export async function fetchOnboardingHistory() {
  return supabase
    .from("onboarding_historia")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function ensureClientOnboarding(klientId: string) {
  const payload = ONBOARDING_STAGE_KEYS.map((stage) => ({
    klient_id: klientId,
    etap: stage,
    status: "do_wykonania" as OnboardingStageStatus,
  }));

  return supabase
    .from("onboarding_etapy")
    .upsert(payload, {
      onConflict: "klient_id,etap",
      ignoreDuplicates: true,
    });
}

export async function updateOnboardingStageStatus(
  stage: OnboardingStageRecord,
  status: OnboardingStageStatus
) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id || null;
  const isDone = status === "gotowe" || status === "papierowo" || status === "nowy_podmiot";

  const updateResult = await supabase
    .from("onboarding_etapy")
    .update({
      status,
      updated_by: userId,
      completed_at: isDone ? new Date().toISOString() : null,
      completed_by: isDone ? userId : null,
    })
    .eq("id", stage.id)
    .select("*")
    .single();

  if (updateResult.error) return updateResult;

  await supabase.from("onboarding_historia").insert({
    klient_id: stage.klient_id,
    onboarding_etap_id: stage.id,
    etap: stage.etap,
    akcja: "zmiana_statusu",
    old_status: stage.status,
    new_status: status,
    opis: `Zmieniono status etapu "${stageLabel(stage.etap)}" z "${statusLabel(stage.status)}" na "${statusLabel(status)}".`,
    created_by: userId,
  });

  return updateResult;
}

export async function updateOnboardingStageNotes(
  stage: OnboardingStageRecord,
  notes: string,
  description: string
) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id || null;

  const updateResult = await supabase
    .from("onboarding_etapy")
    .update({
      uwagi: notes,
      updated_by: userId,
    })
    .eq("id", stage.id)
    .select("*")
    .single();

  if (updateResult.error) return updateResult;

  await supabase.from("onboarding_historia").insert({
    klient_id: stage.klient_id,
    onboarding_etap_id: stage.id,
    etap: stage.etap,
    akcja: "aktualizacja_szczegolow",
    old_status: stage.status,
    new_status: stage.status,
    opis: description,
    created_by: userId,
  });

  return updateResult;
}

export async function finishClientOnboardingRpc(klientId: string) {
  return supabase.rpc("finish_client_onboarding", { public_client_id: klientId });
}

export function stageLabel(stage: OnboardingStageKey) {
  if (stage === "contract") return "Umowa księgowa";
  if (stage === "rodo") return "Umowa powierzenia";
  if (stage === "aml") return "AML";
  if (stage === "client_card") return "Karta klienta biura rachunkowego";
  if (stage === "powers") return "Pełnomocnictwa";
  if (stage === "wfirma_account") return "Utworzenie konta wFirma";
  if (stage === "wfirma") return "Konfiguracja wFirma";
  if (stage === "documents_takeover") return "Dokumenty do przejęcia";
  if (stage === "drive") return "Dysk i komunikacja";
  return "Zadania cykliczne";
}

export function statusLabel(status: OnboardingStageStatus) {
  if (status === "gotowe") return "Gotowe";
  if (status === "papierowo") return "Papierowo";
  if (status === "nowy_podmiot") return "Nowy podmiot";
  if (status === "w_toku") return "W toku";
  if (status === "zablokowane") return "Zablokowane";
  return "Do wykonania";
}
