import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type WebhookPayload = Record<string, unknown>;

export async function GET(request: NextRequest) {
  return webhookKeyResponse(request);
}

export async function POST(request: NextRequest) {
  const payload = await parseWebhookPayload(request);
  const admin = createAdminClient();
  if (!admin) {
    return Object.keys(payload).length === 0
      ? webhookKeyResponse(request)
      : NextResponse.json({ error: "Brak konfiguracji Supabase.", ...webhookKeyPayload(request) }, { status: 500 });
  }

  if (Object.keys(payload).length === 0) {
    await logWebhookEvent(admin, {
      payload,
      identifiers: { invoiceNumber: "", wfirmaIds: [] },
      result: "received_empty_payload",
      error: "Webhook POST przyszedł bez danych.",
    });

    return webhookKeyResponse(request);
  }

  const identifiers = extractInvoiceIdentifiers(payload);

  if (!identifiers.invoiceNumber && identifiers.wfirmaIds.length === 0) {
    await logWebhookEvent(admin, {
      payload,
      identifiers,
      result: "skipped_no_identifier",
      error: "Webhook nie zawiera numeru faktury ani ID faktury z wFirmy.",
    });

    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Webhook nie zawiera numeru faktury ani ID faktury z wFirmy.",
      ...webhookKeyPayload(request),
    });
  }

  const { data, error } = await markInvoicePaid(admin, identifiers);

  if (error) {
    await logWebhookEvent(admin, {
      payload,
      identifiers,
      result: "error",
      error: error.message,
    });

    return NextResponse.json(
      { error: "Nie udało się zaktualizować statusu faktury.", details: error.message, ...webhookKeyPayload(request) },
      { status: 500 }
    );
  }

  if (!data) {
    await logWebhookEvent(admin, {
      payload,
      identifiers,
      result: "skipped_not_found",
      error: "Nie znaleziono faktury pasującej do webhooka.",
    });

    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Nie znaleziono faktury pasującej do webhooka.",
      invoiceNumber: identifiers.invoiceNumber,
      wfirmaIds: identifiers.wfirmaIds,
      ...webhookKeyPayload(request),
    });
  }

  await logWebhookEvent(admin, {
    payload,
    identifiers,
    result: "paid",
    invoiceId: data.id,
  });

  return NextResponse.json({
    ok: true,
    invoiceId: data.id,
    invoiceNumber: identifiers.invoiceNumber,
    wfirmaIds: identifiers.wfirmaIds,
    ...webhookKeyPayload(request),
  });
}

async function logWebhookEvent(
  admin: SupabaseClient,
  event: {
    payload: WebhookPayload;
    identifiers: { invoiceNumber: string; wfirmaIds: string[] };
    result: string;
    invoiceId?: string;
    error?: string;
  }
) {
  await admin.from("wfirma_webhook_events").insert({
    processed_at: new Date().toISOString(),
    result: event.result,
    wfirma_id: event.identifiers.wfirmaIds[0] || null,
    invoice_number: event.identifiers.invoiceNumber || null,
    invoice_id: event.invoiceId || null,
    payload: jsonPayload(event.payload),
    error: event.error || null,
  });
}

function webhookKeyResponse(request: NextRequest) {
  const payload = webhookKeyPayload(request);
  if (!payload.webhook_key) {
    return NextResponse.json(
      { error: `Brak konfiguracji klucza webhooka. Uzupełnij ${webhookKeyEnvName(request)}.` },
      { status: 500 }
    );
  }

  return NextResponse.json(payload);
}

function webhookKeyPayload(request: NextRequest) {
  const webhookKey =
    process.env[webhookKeyEnvName(request)]?.trim() ||
    process.env.WFIRMA_WEBHOOK_KEY?.trim();
  return webhookKey ? { webhook_key: webhookKey } : {};
}

function webhookKeyEnvName(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.includes("/dodanie-platnosci")) return "WFIRMA_WEBHOOK_KEY_DODANIE_PLATNOSCI";
  if (pathname.includes("/modyfikacja-faktury")) return "WFIRMA_WEBHOOK_KEY_MODYFIKACJA_FAKTURY";
  return "WFIRMA_WEBHOOK_KEY";
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function parseWebhookPayload(request: NextRequest): Promise<WebhookPayload> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return (await request.json()) as WebhookPayload;
    } catch {
      return {};
    }
  }

  try {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  } catch {
    return {};
  }
}

