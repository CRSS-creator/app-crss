import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { splitEmails, splitPhones } from "@/lib/contactFields";

const ALLOWED_ROLES = new Set(["owner", "admin"]);
const APP_URL = "https://app.crss.com.pl";

type OverdueReminderPayload = {
  invoiceIds?: string[];
};

type OverdueInvoiceRow = {
  id: string;
  numer: string | null;
  status: string;
  kontrahent_nazwa: string;
  kontrahent_email: string | null;
  kwota_brutto: number | string | null;
  waluta: string | null;
  data_wystawienia: string | null;
  termin_platnosci: string | null;
  wfirma_pdf_path: string | null;
  wfirma_pdf_name: string | null;
  klienci?: {
    email: string | null;
    telefon: string | null;
    profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
  }[] | {
    email: string | null;
    telefon: string | null;
    profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
  } | null;
};

type ReminderContext = {
  webhookUrl: string;
  requesterId: string;
  requesterName: string;
  admin: Awaited<ReturnType<typeof getAuthorizedServerUser>>["admin"];
};

type ReminderGroup = {
  recipientEmail: string;
  recipientPhone: string | null;
  clientName: string;
  replyToEmail: string | null;
  replyToName: string | null;
  invoices: OverdueInvoiceRow[];
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do wysyłki przypomnień.");
  if (auth.error) return auth.error;

  const webhookUrl = process.env.N8N_INVOICE_MAIL_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Brak konfiguracji wysyłki maili. Uzupełnij N8N_INVOICE_MAIL_WEBHOOK_URL." },
      { status: 500 }
    );
  }

  if (webhookUrl.includes("/webhook-test/")) {
    return NextResponse.json(
      { error: "W aplikacji ustawiony jest testowy webhook n8n. Użyj produkcyjnego adresu /webhook/... i aktywuj workflow w n8n." },
      { status: 500 }
    );
  }

  let payload: OverdueReminderPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki przypomnienia." }, { status: 400 });
  }

  const invoiceIds = Array.from(new Set((payload.invoiceIds || []).map((value) => value?.trim()).filter(Boolean)));
  if (invoiceIds.length === 0) {
    return NextResponse.json({ error: "Wybierz co najmniej jedną przeterminowaną fakturę." }, { status: 400 });
  }

  const { data: requesterProfile } = await auth.admin
    .from("profiles")
    .select("full_name,email")
    .eq("id", auth.requesterId)
    .maybeSingle();

  const requesterName = requesterProfile?.full_name || requesterProfile?.email || "Nieustalony użytkownik";

  const { data: invoices, error } = await auth.admin
    .from("faktury")
    .select(`
      id,
      numer,
      status,
      kontrahent_nazwa,
      kontrahent_email,
      kwota_brutto,
      waluta,
      data_wystawienia,
      termin_platnosci,
      wfirma_pdf_path,
      wfirma_pdf_name,
      klienci (
        email,
        telefon,
        profiles!klienci_opiekun_id_fkey (
          full_name,
          email
        )
      )
    `)
    .in("id", invoiceIds);

  if (error) {
    return NextResponse.json({ error: "Nie udało się pobrać faktur do przypomnienia." }, { status: 500 });
  }

  const failed: { invoiceId: string; error: string }[] = [];
  const rows = ((invoices || []) as OverdueInvoiceRow[]).filter((invoice) => {
    if (invoice.status !== "przeterminowana") {
      failed.push({ invoiceId: invoice.id, error: "Ta faktura nie ma statusu przeterminowana." });
      return false;
    }
    if (!firstInvoiceEmail(invoice)) {
      failed.push({ invoiceId: invoice.id, error: "Brak adresu e-mail klienta przy tej fakturze." });
      return false;
    }
    if (!firstInvoicePhone(invoice)) {
      failed.push({ invoiceId: invoice.id, error: "Brak numeru telefonu klienta przy tej fakturze." });
      return false;
    }
    return true;
  });

  invoiceIds
    .filter((id) => !(invoices || []).some((invoice) => invoice.id === id))
    .forEach((invoiceId) => failed.push({ invoiceId, error: "Nie znaleziono faktury." }));

  const groups = groupInvoicesByRecipient(rows);
  const context: ReminderContext = {
    webhookUrl,
    requesterId: auth.requesterId,
    requesterName,
    admin: auth.admin,
  };
  const sent: { recipientEmail: string; invoiceIds: string[] }[] = [];

  for (const group of groups) {
    try {
      await sendReminderGroup(context, group);
      sent.push({ recipientEmail: group.recipientEmail, invoiceIds: group.invoices.map((invoice) => invoice.id) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany błąd wysyłki przypomnienia.";
      group.invoices.forEach((invoice) => failed.push({ invoiceId: invoice.id, error: message }));
    }
  }

  if (sent.length === 0 && failed.length > 0) {
    return NextResponse.json(
      { error: failed.map((item) => item.error).join("\n"), sent: 0, failed, recipients: [] },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, sent: sent.length, failed, recipients: sent });
}

async function sendReminderGroup(context: ReminderContext, group: ReminderGroup) {
  const subject = group.invoices.length === 1
    ? `Powiadomienie o przeterminowanej fakturze ${group.invoices[0].numer || ""} - CRSS`.trim()
    : `Powiadomienie o przeterminowanych fakturach - CRSS`;
  const messageHtml = buildOverdueNotificationHtml(group);
  const smsMessage = buildOverdueNotificationSms(group);

  try {
    const failedChannels: string[] = [];
    for (const channel of ["email", "sms"] as const) {
      const response = await fetch(context.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "overdue_invoice_notification_requested",
          channel,
          clientName: group.clientName,
          recipientEmail: channel === "email" ? group.recipientEmail : null,
          recipientEmails: channel === "email" ? [group.recipientEmail] : [],
          recipientPhone: channel === "sms" ? group.recipientPhone : null,
          recipientPhones: channel === "sms" && group.recipientPhone ? [group.recipientPhone] : [],
          replyToEmail: group.replyToEmail,
          replyToName: group.replyToName,
          subject,
          messageHtml,
          smsMessage,
          invoices: preparedInvoices(group),
          requestedByName: context.requesterName,
          appUrl: APP_URL,
        }),
      });

      if (!response.ok) {
        const details = await response.text().catch(() => "");
        failedChannels.push(details ? `${channel}: ${response.status} ${details}` : `${channel}: ${response.status}`);
      }
    }

    if (failedChannels.length > 0) {
      const message = `Automatyzacja nie przyjęła wysyłki: ${failedChannels.join("; ")}`;
      await insertReminderHistory(context, group, subject, "blad", message);
      throw new Error(message);
    }

    await insertReminderHistory(context, group, subject, "wyslane", null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    if (!message.includes("Automatyzacja zwróciła status") && !message.includes("Automatyzacja nie przyjęła wysyłki")) {
      await insertReminderHistory(context, group, subject, "blad", message);
    }
    throw new Error(message);
  }
}

