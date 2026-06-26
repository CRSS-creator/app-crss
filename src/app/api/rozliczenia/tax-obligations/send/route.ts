import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type SendChannel = "email" | "sms";
type SendPayload = {
  settlementId?: string;
  channel?: SendChannel;
};

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; role: null; error: NextResponse };

function getWebhookUrl() {
  const webhookUrl = process.env.N8N_TAX_OBLIGATIONS_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "Brak konfiguracji wysyłki zobowiązań. Uzupełnij N8N_TAX_OBLIGATIONS_WEBHOOK_URL." },
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
    .select("role, aktywne, full_name, email")
    .eq("id", requesterId)
    .single();

  if (profile?.aktywne === false) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Konto użytkownika jest nieaktywne." }, { status: 403 }) };
  }

  const role = profile?.role || "";
  if (!ALLOWED_ROLES.has(role)) {
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak uprawnień do wysyłki zobowiązań." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", role, error: null };
}

function formatPeriod(period: string) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${period.slice(0, 7)}-01T12:00:00`));
}

function formatDate(date: string | null) {
  return date ? new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)) : null;
}

function formatCurrency(value: number | null) {
  return value === null || value === undefined ? null : new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  const webhookConfig = getWebhookUrl();
  if (webhookConfig.error) return webhookConfig.error;

  let payload: SendPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki." }, { status: 400 });
  }

  if (!payload.settlementId) {
    return NextResponse.json({ error: "Brak rozliczenia." }, { status: 400 });
  }

  if (payload.channel !== "email" && payload.channel !== "sms") {
    return NextResponse.json({ error: "Wybierz kanał wysyłki: email albo sms." }, { status: 400 });
  }

  const { data: settlement, error: settlementError } = await auth.admin
    .from("rozliczenia_miesieczne")
    .select(`
      id,
      okres,
      klienci!rozliczenia_miesieczne_klient_id_fkey (
        id,
        nazwa,
        nip,
        email,
        telefon,
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
    return NextResponse.json({ error: "Możesz wysłać zobowiązania tylko dla swoich klientów." }, { status: 403 });
  }

  if (payload.channel === "email" && !client.email) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  if (payload.channel === "sms" && !client.telefon) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego numeru telefonu." }, { status: 400 });
  }

  const { data: obligations, error: obligationsError } = await auth.admin
    .from("zobowiazania_podatkowe")
    .select("*")
    .eq("rozliczenie_id", settlement.id)
    .order("termin_platnosci", { ascending: true })
    .order("typ", { ascending: true });

  if (obligationsError) {
    return NextResponse.json({ error: "Nie udało się pobrać zobowiązań." }, { status: 500 });
  }

  const readyObligations = (obligations || []).filter((obligation) => obligation.kwota !== null && obligation.termin_platnosci);
  if (readyObligations.length === 0) {
    return NextResponse.json({ error: "Brak zobowiązań z uzupełnioną kwotą i terminem płatności." }, { status: 400 });
  }

  const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  const channelLabel = payload.channel === "email" ? "e-mail" : "SMS";
  const periodLabel = formatPeriod(settlement.okres);

  try {
    const response = await fetch(webhookConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "tax_obligations_notification_requested",
        channel: payload.channel,
        settlementId: settlement.id,
        clientId: client.id,
        clientName: client.nazwa,
        clientNip: client.nip,
        recipientEmail: client.email,
        recipientPhone: client.telefon,
        period: settlement.okres,
        periodLabel,
        subject: `Informacja o zobowiązaniach publicznoprawnych za ${periodLabel}`,
        obligations: readyObligations.map((obligation) => ({
          id: obligation.id,
          type: obligation.typ,
          name: obligation.nazwa,
          amount: Number(obligation.kwota),
          amountLabel: formatCurrency(Number(obligation.kwota)),
          dueDate: obligation.termin_platnosci,
          dueDateLabel: formatDate(obligation.termin_platnosci),
        })),
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

    const sentAt = new Date().toISOString();
    const updatePayload = payload.channel === "email"
      ? { status_email: "wyslane", email_sent_at: sentAt, email_sent_by: auth.requesterId }
      : { status_sms: "wyslane", sms_sent_at: sentAt, sms_sent_by: auth.requesterId };

    const { data: updatedObligations, error: updateError } = await auth.admin
      .from("zobowiazania_podatkowe")
      .update(updatePayload)
      .in("id", readyObligations.map((obligation) => obligation.id))
      .select("*");

    if (updateError) {
      return NextResponse.json({ error: `${channelLabel} wysłano, ale nie udało się zapisać statusu wysyłki.` }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      channel: payload.channel,
      sentAt,
      sentById: auth.requesterId,
      sentByName: auth.requesterName,
      obligations: updatedObligations || [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    return NextResponse.json({ error: `Nie udało się połączyć z automatyzacją n8n: ${message}` }, { status: 502 });
  }
}
