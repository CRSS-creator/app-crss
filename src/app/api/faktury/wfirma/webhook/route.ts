import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extractWfirmaInvoices, findWfirmaInvoices, getWfirmaConfig, getWfirmaInvoice, type WfirmaInvoice } from "@/lib/wfirmaClient";

type WebhookPayload = Record<string, unknown>;
type InvoiceLookup = {
  wfirmaIds: string[];
  numbers: string[];
};

const PAID_VALUES = new Set([
  "1",
  "true",
  "yes",
  "paid",
  "paid_full",
  "fully_paid",
  "settled",
  "closed",
  "oplacona",
  "opłacona",
  "oplacono",
  "opłacono",
  "zaplacona",
  "zapłacona",
  "zaplacono",
  "zapłacono",
]);
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

  const lookup = extractInvoiceLookup(payload);
  const eventId = await createWebhookEvent(admin, payload, lookup);

  if (lookup.wfirmaIds.length === 0 && lookup.numbers.length === 0) {
    const syncResult = await syncRecentPaidWfirmaInvoices(admin);
    await updateWebhookEvent(admin, eventId, {
      result: syncResult.updated > 0 ? "synced" : "skipped",
      error: "Webhook nie zawiera ID ani numeru faktury wFirma.",
    });
    return NextResponse.json({
      ok: true,
      skipped: syncResult.updated === 0,
      reason: "Webhook nie zawiera ID ani numeru faktury wFirma.",
      syncedPaidInvoices: syncResult.updated,
      ...webhookKeyPayload(),
    });
  }

  const paymentState = await resolvePaymentState(lookup.wfirmaIds[0] || null, payload);
  if (!paymentState.paid) {
    await updateWebhookEvent(admin, eventId, {
      result: "skipped",
      error: paymentState.reason,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: paymentState.reason,
      lookup,
      ...webhookKeyPayload(),
    });
  }

  const updateResult = await markInvoicePaid(admin, lookup);
  if (updateResult.error) {
    await updateWebhookEvent(admin, eventId, {
      result: "error",
      error: updateResult.error,
    });
    return NextResponse.json({ error: updateResult.error, lookup, ...webhookKeyPayload() }, { status: 500 });
  }

  if (!updateResult.invoice) {
    const syncResult = await syncRecentPaidWfirmaInvoices(admin);
    await updateWebhookEvent(admin, eventId, {
      result: syncResult.updated > 0 ? "synced" : "not_found",
      error: "Nie znaleziono faktury po danych z webhooka.",
    });
    return NextResponse.json({
      ok: true,
      skipped: syncResult.updated === 0,
      reason: "Nie znaleziono faktury po danych z webhooka.",
      lookup,
      syncedPaidInvoices: syncResult.updated,
      ...webhookKeyPayload(),
    });
  }

  await updateWebhookEvent(admin, eventId, {
    result: "paid",
    invoiceId: updateResult.invoice.id,
    wfirmaId: updateResult.invoice.wfirma_id,
  });

  return NextResponse.json({
    ok: true,
    invoiceId: updateResult.invoice.id,
    wfirmaId: updateResult.invoice.wfirma_id,
    matchedBy: updateResult.matchedBy,
    ...webhookKeyPayload(),
  });
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

