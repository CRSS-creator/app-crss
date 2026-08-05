import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthorizedServerUser } from "@/lib/serverAuth";

const ALLOWED_ROLES = new Set(["owner", "admin"]);

type DraftActionPayload = {
  action?: "deleteInvoice" | "updateLine";
  invoiceId?: string;
  lineId?: string;
  line?: {
    nazwa?: unknown;
    ilosc?: unknown;
    jednostka?: unknown;
    cena_netto?: unknown;
    stawka_vat?: unknown;
  };
};

type DraftInvoiceRow = {
  id: string;
  status: string;
  zrodlo: string;
  wfirma_id: string | null;
  wfirma_sync_status: string;
};

const INVOICE_SELECT = `
  *,
  klienci (
    nazwa,
    nip,
    email,
    telefon
  ),
  faktury_pozycje (
    id,
    faktura_id,
    source_key,
    nazwa,
    ilosc,
    jednostka,
    cena_netto,
    stawka_vat,
    kwota_netto,
    kwota_vat,
    kwota_brutto,
    sort_order
  ),
  faktury_email_history (
    id,
    created_at,
    recipient_email,
    recipient_phone,
    notification_type,
    subject,
    status,
    error,
    invoice_number,
    sent_by_name
  )
`;

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do edycji szkiców faktur.");
  if (auth.error) return auth.error;

  let payload: DraftActionPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane szkicu faktury." }, { status: 400 });
  }

  if (!payload.invoiceId) {
    return NextResponse.json({ error: "Brak identyfikatora faktury." }, { status: 400 });
  }

  const invoice = await loadEditableDraft(auth.admin, payload.invoiceId);
  if (invoice.error) return invoice.error;

  if (payload.action === "deleteInvoice") {
    const deleted = await deleteDraft(auth.admin, invoice.data.id);
    if (deleted) return deleted;
    return NextResponse.json({ deleted: true });
  }

  if (payload.action === "updateLine") {
    if (!payload.lineId || !payload.line) {
      return NextResponse.json({ error: "Brak danych pozycji faktury." }, { status: 400 });
    }

    const result = await updateLine(auth.admin, invoice.data.id, payload.lineId, payload.line);
    if (result.error) return result.error;
    return NextResponse.json({ invoice: result.data });
  }

  return NextResponse.json({ error: "Nieznana operacja na szkicu faktury." }, { status: 400 });
}

async function loadEditableDraft(admin: SupabaseClient, invoiceId: string) {
  const { data, error } = await admin
    .from("faktury")
    .select("id,status,zrodlo,wfirma_id,wfirma_sync_status")
    .eq("id", invoiceId)
    .maybeSingle<DraftInvoiceRow>();

  if (error) {
    return { data: null, error: NextResponse.json({ error: "Nie udało się pobrać szkicu faktury." }, { status: 500 }) };
  }
  if (!data || !isEditableDraft(data)) {
    return { data: null, error: NextResponse.json({ error: "Można edytować albo usunąć tylko szkic przed wysłaniem do wFirmy." }, { status: 400 }) };
  }
  return { data, error: null };
}

async function deleteDraft(admin: SupabaseClient, invoiceId: string) {
  const lineDelete = await admin.from("faktury_pozycje").delete().eq("faktura_id", invoiceId);
  if (lineDelete.error) {
    return NextResponse.json({ error: `Nie udało się usunąć pozycji szkicu: ${lineDelete.error.message}` }, { status: 500 });
  }

  const invoiceDelete = await admin.from("faktury").delete().eq("id", invoiceId);
  if (invoiceDelete.error) {
    return NextResponse.json({ error: `Nie udało się usunąć szkicu: ${invoiceDelete.error.message}` }, { status: 500 });
  }
  return null;
}

async function updateLine(
  admin: SupabaseClient,
  invoiceId: string,
  lineId: string,
  line: NonNullable<DraftActionPayload["line"]>
) {
  const name = asText(line.nazwa);
  const unit = asText(line.jednostka) || "szt.";
  const quantity = asNumber(line.ilosc);
  const netPrice = asNumber(line.cena_netto);
  const vatRate = normalizeVat(asText(line.stawka_vat));

  if (!name) return { data: null, error: NextResponse.json({ error: "Pozycja musi mieć nazwę." }, { status: 400 }) };
  if (!Number.isFinite(quantity) || quantity <= 0) return { data: null, error: NextResponse.json({ error: "Ilość musi być większa od zera." }, { status: 400 }) };
  if (!Number.isFinite(netPrice) || netPrice < 0) return { data: null, error: NextResponse.json({ error: "Cena netto nie może być ujemna." }, { status: 400 }) };

  const net = roundMoney(quantity * netPrice);
  const vat = roundMoney(net * vatRate / 100);
  const gross = roundMoney(net + vat);

  const update = await admin
    .from("faktury_pozycje")
    .update({
      nazwa: name,
      ilosc: quantity,
      jednostka: unit,
      cena_netto: netPrice,
      stawka_vat: `${vatRate}%`,
      kwota_netto: net,
      kwota_vat: vat,
      kwota_brutto: gross,
    })
    .eq("id", lineId)
    .eq("faktura_id", invoiceId);

  if (update.error) {
    return { data: null, error: NextResponse.json({ error: `Nie udało się zapisać pozycji: ${update.error.message}` }, { status: 500 }) };
  }

  const totals = await admin
    .from("faktury_pozycje")
    .select("kwota_netto,kwota_vat,kwota_brutto")
    .eq("faktura_id", invoiceId);
  if (totals.error) {
    return { data: null, error: NextResponse.json({ error: "Nie udało się przeliczyć sum faktury." }, { status: 500 }) };
  }

  const sum = (totals.data || []).reduce(
    (acc, item) => ({
      net: acc.net + Number(item.kwota_netto || 0),
      vat: acc.vat + Number(item.kwota_vat || 0),
      gross: acc.gross + Number(item.kwota_brutto || 0),
    }),
    { net: 0, vat: 0, gross: 0 }
  );

  const { data: invoice, error } = await admin
    .from("faktury")
    .update({
      kwota_netto: roundMoney(sum.net),
      kwota_vat: roundMoney(sum.vat),
      kwota_brutto: roundMoney(sum.gross),
    })
    .eq("id", invoiceId)
    .select(INVOICE_SELECT)
    .single();

  if (error) {
    return { data: null, error: NextResponse.json({ error: `Pozycja zapisana, ale nie udało się odświeżyć faktury: ${error.message}` }, { status: 500 }) };
  }

  return { data: invoice, error: null };
}

function isEditableDraft(invoice: DraftInvoiceRow) {
  return invoice.status === "szkic"
    && invoice.zrodlo === "aplikacja"
    && invoice.wfirma_id === null
    && ["nie_wyslano", "blad"].includes(invoice.wfirma_sync_status);
}

function asText(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeVat(value: string) {
  const match = value.match(/\d+(?:[,.]\d+)?/);
  if (!match) return 23;
  return Math.max(0, asNumber(match[0]));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
