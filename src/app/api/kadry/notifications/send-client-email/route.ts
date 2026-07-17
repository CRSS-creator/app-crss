import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { splitEmails } from "@/lib/contactFields";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type Payload = {
  notificationId?: string;
};

type PayrollNotification = {
  id: string;
  type: string;
  related_id: string | null;
  metadata: Record<string, unknown> | null;
};

type PayrollContractRow = {
  id: string;
  klient_id: string;
  imie: string;
  nazwisko: string;
  typ_umowy: string;
  numer_umowy: string | null;
  data_poczatku: string | null;
  data_konca: string | null;
  badania_lekarskie_wazne_do: string | null;
  szkolenie_bhp_wazne_do: string | null;
  legitymacja_studencka_wazna_do: string | null;
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

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do wysyłki powiadomienia kadrowego.");
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

  if (!payload.notificationId) {
    return NextResponse.json({ error: "Brak powiadomienia." }, { status: 400 });
  }

  const { data: notification, error: notificationError } = await auth.admin
    .from("powiadomienia")
    .select("id,type,related_id,metadata")
    .eq("id", payload.notificationId)
    .maybeSingle();

  if (notificationError || !notification) {
    return NextResponse.json({ error: "Nie znaleziono powiadomienia." }, { status: 404 });
  }

  const payrollNotification = notification as PayrollNotification;
  if (payrollNotification.type !== "payroll_contract_expiry" || !payrollNotification.related_id) {
    return NextResponse.json({ error: "To powiadomienie nie dotyczy terminu kadrowego." }, { status: 400 });
  }

  const { data: contract, error: contractError } = await auth.admin
    .from("kadry_umowy")
    .select(`
      id,
      klient_id,
      imie,
      nazwisko,
      typ_umowy,
      numer_umowy,
      data_poczatku,
      data_konca,
      badania_lekarskie_wazne_do,
      szkolenie_bhp_wazne_do,
      legitymacja_studencka_wazna_do,
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
    .eq("id", payrollNotification.related_id)
    .maybeSingle();

  if (contractError || !contract) {
    return NextResponse.json({ error: "Nie znaleziono umowy kadrowej." }, { status: 404 });
  }

  const row = contract as PayrollContractRow;
  const client = Array.isArray(row.klienci) ? row.klienci[0] : row.klienci;
  if (!client) return NextResponse.json({ error: "Umowa nie ma powiązanego klienta." }, { status: 400 });
  if (auth.role === "accountant" && client.opiekun_id !== auth.requesterId) {
    return NextResponse.json({ error: "Możesz wysyłać maile tylko do swoich klientów." }, { status: 403 });
  }

  const recipientEmails = splitEmails(client.email);
  if (recipientEmails.length === 0) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  const metadata = payrollNotification.metadata || {};
  const dateKind = stringMeta(metadata.date_kind) || "contract_end";
  const subject = buildSubject(client.nazwa, dateKind);
  const plainMessage = buildPlainMessage(row, dateKind);
  const html = buildHtmlMessage(row, client.nazwa, dateKind);
  const caregiver = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
  const failed: string[] = [];

  for (const recipientEmail of recipientEmails) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "payroll_client_notification_requested",
        clientId: client.id,
        clientName: client.nazwa,
        clientNip: client.nip,
        recipientEmail,
        subject,
        message: plainMessage,
        html,
        caregiverName: caregiver?.full_name || null,
        caregiverEmail: caregiver?.email || null,
        replyToEmail: caregiver?.email || null,
        requestedByName: caregiver?.full_name || caregiver?.email || null,
        appUrl: APP_URL,
      }),
    });

    if (!response.ok) failed.push(recipientEmail);
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: `Nie udało się przekazać wysyłki do n8n: ${failed.join(", ")}` }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  await auth.admin
    .from("powiadomienia")
    .update({
      metadata: {
        ...metadata,
        client_email_sent_at: sentAt,
        client_email_sent_by: auth.requesterId,
        client_email_recipients: recipientEmails,
      },
    })
    .eq("id", payrollNotification.id);

  return NextResponse.json({ ok: true, sentAt, recipients: recipientEmails });
}

function stringMeta(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function buildSubject(clientName: string | null | undefined, dateKind: string) {
  if (dateKind === "contract_end") return `Kończąca się umowa - ${clientName || "CRSS"}`;
  if (dateKind === "student_card_expiry") return `Ważność legitymacji studenckiej - ${clientName || "CRSS"}`;
  if (dateKind === "medical_exam_expiry") return `Ważność badań lekarskich - ${clientName || "CRSS"}`;
  if (dateKind === "bhp_training_expiry") return `Ważność szkolenia BHP - ${clientName || "CRSS"}`;
  return `Termin kadrowy - ${clientName || "CRSS"}`;
}

function buildPlainMessage(contract: PayrollContractRow, dateKind: string) {
  const person = `${contract.imie} ${contract.nazwisko}`.trim();
  const date = formatDate(dateForKind(contract, dateKind));
  const contractNumber = contract.numer_umowy ? `, umowa ${contract.numer_umowy}` : "";

  return `Dzień dobry,\n\nponiżej przekazujemy ważne informacje kadrowe:\n\n- ${payrollDateKindLabel(dateKind)}: ${person}${contractNumber}, data: ${date}.\n  ${requestText(dateKind)}\n\nPozdrawiamy serdecznie,\nZespół CRSS`;
}

function buildHtmlMessage(contract: PayrollContractRow, clientName: string | null | undefined, dateKind: string) {
  const person = `${contract.imie} ${contract.nazwisko}`.trim();
  const date = formatDate(dateForKind(contract, dateKind));
  const request = requestText(dateKind);

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=5" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">poniżej przekazujemy ważne informacje kadrowe:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:0 0 18px 0;">
        <tr>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Czego dotyczy</th>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Pracownik / zleceniobiorca</th>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Numer umowy</th>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Data</th>
          <th align="left" style="border:1px solid #c9d6e8;padding:10px;font-weight:700;">Informacja</th>
        </tr>
        <tr>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(payrollDateKindLabel(dateKind))}</td>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(person)}</td>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(contract.numer_umowy || "")}</td>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(date)}</td>
          <td style="border:1px solid #c9d6e8;padding:10px;">${escapeHtml(request)}</td>
        </tr>
      </table>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
}

function requestText(dateKind: string) {
  if (dateKind === "contract_end") return "Prosimy o informację, czy przygotować nową umowę, przedłużyć obecną, czy nie będą Państwo kontynuować współpracy.";
  if (dateKind === "student_card_expiry") return "Prosimy o przesłanie skanu nowej legitymacji lub poprzedniej, z przedłużonym terminem ważności, bezpośrednio do opiekuna.";
  if (dateKind === "medical_exam_expiry") return "W celu uzyskania skierowania na badanie prosimy skontaktować się z opiekunem.";
  return "Prosimy o dostarczenie dokumentacji przeprowadzenia szkolenia. W razie potrzeby współpracujemy ze specjalistą ds. BHP, a opiekun może przekazać Państwu dane kontaktowe.";
}

function payrollDateKindLabel(dateKind: string) {
  if (dateKind === "contract_end") return "Koniec umowy";
  if (dateKind === "student_card_expiry") return "Koniec ważności legitymacji studenckiej";
  if (dateKind === "medical_exam_expiry") return "Koniec ważności badań lekarskich";
  if (dateKind === "bhp_training_expiry") return "Koniec ważności szkolenia BHP";
  return "Termin kadrowy";
}

function dateForKind(contract: PayrollContractRow, dateKind: string) {
  if (dateKind === "student_card_expiry") return contract.legitymacja_studencka_wazna_do;
  if (dateKind === "medical_exam_expiry") return contract.badania_lekarskie_wazne_do;
  if (dateKind === "bhp_training_expiry") return contract.szkolenie_bhp_wazne_do;
  return contract.data_konca;
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("pl-PL").format(new Date(`${value}T12:00:00`)) : "do ustalenia";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
