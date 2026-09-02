import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { splitEmails } from "@/lib/contactFields";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type Payload = {
  a1Id?: string;
};

type A1Row = {
  id: string;
  klient_id: string;
  data_uzyskania_a1: string | null;
  data_konca_a1: string | null;
  procent_przychodow_zagranicznych: number | string | null;
  klienci?: {
    id: string;
    nazwa: string | null;
    nip: string | null;
    email: string | null;
    opiekun_id: string | null;
    profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
  }[] | {
    id: string;
    nazwa: string | null;
    nip: string | null;
    email: string | null;
    opiekun_id: string | null;
    profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
  } | null;
};

type A1MonthlyRevenueRow = {
  rok: number;
  miesiac: number;
  przychod_krajowy: number | string | null;
  przychod_zagraniczny: number | string | null;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do wysyłki powiadomienia A1.");
  if (auth.error) return auth.error;

  const webhookUrl = process.env.N8N_BULK_NOTIFICATIONS_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Brak konfiguracji wysyłki komunikatów. Uzupełnij N8N_BULK_NOTIFICATIONS_WEBHOOK_URL." },
      { status: 500 }
    );
  }

  if (webhookUrl.includes("/webhook-test/")) {
    return NextResponse.json(
      { error: "W aplikacji ustawiony jest testowy webhook n8n. Użyj produkcyjnego adresu /webhook/... i aktywuj workflow w n8n." },
      { status: 500 }
    );
  }

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki." }, { status: 400 });
  }

  if (!payload.a1Id) {
    return NextResponse.json({ error: "Brak wpisu A1." }, { status: 400 });
  }

  const { data: a1, error: a1Error } = await auth.admin
    .from("kadry_a1")
    .select(`
      id,
      klient_id,
      data_uzyskania_a1,
      data_konca_a1,
      procent_przychodow_zagranicznych,
      klienci (
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
    .eq("id", payload.a1Id)
    .maybeSingle();

  if (a1Error || !a1) {
    return NextResponse.json({ error: "Nie znaleziono wpisu A1." }, { status: 404 });
  }

  const row = a1 as A1Row;
  const client = Array.isArray(row.klienci) ? row.klienci[0] : row.klienci;
  if (!client) return NextResponse.json({ error: "Wpis A1 nie ma powiązanego klienta." }, { status: 400 });
  if (auth.role === "accountant" && client.opiekun_id !== auth.requesterId) {
    return NextResponse.json({ error: "Możesz wysyłać powiadomienia A1 tylko do swoich klientów." }, { status: 403 });
  }

  const recipientEmails = splitEmails(client.email);
  if (recipientEmails.length === 0) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  const { data: requesterProfile } = await auth.admin
    .from("profiles")
    .select("full_name,email")
    .eq("id", auth.requesterId)
    .maybeSingle();
  const { data: lastMonthlyRevenue } = await auth.admin
    .from("kadry_a1_przychody_miesieczne")
    .select("rok,miesiac,przychod_krajowy,przychod_zagraniczny")
    .eq("a1_id", row.id)
    .order("rok", { ascending: false })
    .order("miesiac", { ascending: false })
    .limit(1)
    .maybeSingle();
  const monthlySummary = buildMonthlySummary(lastMonthlyRevenue as A1MonthlyRevenueRow | null);
  const subject = `Rozliczenie A1 - ${client.nazwa || "CRSS"}`;
  const message = buildPlainMessage(row, client.nazwa, monthlySummary);
  const html = buildHtmlMessage(row, client.nazwa, monthlySummary);
  const failed: string[] = [];

  for (const recipientEmail of recipientEmails) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "payroll_a1_client_notification_requested",
        clientId: client.id,
        clientName: client.nazwa,
        clientNip: client.nip,
        a1Id: row.id,
        a1StartDate: row.data_uzyskania_a1,
        a1EndDate: row.data_konca_a1,
        a1LastCompletedMonth: monthlySummary.monthLabel,
        a1DomesticRevenue: monthlySummary.domesticRevenue,
        a1ForeignRevenue: monthlySummary.foreignRevenue,
        a1TotalRevenue: monthlySummary.totalRevenue,
        a1ForeignRevenuePercent: monthlySummary.foreignRevenuePercent,
        recipientEmail,
        subject,
        message,
        html,
        caregiverName: caregiver?.full_name || null,
        caregiverEmail: caregiver?.email || null,
        replyToEmail: caregiver?.email || null,
        requestedByName: requesterProfile?.full_name || requesterProfile?.email || caregiver?.full_name || caregiver?.email || null,
        appUrl: APP_URL,
      }),
    });

    if (!response.ok) failed.push(recipientEmail);
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: `Nie udało się przekazać wysyłki do n8n: ${failed.join(", ")}` }, { status: 502 });
  }

  const historyRows = recipientEmails.map((recipientEmail) => ({
    a1_id: row.id,
    klient_id: client.id,
    recipient_email: recipientEmail,
    subject,
    message,
    html,
    sent_by: auth.requesterId,
    sent_by_name: requesterProfile?.full_name || requesterProfile?.email || null,
    sent_by_email: requesterProfile?.email || null,
    metadata: {
      event: "payroll_a1_client_notification_requested",
      a1_start_date: row.data_uzyskania_a1,
      a1_end_date: row.data_konca_a1,
      last_completed_month: monthlySummary.monthLabel,
      domestic_revenue: monthlySummary.domesticRevenue,
      foreign_revenue: monthlySummary.foreignRevenue,
      total_revenue: monthlySummary.totalRevenue,
      foreign_revenue_percent: monthlySummary.foreignRevenuePercent,
      client_name: client.nazwa,
      client_nip: client.nip,
    },
  }));

  const { data: history, error: historyError } = await auth.admin
    .from("kadry_a1_powiadomienia_historia")
    .insert(historyRows)
    .select("*");

  if (historyError) {
    return NextResponse.json({ error: "Wysłano wiadomość, ale nie udało się zapisać historii A1." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sentAt: new Date().toISOString(), recipients: recipientEmails, history });
}

type MonthlySummary = {
  monthLabel: string | null;
  domesticRevenue: number;
  foreignRevenue: number;
  totalRevenue: number;
  foreignRevenuePercent: number;
};

function buildPlainMessage(a1: A1Row, clientName: string | null | undefined, monthlySummary: MonthlySummary) {
  const monthlyText = monthlySummary.monthLabel
    ? `Obecnie struktura za ${monthlySummary.monthLabel} wygląda następująco:
- przychody razem: ${formatMoney(monthlySummary.totalRevenue)}
- przychody zagraniczne: ${formatMoney(monthlySummary.foreignRevenue)}
- udział przychodów zagranicznych: ${formatPercent(monthlySummary.foreignRevenuePercent)}`
    : "Obecnie nie mamy jeszcze uzupełnionego miesiąca przychodów dla tego zaświadczenia A1.";

  return `Dzień dobry,

informujemy, że w dniu ${formatDate(a1.data_konca_a1)} kończy się zaświadczenie A1 wydane przez ZUS${clientName ? ` dla ${clientName}` : ""}.

Aby zaświadczenie mogło zostać rozliczone, w trakcie jego trwania udział przychodów zagranicznych w całości przychodów nie może przekraczać 75%.

${monthlyText}

Prosimy o zachowanie odpowiedniego udziału przychodów na dzień końca ważności zaświadczenia.

Pozdrawiamy serdecznie,
Zespół CRSS`;
}

function buildHtmlMessage(a1: A1Row, clientName: string | null | undefined, monthlySummary: MonthlySummary) {
  const monthlyHtml = monthlySummary.monthLabel
    ? `
      <p style="margin:0 0 12px 0;">Obecnie struktura za <strong>${escapeHtml(monthlySummary.monthLabel)}</strong> wygląda następująco:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 18px 0;">
        <tr>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Przychody razem</th>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Przychody zagraniczne</th>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Udział zagranicznych</th>
        </tr>
        <tr>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(formatMoney(monthlySummary.totalRevenue))}</td>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(formatMoney(monthlySummary.foreignRevenue))}</td>
          <td style="border:1px solid #c9d6e8;padding:10px;"><strong>${escapeHtml(formatPercent(monthlySummary.foreignRevenuePercent))}</strong></td>
        </tr>
      </table>`
    : `<p style="margin:0 0 18px 0;">Obecnie nie mamy jeszcze uzupełnionego miesiąca przychodów dla tego zaświadczenia A1.</p>`;

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=6" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">informujemy, że w dniu <strong>${escapeHtml(formatDate(a1.data_konca_a1))}</strong> kończy się zaświadczenie A1 wydane przez ZUS${clientName ? ` dla <strong>${escapeHtml(clientName)}</strong>` : ""}.</p>
      <p style="margin:0 0 16px 0;">Aby zaświadczenie mogło zostać rozliczone, w trakcie jego trwania udział przychodów zagranicznych w całości przychodów nie może przekraczać <strong>75%</strong>.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 18px 0;">
        <tr>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Data uzyskania A1</th>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Data końca A1</th>
        </tr>
        <tr>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(formatDate(a1.data_uzyskania_a1))}</td>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(formatDate(a1.data_konca_a1))}</td>
        </tr>
      </table>
      ${monthlyHtml}
      <p style="margin:0 0 16px 0;">Prosimy o zachowanie odpowiedniego udziału przychodów na dzień końca ważności zaświadczenia.</p>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
}

function buildMonthlySummary(row: A1MonthlyRevenueRow | null): MonthlySummary {
  const domesticRevenue = toNumber(row?.przychod_krajowy);
  const foreignRevenue = toNumber(row?.przychod_zagraniczny);
  const totalRevenue = domesticRevenue + foreignRevenue;
  const foreignRevenuePercent = totalRevenue > 0 ? (foreignRevenue / totalRevenue) * 100 : 0;

  return {
    monthLabel: row ? formatMonth(row.rok, row.miesiac) : null,
    domesticRevenue,
    foreignRevenue,
    totalRevenue,
    foreignRevenuePercent,
  };
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMonth(year: number, month: number) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1, 12));
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T12:00:00`)) : "do ustalenia";
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} zł`;
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
