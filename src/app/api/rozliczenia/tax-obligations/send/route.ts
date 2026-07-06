import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type SendChannel = "email" | "sms";
type SendPayload = {
  settlementId?: string;
  channel?: SendChannel;
  obligationIds?: string[];
};

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; requesterEmail: string | null; role: string; error: null }
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

  return {
    admin,
    requesterId,
    requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik",
    requesterEmail: profile?.email || requesterData.user?.email || null,
    role,
    error: null,
  };
}

type RelatedProfile = {
  full_name?: string | null;
  email?: string | null;
} | null;

function firstRelatedProfile(value: unknown): RelatedProfile {
  if (Array.isArray(value)) return (value[0] as RelatedProfile) || null;
  return (value as RelatedProfile) || null;
}

function normalizeIdentity(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function accountantOwnsClient(auth: Extract<AuthorizedResult, { error: null }>, client: { opiekun_id?: string | null; profiles?: unknown }) {
  if (auth.role !== "accountant") return true;
  if (client.opiekun_id === auth.requesterId) return true;

  const caregiver = firstRelatedProfile(client.profiles);
  const requesterEmail = normalizeIdentity(auth.requesterEmail);
  const requesterName = normalizeIdentity(auth.requesterName);

  return Boolean(
    (requesterEmail && normalizeIdentity(caregiver?.email) === requesterEmail) ||
    (requesterName && normalizeIdentity(caregiver?.full_name) === requesterName)
  );
}

function formatPeriod(period: string) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(`${period.slice(0, 7)}-01T12:00:00`));
}

