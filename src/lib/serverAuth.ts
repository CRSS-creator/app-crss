import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; role: string; error: null }
  | { admin: null; requesterId: null; role: null; error: NextResponse };

export async function getAuthorizedServerUser(
  request: NextRequest,
  allowedRoles: Set<string>,
  deniedMessage = "Brak uprawnień."
): Promise<AuthorizedResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      admin: null,
      requesterId: null,
      role: null,
      error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }),
    };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return {
      admin: null,
      requesterId: null,
      role: null,
      error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }),
    };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return {
      admin: null,
      requesterId: null,
      role: null,
      error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }),
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false) {
    return {
      admin: null,
      requesterId: null,
      role: null,
      error: NextResponse.json({ error: "Konto użytkownika jest nieaktywne." }, { status: 403 }),
    };
  }

  const role = profile?.role || "";
  if (!allowedRoles.has(role)) {
    return {
      admin: null,
      requesterId: null,
      role: null,
      error: NextResponse.json({ error: deniedMessage }, { status: 403 }),
    };
  }

  return { admin, requesterId, role, error: null };
}
