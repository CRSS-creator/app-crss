import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { splitEmails } from "@/lib/contactFields";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";
const FULL_ZUS_SCHEME = "Pełny ZUS";

type Payload = {
  clientIds?: string[];
};

type ClientRow = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  opiekun_id: string | null;
  schemat_zus: string | null;
  zus_preferencja_koniec: string | null;
  profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
};

type RateRow = {
  schemat_zus: string;
  skladka_miesieczna: number | string | null;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do wysyłki powiadomień ZUS.");
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

  const clientIds = Array.from(new Set((payload.clientIds || []).filter(Boolean)));
  if (clientIds.length === 0) {
    return NextResponse.json({ error: "Zaznacz przynajmniej jednego klienta." }, { status: 400 });
  }

  const { data: requesterProfile } = await auth.admin
    .from("profiles")
    .select("full_name,email")
    .eq("id", auth.requesterId)
    .maybeSingle();

  const { data: clients, error: clientsError } = await auth.admin
    .from("klienci")
    .select(`
      id,
      nazwa,
      nip,
      email,
      opiekun_id,
      schemat_zus,
      zus_preferencja_koniec,
      profiles!klienci_opiekun_id_fkey (
        full_name,
        email
      )
    `)
    .in("id", clientIds);

  if (clientsError) {
    return NextResponse.json({ error: "Nie udało się pobrać klientów do wysyłki." }, { status: 500 });
  }

  const rows = (clients || []) as ClientRow[];
  if (rows.length !== clientIds.length) {
    return NextResponse.json({ error: "Nie znaleziono części zaznaczonych klientów." }, { status: 404 });
  }

  if (auth.role === "accountant" && rows.some((client) => client.opiekun_id !== auth.requesterId)) {
    return NextResponse.json({ error: "Możesz wysyłać powiadomienia ZUS tylko do swoich klientów." }, { status: 403 });
  }

  const missingEmail = rows.find((client) => splitEmails(client.email).length === 0);
  if (missingEmail) {
    return NextResponse.json({ error: `Klient ${missingEmail.nazwa || "bez nazwy"} nie ma uzupełnionego adresu e-mail.` }, { status: 400 });
  }

  const targetYears = Array.from(new Set(rows.map((client) => nextContributionMonth(client.zus_preferencja_koniec).getFullYear())));
  const { data: rates, error: ratesError } = await auth.admin
    .from("zus_przedsiebiorcy_skladki")
    .select("rok,schemat_zus,skladka_miesieczna")
    .in("rok", targetYears);

  if (ratesError) {
    return NextResponse.json({ error: "Nie udało się pobrać wysokości składek ZUS." }, { status: 500 });
  }

  const rateMap = new Map<string, RateRow>();
  (rates || []).forEach((rate: RateRow & { rok: number }) => {
    rateMap.set(`${rate.rok}::${normalizeScheme(rate.schemat_zus)}`, rate);
  });

  const missingRate = rows.find((client) => !rateForClient(rateMap, client));
  if (missingRate) {
    const year = nextContributionMonth(missingRate.zus_preferencja_koniec).getFullYear();
    return NextResponse.json(
      { error: `Brakuje wpisanej składki ZUS dla ${FULL_ZUS_SCHEME} na rok ${year}. Uzupełnij ją przyciskiem "Wysokość składek".` },
      { status: 400 }
    );
  }

  const failed: string[] = [];
  const historyRows = [];

  for (const client of rows) {
    const nextMonth = nextContributionMonth(client.zus_preferencja_koniec);
    const rate = rateForClient(rateMap, client);
    if (!rate) continue;

    const amount = toNumber(rate.skladka_miesieczna);
    const amountLabel = formatMoney(amount);
    const subject = `Koniec preferencji ZUS - ${client.nazwa || "CRSS"}`;
    const message = buildPlainMessage(client, nextMonth, amountLabel);
    const html = buildHtmlMessage(client, nextMonth, amountLabel);
    const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
    const recipients = splitEmails(client.email);

    for (const recipientEmail of recipients) {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "payroll_zus_preference_expiry_notification_requested",
          clientId: client.id,
          clientName: client.nazwa,
          clientNip: client.nip,
          zusScheme: client.schemat_zus,
          nextZusScheme: rate.schemat_zus,
          zusPreferenceEndDate: client.zus_preferencja_koniec,
          contributionMonthFrom: isoDate(nextMonth),
          contributionYear: nextMonth.getFullYear(),
          monthlyContributionAmount: amount,
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

      if (!response.ok) {
        failed.push(`${client.nazwa || client.id}: ${recipientEmail}`);
        continue;
      }

      historyRows.push({
        klient_id: client.id,
        recipient_email: recipientEmail,
        subject,
        message,
        html,
        schemat_zus: client.schemat_zus,
        nastepny_schemat_zus: rate.schemat_zus,
        data_konca_ulgi: client.zus_preferencja_koniec,
        miesiac_od: isoDate(nextMonth),
        rok_skladki: nextMonth.getFullYear(),
        skladka_miesieczna: amount,
        sent_by: auth.requesterId,
        sent_by_name: requesterProfile?.full_name || requesterProfile?.email || null,
        sent_by_email: requesterProfile?.email || null,
        metadata: {
          event: "payroll_zus_preference_expiry_notification_requested",
          client_name: client.nazwa,
          client_nip: client.nip,
        },
      });
    }
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: `Nie udało się przekazać wysyłki do n8n: ${failed.join(", ")}` }, { status: 502 });
  }

  const { data: history, error: historyError } = await auth.admin
    .from("kadry_zus_preferencja_powiadomienia_historia")
    .insert(historyRows)
    .select("*");

  if (historyError) {
    return NextResponse.json({ error: "Wysłano wiadomości, ale nie udało się zapisać historii powiadomień ZUS." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sentAt: new Date().toISOString(), history, sentCount: historyRows.length });
}

