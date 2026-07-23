import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const CLIENT_DOCUMENTS_BUCKET = "klienci-dokumenty";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const requesterId = userData.user?.id;
  if (userError || !requesterId) return NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 });

  const { data: profile } = await admin.from("profiles").select("full_name, email, role, aktywne").eq("id", requesterId).single();
  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return NextResponse.json({ error: "Brak uprawnień do dodania archiwalnego oświadczenia AML." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const clientId = String(formData?.get("clientId") || "").trim();
  const completedDate = String(formData?.get("completedDate") || "").trim();
  const file = formData?.get("file");

  if (!clientId) return NextResponse.json({ error: "Brak klienta AML." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) return NextResponse.json({ error: "Podaj datę oświadczenia." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Dodaj PDF archiwalnego oświadczenia AML." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Plik PDF jest pusty albo przekracza limit 25 MB." }, { status: 400 });
  if (!isPdfFile(file)) return NextResponse.json({ error: "Archiwalne oświadczenie musi być plikiem PDF." }, { status: 400 });

  const { data: client, error: clientError } = await admin
    .from("klienci")
    .select("id, nazwa, nip")
    .eq("id", clientId)
    .single();
  if (clientError || !client) return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });

  const register = await ensureAmlRegister(admin, client.id).catch((error) => {
    console.error("Nie udało się przygotować rejestru AML dla archiwalnego oświadczenia:", error);
    return null;
  });
  if (!register) return NextResponse.json({ error: "Nie udało się przygotować rejestru AML klienta." }, { status: 500 });

  const originalFileName = file.name || "oswiadczenie-weryfikacji-aml.pdf";
  const storagePath = `${client.id}/aml-oswiadczenie-weryfikacji-archiwalne-${Date.now()}-${sanitizeFileName(originalFileName)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const upload = await admin.storage.from(CLIENT_DOCUMENTS_BUCKET).upload(storagePath, bytes, {
    contentType: "application/pdf",
    cacheControl: "3600",
    upsert: false,
  });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 });

  const documentName = `Oświadczenie weryfikacji AML archiwalne - ${client.nazwa || "Klient"}.pdf`;
  const { data: documentRecord, error: documentError } = await admin
    .from("klienci_dokumenty")
    .insert({
      klient_id: client.id,
      nazwa: documentName,
      sciezka: storagePath,
      rozmiar: file.size,
      typ: "application/pdf",
    })
    .select("id")
    .single();

  if (documentError || !documentRecord) {
    await admin.storage.from(CLIENT_DOCUMENTS_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: documentError?.message || "Nie udało się zapisać dokumentu oświadczenia." }, { status: 500 });
  }

  const completedAt = `${completedDate}T12:00:00.000Z`;
  const requesterName = profile?.full_name || profile?.email || requesterId;
  const { data: statementRecord, error: statementError } = await admin
    .from("aml_oswiadczenia_weryfikacji")
    .insert({
      klient_id: client.id,
      aml_rejestr_id: register.id,
      status: "completed",
      created_by: requesterId,
      created_by_name: requesterName,
      completed_at: completedAt,
      completed_by_name: "Oświadczenie archiwalne",
      completed_pdf_document_id: documentRecord.id,
      verification_date: completedDate,
      form_data: {
        archiwalny: true,
        originalFileName,
        uploadedAt: new Date().toISOString(),
        uploadedBy: requesterName,
        completedDate,
      },
    })
    .select("*")
    .single();

  if (statementError || !statementRecord) {
    await admin.storage.from(CLIENT_DOCUMENTS_BUCKET).remove([storagePath]);
    await admin.from("klienci_dokumenty").delete().eq("id", documentRecord.id);
    return NextResponse.json({ error: statementError?.message || "Nie udało się zapisać archiwalnego oświadczenia AML." }, { status: 500 });
  }

  await admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: register.id,
    akcja: "dodano_archiwalne_oswiadczenie_weryfikacji",
    opis: `Dodano archiwalne oświadczenie o weryfikacji i identyfikacji klienta z datą ${completedDate}.`,
    zmiany: {
      aml_identification_statement_id: statementRecord.id,
      document_id: documentRecord.id,
      completed_date: completedDate,
      original_file_name: originalFileName,
    },
    created_by: requesterId,
  });

  return NextResponse.json({ statement: statementRecord });
}

async function ensureAmlRegister(admin: SupabaseClient, clientId: string) {
  const { data: existing } = await admin.from("aml_rejestr_klientow").select("*").eq("klient_id", clientId).maybeSingle();
  if (existing) return existing;
  const { data, error } = await admin.from("aml_rejestr_klientow").insert({ klient_id: clientId, status: "do_weryfikacji" }).select("*").single();
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
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized || "oswiadczenie-weryfikacji-aml"}.pdf`;
}
