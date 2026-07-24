import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { completeOnboardingAmlIfReady, markOnboardingAmlInProgress } from "@/lib/server/onboardingAmlStatus";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AML_REPORT_BUCKET = "crm-umowy";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

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
    .select("full_name, role, aktywne")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return NextResponse.json({ error: "Brak uprawnień do dodania archiwalnego raportu AML." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const clientId = String(formData?.get("clientId") || "").trim();
  const file = formData?.get("file");

  if (!clientId) {
    return NextResponse.json({ error: "Brak klienta AML." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Dodaj plik PDF raportu AML." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Plik PDF jest pusty albo przekracza limit 25 MB." }, { status: 400 });
  }
  if (!isPdfFile(file)) {
    return NextResponse.json({ error: "Archiwalny raport AML musi być plikiem PDF." }, { status: 400 });
  }

  const { data: client, error: clientError } = await admin
    .from("klienci")
    .select("id, nazwa, nip")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  }

  const register = await ensureAmlRegister(admin, client.id).catch((error) => {
    console.error("Nie udało się przygotować rejestru AML dla raportu archiwalnego:", error);
    return null;
  });
  if (!register) {
    return NextResponse.json({ error: "Nie udało się przygotować rejestru AML klienta." }, { status: 500 });
  }
  await markOnboardingAmlInProgress(admin, client.id, requesterId);
  const uploadedAt = new Date();
  const originalFileName = file.name || "raport_aml_archiwalny.pdf";
  const storageName = `${Date.now()}-${sanitizeFileName(originalFileName)}`;
  const storagePath = `aml/${client.id}/archive/${storageName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const upload = await admin.storage
    .from(AML_REPORT_BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: verification, error: verificationError } = await admin
    .from("aml_weryfikacje")
    .insert({
      klient_id: client.id,
      aml_rejestr_id: register.id,
      wykonana_by: requesterId,
      status: "archiwalny",
      wynik: "archiwalny",
      zrodla: [{ source: "Raport archiwalny", status: "archiwalny", label: "Dodany ręcznie plik PDF." }],
      dane: {
        archiwalny: true,
        originalFileName,
        uploadedAt: uploadedAt.toISOString(),
        uploadedBy: profile?.full_name || requesterId,
      },
      pdf_path: storagePath,
      pdf_name: originalFileName,
    })
    .select("*")
    .single();

  if (verificationError || !verification) {
    await admin.storage.from(AML_REPORT_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: verificationError?.message || "Nie udało się zapisać archiwalnego raportu AML." }, { status: 500 });
  }

  await admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: register.id,
    aml_weryfikacja_id: verification.id,
    akcja: "dodano_archiwalny_raport_aml",
    opis: `Dodano archiwalny raport AML: ${originalFileName}.`,
    zmiany: {
      archiwalny: true,
      pdf_name: originalFileName,
      pdf_path: storagePath,
    },
    created_by: requesterId,
  });

  await completeOnboardingAmlIfReady(admin, client.id, requesterId);

  return NextResponse.json({ verification });
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

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function sanitizeFileName(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized || "raport-aml-archiwalny"}.pdf`;
}
