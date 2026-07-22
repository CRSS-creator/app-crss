import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildAmlInitialFormPdf } from "@/lib/amlInitialFormPdf";
import { validateAmlInitialFormData, type AmlInitialFormData } from "@/lib/amlInitialFormTypes";

export const runtime = "nodejs";

const CLIENT_DOCUMENTS_BUCKET = "klienci-dokumenty";

type RouteContext = {
  params: Promise<{ token: string }>;
};

type ClientRecord = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  opiekun_id: string | null;
};

type FormRecord = {
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

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getClient(form: FormRecord) {
  return Array.isArray(form.klienci) ? form.klienci[0] : form.klienci;
}

function fileSafeName(value: string | null | undefined) {
  return (value?.trim() || "klient").replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ");
}

async function getForm(token: string) {
  const admin = adminClient();
  if (!admin) return { admin: null, form: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };

  const { data, error } = await admin
    .from("aml_formularze_wstepne")
    .select(`
      id,
      status,
      klient_id,
      aml_rejestr_id,
      public_token,
      klienci (
        id,
        nazwa,
        nip,
        email,
        opiekun_id
      )
    `)
    .eq("public_token", token)
    .maybeSingle();

  if (error) {
    return { admin, form: null, error: NextResponse.json({ error: "Nie udało się pobrać formularza." }, { status: 500 }) };
  }

  if (!data) return { admin, form: null, error: NextResponse.json({ status: "missing" }, { status: 404 }) };

  return { admin, form: data as FormRecord, error: null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getForm(token);
  if (result.error) return result.error;

  const form = result.form;
  if (!form) return NextResponse.json({ status: "missing" }, { status: 404 });
  if (form.status !== "active") return NextResponse.json({ status: form.status });

  const client = getClient(form);
  if (!client) return NextResponse.json({ status: "missing" }, { status: 404 });

  return NextResponse.json({
    status: "active",
    client: {
      id: client.id,
      nazwa: client.nazwa,
      nip: client.nip,
      email: client.email,
    },
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    return await saveInitialForm(request, context);
  } catch (error) {
    console.error("Nieobsłużony błąd zapisu formularza wstępnego AML:", error);
    return NextResponse.json({ error: "Nie udało się zapisać formularza. Spróbuj ponownie za chwilę albo skontaktuj się z opiekunem." }, { status: 500 });
  }
}

async function saveInitialForm(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const result = await getForm(token);
  if (result.error) return result.error;

  const admin = result.admin;
  const form = result.form;
  if (!admin || !form) return NextResponse.json({ status: "missing" }, { status: 404 });

  if (form.status !== "active") {
    return NextResponse.json({ error: "Ten formularz został już zapisany albo link wygasł." }, { status: 409 });
  }

  const client = getClient(form) as ClientRecord;
  if (!client) return NextResponse.json({ error: "Nie znaleziono klienta dla formularza." }, { status: 404 });

  let data: AmlInitialFormData;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane formularza." }, { status: 400 });
  }

  const missing = validateAmlInitialFormData(data);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Uzupełnij wymagane pola: ${missing.join(", ")}.` }, { status: 400 });
  }

  const completedAt = new Date();
  const { data: register } = form.aml_rejestr_id
    ? await admin
      .from("aml_rejestr_klientow")
      .select("nastepna_weryfikacja_at")
      .eq("id", form.aml_rejestr_id)
      .maybeSingle()
    : { data: null };
  const validUntil = register?.nastepna_weryfikacja_at ? dateBefore(register.nastepna_weryfikacja_at) : null;
  const pdf = await buildAmlInitialFormPdf({
    clientName: client.nazwa || "Klient",
    clientNip: client.nip,
    completedAt,
    data,
  });

  const fileName = `Formularz wstępny AML - ${fileSafeName(client.nazwa)}.pdf`;
  const storagePath = `${client.id}/aml-formularz-wstepny-${Date.now()}.pdf`;

  const uploadResult = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(storagePath, pdf, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadResult.error) {
    console.error("Błąd zapisu PDF formularza wstępnego AML:", uploadResult.error);
    return NextResponse.json({ error: "Nie udało się zapisać PDF w segregatorze klienta." }, { status: 500 });
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
    console.error("Błąd zapisu dokumentu formularza AML:", documentError);
    return NextResponse.json({ error: "PDF został utworzony, ale nie udało się dodać go do rejestru dokumentów." }, { status: 500 });
  }

  await admin
    .from("aml_formularze_wstepne")
    .update({
      status: "completed",
      completed_at: completedAt.toISOString(),
      completed_by_name: data.completedBy.trim(),
      completed_pdf_document_id: documentRecord.id,
      wazny_do: validUntil,
      form_data: data,
    })
    .eq("id", form.id);

  if (form.aml_rejestr_id) {
    await admin
      .from("aml_rejestr_klientow")
      .update({ status: "formularz_odebrany" })
      .eq("id", form.aml_rejestr_id);
  }

  await admin.from("aml_historia").insert({
    klient_id: client.id,
    aml_rejestr_id: form.aml_rejestr_id,
    akcja: "uzupelnienie_formularza_wstepnego",
    opis: `Formularz wstępny AML został wypełniony przez ${data.completedBy.trim()}.`,
    zmiany: {
      aml_initial_form_id: form.id,
      document_id: documentRecord.id,
      valid_until: validUntil,
    },
    created_by: null,
  });

  if (!client || !documentRecord) {
    return NextResponse.json({ error: "Nie udało się przygotować danych powiadomienia AML." }, { status: 500 });
  }

  const { data: ownerProfiles } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "owner")
    .eq("aktywne", true);

  const ownerNotifications = (ownerProfiles || []).map((owner) => ({
    type: "aml_initial_form_completed",
    title: "Formularz wstępny AML został wypełniony",
    body: `Klient ${client.nazwa || "bez nazwy"} wypełnił formularz wstępny AML. PDF zapisano w dokumentach klienta.`,
    priority: "high",
    related_table: "aml_formularze_wstepne",
    related_id: form.id,
    recipient_id: owner.id,
    metadata: {
      client_id: client.id,
      client_name: client.nazwa,
      client_nip: client.nip,
      aml_initial_form_id: form.id,
      document_id: documentRecord.id,
      notification_kind: "aml_initial_form_completed",
      recipient_kind: "owner",
      target_module: "aml",
    },
  }));

  if (ownerNotifications.length > 0) {
    await admin.from("powiadomienia").insert(ownerNotifications);
  }

  if (false && client.opiekun_id) {
    await admin.from("powiadomienia").insert({
      type: "aml_initial_form_completed",
      title: "Formularz wstępny AML został wypełniony",
      body: `Klient ${client.nazwa || "bez nazwy"} wypełnił formularz wstępny AML. PDF zapisano w dokumentach klienta.`,
      priority: "high",
      related_table: "aml_formularze_wstepne",
      related_id: form.id,
      recipient_id: client.opiekun_id,
      metadata: {
        client_id: client.id,
        client_name: client.nazwa,
        client_nip: client.nip,
        aml_initial_form_id: form.id,
        document_id: documentRecord.id,
        notification_kind: "aml_initial_form_completed",
      },
    });
  }

  return NextResponse.json({ ok: true });
}

function dateBefore(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
