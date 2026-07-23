import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildAmlInstitutionRiskPdf,
  dominantInstitutionRisk,
  type InstitutionRiskLevel,
} from "@/lib/amlInstitutionRiskPdf";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const COMPANY_NAME = "CRSS Sp. z o.o.";
const COMPANY_CITY = "Śrem";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; error: NextResponse };

type ClientRecord = {
  id: string;
  status_klienta: string | null;
};

type RegisterRecord = {
  klient_id: string;
  poziom_ryzyka: string | null;
  pep_status: string | null;
  dane_rejestrowe: Record<string, unknown> | null;
};

type RiskAssessmentRecord = {
  klient_id: string;
  risk_level: string | null;
  completed_at: string | null;
  completed_pdf_document_id: string | null;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  const [clientsResult, registersResult, assessmentsResult] = await Promise.all([
    auth.admin.from("klienci").select("id, status_klienta"),
    auth.admin.from("aml_rejestr_klientow").select("klient_id, poziom_ryzyka, pep_status, dane_rejestrowe"),
    auth.admin
      .from("aml_oceny_ryzyka")
      .select("klient_id, risk_level, completed_at, completed_pdf_document_id")
      .order("created_at", { ascending: false }),
  ]);

  if (clientsResult.error) return NextResponse.json({ error: "Nie udało się pobrać klientów do weryfikacji instytucji obowiązanej." }, { status: 500 });
  if (registersResult.error) return NextResponse.json({ error: "Nie udało się pobrać rejestru AML." }, { status: 500 });
  if (assessmentsResult.error) return NextResponse.json({ error: "Nie udało się pobrać ocen ryzyka AML." }, { status: 500 });

  const clients = (clientsResult.data || []) as ClientRecord[];
  const registers = indexByClient((registersResult.data || []) as RegisterRecord[]);
  const assessments = latestCompletedAssessmentByClient((assessmentsResult.data || []) as RiskAssessmentRecord[]);
  const counts: Record<InstitutionRiskLevel, number> = { niskie: 0, standardowe: 0, podwyzszone: 0, wysokie: 0 };

  clients.forEach((client) => {
    const risk = normalizeRiskLevel(assessments.get(client.id)?.risk_level || registers.get(client.id)?.poziom_ryzyka);
    if (risk) counts[risk] += 1;
  });
  const assessedClientsCount = Object.values(counts).reduce((total, count) => total + count, 0);

  const generatedAt = new Date();
  const pdf = await buildAmlInstitutionRiskPdf({
    generatedAt,
    requesterName: auth.requesterName,
    city: COMPANY_CITY,
    companyName: COMPANY_NAME,
    foreignClientsCount: countForeignClients(clients, registers),
    politicallyExposedCount: countPepClients(clients, registers),
    counts,
    totalClients: assessedClientsCount,
    dominantRisk: dominantInstitutionRisk(counts),
  });

  const fileName = `Weryfikacja instytucji obowiązanej - ${formatFileDate(generatedAt)}.pdf`;

  const responseBody = Uint8Array.from(pdf).buffer;

  return new NextResponse(responseBody, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function getAuthorizedUser(request: NextRequest): Promise<AuthorizedResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne, full_name, email")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Brak uprawnień do weryfikacji instytucji obowiązanej." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", error: null };
}

function indexByClient(registers: RegisterRecord[]) {
  return new Map(registers.map((register) => [register.klient_id, register]));
}

function latestCompletedAssessmentByClient(assessments: RiskAssessmentRecord[]) {
  const byClient = new Map<string, RiskAssessmentRecord>();
  assessments.forEach((assessment) => {
    if (byClient.has(assessment.klient_id)) return;
    if (!assessment.completed_at && !assessment.completed_pdf_document_id) return;
    byClient.set(assessment.klient_id, assessment);
  });
  return byClient;
}

function normalizeRiskLevel(value: string | null | undefined): InstitutionRiskLevel | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (["niskie", "niski", "niskie_ryzyko"].includes(normalized)) return "niskie";
  if (["podwyzszone", "podwyższone", "podwyzszony", "podwyższony"].includes(normalized)) return "podwyzszone";
  if (["wysokie", "wysoki"].includes(normalized)) return "wysokie";
  if (["standardowe", "normalne", "normalny", "standardowy"].includes(normalized)) return "standardowe";
  return null;
}

function countPepClients(clients: ClientRecord[], registers: Map<string, RegisterRecord>) {
  return clients.filter((client) => {
    const status = String(registers.get(client.id)?.pep_status || "").trim().toLowerCase();
    return ["pep", "tak", "warning", "wymaga_analizy", "podwyzszone", "podwyższone"].includes(status);
  }).length;
}

function countForeignClients(clients: ClientRecord[], registers: Map<string, RegisterRecord>) {
  return clients.filter((client) => {
    const registry = registers.get(client.id)?.dane_rejestrowe || {};
    const country = String(registry.kraj || registry.country || registry.panstwo || registry.państwo || "").trim().toUpperCase();
    return Boolean(country && !["PL", "POLSKA", "POLAND"].includes(country));
  }).length;
}

function formatFileDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
