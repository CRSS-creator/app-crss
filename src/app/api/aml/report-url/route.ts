import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AML_REPORT_BUCKET = "crm-umowy";

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const requesterId = userData.user?.id;
  if (userError || !requesterId) {
    return NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return NextResponse.json({ error: "Brak uprawnień do raportu AML." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { verificationId?: string } | null;
  if (!body?.verificationId) {
    return NextResponse.json({ error: "Brak raportu AML." }, { status: 400 });
  }

  const { data: verification, error } = await admin
    .from("aml_weryfikacje")
    .select("pdf_path, pdf_name")
    .eq("id", body.verificationId)
    .single();

  if (error || !verification?.pdf_path) {
    return NextResponse.json({ error: "Nie znaleziono PDF raportu AML." }, { status: 404 });
  }

  const signedUrl = await admin.storage
    .from(AML_REPORT_BUCKET)
    .createSignedUrl(verification.pdf_path, 10 * 60);

  if (signedUrl.error) {
    return NextResponse.json({ error: signedUrl.error.message }, { status: 500 });
  }

  return NextResponse.json({ url: signedUrl.data.signedUrl, fileName: verification.pdf_name || "Analiza_AML_Klient_Data.pdf" });
}