async function insertReminderHistory(
  context: ReminderContext,
  group: ReminderGroup,
  subject: string,
  status: "wyslane" | "blad",
  error: string | null
) {
  if (!context.admin) return;
  await context.admin.from("faktury_email_history").insert(
    group.invoices.map((invoice) => ({
      faktura_id: invoice.id,
      notification_type: "overdue_notification",
      recipient_email: group.recipientEmail,
      recipient_phone: group.recipientPhone,
      subject,
      status,
      error,
      invoice_number: invoice.numer,
      wfirma_pdf_path: invoice.wfirma_pdf_path,
      wfirma_pdf_name: invoice.wfirma_pdf_name,
      sent_by: context.requesterId,
      sent_by_name: context.requesterName,
    }))
  );
}

function groupInvoicesByRecipient(invoices: OverdueInvoiceRow[]) {
  const groups = new Map<string, ReminderGroup>();
  for (const invoice of invoices) {
    const recipientEmail = firstInvoiceEmail(invoice);
    if (!recipientEmail) continue;
    const caregiver = invoiceCaregiver(invoice);
    const replyToEmail = firstEmail(caregiver?.email);
    const key = recipientEmail.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.invoices.push(invoice);
      continue;
    }
    groups.set(key, {
      recipientEmail,
      recipientPhone: firstInvoicePhone(invoice),
      clientName: invoice.kontrahent_nazwa,
      replyToEmail,
      replyToName: caregiver?.full_name || replyToEmail || null,
      invoices: [invoice],
    });
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    invoices: group.invoices.sort(compareByDueDate),
  }));
}

function firstInvoiceEmail(invoice: OverdueInvoiceRow) {
  const client = Array.isArray(invoice.klienci) ? invoice.klienci[0] : invoice.klienci;
  return splitEmails(client?.email)[0] || null;
}

function firstInvoicePhone(invoice: OverdueInvoiceRow) {
  const client = Array.isArray(invoice.klienci) ? invoice.klienci[0] : invoice.klienci;
  return splitPhones(client?.telefon)[0] || null;
}

