import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getWebhookKey() {
  const explicitKey = process.env.WFIRMA_WEBHOOK_KEY?.trim();
  if (explicitKey) return explicitKey;

  const accessKey = process.env.WFIRMA_ACCESS_KEY?.trim();
  const secretKey = process.env.WFIRMA_SECRET_KEY?.trim();
  if (!accessKey || !secretKey) return null;

  return createHash("sha256")
    .update(`${accessKey}:${secretKey}:app.crss.com.pl:wfirma-webhook`)
    .digest("hex")
    .slice(0, 40);
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function extractEventType(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const candidates = [
    record.event,
    record.event_type,
    record.action,
    record.type,
    record.zdarzenie,
  ];

  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value : null;
}

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export async function GET() {
  const webhookKey = getWebhookKey();
  if (!webhookKey) {
    return NextResponse.json({ error: "Brak konfiguracji WFIRMA_ACCESS_KEY i WFIRMA_SECRET_KEY." }, { status: 500 });
  }

  return NextResponse.json({ webhook_key: webhookKey });
}

export async function POST(request: NextRequest) {
  const webhookKey = getWebhookKey();
  if (!webhookKey) {
    return NextResponse.json({ error: "Brak konfiguracji WFIRMA_ACCESS_KEY i WFIRMA_SECRET_KEY." }, { status: 500 });
  }

  let payload: unknown = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const admin = getAdminClient();
  if (admin) {
    const { error } = await admin
      .from("wfirma_webhook_events")
      .insert({
        event_type: extractEventType(payload),
        source_ip: clientIp(request),
        user_agent: request.headers.get("user-agent"),
        payload,
      });

    if (error) {
      return NextResponse.json({ webhook_key: webhookKey, saved: false, error: "Nie udało się zapisać zdarzenia wFirmy." }, { status: 500 });
    }
  }

  return NextResponse.json({ webhook_key: webhookKey, saved: Boolean(admin) });
}
