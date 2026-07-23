import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIENT_DOCUMENTS_BUCKET = "klienci-dokumenty";

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const requesterId = userData.user?.id;
  if (userError || !requesterId) return NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 });

  const { data: profile } = await admin.from("profiles").select("role, aktywne").eq("id", requesterId).single();
  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return NextResponse.json({ error: "Brak uprawnień do ocen ryzyka AML." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { assessmentId?: string } | null;
  if (!body?.assessmentId) return NextResponse.json({ error: "Brak oceny ryzyka AML." }, { status: 400 });

  const { data: assessment, error: assessmentError } = await admin
    .from("aml_oceny_ryzyka")
    .select("completed_pdf_document_id")
    .eq("id", body.assessmentId)
    .single();

  if (assessmentError || !assessment?.completed_pdf_document_id) {
    return NextResponse.json({ error: "Nie znaleziono PDF oceny ryzyka AML." }, { status: 404 });
  }

  const { data: document, error: documentError } = await admin
    .from("klienci_dokumenty")
    .select("nazwa, sciezka")
    .eq("id", assessment.completed_pdf_document_id)
    .single();

  if (documentError || !document?.sciezka) {
    return NextResponse.json({ error: "Nie znaleziono dokumentu oceny ryzyka AML." }, { status: 404 });
  }

  const signedUrl = await admin.storage.from(CLIENT_DOCUMENTS_BUCKET).createSignedUrl(document.sciezka, 10 * 60);
  if (signedUrl.error) return NextResponse.json({ error: signedUrl.error.message }, { status: 500 });

  return NextResponse.json({
    url: signedUrl.data.signedUrl,
    fileName: document.nazwa || "Ocena_ryzyka_AML.pdf",
  });
}
