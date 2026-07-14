import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { splitEmails } from "@/lib/contactFields";

const ALLOWED_ROLES = new Set(["owner", "admin"]);
const APP_URL = "https://app.crss.com.pl";
const INVOICE_PDF_BUCKET = "faktury-pdf";

type SendInvoiceMailPayload = {
  invoiceId?: string;
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
  klienci?: { email: string | null }[] | { email: string | null } | null;
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

  const invoiceId = payload.invoiceId?.trim();
  if (!invoiceId) {
    return NextResponse.json({ error: "Brak ID faktury." }, { status: 400 });
  }

  const { data: invoice, error } = await auth.admin
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
        email
      )
    `)
    .eq("id", invoiceId)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Nie znaleziono faktury." }, { status: 404 });
  }

  const invoiceRecord = invoice as InvoiceMailRow;
  if (!invoiceRecord.wfirma_pdf_path) {
    return NextResponse.json({ error: "Ta faktura nie ma jeszcze PDF do wysyłki." }, { status: 400 });
  }

  const recipientEmail = firstInvoiceEmail(invoiceRecord);
  if (!recipientEmail) {
    return NextResponse.json({ error: "Brak adresu e-mail klienta przy tej fakturze." }, { status: 400 });
  }

  const signedUrl = await auth.admin.storage
    .from(INVOICE_PDF_BUCKET)
    .createSignedUrl(invoiceRecord.wfirma_pdf_path, 30 * 60);

  if (signedUrl.error || !signedUrl.data?.signedUrl) {
    return NextResponse.json({ error: "Nie udało się przygotować PDF faktury do wysyłki." }, { status: 500 });
  }

  const invoiceNumber = invoiceRecord.numer || "faktura";
  const subject = `Faktura ${invoiceNumber} - CRSS`;
  const html = buildInvoiceMailHtml(invoiceRecord);
  const attachmentName = invoiceRecord.wfirma_pdf_name || `${sanitizeFileNamePart(invoiceNumber) || "faktura"}.pdf`;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "invoice_mail_requested",
        invoiceId: invoiceRecord.id,
        invoiceNumber,
        clientName: invoiceRecord.kontrahent_nazwa,
        recipientEmail,
        subject,
        html,
        amountGross: invoiceRecord.kwota_brutto,
        currency: invoiceRecord.waluta || "PLN",
        issueDate: invoiceRecord.data_wystawienia,
        paymentDate: invoiceRecord.termin_platnosci,
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
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (!["oplacona", "anulowana"].includes(invoiceRecord.status)) {
      await auth.admin
        .from("faktury")
        .update({ status: "wyslana" })
        .eq("id", invoiceRecord.id);
    }

    return NextResponse.json({ ok: true, recipientEmail });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się połączyć z n8n.";
    return NextResponse.json({ error: `Nie udało się połączyć z automatyzacją n8n: ${message}` }, { status: 502 });
  }
}

function firstInvoiceEmail(invoice: InvoiceMailRow) {
  const client = Array.isArray(invoice.klienci) ? invoice.klienci[0] : invoice.klienci;
  const candidates = [
    ...splitEmails(invoice.kontrahent_email),
    ...splitEmails(client?.email),
  ];
  return candidates[0] || null;
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
