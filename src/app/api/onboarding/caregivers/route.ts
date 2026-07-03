import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager"]);
const CAREGIVER_ROLES = ["owner", "manager", "admin", "accountant"];

export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 });
  }

  const { data: requesterProfile } = await admin
    .from("profiles")
    .select("role, aktywne")
    .eq("id", requesterId)
    .single();

  if (requesterProfile?.aktywne === false) {
    return NextResponse.json({ error: "Konto użytkownika jest nieaktywne." }, { status: 403 });
  }

  if (!ALLOWED_ROLES.has(requesterProfile?.role || "")) {
    return NextResponse.json({ error: "Brak uprawnień do pobrania listy opiekunów." }, { status: 403 });
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, role, aktywne")
    .in("role", CAREGIVER_ROLES)
    .neq("aktywne", false)
    .order("full_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Nie udało się pobrać listy opiekunów." }, { status: 500 });
  }

  return NextResponse.json({ caregivers: data || [] });
}
