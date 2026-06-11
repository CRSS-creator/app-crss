import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type StoreGeneratedPdfRequest = {
  callbackSecret?: string;
  contractId?: string;
  fileName?: string;
  pdfBase64?: string;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CALLBACK_SECRET = process.env.CRSS_CONTRACT_CALLBACK_SECRET;
const CRM_CONTRACTS_BUCKET = "crm-umowy";

export async function POST(request: Request) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Brakuje konfiguracji Supabase dla zapisu wygenerowanego PDF." },
      { status: 500 }
    );
  }

  if (!CALLBACK_SECRET) {
    return NextResponse.json(
      { error: "Brakuje zmiennej CRSS_CONTRACT_CALLBACK_SECRET na serwerze." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null) as StoreGeneratedPdfRequest | null;
  if (!body || body.callbackSecret !== CALLBACK_SECRET) {
    return NextResponse.json({ error: "Nieprawidłowy sekret callback." }, { status: 401 });
  }

  if (!body.contractId || !body.pdfBase64) {
    return NextResponse.json({ error: "Brakuje ID umowy albo pliku PDF." }, { status: 400 });
  }

  const fileName = sanitizeFileName(body.fileName || "umowa.pdf");
  const storagePath = `${body.contractId}/generated/${Date.now()}-${fileName}`;
  const pdfBuffer = Buffer.from(stripDataUriPrefix(body.pdfBase64), "base64");
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const uploadResult = await supabase.storage
    .from(CRM_CONTRACTS_BUCKET)
    .upload(storagePath, pdfBuffer, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadResult.error) {
    return NextResponse.json({ error: uploadResult.error.message }, { status: 500 });
  }

  const updateResult = await supabase
    .from("crm_umowy")
    .update({
      status: "wygenerowana",
      wygenerowany_pdf_path: storagePath,
      wygenerowany_pdf_name: fileName,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.contractId)
    .select("id")
    .maybeSingle();

  if (updateResult.error) {
    return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
  }

  if (!updateResult.data) {
    return NextResponse.json({ error: "Nie znaleziono umowy do aktualizacji." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, path: storagePath, fileName });
}

function stripDataUriPrefix(value: string) {
  return value.includes(",") ? value.split(",").pop() || "" : value;
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "umowa"}.pdf`;
}
