import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager"]);

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; role: null; error: NextResponse };

type AssignmentPayload = {
  clientId?: string;
  caregiverId?: string | null;
};

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
    auth: { autoRefreshToken: false, persistSession: false },
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
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Opiekuna księgowego może ustawić tylko owner albo manager." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", role, error: null };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  let payload: AssignmentPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane przypisania opiekuna." }, { status: 400 });
  }

  if (!payload.clientId) {
    return NextResponse.json({ error: "Brak klienta." }, { status: 400 });
  }

  const caregiverId = payload.caregiverId || null;

  const { data: client, error: clientError } = await auth.admin
    .from("klienci")
    .select("id, nazwa, nip, opiekun_id")
    .eq("id", payload.clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  }

  let caregiverName: string | null = null;
  if (caregiverId) {
    const { data: caregiver, error: caregiverError } = await auth.admin
      .from("profiles")
      .select("id, full_name, email, aktywne")
      .eq("id", caregiverId)
      .single();

    if (caregiverError || !caregiver || caregiver.aktywne === false) {
      return NextResponse.json({ error: "Nie znaleziono aktywnego opiekuna księgowego." }, { status: 404 });
    }

    caregiverName = caregiver.full_name || caregiver.email || "opiekun księgowy";
  }

  const previousCaregiverId = client.opiekun_id;
  const { error: updateError } = await auth.admin
    .from("klienci")
    .update({ opiekun_id: caregiverId })
    .eq("id", client.id);

  if (updateError) {
    return NextResponse.json({ error: "Nie udało się zapisać opiekuna księgowego." }, { status: 500 });
  }

  await auth.admin.from("onboarding_historia").insert({
    klient_id: client.id,
    onboarding_etap_id: null,
    etap: null,
    akcja: "zmiana_opiekuna_ksiegowego",
    old_status: previousCaregiverId,
    new_status: caregiverId,
    opis: caregiverId
      ? `${auth.requesterName} przypisał opiekuna księgowego: ${caregiverName}.`
      : `${auth.requesterName} usunął opiekuna księgowego.`,
    created_by: auth.requesterId,
  });

  if (caregiverId && caregiverId !== previousCaregiverId) {
    await auth.admin.from("powiadomienia").insert({
      type: "onboarding_caregiver_assigned",
      title: "Przypisano klienta do onboardingu",
      body: `Zostałeś przypisany jako opiekun księgowy klienta ${client.nazwa || "bez nazwy"}. Przeprowadź onboarding klienta.`,
      priority: "high",
      related_table: "klienci",
      related_id: client.id,
      recipient_id: caregiverId,
      metadata: {
        client_id: client.id,
        client_name: client.nazwa,
        client_nip: client.nip,
        assigned_by: auth.requesterId,
        assigned_by_name: auth.requesterName,
        notification_kind: "onboarding_caregiver_assigned",
      },
    });
  }

  return NextResponse.json({ ok: true });
}
