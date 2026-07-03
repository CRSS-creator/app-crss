import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const ALLOWED_STATUSES = new Set(["do_zrobienia", "w_trakcie", "zrobione"]);

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; requesterEmail: string | null; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; requesterEmail?: null; role: null; error: NextResponse };

type StatusPayload = {
  realizationId?: string;
  status?: string;
};

type RelatedProfile = {
  full_name?: string | null;
  email?: string | null;
} | null;

async function getAuthorizedUser(request: NextRequest): Promise<AuthorizedResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne, full_name, email")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Konto użytkownika jest nieaktywne." }, { status: 403 }) };
  }

  const role = profile?.role || "";
  if (!ALLOWED_ROLES.has(role)) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak uprawnień do zmiany statusu zadania." }, { status: 403 }) };
  }

  return {
    admin,
    requesterId,
    requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik",
    requesterEmail: profile?.email || requesterData.user?.email || null,
    role,
    error: null,
  };
}

function firstRelatedProfile(value: unknown): RelatedProfile {
  if (Array.isArray(value)) return (value[0] as RelatedProfile) || null;
  return (value as RelatedProfile) || null;
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function accountantOwnsClient(auth: Extract<AuthorizedResult, { error: null }>, client: { opiekun_id?: string | null; profiles?: unknown }) {
  if (auth.role !== "accountant") return true;
  if (client.opiekun_id === auth.requesterId) return true;

  const caregiver = firstRelatedProfile(client.profiles);
  const requesterEmail = normalizeIdentity(auth.requesterEmail);
  const requesterName = normalizeIdentity(auth.requesterName);

  return Boolean(
    (requesterEmail && normalizeIdentity(caregiver?.email) === requesterEmail) ||
    (requesterName && normalizeIdentity(caregiver?.full_name) === requesterName)
  );
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  let payload: StatusPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane zadania." }, { status: 400 });
  }

  if (!payload.realizationId || !payload.status || !ALLOWED_STATUSES.has(payload.status)) {
    return NextResponse.json({ error: "Brak poprawnego zadania albo statusu." }, { status: 400 });
  }

  const { data: realization, error: realizationError } = await auth.admin
    .from("zadania_cykliczne_realizacje")
    .select("id, klient_id, rozliczenie_id")
    .eq("id", payload.realizationId)
    .single();

  if (realizationError || !realization) {
    return NextResponse.json({ error: "Nie znaleziono zadania cyklicznego." }, { status: 404 });
  }

  let clientId = (realization as { klient_id?: string | null }).klient_id || null;
  if (!clientId && (realization as { rozliczenie_id?: string | null }).rozliczenie_id) {
    const { data: settlement } = await auth.admin
      .from("rozliczenia_miesieczne")
      .select("klient_id")
      .eq("id", (realization as { rozliczenie_id: string }).rozliczenie_id)
      .single();
    clientId = (settlement as { klient_id?: string | null } | null)?.klient_id || null;
  }

  if (clientId) {
    const { data: client, error: clientError } = await auth.admin
      .from("klienci")
      .select(`
        id,
        opiekun_id,
        profiles!klienci_opiekun_id_fkey (
          full_name,
          email
        )
      `)
      .eq("id", clientId)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: "Nie znaleziono klienta zadania." }, { status: 404 });
    }

    if (!accountantOwnsClient(auth, client)) {
      return NextResponse.json({ error: "Możesz zmieniać zadania cykliczne tylko dla swoich klientów." }, { status: 403 });
    }
  }

  const { data: updated, error: updateError } = await auth.admin
    .from("zadania_cykliczne_realizacje")
    .update({
      status: payload.status,
      completed_at: payload.status === "zrobione" ? new Date().toISOString() : null,
    })
    .eq("id", payload.realizationId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Nie udało się zapisać statusu zadania." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: updated });
}