function invoiceCaregiver(invoice: OverdueInvoiceRow) {
  const client = Array.isArray(invoice.klienci) ? invoice.klienci[0] : invoice.klienci;
  if (!client?.profiles) return null;
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function firstEmail(value: string | null | undefined) {
  return splitEmails(value)[0] || null;
}

function preparedInvoices(group: ReminderGroup) {
  return group.invoices.map((invoice) => ({
    invoiceId: invoice.id,
    invoiceNumber: invoice.numer,
    amountGross: invoice.kwota_brutto,
    amountGrossLabel: formatMoney(invoice.kwota_brutto, invoice.waluta || "PLN"),
    currency: invoice.waluta || "PLN",
    issueDate: invoice.data_wystawienia,
    paymentDate: invoice.termin_platnosci,
    paymentDateLabel: formatDate(invoice.termin_platnosci),
    overdueDays: overdueDays(invoice.termin_platnosci),
  }));
}

function buildOverdueNotificationHtml(group: ReminderGroup) {
  const clientName = escapeHtml(group.clientName || "Państwa firmy");
  const paymentRequestText = overduePaymentRequestText(group);
  const rows = group.invoices.map((invoice) => {
    const days = overdueDays(invoice.termin_platnosci);
    return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #c9d6e8;"><strong>${escapeHtml(invoice.numer || "Faktura")}</strong></td>
          <td style="padding:10px;border-bottom:1px solid #c9d6e8;text-align:right;">${escapeHtml(formatMoney(invoice.kwota_brutto, invoice.waluta || "PLN"))}</td>
          <td style="padding:10px;border-bottom:1px solid #c9d6e8;text-align:center;">${escapeHtml(formatDate(invoice.termin_platnosci))}</td>
          <td style="padding:10px;border-bottom:1px solid #c9d6e8;text-align:center;"><strong>${days} ${days === 1 ? "dzień" : "dni"}</strong></td>
        </tr>`;
  }).join("");

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:680px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=6" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">odnotowaliśmy, że minął termin płatności poniższych faktur dla <strong>${clientName}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;background:#eef3fb;border:1px solid #c9d6e8;border-radius:14px;overflow:hidden;margin:24px 0;">
        <thead>
          <tr>
            <th style="padding:10px;text-align:left;background:#dfe8f5;">Faktura</th>
            <th style="padding:10px;text-align:right;background:#dfe8f5;">Kwota brutto</th>
            <th style="padding:10px;text-align:center;background:#dfe8f5;">Termin płatności</th>
            <th style="padding:10px;text-align:center;background:#dfe8f5;">Po terminie</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
      <p style="margin:0 0 16px 0;">${escapeHtml(paymentRequestText)}</p>
      <p style="margin:0 0 16px 0;">W razie pytań prosimy o kontakt.</p>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
}

function buildOverdueNotificationSms(group: ReminderGroup) {
  const invoiceText = group.invoices
    .map((invoice) => `${toSmsText(invoice.numer || "FV")} - ${overdueDays(invoice.termin_platnosci)} dni po terminie`)
    .join("; ");
  const paymentRequestText = toSmsText(overduePaymentRequestText(group));

  return toSmsText(`Dzień dobry, informujemy o przeterminowanych fakturach: ${invoiceText}. ${paymentRequestText} Szczegóły wysłaliśmy na adres e-mail. CRSS Sp. z o.o.`);
}

function overduePaymentRequestText(group: ReminderGroup) {
  if (group.invoices.length < 2) return "Prosimy o uregulowanie zaległości.";

  return `Prosimy o uregulowanie zaległości o łącznej kwocie ${formatTotalOverdueAmount(group.invoices)}.`;
}

function formatTotalOverdueAmount(invoices: OverdueInvoiceRow[]) {
  const currency = invoices[0]?.waluta || "PLN";
  const allSameCurrency = invoices.every((invoice) => (invoice.waluta || "PLN") === currency);

  if (!allSameCurrency) {
    return invoices
      .map((invoice) => formatMoney(invoice.kwota_brutto, invoice.waluta || "PLN"))
      .join(" + ");
  }

  const total = invoices.reduce((sum, invoice) => sum + moneyValue(invoice.kwota_brutto), 0);
  return formatMoney(total, currency);
}

function moneyValue(value: number | string | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function overdueDays(value: string | null) {
  if (!value) return 0;
  const due = new Date(`${value}T00:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today - due) / 86_400_000));
}

function compareByDueDate(first: OverdueInvoiceRow, second: OverdueInvoiceRow) {
  return dateValue(first.termin_platnosci) - dateValue(second.termin_platnosci);
}

function dateValue(value: string | null) {
  return value ? new Date(`${value}T00:00:00Z`).getTime() : Number.MAX_SAFE_INTEGER;
}

function formatMoney(value: number | string | null, currency: string) {
  return `${Number(value || 0).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatDate(value: string | null) {
  if (!value) return "brak";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
