import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const APP_URL = "https://app.crss.com.pl";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; role: null; error: NextResponse };

type CaregiverNotificationPayload = {
  clientId?: string;
};

type ClientWithCaregiver = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  opiekun_id: string | null;
  profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
};

function getWebhookUrl() {
  const webhookUrl = process.env.N8N_ONBOARDING_CAREGIVER_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "Brak konfiguracji wysyłki informacji o opiekunie. Uzupełnij N8N_ONBOARDING_CAREGIVER_WEBHOOK_URL." },
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
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 }) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak aktywnej sesji użytkownika." }, { status: 401 }) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne, full_name, email")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Konto użytkownika jest nieaktywne." }, { status: 403 }) };
  }

  const role = profile?.role || "";
  if (role !== "manager") {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Informację o opiekunie może wysłać tylko manager." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", role, error: null };
}

function caregiverFromClient(client: ClientWithCaregiver) {
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function buildCaregiverHtml(client: ClientWithCaregiver, caregiverName: string, caregiverEmail: string) {
  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=6" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">miło nam poinformować, że w ramach współpracy z naszym biurem rachunkowym został wyznaczony Państwa indywidualny opiekun księgowy.</p>
      <p style="margin:0 0 16px 0;">Od dziś wszelkie sprawy związane z obsługą księgową będzie prowadzić:</p>
      <div style="background:#eef3fb;border:1px solid #c9d6e8;border-radius:14px;padding:18px;margin:24px 0;">
        <p style="margin:0 0 8px 0;font-size:18px;font-weight:850;">${caregiverName}</p>
        <p style="margin:0 0 8px 0;"><strong>tel.:</strong> 600-950-940</p>
        <p style="margin:0;"><strong>e-mail:</strong> ${caregiverEmail}</p>
      </div>
      <p style="margin:0 0 16px 0;">Numer telefonu jest ogólny do biura, po dodzwonieniu się należy poprosić o kontakt z dedykowanym opiekunem.</p>
      <p style="margin:0 0 16px 0;">Państwa opiekun będzie odpowiadać za bieżący kontakt, udzielanie informacji oraz wspieranie w sprawach związanych z księgowością i rozliczeniami.</p>
      <p style="margin:0 0 16px 0;">W przypadku dodatkowych pytań lub pilnych spraw zawsze pozostaje również do dyspozycji nasz główny adres e-mail: <a href="mailto:biuro@crss.com.pl" style="color:#173b73;font-weight:850;">biuro@crss.com.pl</a>. Na tego maila proszę również kierować pytania związane z kwestiami formalno-prawnymi naszej umowy.</p>
      <p style="margin:0 0 16px 0;">Dziękujemy za zaufanie i cieszymy się na dalszą współpracę.</p>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  const webhookConfig = getWebhookUrl();
  if (webhookConfig.error) return webhookConfig.error;

  let payload: CaregiverNotificationPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki." }, { status: 400 });
  }

  if (!payload.clientId) {
    return NextResponse.json({ error: "Brak klienta." }, { status: 400 });
  }

  const { data: client, error: clientError } = await auth.admin
    .from("klienci")
    .select(`
      id,
      nazwa,
      nip,
      email,
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

  const caregiver = caregiverFromClient(clientRecord);
  const caregiverName = caregiver?.full_name?.trim();
  const caregiverEmail = caregiver?.email?.trim();

  if (!clientRecord.opiekun_id || !caregiverName || !caregiverEmail) {
    return NextResponse.json({ error: "Najpierw wybierz opiekuna księgowego z imieniem, nazwiskiem i adresem e-mail." }, { status: 400 });
  }

  try {
    const response = await fetch(webhookConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "onboarding_caregiver_notification_requested",
        clientId: clientRecord.id,
        clientName: clientRecord.nazwa,
        clientNip: clientRecord.nip,
        recipientEmail: clientRecord.email,
        subject: "Twój opiekun księgowy CRSS",
        html: buildCaregiverHtml(clientRecord, caregiverName, caregiverEmail),
        caregiverName,
        caregiverEmail,
        requestedByName: auth.requesterName,
        appUrl: APP_URL,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const message = details ? `Automatyzacja zwróciła status ${response.status}: ${details}` : `Automatyzacja zwróciła status ${response.status}.`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    await auth.admin.from("onboarding_historia").insert({
      klient_id: clientRecord.id,
      onboarding_etap_id: null,
      etap: null,
      akcja: "wysylka_informacji_o_opiekunie",
      old_status: null,
      new_status: null,
      opis: `Wysłano klientowi informację o opiekunie księgowym: ${caregiverName}.`,
      created_by: auth.requesterId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    return NextResponse.json({ error: `Nie udało się połączyć z automatyzacją n8n: ${message}` }, { status: 502 });
  }
}
