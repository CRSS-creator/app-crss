import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { splitEmails } from "@/lib/contactFields";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";
const BULK_TO_EMAIL = "biuro@crss.com.pl";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; role: null; error: NextResponse };

type BulkNotificationPayload = {
  clientIds?: string[];
  subject?: string;
  message?: string;
  filterSnapshot?: Record<string, unknown>;
};

type BulkRecipient = {
  client: {
    id: string;
    nazwa: string | null;
    nip: string | null;
    email: string | null;
    opiekun_id: string | null;
    profiles?: {
      full_name: string | null;
      email: string | null;
    } | {
      full_name: string | null;
      email: string | null;
    }[] | null;
  };
  email: string;
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

  return { webhookUrl: normalizeBulkWebhookUrl(webhookUrl), error: null };
}

function normalizeBulkWebhookUrl(webhookUrl: string) {
  return webhookUrl.replace(/powiadomienia-kadrowe\b/, "powiadomienia-zbiorcze");
}

function webhookDiagnostics(webhookUrl: string) {
  let path = "nieznana sciezka";
  try {
    const url = new URL(webhookUrl);
    path = url.pathname;
  } catch {
    path = webhookUrl.includes("/webhook-test/") ? "/webhook-test/..." : webhookUrl.includes("/webhook/") ? "/webhook/..." : "nieprawidlowy URL";
  }

  return {
    webhookMode: webhookUrl.includes("/webhook-test/") ? "test" : "production",
    webhookPath: path,
  };
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

async function readWebhookError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return `Automatyzacja zwróciła błąd HTTP ${response.status} ${response.statusText || ""}.`.trim();

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const details = [
      parsed.error,
      parsed.message,
      parsed.details,
      parsed.reason,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    if (details.length > 0) return `Automatyzacja zwróciła błąd HTTP ${response.status}: ${details.join(" ")}`;
  } catch {
    // The webhook may return plain text or HTML; include a short excerpt for diagnostics.
  }

  return `Automatyzacja zwróciła błąd HTTP ${response.status}: ${text.slice(0, 700)}`;
}

async function readWebhookConfirmation(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {
      confirmed: false,
      details: "n8n zwrocilo pusta odpowiedz. Dodaj na koncu workflow odpowiedz JSON po Gmailu, np. {\"success\": true}.",
    };
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const confirmed = [
      parsed.success,
      parsed.emailSent,
      parsed.gmailSent,
      parsed.messageSent,
    ].some((value) => value === true);

    if (confirmed) return { confirmed: true, details: "" };

    const details = [
      parsed.error,
      parsed.message,
      parsed.details,
      parsed.reason,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    return {
      confirmed: false,
      details: details.length > 0
        ? details.join(" ")
        : `n8n odpowiedzialo, ale nie potwierdzilo wysylki po Gmailu: ${text.slice(0, 700)}`,
    };
  } catch {
    return {
      confirmed: false,
      details: `n8n zwrocilo odpowiedz bez JSON: ${text.slice(0, 700)}. Zwroc po Gmailu np. {\"success\": true}.`,
    };
  }
}

function uniqueRecipients(recipients: BulkRecipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const normalized = recipient.email.trim().toLocaleLowerCase("pl-PL");
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function historyRecipient(recipient: BulkRecipient) {
  const caregiver = Array.isArray(recipient.client.profiles) ? recipient.client.profiles[0] : recipient.client.profiles;
  return {
    clientId: recipient.client.id,
    clientName: recipient.client.nazwa,
    clientNip: recipient.client.nip,
    email: recipient.email,
    caregiverName: caregiver?.full_name || null,
    caregiverEmail: caregiver?.email || null,
  };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  const webhookConfig = getWebhookUrl();
  if (webhookConfig.error) return webhookConfig.error;
  const webhookUrl = webhookConfig.webhookUrl;
  if (!webhookUrl) return NextResponse.json({ error: "Brak adresu webhooka n8n do wysyłki komunikatów." }, { status: 500 });

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
    return NextResponse.json({ error: `Nie udało się pobrać klientów do wysyłki: ${clientsError.message}` }, { status: 500 });
  }

  const allowedClients = (clients || []).filter((client) => auth.role !== "accountant" || client.opiekun_id === auth.requesterId);
  const skippedCount = allowedClients.filter((client) => splitEmails(client.email).length === 0).length;
  const recipients = uniqueRecipients(allowedClients.flatMap((client) =>
    splitEmails(client.email).map((email) => ({ client, email }))
  ));

  if (recipients.length === 0) {
    return NextResponse.json({ error: "Wybrani klienci nie mają adresów e-mail albo nie masz uprawnień do ich wysyłki." }, { status: 400 });
  }

  const html = buildHtmlMessage(message);
  const bccEmails = recipients.map((recipient) => recipient.email);
  const diagnostics = webhookDiagnostics(webhookUrl);

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "bulk_client_notification_requested",
        deliveryMode: "single_email_bcc",
        recipientEmail: null,
        recipientEmails: [],
        toEmail: BULK_TO_EMAIL,
        bccEmails,
        bcc: bccEmails,
        subject,
        message,
        html,
        recipients: recipients.map(historyRecipient),
        requestedByName: auth.requesterName,
        appUrl: APP_URL,
        requiresDeliveryConfirmation: true,
      }),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: `Nie udało się połączyć z automatyzacją n8n. Szczegóły: ${details}`,
        diagnostics,
      },
      { status: 502 }
    );
  }

  if (!response.ok) {
    const errorDetails = await readWebhookError(response);
    return NextResponse.json(
      {
        error: `Nie udało się przekazać komunikatu zbiorczego do n8n. ${errorDetails} Sprawdź workflow wysyłki komunikatów oraz pola: toEmail, bccEmails, subject i html.`,
        sent: 0,
        failed: recipients.length,
        diagnostics,
      },
      { status: 502 }
    );
  }

  const webhookConfirmation = await readWebhookConfirmation(response);
  if (!webhookConfirmation.confirmed) {
    return NextResponse.json(
      {
        error: `n8n odebralo komunikat, ale nie potwierdzilo wysylki po Gmailu. ${webhookConfirmation.details}`,
        sent: 0,
        failed: recipients.length,
        diagnostics,
      },
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
      recipients: recipients.map(historyRecipient),
      skipped_count: skippedCount,
      failed_count: 0,
      filter_snapshot: payload.filterSnapshot || {},
    });

  return NextResponse.json({
    sent: recipients.length,
    skipped: skippedCount,
    diagnostics,
  });
}