function extractInvoiceIdentifiers(payload: WebhookPayload) {
  const fields = collectNestedValues(payload);
  const invoiceNumber = fields
    .map(({ key, path, value }) => ({ value: stringify(value), score: invoiceNumberScore(key, path, value) }))
    .filter((candidate) => candidate.value && candidate.score > 0)
    .sort((first, second) => second.score - first.score)[0]?.value || "";
  const wfirmaIds = fields
    .map(({ key, path, value }) => ({ value: stringify(value), score: wfirmaInvoiceIdScore(key, path, value) }))
    .filter((candidate) => candidate.value && candidate.score > 0)
    .sort((first, second) => second.score - first.score)
    .map((candidate) => candidate.value);

  return {
    invoiceNumber,
    wfirmaIds: Array.from(new Set(wfirmaIds)).slice(0, 5),
  };
}

function invoiceNumberScore(key: string, path: string[], value: unknown) {
  const normalizedKey = normalizeText(key);
  const normalizedPath = normalizeText(path.join("."));
  const text = stringify(value);
  const compactKey = normalizedKey.replace(/[^a-z0-9]+/g, "_");
  const compactPath = normalizedPath.replace(/[^a-z0-9]+/g, "_");
  let score = 0;

  if (/(^|_)full_?number($|_)|(^|_)invoice_?number($|_)|(^|_)document_?number($|_)|(^|_)numer(_faktury)?($|_)/.test(compactKey)) {
    score += 12;
  }
  if (/invoice|faktura|document|dokument/.test(compactPath)) score += 3;
  if (looksLikeInvoiceNumber(text)) score += 20;
  if (/^fv\s*\d+/i.test(text) || /^faktura\s+/i.test(text)) score += 8;
  if (/^\d{7,}$/.test(text)) score -= 10;

  return score;
}

function wfirmaInvoiceIdScore(key: string, path: string[], value: unknown) {
  const text = stringify(value);
  if (!/^\d{5,}$/.test(text)) return 0;

  const normalizedPath = normalizeText([...path, key].join(".")).replace(/[^a-z0-9]+/g, "_");
  let score = 0;

  if (/invoice|faktura|document|dokument/.test(normalizedPath)) score += 10;
  if (/(^|_)id($|_)|invoice_?id|faktura_?id|document_?id/.test(normalizedPath)) score += 8;
  if (/payment|platnosc|płatność|paid|transaction|bank/.test(normalizedPath)) score -= 12;
  if (/tax|nip|vat|amount|total|netto|brutto|kwota|price|cena/.test(normalizedPath)) score -= 12;

  return score;
}

async function markInvoicePaid(admin: SupabaseClient, identifiers: { invoiceNumber: string; wfirmaIds: string[] }) {
  if (identifiers.invoiceNumber) {
    const result = await markInvoicePaidByNumber(admin, identifiers.invoiceNumber);
    if (result.error || result.data) return result;
  }

  return markInvoicePaidByWfirmaIds(admin, identifiers.wfirmaIds);
}

async function markInvoicePaidByNumber(admin: SupabaseClient, invoiceNumber: string) {
  const candidateNumbers = invoiceNumberCandidates(invoiceNumber);
  for (const candidate of candidateNumbers) {
    const result = await admin
      .from("faktury")
      .update({
        status: "oplacona",
        wfirma_synced_at: new Date().toISOString(),
        wfirma_sync_error: null,
      })
      .eq("numer", candidate)
      .neq("status", "anulowana")
      .select("id,numer,status")
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  return { data: null, error: null };
}

async function markInvoicePaidByWfirmaIds(admin: SupabaseClient, wfirmaIds: string[]) {
  for (const wfirmaId of wfirmaIds) {
    const result = await admin
      .from("faktury")
      .update({
        status: "oplacona",
        wfirma_synced_at: new Date().toISOString(),
        wfirma_sync_error: null,
      })
      .eq("wfirma_id", wfirmaId)
      .neq("status", "anulowana")
      .select("id,numer,status")
      .maybeSingle();

    if (result.error || result.data) return result;
  }

  return { data: null, error: null };
}

function invoiceNumberCandidates(invoiceNumber: string) {
  const trimmed = invoiceNumber.trim().replace(/\s+/g, " ");
  const withoutPrefix = trimmed.replace(/^fv\s+/i, "").trim();
  return Array.from(new Set([trimmed, `FV ${withoutPrefix}`, withoutPrefix].filter(Boolean)));
}

function looksLikeInvoiceNumber(value: string) {
  return /^(fv\s*)?\d+\/\d+\/\d{4}$/i.test(value.trim());
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

function jsonPayload(payload: WebhookPayload) {
  try {
    return JSON.parse(JSON.stringify(payload)) as WebhookPayload;
  } catch {
    return {};
  }
}
