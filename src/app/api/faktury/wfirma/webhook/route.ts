import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type WebhookPayload = Record<string, unknown>;

export async function GET() {
  return webhookKeyResponse();
}

export async function POST(request: NextRequest) {
  const secretValidation = validateWebhookSecret(request);
  if (secretValidation) return secretValidation;

  const payload = await parseWebhookPayload(request);
  if (Object.keys(payload).length === 0) return webhookKeyResponse();

  const invoiceNumber = extractInvoiceNumber(payload);
  if (!invoiceNumber) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Webhook nie zawiera numeru faktury.",
      ...webhookKeyPayload(),
    });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase.", ...webhookKeyPayload() }, { status: 500 });
  }

  const { data, error } = await markInvoicePaidByNumber(admin, invoiceNumber);

  if (error) {
    return NextResponse.json(
      { error: "Nie udało się zaktualizować statusu faktury.", details: error.message, ...webhookKeyPayload() },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Nie znaleziono faktury o numerze z webhooka.",
      invoiceNumber,
      ...webhookKeyPayload(),
    });
  }

  return NextResponse.json({ ok: true, invoiceId: data.id, invoiceNumber, ...webhookKeyPayload() });
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

function extractInvoiceNumber(payload: WebhookPayload) {
  const candidates = collectNestedValues(payload)
    .map(({ key, path, value }) => ({ value: stringify(value), score: invoiceNumberScore(key, path, value) }))
    .filter((candidate) => candidate.value && candidate.score > 0)
    .sort((first, second) => second.score - first.score);

  return candidates[0]?.value || "";
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

function invoiceNumberCandidates(invoiceNumber: string) {
  const trimmed = invoiceNumber.trim().replace(/\s+/g, " ");
  const withoutPrefix = trimmed.replace(/^fv\s+/i, "").trim();
  return Array.from(new Set([trimmed, `FV ${withoutPrefix}`, withoutPrefix].filter(Boolean)));
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