async function resolvePaymentState(wfirmaId: string | null, payload: WebhookPayload) {
  const payloadState = normalizeText(firstNestedValue(payload, isPaymentStateKey));
  if (payloadState) {
    return {
      paid: PAID_VALUES.has(payloadState),
      reason: `Status płatności z webhooka: ${payloadState}.`,
    };
  }

  if (wfirmaId) {
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

async function markInvoicePaid(admin: SupabaseClient, lookup: InvoiceLookup) {
  const update = {
    status: "oplacona",
    wfirma_synced_at: new Date().toISOString(),
    wfirma_sync_error: null,
  };

  for (const wfirmaId of lookup.wfirmaIds) {
    const { data, error } = await admin
      .from("faktury")
      .update(update)
      .eq("wfirma_id", wfirmaId)
      .neq("status", "anulowana")
      .select("id,status,wfirma_id,numer")
      .maybeSingle();

    if (error) return { invoice: null, matchedBy: null, error: error.message };
    if (data) return { invoice: data, matchedBy: "wfirma_id", error: null };
  }

  for (const number of lookup.numbers) {
    const { data, error } = await admin
      .from("faktury")
      .update(update)
      .eq("numer", number)
      .neq("status", "anulowana")
      .select("id,status,wfirma_id,numer")
      .maybeSingle();

    if (error) return { invoice: null, matchedBy: null, error: error.message };
    if (data) return { invoice: data, matchedBy: "numer", error: null };
  }

  return { invoice: null, matchedBy: null, error: null };
}

async function syncRecentPaidWfirmaInvoices(admin: SupabaseClient) {
  const wfirma = getWfirmaConfig();
  if (wfirma.error || !wfirma.config) return { updated: 0 };

  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFromDate = new Date();
  dateFromDate.setUTCMonth(dateFromDate.getUTCMonth() - 4);
  const dateFrom = dateFromDate.toISOString().slice(0, 10);
  let updated = 0;

  for (let page = 1; page <= 10; page += 1) {
    const response = await findWfirmaInvoices({
      config: wfirma.config,
      dateFrom,
      dateTo,
      page,
      limit: 50,
    });
    const invoices = extractWfirmaInvoices(response);
    if (invoices.length === 0) break;

    for (const invoice of invoices) {
      if (!isWfirmaInvoicePaid(invoice)) continue;
      const lookup = wfirmaInvoiceLookup(invoice);
      const result = await markInvoicePaid(admin, lookup);
      if (result.invoice) updated += 1;
    }

    if (invoices.length < 50) break;
  }

  return { updated };
}

function isWfirmaInvoicePaid(invoice: WfirmaInvoice) {
  return PAID_VALUES.has(normalizeText(invoice.paymentstate));
}

function wfirmaInvoiceLookup(invoice: WfirmaInvoice): InvoiceLookup {
  return {
    wfirmaIds: unique([stringify(invoice.id)].filter(Boolean)),
    numbers: unique([stringify(invoice.fullnumber), stringify(invoice.number)].filter(Boolean)),
  };
}

async function createWebhookEvent(admin: SupabaseClient, payload: WebhookPayload, lookup: InvoiceLookup) {
  const { data } = await admin
    .from("wfirma_webhook_events")
    .insert({
      payload,
      wfirma_id: lookup.wfirmaIds[0] || null,
      invoice_number: lookup.numbers[0] || null,
      result: "received",
    })
    .select("id")
    .maybeSingle();

  return typeof data?.id === "string" ? data.id : null;
}

async function updateWebhookEvent(
  admin: SupabaseClient,
  eventId: string | null,
  update: { result: string; invoiceId?: string | null; wfirmaId?: string | null; error?: string | null }
) {
  if (!eventId) return;

  await admin
    .from("wfirma_webhook_events")
    .update({
      result: update.result,
      invoice_id: update.invoiceId || null,
      wfirma_id: update.wfirmaId || undefined,
      error: update.error || null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", eventId);
}

function extractInvoiceLookup(payload: WebhookPayload): InvoiceLookup {
  const values = collectNestedValues(payload);
  const wfirmaIds = unique(
    values
      .map(({ key, path, value }) => ({ value: stringify(value), score: invoiceIdScore(key, path) }))
      .filter((candidate) => candidate.value && candidate.score > 0)
      .sort((first, second) => second.score - first.score)
      .map((candidate) => candidate.value)
  );
  const numbers = unique(
    values
      .map(({ key, path, value }) => ({ value: stringify(value), score: invoiceNumberScore(key, path, value) }))
      .filter((candidate) => candidate.value && candidate.score > 0)
      .sort((first, second) => second.score - first.score)
      .map((candidate) => candidate.value)
  );

  return { wfirmaIds, numbers };
}

function invoiceIdScore(key: string, path: string[]) {
  const normalizedKey = normalizeText(key);
  const normalizedPath = normalizeText(path.join("."));
  let score = 0;

  if (["wfirma_id", "wfirmaid", "invoice_id", "invoiceid", "id_invoice", "idinvoice", "faktura_id", "fakturaid"].includes(normalizedKey)) {
    score += 8;
  }
  if (["document_id", "documentid", "id_document", "iddocument"].includes(normalizedKey) && /invoice|faktura/.test(normalizedPath)) {
    score += 7;
  }
  if (normalizedKey === "id" && /invoice|faktura/.test(normalizedPath)) score += 5;
  if (/invoice|faktura/.test(normalizedPath)) score += 2;
  if (/payment|platn|płatn/.test(normalizedPath)) score -= 2;

  return score;
}

function invoiceNumberScore(key: string, path: string[], value: unknown) {
  const normalizedKey = normalizeText(key);
  const normalizedPath = normalizeText(path.join("."));
  const text = stringify(value);
  let score = 0;

  if (["number", "fullnumber", "full_number", "invoice_number", "document_number", "numer", "numer_faktury"].includes(normalizedKey)) {
    score += 6;
  }
  if (/invoice|faktura|document|dokument/.test(normalizedPath)) score += 2;
  if (/^fv\s*\d+/i.test(text) || /^faktura\s+/i.test(text)) score += 5;

  return score;
}

function firstNestedValue(payload: unknown, keyMatcher: (key: string) => boolean) {
  return collectNestedValues(payload).find(({ key }) => keyMatcher(key))?.value;
}

function isPaymentStateKey(key: string) {
  return ["paymentstate", "payment_state", "paymentstatus", "payment_status", "status_platnosci", "status_płatności", "paid"].includes(
    normalizeText(key)
  );
}

function isEventKey(key: string) {
  return ["event", "eventname", "event_name", "type", "action", "topic", "name"].includes(normalizeText(key));
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

function unique(values: string[]) {
  return Array.from(new Set(values));
}
