import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; role: null; error: NextResponse };

type BulkNotificationPayload = {
  clientIds?: string[];
  subject?: string;
  message?: string;
  filterSnapshot?: Record<string, unknown>;
};

function getWebhookUrl() {
  const webhookUrl = process.env.N8N_BULK_NOTIFICATIONS_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "Brak konfiguracji wysyłki komunikatów. Uzupełnij N8N_BULK_NOTIFICATIONS_WEBHOOK_URL." },
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
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak uprawnień do wysyłki komunikatów." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", role, error: null };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineFormatting(value: string) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function buildHtmlMessage(message: string) {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px 0;">${renderInlineFormatting(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=5" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      ${paragraphs}
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

  let payload: BulkNotificationPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki." }, { status: 400 });
  }

  const clientIds = Array.isArray(payload.clientIds) ? payload.clientIds.filter(Boolean) : [];
  const subject = payload.subject?.trim() || "";
  const message = payload.message?.trim() || "";

  if (clientIds.length === 0) return NextResponse.json({ error: "Wybierz co najmniej jednego klienta." }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Uzupełnij temat wiadomości." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Uzupełnij treść wiadomości." }, { status: 400 });

  const { data: clients, error: clientsError } = await auth.admin
    .from("klienci")
    .select(`
      id,
      nazwa,
      nip,
      email,
      telefon,
      forma_prawna,
      forma_opodatkowania,
      status_klienta,
      opiekun_id,
      profiles!klienci_opiekun_id_fkey (
        full_name,
        email
      )
    `)
    .in("id", clientIds);

  if (clientsError) {
    return NextResponse.json({ error: "Nie udało się pobrać klientów do wysyłki." }, { status: 500 });
  }

  const allowedClients = (clients || []).filter((client) => auth.role !== "accountant" || client.opiekun_id === auth.requesterId);
  const recipients = allowedClients.filter((client) => Boolean(client.email));

  if (recipients.length === 0) {
    return NextResponse.json({ error: "Wybrani klienci nie mają adresów e-mail albo nie masz uprawnień do ich wysyłki." }, { status: 400 });
  }

  const html = buildHtmlMessage(message);
  const failed: string[] = [];

  for (const client of recipients) {
    const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
    const response = await fetch(webhookConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "bulk_client_notification_requested",
        clientId: client.id,
        clientName: client.nazwa,
        clientNip: client.nip,
        recipientEmail: client.email,
        subject,
        message,
        html,
        caregiverName: caregiver?.full_name || null,
        caregiverEmail: caregiver?.email || null,
        requestedByName: auth.requesterName,
        appUrl: APP_URL,
      }),
    });

    if (!response.ok) {
      failed.push(client.nazwa || client.email || client.id);
    }
  }

  if (failed.length > 0) {
    return NextResponse.json(
      { error: `Nie udało się przekazać części komunikatów do n8n: ${failed.join(", ")}.`, sent: recipients.length - failed.length, failed: failed.length },
      { status: 502 }
    );
  }

  await auth.admin
    .from("komunikaty_historia")
    .insert({
      sent_by: auth.requesterId,
      sent_by_name: auth.requesterName,
      subject,
      message,
      recipients_count: recipients.length,
      recipients: recipients.map((client) => {
        const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
        return {
          clientId: client.id,
          clientName: client.nazwa,
          clientNip: client.nip,
          email: client.email,
          caregiverName: caregiver?.full_name || null,
          caregiverEmail: caregiver?.email || null,
        };
      }),
      skipped_count: allowedClients.length - recipients.length,
      failed_count: 0,
      filter_snapshot: payload.filterSnapshot || {},
    });

  return NextResponse.json({
    sent: recipients.length,
    skipped: allowedClients.length - recipients.length,
  });
}
