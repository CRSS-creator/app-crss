import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ALLOWED_ROLES = new Set(["owner", "manager", "admin", "accountant"]);
const APP_URL = "https://app.crss.com.pl";

type AuthorizedResult =
  | { admin: SupabaseClient; requesterId: string; requesterName: string; role: string; error: null }
  | { admin: null; requesterId: null; requesterName?: null; role: null; error: NextResponse };

type ClientCardPayload = {
  clientId?: string;
};

type ClientWithCaregiver = {
  id: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  telefon: string | null;
  osoba_kontaktowa: string | null;
  opiekun_id: string | null;
  profiles?: { full_name: string | null; email: string | null }[] | { full_name: string | null; email: string | null } | null;
};

function getWebhookUrl() {
  const webhookUrl = process.env.N8N_ONBOARDING_CLIENT_CARD_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return {
      webhookUrl: null,
      error: NextResponse.json(
        { error: "Brak konfiguracji wysyłki karty klienta. Uzupełnij N8N_ONBOARDING_CLIENT_CARD_WEBHOOK_URL." },
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
    auth: { autoRefreshToken: false, persistSession: false },
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
    return { admin: null, requesterId: null, role: null, error: NextResponse.json({ error: "Brak uprawnień do wysyłki karty klienta." }, { status: 403 }) };
  }

  return { admin, requesterId, requesterName: profile?.full_name || profile?.email || "Nieustalony użytkownik", role, error: null };
}

function caregiverFromClient(client: ClientWithCaregiver) {
  return Array.isArray(client.profiles) ? client.profiles[0] : client.profiles;
}

function buildClientCardHtml(client: ClientWithCaregiver, formUrl: string) {
  const clientName = client.nazwa || "Państwa firmy";

  return `
<div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#173b73;">
  <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
    <div style="background:#ffffff;border:1px solid #c9d6e8;border-radius:18px;padding:28px;">
      <div style="margin-bottom:24px;">
        <img src="${APP_URL}/logo-crss-mail.png?v=6" alt="CRSS" width="180" style="display:block;width:180px;max-width:180px;height:auto;border:0;outline:none;text-decoration:none;">
      </div>
      <p style="margin:0 0 16px 0;">Dzień dobry,</p>
      <p style="margin:0 0 16px 0;">prosimy o uzupełnienie karty klienta biura rachunkowego dla <strong>${clientName}</strong>.</p>
      <div style="background:#eef3fb;border:1px solid #c9d6e8;border-radius:14px;padding:18px;margin:24px 0;">
        <p style="margin:0 0 10px 0;font-weight:850;">Karta klienta</p>
        <p style="margin:0;">Formularz należy wypełnić online. Link jest indywidualny i wygaśnie po zapisaniu formularza.</p>
      </div>
      <p style="margin:24px 0;">
        <a href="${formUrl}" style="display:inline-block;padding:14px 22px;background:#f52f57;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:850;">Wypełnij kartę klienta</a>
      </p>
      <p style="margin:0 0 16px 0;">W razie pytań prosimy o kontakt z opiekunem księgowym.</p>
      <p style="margin:24px 0 0 0;">Pozdrawiamy serdecznie,<br><strong>Zespół CRSS</strong></p>
    </div>
    <p style="margin:18px 4px 0;color:#7a8598;font-size:13px;">Wiadomość wysłana automatycznie.</p>
  </div>
</div>`.trim();
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedUser(request);
  if (auth.error) return auth.error;

  const webhookConfig = getWebhookUrl();
  if (webhookConfig.error) return webhookConfig.error;

  let payload: ClientCardPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane wysyłki." }, { status: 400 });
  }

  if (!payload.clientId) {
    return NextResponse.json({ error: "Brak klienta." }, { status: 400 });
  }

  const { data: client, error: clientError } = await auth.admin
    .from("klienci")
    .select(`
      id,
      nazwa,
      nip,
      email,
      telefon,
      osoba_kontaktowa,
      opiekun_id,
      profiles!klienci_opiekun_id_fkey (
        full_name,
        email
      )
    `)
    .eq("id", payload.clientId)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: "Nie znaleziono klienta." }, { status: 404 });
  }

  const clientRecord = client as ClientWithCaregiver;
  if (auth.role === "accountant" && clientRecord.opiekun_id !== auth.requesterId) {
    return NextResponse.json({ error: "Możesz wysyłać kartę tylko dla swoich klientów." }, { status: 403 });
  }

  if (!clientRecord.email) {
    return NextResponse.json({ error: "Klient nie ma uzupełnionego adresu e-mail." }, { status: 400 });
  }

  const { data: existingForm } = await auth.admin
    .from("klient_karty_formularze")
    .select("id, public_token")
    .eq("klient_id", clientRecord.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let formRecord = existingForm as { id: string; public_token: string } | null;

  if (!formRecord) {
    const { data: createdForm, error: createError } = await auth.admin
      .from("klient_karty_formularze")
      .insert({
        klient_id: clientRecord.id,
        recipient_email: clientRecord.email,
        recipient_name: clientRecord.osoba_kontaktowa,
        created_by: auth.requesterId,
      })
      .select("id, public_token")
      .single();

    if (createError || !createdForm) {
      return NextResponse.json({ error: "Nie udało się przygotować linku do karty klienta." }, { status: 500 });
    }

    formRecord = createdForm as { id: string; public_token: string };
  }

  const formUrl = `${APP_URL}/karta-klienta/${formRecord.public_token}`;
  const caregiver = caregiverFromClient(clientRecord);

  try {
    const response = await fetch(webhookConfig.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "onboarding_client_card_requested",
        clientId: clientRecord.id,
        clientName: clientRecord.nazwa,
        clientNip: clientRecord.nip,
        recipientEmail: clientRecord.email,
        recipientName: clientRecord.osoba_kontaktowa,
        subject: "Karta klienta biura rachunkowego do uzupełnienia",
        html: buildClientCardHtml(clientRecord, formUrl),
        formUrl,
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

    await auth.admin
      .from("klient_karty_formularze")
      .update({
        sent_at: new Date().toISOString(),
        sent_by: auth.requesterId,
        recipient_email: clientRecord.email,
        recipient_name: clientRecord.osoba_kontaktowa,
      })
      .eq("id", formRecord.id);

    const { data: stage } = await auth.admin
      .from("onboarding_etapy")
      .select("id, status")
      .eq("klient_id", clientRecord.id)
      .eq("etap", "client_card")
      .maybeSingle();

    if (stage?.id && stage.status !== "gotowe") {
      await auth.admin
        .from("onboarding_etapy")
        .update({ status: "w_toku", updated_by: auth.requesterId })
        .eq("id", stage.id);
    }

    await auth.admin.from("onboarding_historia").insert({
      klient_id: clientRecord.id,
      etap: "client_card",
      akcja: "wysylka_karty_klienta",
      opis: `Karta klienta została wysłana do uzupełnienia przez ${auth.requesterName}.`,
      created_by: auth.requesterId,
    });

    return NextResponse.json({ ok: true, formUrl });
  } catch (error) {
    console.error("Błąd wysyłki karty klienta:", error);
    return NextResponse.json({ error: "Nie udało się przekazać karty klienta do wysyłki." }, { status: 500 });
  }
}
