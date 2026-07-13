import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractWfirmaInvoices, getWfirmaConfig, getWfirmaInvoice } from "@/lib/wfirmaClient";

type WebhookPayload = Record<string, unknown>;

const PAID_VALUES = new Set(["paid", "oplacona", "opłacona", "zaplacona", "zapłacona", "settled", "closed"]);
const PAYMENT_EVENT_PATTERNS = [/payment/i, /platn/i, /płatn/i, /paid/i, /oplacon/i, /opłacon/i, /zaplacon/i, /zapłacon/i];

export async function GET() {
  return webhookKeyResponse();
}

export async function POST(request: NextRequest) {
  const secretValidation = validateWebhookSecret(request);
  if (secretValidation) return secretValidation;

  const rawBody = await request.text();
  if (!rawBody.trim()) return webhookKeyResponse();

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return webhookKeyResponse();
  }

  if (Object.keys(payload).length === 0) return webhookKeyResponse();

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Brak konfiguracji Supabase.", ...webhookKeyPayload() }, { status: 500 });

  const wfirmaId = extractInvoiceId(payload);
  if (!wfirmaId) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Webhook nie zawiera ID faktury wFirma.",
      ...webhookKeyPayload(),
    });
  }

  const paymentState = await resolvePaymentState(wfirmaId, payload);
  if (!paymentState.paid) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: paymentState.reason,
      wfirmaId,
      ...webhookKeyPayload(),
    });
  }

  const { data, error } = await admin
    .from("faktury")
    .update({
      status: "oplacona",
      wfirma_synced_at: new Date().toISOString(),
      wfirma_sync_error: null,
    })
    .eq("wfirma_id", wfirmaId)
    .neq("status", "anulowana")
    .select("id,status,wfirma_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Nie udało się zaktualizować statusu faktury.", ...webhookKeyPayload() },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Nie znaleziono faktury z podanym ID wFirma.", ...webhookKeyPayload() },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, invoiceId: data.id, wfirmaId, ...webhookKeyPayload() });
}

function webhookKeyResponse() {
  const payload = webhookKeyPayload();
  if (!payload.webhook_key) {
    return NextResponse.json(
      { error: "Brak konfiguracji klucza webhooka. Uzupełnij WFIRMA_WEBHOOK_KEY." },
      { status: 500 }
    );
  }

  return NextResponse.json(payload);
}

function webhookKeyPayload() {
  const webhookKey = process.env.WFIRMA_WEBHOOK_KEY?.trim();
  return webhookKey ? { webhook_key: webhookKey } : {};
}

function validateWebhookSecret(request: NextRequest) {
  const expectedSecret = process.env.WFIRMA_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Brak konfiguracji webhooka. Uzupełnij WFIRMA_WEBHOOK_SECRET.", ...webhookKeyPayload() },
      { status: 500 }
    );
  }

  const providedSecret =
    request.headers.get("x-wfirma-webhook-secret")?.trim() ||
    request.headers.get("x-webhook-secret")?.trim() ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    request.nextUrl.searchParams.get("secret")?.trim();

  if (providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Nieprawidłowy sekret webhooka.", ...webhookKeyPayload() }, { status: 401 });
  }

  return null;
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolvePaymentState(wfirmaId: string, payload: WebhookPayload) {
  const wfirma = getWfirmaConfig();
  if (!wfirma.error && wfirma.config) {
    try {
      const response = await getWfirmaInvoice(wfirma.config, wfirmaId);
      const invoice = extractWfirmaInvoices(response)[0];
      const state = normalizeText(invoice?.paymentstate);
      return {
        paid: PAID_VALUES.has(state),
        reason: state ? `Status płatności wFirma: ${state}.` : "wFirma nie zwróciła statusu płatności.",
      };
    } catch {
      // Jeżeli API wFirma chwilowo nie odpowie, nadal obsługujemy webhook na podstawie jego treści.
    }
  }

  const state = normalizeText(firstNestedValue(payload, isPaymentStateKey));
  if (state) {
    return {
      paid: PAID_VALUES.has(state),
      reason: `Status płatności z webhooka: ${state}.`,
    };
  }

  const eventName = normalizeText(firstNestedValue(payload, isEventKey));
  const looksLikePaymentEvent = PAYMENT_EVENT_PATTERNS.some((pattern) => pattern.test(eventName));
  return {
    paid: looksLikePaymentEvent,
    reason: looksLikePaymentEvent
      ? `Zdarzenie webhooka: ${eventName}.`
      : "Webhook nie potwierdza opłacenia faktury.",
  };
}

function extractInvoiceId(payload: WebhookPayload) {
  const candidates = collectNestedValues(payload)
    .map(({ key, path, value }) => ({
      value: stringify(value),
      score: invoiceIdScore(key, path),
    }))
    .filter((candidate) => candidate.value && candidate.score > 0)
    .sort((first, second) => second.score - first.score);

  return candidates[0]?.value || "";
}

function invoiceIdScore(key: string, path: string[]) {
  const normalizedKey = normalizeText(key);
  const normalizedPath = normalizeText(path.join("."));
  let score = 0;

  if (["wfirma_id", "wfirmaid", "invoice_id", "invoiceid", "id_invoice", "idinvoice", "faktura_id", "fakturaid"].includes(normalizedKey)) {
    score += 8;
  }
  if (normalizedKey === "id" && /invoice|faktura/.test(normalizedPath)) score += 5;
  if (/invoice|faktura/.test(normalizedPath)) score += 2;
  if (/payment|platn|płatn/.test(normalizedPath)) score -= 2;

  return score;
}

function firstNestedValue(payload: unknown, keyMatcher: (key: string) => boolean) {
  return collectNestedValues(payload).find(({ key }) => keyMatcher(key))?.value;
}

function isPaymentStateKey(key: string) {
  return ["paymentstate", "payment_state", "paymentstatus", "payment_status", "status_platnosci", "status_płatności"].includes(
    normalizeText(key)
  );
}

function isEventKey(key: string) {
  return ["event", "eventname", "event_name", "type", "action", "topic"].includes(normalizeText(key));
}

function collectNestedValues(value: unknown, path: string[] = []): { key: string; path: string[]; value: unknown }[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNestedValues(item, [...path, String(index)]));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    { key, path: [...path, key], value: child },
    ...collectNestedValues(child, [...path, key]),
  ]);
}

function normalizeText(value: unknown) {
  return stringify(value).toLowerCase().replace(/\s+/g, "_");
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
