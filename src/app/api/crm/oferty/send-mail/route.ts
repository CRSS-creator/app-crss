import { NextRequest, NextResponse } from "next/server";

type OfferMailPayload = {
  offerId?: string;
  leadId?: string;
  recipientEmail?: string | null;
  recipientName?: string | null;
  companyName?: string | null;
  subject?: string | null;
  proposalTitle?: string | null;
  proposalUrl?: string | null;
  validUntil?: string | null;
};

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.N8N_CRM_OFFER_MAIL_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      { error: "Brak konfiguracji wysyłki maila." },
      { status: 500 }
    );
  }

  let payload: OfferMailPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Nieprawidłowe dane wysyłki." },
      { status: 400 }
    );
  }

  if (!payload.recipientEmail || !payload.proposalUrl) {
    return NextResponse.json(
      { error: "Brakuje odbiorcy lub linku propozycji." },
      { status: 400 }
    );
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "crm_proposal_mail_requested",
      offerId: payload.offerId,
      leadId: payload.leadId,
      recipientEmail: payload.recipientEmail,
      recipientName: payload.recipientName,
      companyName: payload.companyName,
      subject: payload.subject,
      proposalTitle: payload.proposalTitle,
      proposalUrl: payload.proposalUrl,
      validUntil: payload.validUntil,
      template: {
        type: "proposal_link",
        signatureSource: "n8n_html_template",
      },
    }),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Automatyzacja zwróciła status ${response.status}.` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