function formatDate(date: string | null) {
  return date ? new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00`)) : null;
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;

  const amount = new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  })
    .format(value)
    .replace(/\u00a0|\u202f/g, " ");

  return `${amount} zł`;
}

function escapeHtml(value: string | null | undefined) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toSmsText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/zł/g, "zl")
    .replace(/ZŁ/g, "ZL")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEmailHtml(input: {
  clientName: string | null;
  periodLabel: string;
  obligations: Array<{ name: string; amountLabel: string | null; dueDateLabel: string | null }>;
  caregiverName: string | null;
  caregiverEmail: string | null;
}) {
  const obligationCards = input.obligations.map((obligation, index) => `
    <div style="padding:${index === 0 ? "4px" : "16px"} 0 16px;border-bottom:${index === input.obligations.length - 1 ? "none" : "1px solid #dbe5f2"};">
      <div style="margin:0 0 10px;color:#173B73;font-size:17px;font-weight:800;">${escapeHtml(obligation.name)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;">
        <tr>
          <td width="48%" valign="top" style="background:#ffffff;border:1px solid #c9d6e8;border-radius:12px;padding:12px;">
            <div style="margin:0 0 6px;color:#43516a;font-size:13px;font-weight:700;">Kwota</div>
            <div style="color:#173B73;font-size:20px;font-weight:850;">${escapeHtml(obligation.amountLabel || "Do uzupełnienia")}</div>
          </td>
          <td width="16" style="font-size:0;line-height:0;">&nbsp;</td>
          <td width="48%" valign="top" style="background:#ffffff;border:1px solid #c9d6e8;border-radius:12px;padding:12px;">
            <div style="margin:0 0 6px;color:#43516a;font-size:13px;font-weight:700;">Termin płatności</div>
            <div style="color:#173B73;font-size:20px;font-weight:850;">${escapeHtml(obligation.dueDateLabel || "Do ustalenia")}</div>
          </td>
        </tr>
      </table>
    </div>
  `).join("");

  const caregiverContact = input.caregiverName || input.caregiverEmail
    ? `: <strong>${escapeHtml(input.caregiverName || input.caregiverEmail)}</strong>${input.caregiverEmail ? `, <a href="mailto:${escapeHtml(input.caregiverEmail)}" style="color:#173B73;">${escapeHtml(input.caregiverEmail)}</a>` : ""}`
    : "";

  return `
    <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#26364f;">
      <div style="max-width:680px;margin:0 auto;padding:28px 18px;">
        <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
          <div style="margin-bottom:24px;">
            <img src="${APP_URL}/logo-crss-mail.png" alt="CRSS" style="height:54px;max-width:180px;display:block;">
          </div>
          <p style="margin:0 0 18px;font-size:16px;line-height:1.7;">Dzień dobry,</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.7;">
            przekazujemy informacje o zobowiązaniach publicznoprawnych za miesiąc <strong>${escapeHtml(input.periodLabel)}</strong>${input.clientName ? ` dla <strong>${escapeHtml(input.clientName)}</strong>` : ""}.
          </p>
          <div style="background:#eef3fb;border:1px solid #c9d6e8;border-radius:16px;padding:18px 20px;margin:0 0 22px;">
            <div style="margin:0 0 12px;color:#43516a;font-size:13px;font-weight:800;">Zobowiązania do zapłaty</div>
            ${obligationCards}
          </div>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#26364f;">
            Jeżeli masz jakieś wątpliwości, skontaktuj się ze swoim opiekunem${caregiverContact}. Wszystkie deklaracje znajdziesz na swoim koncie w systemie wFirma.
          </p>
          <p style="margin:24px 0 0;font-size:16px;line-height:1.7;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
        </div>
        <p style="margin:18px 4px 0;color:#8b96a8;font-size:13px;line-height:1.5;">Wiadomość wysłana automatycznie, prosimy na nią nie odpowiadać.</p>
      </div>
    </div>
  `;
}

function buildSmsMessage(input: {
  clientName: string | null;
  periodLabel: string;
  obligations: Array<{ name: string; amountLabel: string | null; dueDateLabel: string | null }>;
}) {
  const items = input.obligations
    .map((obligation) => `zobowiazanie ${toSmsText(obligation.name)} za miesiac ${toSmsText(input.periodLabel)} w kwocie ${toSmsText(obligation.amountLabel || "kwota do uzupelnienia")}`)
    .join("; ");

  return `Dzien dobry, do zaplaty z ${toSmsText(input.clientName || "firmy")} ${items}. Pozdrawiamy, CRSS Sp. z o.o.`;
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

  if (!accountantOwnsClient(auth, client)) {
    return NextResponse.json({ error: "Możesz wysłać zobowiązania tylko dla swoich klientów." }, { status: 403 });
  }

  if (payload.channel === "email" && !client.email) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  if (payload.channel === "sms" && !client.telefon) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego numeru telefonu." }, { status: 400 });
  }

  let obligationsQuery = auth.admin
    .from("zobowiazania_podatkowe")
    .select("*")
    .eq("rozliczenie_id", settlement.id)
    .order("termin_platnosci", { ascending: true })
    .order("typ", { ascending: true });

  const obligationIds = Array.isArray(payload.obligationIds) ? payload.obligationIds.filter(Boolean) : [];
  if (obligationIds.length > 0) {
    obligationsQuery = obligationsQuery.in("id", obligationIds);
  }

  const { data: obligations, error: obligationsError } = await obligationsQuery;

  if (obligationsError) {
    return NextResponse.json({ error: "Nie udało się pobrać zobowiązań." }, { status: 500 });
  }

  const sendStatusColumn = payload.channel === "email" ? "status_email" : "status_sms";
  const readyObligations = (obligations || []).filter((obligation) =>
    obligation.kwota !== null &&
    obligation.termin_platnosci &&
    obligation[sendStatusColumn] !== "wyslane"
  );
  if (readyObligations.length === 0) {
    return NextResponse.json({ error: "Brak nowych zobowiązań do wysłania tym kanałem." }, { status: 400 });
  }

  const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  const channelLabel = payload.channel === "email" ? "e-mail" : "SMS";
  const periodLabel = formatPeriod(settlement.okres);
  const preparedObligations = readyObligations.map((obligation) => ({
    id: obligation.id,
    type: obligation.typ,
    name: obligation.nazwa,
    amount: Number(obligation.kwota),
    amountLabel: formatCurrency(Number(obligation.kwota)),
    dueDate: obligation.termin_platnosci,
    dueDateLabel: formatDate(obligation.termin_platnosci),
  }));
  const subject = `Zobowiązania publicznoprawne za ${periodLabel}${client.nazwa ? ` - ${client.nazwa}` : ""}`;
  const messageHtml = buildEmailHtml({
    clientName: client.nazwa,
    periodLabel,
    obligations: preparedObligations,
    caregiverName: caregiver?.full_name || null,
    caregiverEmail: caregiver?.email || null,
  });
  const smsMessage = buildSmsMessage({
    clientName: client.nazwa,
    periodLabel,
    obligations: preparedObligations,
  });

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
        subject,
        messageHtml,
        smsMessage,
        replyToEmail: caregiver?.email || null,
        obligations: preparedObligations,
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

    await auth.admin
      .from("zobowiazania_wysylki_historia")
      .insert({
        created_at: sentAt,
        channel: payload.channel,
        settlement_id: settlement.id,
        client_id: client.id,
        client_name: client.nazwa,
        client_nip: client.nip,
        period: settlement.okres,
        period_label: periodLabel,
        subject,
        recipient_email: payload.channel === "email" ? client.email : null,
        recipient_phone: payload.channel === "sms" ? client.telefon : null,
        obligations: preparedObligations,
        sent_by: auth.requesterId,
        sent_by_name: auth.requesterName,
      });

    const obligationsWithSender = (updatedObligations || []).map((obligation) => payload.channel === "email"
      ? { ...obligation, email_sent_by_name: auth.requesterName }
      : { ...obligation, sms_sent_by_name: auth.requesterName }
    );

    return NextResponse.json({
      ok: true,
      channel: payload.channel,
      sentAt,
      sentById: auth.requesterId,
      sentByName: auth.requesterName,
      obligations: obligationsWithSender,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    return NextResponse.json({ error: `Nie udało się połączyć z automatyzacją n8n: ${message}` }, { status: 502 });
  }
}
