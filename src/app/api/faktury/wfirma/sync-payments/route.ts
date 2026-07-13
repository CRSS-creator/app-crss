import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { firstWfirmaInvoice, getWfirmaConfig, getWfirmaInvoice, type WfirmaInvoice } from "@/lib/wfirmaClient";

const STATUSES_TO_CHECK = ["wystawiona", "wyslana", "przeterminowana"];
const MAX_INVOICES_PER_RUN = 200;
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

type InvoiceRow = {
  id: string;
  numer: string | null;
  wfirma_id: string | null;
  status: string;
};

type PaidInvoice = {
  invoiceId: string;
  number: string | null;
  wfirmaId: string;
};

type FailedInvoice = PaidInvoice & {
  error: string;
};

export async function GET(request: NextRequest) {
  return syncPayments(request);
}

export async function POST(request: NextRequest) {
  return syncPayments(request);
}

async function syncPayments(request: NextRequest) {
  const secretError = validateSyncSecret(request);
  if (secretError) return secretError;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const wfirma = getWfirmaConfig();
  if (wfirma.error || !wfirma.config) {
    return NextResponse.json({ error: wfirma.error }, { status: 500 });
  }

  const { data, error } = await admin
    .from("faktury")
    .select("id,numer,wfirma_id,status")
    .in("status", STATUSES_TO_CHECK)
    .not("wfirma_id", "is", null)
    .order("termin_platnosci", { ascending: true })
    .limit(MAX_INVOICES_PER_RUN);

  if (error) {
    return NextResponse.json({ error: "Nie udało się pobrać faktur do sprawdzenia." }, { status: 500 });
  }

  const invoices = ((data || []) as InvoiceRow[]).filter((invoice) => stringify(invoice.wfirma_id));
  const paid: PaidInvoice[] = [];
  const failed: FailedInvoice[] = [];

  for (const invoice of invoices) {
    const wfirmaId = stringify(invoice.wfirma_id);
    const baseResult = { invoiceId: invoice.id, number: invoice.numer, wfirmaId };

    try {
      const response = await getWfirmaInvoice(wfirma.config, wfirmaId);
      const wfirmaInvoice = firstWfirmaInvoice(response);
      if (!wfirmaInvoice) throw new Error("wFirma nie zwróciła danych tej faktury.");

      if (!isPaidInvoice(wfirmaInvoice)) continue;

      const update = await admin
        .from("faktury")
        .update({
          status: "oplacona",
          wfirma_synced_at: new Date().toISOString(),
          wfirma_sync_error: null,
        })
        .eq("id", invoice.id)
        .neq("status", "anulowana")
        .select("id")
        .single();

      if (update.error || !update.data?.id) {
        throw new Error(update.error?.message || "Nie udało się zapisać statusu opłaconej faktury.");
      }

      paid.push(baseResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nieznany błąd sprawdzania płatności.";
      failed.push({ ...baseResult, error: message });
      await admin
        .from("faktury")
        .update({
          wfirma_sync_error: `Błąd sprawdzania płatności w wFirmie: ${message}`,
        })
        .eq("id", invoice.id);
    }
  }

  return NextResponse.json({
    checked: invoices.length,
    markedPaid: paid.length,
    paid,
    failed,
  });
}

function validateSyncSecret(request: NextRequest) {
  const expected = process.env.WFIRMA_PAYMENT_SYNC_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: "Brak WFIRMA_PAYMENT_SYNC_SECRET w konfiguracji aplikacji." }, { status: 500 });
  }

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  const provided = bearer || headerSecret || querySecret;

  if (provided !== expected) {
    return NextResponse.json({ error: "Brak dostępu do nocnego sprawdzania płatności." }, { status: 401 });
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

function isPaidInvoice(invoice: WfirmaInvoice) {
  const record = invoice as Record<string, unknown>;
  const values = [
    invoice.paymentstate,
    record.payment_state,
    record.paymentStatus,
    record.payment_status,
    record.paid,
    record.status,
    record.state,
  ].map(normalizeText);

  return values.some((value) => PAID_VALUES.has(value));
}

function normalizeText(value: unknown) {
  return stringify(value).toLowerCase();
}

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
