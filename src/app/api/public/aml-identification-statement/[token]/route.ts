import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildAmlIdentificationStatementPdf } from "@/lib/amlIdentificationStatementPdf";
import { validateAmlIdentificationStatementData, type AmlIdentificationStatementData } from "@/lib/amlIdentificationStatementTypes";

export const runtime = "nodejs";

const CLIENT_DOCUMENTS_BUCKET = "klienci-dokumenty";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type ClientRecord = {
  id: string;
  nazwa: string | null;
  nip: string | null;
};

type StatementRecord = {
  id: string;
  status: "active" | "completed" | "revoked";
  klient_id: string;
  aml_rejestr_id: string | null;
  public_token: string;
  klienci: ClientRecord[] | ClientRecord | null;
};

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getClient(statement: StatementRecord) {
  return Array.isArray(statement.klienci) ? statement.klienci[0] : statement.klienci;
}

function fileSafeName(value: string | null | undefined) {
  return (value?.trim() || "klient").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ");
}

async function getStatement(token: string) {
  const admin = adminClient();
  if (!admin) return { admin: null, statement: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };

  const { data, error } = await admin
    .from("aml_oswiadczenia_weryfikacji")
    .select(`
      id,
      status,
      klient_id,
      aml_rejestr_id,
      public_token,
      klienci (
        id,
        nazwa,
        nip
      )
    `)
    .eq("public_token", token)
    .maybeSingle();

  if (error) return { admin, statement: null, error: NextResponse.json({ error: "Nie udało się pobrać oświadczenia." }, { status: 500 }) };
  if (!data) return { admin, statement: null, error: NextResponse.json({ status: "missing" }, { status: 404 }) };
  return { admin, statement: data as StatementRecord, error: null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getStatement(token);
  if (result.error) return result.error;

  const statement = result.statement;
  if (!statement) return NextResponse.json({ status: "missing" }, { status: 404 });
  if (statement.status !== "active") return NextResponse.json({ status: statement.status });

  const client = getClient(statement);
  if (!client) return NextResponse.json({ status: "missing" }, { status: 404 });

  const { data: register } = statement.aml_rejestr_id
    ? await result.admin!
      .from("aml_rejestr_klientow")
      .select("numer_krs, dane_rejestrowe, beneficjenci_rzeczywisci")
      .eq("id", statement.aml_rejestr_id)
      .maybeSingle()
    : { data: null };

  const { data: verification } = await result.admin!
    .from("aml_weryfikacje")
    .select("created_at, zrodla, wynik")
    .eq("klient_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    status: "active",
    client: {
      id: client.id,
      nazwa: client.nazwa,
      nip: client.nip,
    },
    defaults: buildDefaults(client, register, verification),
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await saveStatement(request, context);
  } catch (error) {
    console.error("Nieobsłużony błąd zapisu oświadczenia AML:", error);
    return NextResponse.json({ error: "Nie udało się zapisać oświadczenia. Spróbuj ponownie za chwilę." }, { status: 500 });
  }
}

async function saveStatement(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getStatement(token);
  if (result.error) return result.error;

  const admin = result.admin;
  const statement = result.statement;
  if (!admin || !statement) return NextResponse.json({ status: "missing" }, { status: 404 });
  if (statement.status !== "active") return NextResponse.json({ error: "To oświadczenie zostało już zapisane albo link wygasł." }, { status: 409 });

  const client = getClient(statement);
  if (!client) return NextResponse.json({ error: "Nie znaleziono klienta dla oświadczenia." }, { status: 404 });

  let data: AmlIdentificationStatementData;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane formularza." }, { status: 400 });
  }

  const missing = validateAmlIdentificationStatementData(data);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Uzupełnij wymagane pola: ${missing.join(", ")}.` }, { status: 400 });
  }

  const completedAt = new Date();
  const pdf = await buildAmlIdentificationStatementPdf({
    formToken: statement.public_token || token,
    completedAt,
    data,
  });
  const fileName = `Oświadczenie weryfikacji AML - ${fileSafeName(client.nazwa)}.pdf`;
  const storagePath = `${client.id}/aml-oswiadczenie-weryfikacji-${Date.now()}.pdf`;

  const uploadResult = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadResult.error) {
    console.error("Błąd zapisu PDF oświadczenia AML:", uploadResult.error);
    return NextResponse.json({ error: "Nie udało się zapisać PDF w dokumentach klienta." }, { status: 500 });
  }

  const { data: documentRecord, error: documentError } = await admin
    .from("klienci_dokumenty")
    .insert({
      klient_id: client.id,
      nazwa: fileName,
      sciezka: storagePath,
      rozmiar: pdf.length,
      typ: "application/pdf",
    })
    .select("id")
    .single() as { data: { id: string }; error: { message?: string } | null };

  if (documentError || !documentRecord) {
    await admin.storage.from(CLIENT_DOCUMENTS_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: documentError?.message || "Nie udało się zapisać dokumentu oświadczenia." }, { status: 500 });
  }

  await admin
    .from("aml_oswiadczenia_weryfikacji")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      completed_by_name: data.verifiedBy.trim(),
      completed_pdf_document_id: documentRecord.id,
      verification_date: data.verificationDate,
      action_type: data.actionType,
      form_data: data,
    })
    .eq("id", statement.id);

  if (statement.aml_rejestr_id) {
    await admin
      .from("aml_rejestr_klientow")
      .update({ status: "oswiadczenie_zapisane", updated_at: completedAt.toISOString() })
      .eq("id", statement.aml_rejestr_id);
  }

  await admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: statement.aml_rejestr_id,
    akcja: "uzupelnienie_oswiadczenia_weryfikacji",
    opis: `Oświadczenie o weryfikacji i identyfikacji klienta zostało zapisane przez ${data.verifiedBy.trim()}.`,
    zmiany: {
      aml_identification_statement_id: statement.id,
      document_id: documentRecord.id,
      verification_date: data.verificationDate,
      action_type: data.actionType,
    },
    created_by: null,
  });

  return NextResponse.json({ ok: true });
}

function buildDefaults(client: ClientRecord, register: Record<string, unknown> | null, verification: Record<string, unknown> | null) {
  const registry = asRecord(register?.dane_rejestrowe);
  const identifiers = asRecord(registry.identyfikatory);
  const owners = Array.isArray(register?.beneficjenci_rzeczywisci) ? register.beneficjenci_rzeczywisci as Array<Record<string, unknown>> : [];
  const firstOwner = owners[0] || {};
  const sources = Array.isArray(verification?.zrodla) ? verification.zrodla as Array<Record<string, unknown>> : [];
  const sourceNames = sources
    .filter((source) => String(source.status || "") !== "skipped")
    .map((source) => String(source.source || "").trim())
    .filter(Boolean);
  const krs = String(identifiers.krs || register?.numer_krs || "").trim();
  const identifierParts = [client.nip ? `NIP ${client.nip}` : null, krs ? `KRS ${krs}` : null].filter(Boolean);
  return {
    clientName: String(identifiers.nazwa || client.nazwa || ""),
    clientIdentifier: identifierParts.join(", "),
    verificationDate: verification?.created_at ? String(verification.created_at).slice(0, 10) : new Date().toISOString().slice(0, 10),
    actionType: "pierwsza_weryfikacja",
    clientVerificationSources: sourceNames.join(", "),
    clientVerificationResult: verification?.wynik === "negatywny" ? "negatywny" : verification?.wynik === "wymaga_analizy" ? "wymaga_wyjasnien" : "pozytywny",
    beneficialOwnerName: String(firstOwner.label || [firstOwner.pierwszeImie, firstOwner.nazwisko].filter(Boolean).join(" ") || ""),
    beneficialOwnerControlType: firstOwner.typ === "jdg" ? "przedsiębiorca" : String(firstOwner.rola || firstOwner.typ || ""),
    beneficialOwnerSources: [firstOwner.source ? String(firstOwner.source) : "formularz klienta"],
    ownershipStructureEstablished: owners.length > 0 ? "tak" : "",
    beneficialOwnerDataConsistent: owners.length > 0 ? "tak" : "",
    discrepanciesRequireExplanation: "nie",
    finalPositive: "tak",
    finalRequiresCompletion: "nie",
    finalNegative: "nie",
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
