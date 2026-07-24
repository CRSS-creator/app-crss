import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveAmlInitialFormType } from "@/lib/amlInitialFormTypes";
import { markOnboardingAmlInProgress } from "@/lib/server/onboardingAmlStatus";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin"]);
const APP_URL = "https://app.crss.com.pl";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; error: NextResponse };

type Payload = {
  clientId?: string;
};

type ClientWithCaregiver = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  osoba_kontaktowa: string | null;
  forma_prawna: string | null;
  opiekun_id: string | null;
  profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
};

function getWebhookUrl() {
  const webhookUrl = process.env.N8N_AML_INITIAL_FORM_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "Brak konfiguracji wysyłki formularza wstępnego AML. Uzupełnij N8N_AML_INITIAL_FORM_WEBHOOK_URL." },
        { status: 500 }
      ),
    };
  }

  if (webhookUrl.includes("/webhook-test/")) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "W aplikacji ustawiony jest testowy webhook n8n. Użyj produkcyjnego adresu /webhook/... i aktywuj workflow w n8n." },
        { status: 500 }
      ),
    };
  }

  return { webhookUrl, error: null };
}

async function getAuthorizedUser(request: NextRequest): Promise<AuthorizedResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne, full_name, email")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false || !ALLOWED_ROLES.has(String(profile?.role || ""))) {
    return { admin: null, requesterId: null, error: NextResponse.json({ error: "Brak uprawnień do wysyłki formularza wstępnego AML." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", error: null };
}

function caregiverFromClient(client: ClientWithCaregiver) {
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function buildInitialFormHtml(client: ClientWithCaregiver, formUrl: string) {
  const clientName = client.nazwa || "Państwa firmy";

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=6" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">prosimy o uzupełnienie formularza wstępnego AML dla <strong>${clientName}</strong>.</p>
      <p style="margin:0 0 16px 0;">Jako biuro rachunkowe jesteśmy jednostką obowiązaną w myśl ustawy o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu. Z tego powodu musimy zebrać wskazane dane w celu identyfikacji i weryfikacji klienta.</p>
      <div style="background:#eef3fb;border:1px solid #c9d6e8;border-radius:14px;padding:18px;margin:24px 0;">
        <p style="margin:0 0 10px 0;font-weight:850;">Formularz wstępny AML</p>
        <p style="margin:0;">Formularz należy wypełnić online. Link jest indywidualny i wygaśnie po zapisaniu formularza.</p>
      </div>
      <p style="margin:24px 0;">
        <a href="${formUrl}" style="display:inline-block;padding:14px 22px;background:#f52f57;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:850;">Wypełnij formularz AML</a>
      </p>
      <p style="margin:0 0 16px 0;">W razie pytań prosimy o kontakt z opiekunem.</p>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
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

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki." }, { status: 400 });
  }

  if (!payload.clientId) return NextResponse.json({ error: "Brak klienta." }, { status: 400 });

  const { data: client, error: clientError } = await auth.admin
    .from("klienci")
    .select(`
      id,
      nazwa,
      nip,
      email,
      osoba_kontaktowa,
      forma_prawna,
      opiekun_id,
      profiles!klienci_opiekun_id_fkey (
        full_name,
        email
      )
    `)
    .eq("id", payload.clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  }

  const clientRecord = client as ClientWithCaregiver;
  if (!clientRecord.email) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  const register = await ensureAmlRegister(auth.admin, clientRecord.id).catch((error) => {
    console.error("Nie udało się przygotować rejestru AML dla formularza wstępnego:", error);
    return null;
  });
  if (!register) {
    return NextResponse.json({ error: "Nie udało się przygotować rejestru AML klienta." }, { status: 500 });
  }
  await markOnboardingAmlInProgress(auth.admin, clientRecord.id, auth.requesterId);

  const { data: existingForm } = await auth.admin
    .from("aml_formularze_wstepne")
    .select("id, public_token")
    .eq("klient_id", clientRecord.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let formRecord = existingForm as { id: string; public_token: string } | null;

  if (!formRecord) {
    const { data: createdForm, error: createError } = await auth.admin
      .from("aml_formularze_wstepne")
      .insert({
        klient_id: clientRecord.id,
        aml_rejestr_id: register.id,
        recipient_email: clientRecord.email,
        recipient_name: clientRecord.osoba_kontaktowa,
      })
      .select("id, public_token")
      .single();

    if (createError || !createdForm) {
      return NextResponse.json({ error: "Nie udało się przygotować linku do formularza wstępnego AML." }, { status: 500 });
    }

    formRecord = createdForm as { id: string; public_token: string };
  }

  const formUrl = `${APP_URL}/aml/formularz-wstepny/${formRecord.public_token}`;
  const webhookConfig = getWebhookUrl();
  if (webhookConfig.error) return webhookConfig.error;

  const caregiver = caregiverFromClient(clientRecord);
  const formType = resolveAmlInitialFormType(clientRecord.forma_prawna);

  try {
    const response = await fetch(webhookConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "aml_initial_form_requested",
        clientId: clientRecord.id,
        clientName: clientRecord.nazwa,
        clientNip: clientRecord.nip,
        clientLegalForm: clientRecord.forma_prawna,
        formType,
        recipientEmail: clientRecord.email,
        recipientName: clientRecord.osoba_kontaktowa,
        subject: "Formularz wstępny AML do uzupełnienia",
        html: buildInitialFormHtml(clientRecord, formUrl),
        formUrl,
        caregiverName: caregiver?.full_name || null,
        caregiverEmail: caregiver?.email || null,
        requestedByName: auth.requesterName,
        appUrl: APP_URL,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const message = details ? `Automatyzacja zwróciła status ${response.status}: ${details}` : `Automatyzacja zwróciła status ${response.status}.`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    await auth.admin
      .from("aml_formularze_wstepne")
      .update({
        sent_at: new Date().toISOString(),
        sent_by: auth.requesterId,
        sent_by_name: auth.requesterName,
        recipient_email: clientRecord.email,
        recipient_name: clientRecord.osoba_kontaktowa,
      })
      .eq("id", formRecord.id);

    await auth.admin
      .from("aml_rejestr_klientow")
      .update({ status: "formularz_wyslany" })
      .eq("id", register.id);

    await auth.admin.from("aml_historia").insert({
      klient_id: clientRecord.id,
      aml_rejestr_id: register.id,
      akcja: "wysylka_formularza_wstepnego",
      opis: `Formularz wstępny AML został wysłany do uzupełnienia przez ${auth.requesterName}.`,
      zmiany: {
        aml_initial_form_id: formRecord.id,
        recipient_email: clientRecord.email,
        form_url: formUrl,
      },
      created_by: auth.requesterId,
    });

    return NextResponse.json({ ok: true, formUrl });
  } catch (error) {
    console.error("Błąd wysyłki formularza wstępnego AML:", error);
    return NextResponse.json({ error: "Nie udało się przekazać formularza wstępnego AML do wysyłki." }, { status: 500 });
  }
}
