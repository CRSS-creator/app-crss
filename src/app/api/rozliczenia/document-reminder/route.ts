import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type ReminderPayload = {
  settlementId?: string;
};

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; role: string; error: null }
  | { admin: null; requesterId: null; role: null; error: NextResponse };

type WebhookConfig =
  | { webhookUrl: string; error: null }
  | { webhookUrl: null; error: NextResponse };

function getWebhookUrl(): WebhookConfig {
  const webhookUrl = process.env.N8N_DOCUMENT_REMINDER_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "Brak konfiguracji wysyłki przypomnienia. Uzupełnij N8N_DOCUMENT_REMINDER_WEBHOOK_URL." },
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
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: requesterData, error: requesterError } = await admin.auth.getUser(token);
  const requesterId = requesterData.user?.id;
  if (requesterError || !requesterId) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Nie udało się potwierdzić sesji użytkownika." }, { status: 401 }) };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, aktywne")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Konto użytkownika jest nieaktywne." }, { status: 403 }) };
  }

  const role = profile?.role || "";
  if (!ALLOWED_ROLES.has(role)) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak uprawnień do wysyłki przypomnienia." }, { status: 403 }) };
  }

  return { admin, requesterId, role, error: null };
}

function reminderDueDate(period: string) {
  const periodDate = new Date(`${period.slice(0, 7)}-01T12:00:00`);
  const date = new Date(periodDate);
  date.setMonth(date.getMonth() + 1, 7);
  return date.toISOString().slice(0, 10);
}

function formatPeriod(period: string) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${period.slice(0, 7)}-01T12:00:00`));
}

function formatDueDate(date: string) {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  const webhookConfig = getWebhookUrl();
  if (webhookConfig.error) return webhookConfig.error;

  let payload: ReminderPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane przypomnienia." }, { status: 400 });
  }

  if (!payload.settlementId) {
    return NextResponse.json({ error: "Brak rozliczenia." }, { status: 400 });
  }

  const { data: settlement, error: settlementError } = await auth.admin
    .from("rozliczenia_miesieczne")
    .select(`
      id,
      okres,
      status_ksiegowosci,
      data_dostarczenia_dokumentow,
      klienci!rozliczenia_miesieczne_klient_id_fkey (
        id,
        nazwa,
        nip,
        email,
        opiekun_id,
        profiles!klienci_opiekun_id_fkey (
          full_name,
          email
        )
      )
    `)
    .eq("id", payload.settlementId)
    .single();

  if (settlementError || !settlement) {
    return NextResponse.json({ error: "Nie znaleziono rozliczenia." }, { status: 404 });
  }

  const client = Array.isArray(settlement.klienci) ? settlement.klienci[0] : settlement.klienci;
  if (!client) {
    return NextResponse.json({ error: "Rozliczenie nie ma powiązanego klienta." }, { status: 400 });
  }

  if (auth.role === "accountant" && client.opiekun_id !== auth.requesterId) {
    return NextResponse.json({ error: "Możesz wysłać przypomnienie tylko dla swoich klientów." }, { status: 403 });
  }

  if (!client.email) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  if (settlement.data_dostarczenia_dokumentow) {
    return NextResponse.json({ error: "Dokumenty są już oznaczone jako dostarczone." }, { status: 400 });
  }

  const dueDate = reminderDueDate(settlement.okres);
  const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;

  try {
    const response = await fetch(webhookConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "settlement_documents_reminder_requested",
        settlementId: settlement.id,
        clientId: client.id,
        clientName: client.nazwa,
        clientNip: client.nip,
        recipientEmail: client.email,
        period: settlement.okres,
        periodLabel: formatPeriod(settlement.okres),
        dueDate,
        dueDateLabel: formatDueDate(dueDate),
        subject: `Przypomnienie o dokumentach księgowych za ${formatPeriod(settlement.okres)}`,
        caregiverName: caregiver?.full_name || null,
        caregiverEmail: caregiver?.email || null,
        appUrl: APP_URL,
        sender: {
          suggestedEmail: "no-reply@biurocrss.pl",
          type: "technical_mailbox",
        },
        template: {
          type: "documents_reminder",
          signatureSource: "n8n_html_template",
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const message = details ? `Automatyzacja zwróciła status ${response.status}: ${details}` : `Automatyzacja zwróciła status ${response.status}.`;
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    return NextResponse.json({ error: `Nie udało się połączyć z automatyzacją n8n: ${message}` }, { status: 502 });
  }
}
