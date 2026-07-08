import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; role: null; error: NextResponse };

type NotificationPayload = {
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
  const webhookUrl = process.env.N8N_ONBOARDING_WFIRMA_ACCOUNT_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "Brak konfiguracji wysyłki powiadomienia wFirma. Uzupełnij N8N_ONBOARDING_WFIRMA_ACCOUNT_WEBHOOK_URL." },
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
  if (!ALLOWED_ROLES.has(role)) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak uprawnień do wysyłki powiadomienia." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", role, error: null };
}

function caregiverFromClient(client: ClientWithCaregiver) {
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function buildNotificationHtml(client: ClientWithCaregiver) {
  const clientName = client.nazwa || "Państwa firmy";
  const caregiver = caregiverFromClient(client);
  const caregiverName = caregiver?.full_name || "opiekunem księgowym";

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=6" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">informujemy, że dla <strong>${clientName}</strong> zostało utworzone konto w systemie wFirma, na ten adres mailowy powinna przyjść informacja systemowa o utworzeniu konta przedsiębiorcy i konieczności ustawienia hasła.</p>
      <div style="background:#eef3fb;border:1px solid #c9d6e8;border-radius:14px;padding:18px;margin:24px 0;">
        <p style="margin:0 0 12px 0;font-weight:850;">Instrukcja KSeF</p>
        <p style="margin:0;">W załączeniu przesyłamy instrukcję integracji KSeF z wFirmą oraz informacje dotyczące uprawnień i certyfikatów.</p>
      </div>
      <p style="margin:0 0 16px 0;">W razie pytań prosimy o kontakt z ${caregiverName}.</p>
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

  let payload: NotificationPayload;
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
  if (auth.role === "accountant" && clientRecord.opiekun_id !== auth.requesterId) {
    return NextResponse.json({ error: "Możesz wysyłać powiadomienia tylko dla swoich klientów." }, { status: 403 });
  }

  if (!clientRecord.email) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  const caregiver = caregiverFromClient(clientRecord);
  const attachments = [
    {
      fileName: "CRSS-uprawnienia-i-certyfikaty-w-KSeF.pdf",
      url: `${APP_URL}/CRSS-uprawnienia-i-certyfikaty-w-KSeF.pdf`,
    },
  ];

  try {
    const response = await fetch(webhookConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "onboarding_wfirma_account_notification_requested",
        clientId: clientRecord.id,
        clientName: clientRecord.nazwa,
        clientNip: clientRecord.nip,
        recipientEmail: clientRecord.email,
        subject: "Utworzenie konta wFirma i instrukcja integracji KSeF",
        html: buildNotificationHtml(clientRecord),
        attachments,
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

    const { data: stage } = await auth.admin
      .from("onboarding_etapy")
      .select("id, status")
      .eq("klient_id", clientRecord.id)
      .eq("etap", "wfirma_account")
      .maybeSingle();

    if (stage?.id && stage.status !== "gotowe") {
      await auth.admin
        .from("onboarding_etapy")
        .update({
          status: "gotowe",
          completed_at: new Date().toISOString(),
          completed_by: auth.requesterId,
          updated_by: auth.requesterId,
        })
        .eq("id", stage.id);
    }

    await auth.admin.from("onboarding_historia").insert({
      klient_id: clientRecord.id,
      onboarding_etap_id: stage?.id || null,
      etap: "wfirma_account",
      akcja: "wysylka_powiadomienia_wfirma",
      old_status: stage?.status || null,
      new_status: "gotowe",
      opis: `Wysłano powiadomienie o utworzeniu konta wFirma do klienta ${clientRecord.nazwa || "bez nazwy"}.`,
      created_by: auth.requesterId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    return NextResponse.json({ error: `Nie udało się połączyć z automatyzacją n8n: ${message}` }, { status: 502 });
  }
}
