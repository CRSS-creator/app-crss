import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { markOnboardingAmlInProgress } from "@/lib/server/onboardingAmlStatus";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const APP_URL = "https://app.crss.com.pl";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; error: NextResponse };

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
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Brak uprawnień do oświadczeń AML." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", error: null };
}

async function ensureAmlRegister(admin: SupabaseClient, clientId: string) {
  const { data: existing } = await admin
    .from("aml_rejestr_klientow")
    .select("*")
    .eq("klient_id", clientId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await admin
    .from("aml_rejestr_klientow")
    .insert({ klient_id: clientId, status: "do_weryfikacji" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Nie udało się utworzyć rejestru AML.");
  return data;
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  const payload = await request.json().catch(() => null) as { clientId?: string } | null;
  if (!payload?.clientId) return NextResponse.json({ error: "Brak klienta." }, { status: 400 });

  const { data: client, error: clientError } = await auth.admin
    .from("klienci")
    .select("id, nazwa, nip")
    .eq("id", payload.clientId)
    .single();

  if (clientError || !client) return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });

  const register = await ensureAmlRegister(auth.admin, client.id).catch((error) => {
    console.error("Nie udało się przygotować rejestru AML dla oświadczenia:", error);
    return null;
  });
  if (!register) return NextResponse.json({ error: "Nie udało się przygotować rejestru AML klienta." }, { status: 500 });
  await markOnboardingAmlInProgress(auth.admin, client.id, auth.requesterId);

  const { data: existingStatement } = await auth.admin
    .from("aml_oswiadczenia_weryfikacji")
    .select("id, public_token")
    .eq("klient_id", client.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let statement = existingStatement as { id: string; public_token: string } | null;
  if (!statement) {
    const { data: createdStatement, error: createError } = await auth.admin
      .from("aml_oswiadczenia_weryfikacji")
      .insert({
        klient_id: client.id,
        aml_rejestr_id: register.id,
        created_by: auth.requesterId,
        created_by_name: auth.requesterName,
      })
      .select("id, public_token")
      .single();

    if (createError || !createdStatement) {
      return NextResponse.json({ error: "Nie udało się przygotować linku do oświadczenia AML." }, { status: 500 });
    }
    statement = createdStatement as { id: string; public_token: string };
  }

  const statementUrl = `${APP_URL}/aml/oswiadczenie-weryfikacji/${statement.public_token}`;
  await auth.admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: register.id,
    akcja: "utworzono_link_oswiadczenia_weryfikacji",
    opis: `Utworzono link do oświadczenia o weryfikacji i identyfikacji klienta przez ${auth.requesterName}.`,
    zmiany: {
      aml_identification_statement_id: statement.id,
      statement_url: statementUrl,
    },
    created_by: auth.requesterId,
  });

  return NextResponse.json({ ok: true, statementUrl });
}
