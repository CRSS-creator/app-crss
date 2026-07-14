import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { splitEmails } from "@/lib/contactFields";

const ALLOWED_ROLES = new Set(["owner", "admin"]);
const APP_URL = "https://app.crss.com.pl";
const INVOICE_PDF_BUCKET = "faktury-pdf";

type SendInvoiceMailPayload = {
  invoiceId?: string;
  invoiceIds?: string[];
};

type InvoiceMailRow = {
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
    profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
  }[] | {
    email: string | null;
    profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
  } | null;
};

type SendContext = {
  webhookUrl: string;
  requesterId: string;
  requesterName: string;
  admin: Awaited<ReturnType<typeof getAuthorizedServerUser>>["admin"];
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do wysyłki faktury e-mailem.");
  if (auth.error) return auth.error;

  const webhookUrl = process.env.N8N_INVOICE_MAIL_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Brak konfiguracji wysyłki faktur. Uzupełnij N8N_INVOICE_MAIL_WEBHOOK_URL." },
      { status: 500 }
    );
  }

  if (webhookUrl.includes("/webhook-test/")) {
    return NextResponse.json(
      { error: "W aplikacji ustawiony jest testowy webhook n8n. Użyj produkcyjnego adresu /webhook/... i aktywuj workflow w n8n." },
      { status: 500 }
    );
  }

  let payload: SendInvoiceMailPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki faktury." }, { status: 400 });
  }

  const invoiceIds = Array.from(
    new Set([
      ...(Array.isArray(payload.invoiceIds) ? payload.invoiceIds : []),
      ...(payload.invoiceId ? [payload.invoiceId] : []),
    ].map((value) => value?.trim()).filter(Boolean) as string[])
  );

  if (invoiceIds.length === 0) {
    return NextResponse.json({ error: "Wybierz co najmniej jedną fakturę." }, { status: 400 });
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
        profiles!klienci_opiekun_id_fkey (
          full_name,
          email
        )
      )
    `)
    .in("id", invoiceIds);

  if (error) {
    return NextResponse.json({ error: "Nie udało się pobrać faktur do wysyłki." }, { status: 500 });
  }

  const context: SendContext = {
    webhookUrl,
    requesterId: auth.requesterId,
    requesterName,
    admin: auth.admin,
  };
  const sent: { invoiceId: string; recipientEmail: string }[] = [];
  const failed: { invoiceId: string; error: string }[] = [];

  for (const invoice of (invoices || []) as InvoiceMailRow[]) {
    try {
      const recipientEmail = await sendSingleInvoiceMail(context, invoice);
      sent.push({ invoiceId: invoice.id, recipientEmail });
    } catch (error) {
      failed.push({
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : "Nieznany błąd wysyłki.",
      });
    }
  }

  const missingIds = invoiceIds.filter((id) => !(invoices || []).some((invoice) => invoice.id === id));
  missingIds.forEach((invoiceId) => failed.push({ invoiceId, error: "Nie znaleziono faktury." }));

  if (sent.length === 0 && failed.length > 0) {
    return NextResponse.json(
      { error: failed.map((item) => item.error).join("\n"), sent: 0, failed },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, sent: sent.length, failed, recipients: sent });
}

async function sendSingleInvoiceMail(context: SendContext, invoice: InvoiceMailRow) {
  if (!context.admin) throw new Error("Brak połączenia z bazą.");
  if (!invoice.wfirma_pdf_path) throw new Error("Ta faktura nie ma jeszcze PDF do wysyłki.");

  const recipientEmail = firstInvoiceEmail(invoice);
  if (!recipientEmail) throw new Error("Brak adresu e-mail klienta przy tej fakturze.");

  const signedUrl = await context.admin.storage
    .from(INVOICE_PDF_BUCKET)
    .createSignedUrl(invoice.wfirma_pdf_path, 30 * 60);

  if (signedUrl.error || !signedUrl.data?.signedUrl) {
    throw new Error("Nie udało się przygotować PDF faktury do wysyłki.");
  }

  const invoiceNumber = invoice.numer || "faktura";
  const subject = `Faktura ${invoiceNumber} - CRSS`;
  const html = buildInvoiceMailHtml(invoice);
  const attachmentName = invoice.wfirma_pdf_name || `${sanitizeFileNamePart(invoiceNumber) || "faktura"}.pdf`;
  const caregiver = invoiceCaregiver(invoice);
  const replyToEmail = firstEmail(caregiver?.email);
  const replyToName = caregiver?.full_name || replyToEmail || null;

  try {
    const response = await fetch(context.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "invoice_mail_requested",
        invoiceId: invoice.id,
        invoiceNumber,
        clientName: invoice.kontrahent_nazwa,
        recipientEmail,
        replyToEmail,
        replyToName,
        subject,
        html,
        amountGross: invoice.kwota_brutto,
        currency: invoice.waluta || "PLN",
        issueDate: invoice.data_wystawienia,
        paymentDate: invoice.termin_platnosci,
        attachments: [
          {
            fileName: attachmentName,
            url: signedUrl.data.signedUrl,
            contentType: "application/pdf",
          },
        ],
        appUrl: APP_URL,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      const message = details ? `Automatyzacja zwróciła status ${response.status}: ${details}` : `Automatyzacja zwróciła status ${response.status}.`;
      await insertMailHistory(context, invoice, recipientEmail, subject, "blad", message);
      throw new Error(message);
    }

    await insertMailHistory(context, invoice, recipientEmail, subject, "wyslane", null);

    if (!["oplacona", "anulowana"].includes(invoice.status)) {
      await context.admin
        .from("faktury")
        .update({ status: "wyslana" })
        .eq("id", invoice.id);
    }

    return recipientEmail;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    if (!message.includes("Automatyzacja zwróciła status")) {
      await insertMailHistory(context, invoice, recipientEmail, subject, "blad", message);
    }
    throw new Error(message);
  }
}

async function insertMailHistory(
  context: SendContext,
  invoice: InvoiceMailRow,
  recipientEmail: string,
  subject: string,
  status: "wyslane" | "blad",
  error: string | null
) {
  if (!context.admin) return;
  await context.admin.from("faktury_email_history").insert({
    faktura_id: invoice.id,
    recipient_email: recipientEmail,
    subject,
    status,
    error,
    invoice_number: invoice.numer,
    wfirma_pdf_path: invoice.wfirma_pdf_path,
    wfirma_pdf_name: invoice.wfirma_pdf_name,
    sent_by: context.requesterId,
    sent_by_name: context.requesterName,
  });
}

function firstInvoiceEmail(invoice: InvoiceMailRow) {
  const client = Array.isArray(invoice.klienci) ? invoice.klienci[0] : invoice.klienci;
  const candidates = [
    ...splitEmails(invoice.kontrahent_email),
    ...splitEmails(client?.email),
  ];
  return candidates[0] || null;
}

function invoiceCaregiver(invoice: InvoiceMailRow) {
  const client = Array.isArray(invoice.klienci) ? invoice.klienci[0] : invoice.klienci;
  if (!client?.profiles) return null;
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function firstEmail(value: string | null | undefined) {
  return splitEmails(value)[0] || null;
}

function buildInvoiceMailHtml(invoice: InvoiceMailRow) {
  const invoiceNumber = escapeHtml(invoice.numer || "faktury");
  const clientName = escapeHtml(invoice.kontrahent_nazwa || "Państwa firmy");
  const amount = escapeHtml(formatMoney(invoice.kwota_brutto, invoice.waluta || "PLN"));
  const paymentDate = escapeHtml(formatDate(invoice.termin_platnosci));

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=6" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">w załączeniu przesyłamy fakturę <strong>${invoiceNumber}</strong> dla <strong>${clientName}</strong>.</p>
      <div style="background:#eef3fb;border:1px solid #c9d6e8;border-radius:14px;padding:18px;margin:24px 0;">
        <p style="margin:0 0 8px 0;"><strong>Kwota brutto:</strong> ${amount}</p>
        <p style="margin:0;"><strong>Termin płatności:</strong> ${paymentDate}</p>
      </div>
      <p style="margin:0 0 16px 0;">W razie pytań prosimy o kontakt z zespołem CRSS.</p>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .toLowerCase();
}
