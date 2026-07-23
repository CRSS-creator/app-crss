import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildAmlRiskAssessmentPdf } from "@/lib/amlRiskAssessmentPdf";
import { validateAmlRiskAssessmentData, type AmlRiskAssessmentData } from "@/lib/amlRiskAssessmentTypes";

export const runtime = "nodejs";

const CLIENT_DOCUMENTS_BUCKET = "klienci-dokumenty";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type ClientRecord = {
  id: string;
  nazwa: string | null;
  nip: string | null;
};

type RiskAssessmentRecord = {
  id: string;
  status: "active" | "completed" | "revoked";
  klient_id: string;
  aml_rejestr_id: string | null;
  public_token: string;
  klienci: ClientRecord[] | ClientRecord | null;
};

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getClient(assessment: RiskAssessmentRecord) {
  return Array.isArray(assessment.klienci) ? assessment.klienci[0] : assessment.klienci;
}

function fileSafeName(value: string | null | undefined) {
  return (value?.trim() || "klient").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ");
}

async function getAssessment(token: string) {
  const admin = adminClient();
  if (!admin) return { admin: null, assessment: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };

  const { data, error } = await admin
    .from("aml_oceny_ryzyka")
    .select(`
      id,
      status,
      klient_id,
      aml_rejestr_id,
      public_token,
      klienci (
        id,
        nazwa,
        nip
      )
    `)
    .eq("public_token", token)
    .maybeSingle();

  if (error) return { admin, assessment: null, error: NextResponse.json({ error: "Nie udało się pobrać oceny ryzyka." }, { status: 500 }) };
  if (!data) return { admin, assessment: null, error: NextResponse.json({ status: "missing" }, { status: 404 }) };
  return { admin, assessment: data as RiskAssessmentRecord, error: null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getAssessment(token);
  if (result.error) return result.error;

  const assessment = result.assessment;
  if (!assessment) return NextResponse.json({ status: "missing" }, { status: 404 });
  if (assessment.status !== "active") return NextResponse.json({ status: assessment.status });

  const client = getClient(assessment);
  if (!client) return NextResponse.json({ status: "missing" }, { status: 404 });

  const { data: register } = assessment.aml_rejestr_id
    ? await result.admin!
      .from("aml_rejestr_klientow")
      .select("numer_krs, numer_regon, dane_rejestrowe, beneficjenci_rzeczywisci, kody_pkd, nastepna_weryfikacja_at")
      .eq("id", assessment.aml_rejestr_id)
      .maybeSingle()
    : { data: null };

  const { data: verification } = await result.admin!
    .from("aml_weryfikacje")
    .select("created_at, zrodla, wynik, sankcje_status, pep_status, krs_status, vat_status, vies_status")
    .eq("klient_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: initialForm } = await result.admin!
    .from("aml_formularze_wstepne")
    .select("form_data, completed_by_name, completed_at")
    .eq("klient_id", client.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    status: "active",
    client: {
      id: client.id,
      nazwa: client.nazwa,
      nip: client.nip,
    },
    defaults: buildDefaults(client, register, verification, initialForm),
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await saveRiskAssessment(request, context);
  } catch (error) {
    console.error("Nieobsłużony błąd zapisu oceny ryzyka AML:", error);
    return NextResponse.json({ error: "Nie udało się zapisać oceny ryzyka. Spróbuj ponownie za chwilę." }, { status: 500 });
  }
}

async function saveRiskAssessment(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getAssessment(token);
  if (result.error) return result.error;

  const admin = result.admin;
  const assessment = result.assessment;
  if (!admin || !assessment) return NextResponse.json({ status: "missing" }, { status: 404 });
  if (assessment.status !== "active") return NextResponse.json({ error: "Ta ocena ryzyka została już zapisana albo link wygasł." }, { status: 409 });

  const client = getClient(assessment);
  if (!client) return NextResponse.json({ error: "Nie znaleziono klienta dla oceny ryzyka." }, { status: 404 });

  let data: AmlRiskAssessmentData;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane formularza." }, { status: 400 });
  }

  const missing = validateAmlRiskAssessmentData(data);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Uzupełnij wymagane pola: ${missing.join(", ")}.` }, { status: 400 });
  }

  const completedAt = new Date();
  const pdf = await buildAmlRiskAssessmentPdf({
    formToken: assessment.public_token || token,
    completedAt,
    data,
  });
  const fileName = `Ocena ryzyka AML - ${fileSafeName(client.nazwa)}.pdf`;
  const storagePath = `${client.id}/aml-ocena-ryzyka-${Date.now()}.pdf`;

  const uploadResult = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadResult.error) {
    console.error("Błąd zapisu PDF oceny ryzyka AML:", uploadResult.error);
    return NextResponse.json({ error: "Nie udało się zapisać PDF w dokumentach klienta." }, { status: 500 });
  }

  const { data: documentRecord, error: documentError } = await admin
    .from("klienci_dokumenty")
    .insert({
      klient_id: client.id,
      nazwa: fileName,
      sciezka: storagePath,
      rozmiar: pdf.length,
      typ: "application/pdf",
    })
    .select("id")
    .single() as { data: { id: string }; error: { message?: string } | null };

  if (documentError || !documentRecord) {
    await admin.storage.from(CLIENT_DOCUMENTS_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: documentError?.message || "Nie udało się zapisać dokumentu oceny ryzyka." }, { status: 500 });
  }

  await admin
    .from("aml_oceny_ryzyka")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      completed_by_name: data.assessedBy.trim(),
      completed_pdf_document_id: documentRecord.id,
      assessment_date: data.assessmentDate,
      assessment_basis: data.assessmentBasis,
      risk_level: data.finalRiskLevel,
      next_update_date: data.nextUpdateDate || null,
      form_data: data,
    })
    .eq("id", assessment.id);

  if (assessment.aml_rejestr_id) {
    await admin
      .from("aml_rejestr_klientow")
      .update({
        status: "ocena_ryzyka_zapisana",
        poziom_ryzyka: data.finalRiskLevel,
        nastepna_weryfikacja_at: data.nextUpdateDate || null,
        updated_at: completedAt.toISOString(),
      })
      .eq("id", assessment.aml_rejestr_id);
  }

  await admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: assessment.aml_rejestr_id,
    akcja: "uzupelnienie_oceny_ryzyka",
    opis: `Karta oceny ryzyka AML została zapisana przez ${data.assessedBy.trim()}.`,
    zmiany: {
      aml_risk_assessment_id: assessment.id,
      document_id: documentRecord.id,
      assessment_date: data.assessmentDate,
      risk_level: data.finalRiskLevel,
      next_update_date: data.nextUpdateDate,
    },
    created_by: null,
  });

  return NextResponse.json({ ok: true });
}

function buildDefaults(
  client: ClientRecord,
  register: Record<string, unknown> | null,
  verification: Record<string, unknown> | null,
  initialForm: Record<string, unknown> | null
): Partial<AmlRiskAssessmentData> {
  const registry = asRecord(register?.dane_rejestrowe);
  const identifiers = asRecord(registry.identyfikatory);
  const formData = asRecord(initialForm?.form_data);
  const common = asRecord(formData.common);
  const isJdg = String(registry.typPodmiotu || identifiers.forma || "").toLowerCase().includes("jednoosobowa");
  const sourceStatuses = sourceStatusMap(Array.isArray(verification?.zrodla) ? verification.zrodla as Array<Record<string, unknown>> : []);
  const krs = String(identifiers.krs || register?.numer_krs || "").trim();
  const identifierParts = [client.nip ? `NIP ${client.nip}` : null, krs && !isJdg ? `KRS ${krs}` : null].filter(Boolean);
  const nextUpdate = String(register?.nastepna_weryfikacja_at || "").slice(0, 10);

  return {
    clientName: String(identifiers.nazwa || client.nazwa || ""),
    clientIdentifier: identifierParts.join(", "),
    assessmentDate: verification?.created_at ? String(verification.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    assessmentBasis: "rozpoczecie_wspolpracy",
    dataSources: {
      initialForm: initialForm ? "tak" : "nie",
      krs: isJdg ? "nie_dotyczy" : sourceStatuses.krs || (krs ? "tak" : "nie"),
      ceidg: isJdg ? "tak" : "nie_dotyczy",
      regon: register?.numer_regon ? "tak" : "nie",
      vatWhitelist: sourceStatuses.vatWhitelist || (verification?.vat_status ? "tak" : "nie"),
      vies: sourceStatuses.vies || (verification?.vies_status ? "tak" : "nie_dotyczy"),
      crbr: isJdg ? "nie_dotyczy" : sourceStatuses.crbr || "nie",
      identityDocument: "nie_dotyczy",
      signatureReport: "nie_dotyczy",
      sanctions: verification?.sankcje_status ? "tak" : "nie",
      pepStatement: hasAnyPepData(formData) ? "tak" : "nie",
      publicInfo: "nie",
    },
    clientFactors: {
      naturalPerson: "nie",
      individualBusiness: isJdg ? "tak" : "nie",
      legalEntity: isJdg ? "nie" : "tak",
      simpleOwnership: isJdg ? "nie_dotyczy" : "tak",
      complexOwnership: "nie",
      foreignOwnershipEntities: common.hasForeignOwnershipEntities === "tak" ? "tak" : "nie",
      uboEstablished: "tak",
      uboDifficulties: "nie",
      registryConsistent: verification?.wynik === "wymaga_analizy" ? "nie" : "tak",
      inconsistencies: verification?.wynik === "wymaga_analizy" ? "tak" : "nie",
    },
    geographicFactors: {
      onlyPoland: common.onlyPoland === "nie" ? "nie" : "tak",
      euEeaActivity: common.activityEuEea === "tak" ? "tak" : "nie",
      outsideEuEeaActivity: common.activityOutsideEuEea === "tak" ? "tak" : "nie",
      highRiskCountry: common.geographicRisk === "tak" ? "tak" : "nie",
      sanctionedCountry: "nie",
    },
    industryFactors: {
      typicalForCrss: "tak",
      understandableActivity: "tak",
      highAttentionIndustry: hasHighAttentionActivity(common) ? "tak" : "nie",
      cashActivity: common.significantCashTransactions === "tak" ? "tak" : "nie",
      crossBorderActivity: common.activityOutsideEuEea === "tak" || common.activityEuEea === "tak" ? "tak" : "nie",
      sensitiveGoodsOrServices: hasHighAttentionActivity(common) ? "tak" : "nie",
    },
    channelFactors: {
      personalContact: "nie",
      remoteContact: "tak",
      autentiAgreement: "nie",
      advancedAutentiSignature: "nie",
      mobywatel: "nie",
      qualifiedSignature: "nie",
      trustedSignature: "nie",
      remoteRiskMitigated: "nie",
    },
    pepSanctionsFactors: {
      pep: verification?.pep_status === "pep" ? "tak" : "nie",
      pepRelated: "nie",
      sanctionsPositive: verification?.sankcje_status === "trafienie" ? "tak" : "nie",
      sanctionsRequiresExplanation: verification?.sankcje_status === "wymaga_analizy" ? "tak" : "nie",
    },
    behavioralFactors: {
      completeConsistentData: initialForm ? "tak" : "nie",
      refusesData: "nie",
      avoidsExplanation: "nie",
      expectsEarlyStart: "nie",
      unusualBehavior: "nie",
    },
    finalRiskLevel: verification?.wynik === "wymaga_analizy" ? "podwyzszone" : "standardowe",
    riskJustification: "Na podstawie formularza wstepnego, danych rejestrowych i wykonanych weryfikacji nie stwierdzono przeslanek ryzyka wysokiego.",
    decisions: {
      standardMeasures: verification?.wynik === "wymaga_analizy" ? "nie" : "tak",
      enhancedMeasures: verification?.wynik === "wymaga_analizy" ? "tak" : "nie",
      requiresCompletion: "nie",
      requiresApproval: "nie",
      refuseCooperation: "nie",
      considerNotification: "nie",
    },
    nextUpdateDate: nextUpdate,
    approvalDate: new Date().toISOString().slice(0, 10),
  };
}

function sourceStatusMap(sources: Array<Record<string, unknown>>) {
  const map: Record<string, "tak" | "nie"> = {};
  sources.forEach((source) => {
    const name = String(source.source || "").toLowerCase();
    const status = String(source.status || "");
    const value = status && status !== "skipped" && status !== "error" ? "tak" : "nie";
    if (name.includes("krs")) map.krs = value;
    if (name.includes("vat") || name.includes("bia")) map.vatWhitelist = value;
    if (name.includes("vies")) map.vies = value;
    if (name.includes("crbr")) map.crbr = value;
  });
  return map;
}

function hasHighAttentionActivity(common: Record<string, unknown>) {
  const activities = asRecord(common.highAttentionActivities);
  return Object.values(activities).some((value) => value === "tak");
}

function hasAnyPepData(formData: Record<string, unknown>) {
  const common = asRecord(formData.common);
  return common.pepPublicFunction === "tak" || common.pepFamily === "tak" || common.pepAssociate === "tak";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