function rateForClient(rateMap: Map<string, RateRow>, client: ClientRow) {
  const year = nextContributionMonth(client.zus_preferencja_koniec).getFullYear();
  return (
    rateMap.get(`${year}::${normalizeScheme(FULL_ZUS_SCHEME)}`) ||
    rateMap.get(`${year}::${normalizeScheme(client.schemat_zus || "")}`) ||
    null
  );
}

function nextContributionMonth(endDate: string | null) {
  const base = endDate ? new Date(`${endDate}T12:00:00`) : new Date();
  return new Date(base.getFullYear(), base.getMonth() + 1, 1, 12);
}

function isoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
}

function normalizeScheme(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPlainMessage(client: ClientRow, nextMonth: Date, amountLabel: string) {
  return `Dzień dobry,

informujemy, że kończy się preferencja ZUS${client.schemat_zus ? `: ${client.schemat_zus}` : ""}${client.zus_preferencja_koniec ? `, której data końca przypada na ${formatDate(client.zus_preferencja_koniec)}` : ""}.

Od ${formatMonth(nextMonth)} składki na ubezpieczenie wyniosą ${amountLabel} miesięcznie.

Pozdrawiamy serdecznie,
Zespół CRSS`;
}

function buildHtmlMessage(client: ClientRow, nextMonth: Date, amountLabel: string) {
  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=7" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">informujemy, że kończy się preferencja ZUS${client.schemat_zus ? `: <strong>${escapeHtml(client.schemat_zus)}</strong>` : ""}${client.zus_preferencja_koniec ? `, której data końca przypada na <strong>${escapeHtml(formatDate(client.zus_preferencja_koniec))}</strong>` : ""}.</p>
      <p style="margin:0 0 16px 0;">Od <strong>${escapeHtml(formatMonth(nextMonth))}</strong> składki na ubezpieczenie wyniosą <strong>${escapeHtml(amountLabel)}</strong> miesięcznie.</p>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T12:00:00`));
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(value);
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} zł`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
