import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthorizedServerUser } from "@/lib/serverAuth";
import { createInvoiceBankAccountResolver, ensureDraftInvoiceBankAccount, isWfirmaDraft, type RequiredInvoiceBankAccount } from "@/lib/invoiceBankAccount";
import {
  downloadWfirmaInvoicePdf,
  extractWfirmaInvoiceLines,
  wfirmaLineAmounts,
  wfirmaInvoiceAmounts,
  extractWfirmaInvoices,
  findWfirmaInvoices,
  firstWfirmaInvoice,
  getWfirmaInvoice,
  getWfirmaConfig,
  type WfirmaInvoice,
  type WfirmaInvoiceLine,
} from "@/lib/wfirmaClient";

const ALLOWED_ROLES = new Set(["owner", "admin"]);
const INVOICE_PDF_BUCKET = "faktury-pdf";
const STATUSES_TO_CHECK = ["wystawiona", "wyslana", "przeterminowana"];
const MAX_INVOICES_PER_RUN = 5000;
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
const UNPAID_VALUES = new Set([
  "0",
  "false",
  "no",
  "unpaid",
  "not_paid",
  "unsettled",
  "open",
  "nieoplacona",
  "nieopłacona",
  "nieoplacono",
  "nieopłacono",
  "niezaplacona",
  "niezapłacona",
  "niezaplacono",
  "niezapłacono",
]);

type InvoiceRow = {
  id: string;
  numer: string | null;
  data_wystawienia: string | null;
  termin_platnosci: string | null;
  okres: string | null;
  kontrahent_nip: string | null;
  kwota_netto: number | string | null;
  kwota_vat: number | string | null;
  kwota_brutto: number | string | null;
  wfirma_id: string | null;
  wfirma_pdf_path: string | null;
  wfirma_pdf_name: string | null;
  status: string;
};

type PaidInvoice = {
  invoiceId: string;
  number: string | null;
  wfirmaId: string;
};

type RecoveryCandidate = { wfirmaId: string; number: string; date: string | null; gross: number; nip: string };
type ConfirmedReplacement = { invoiceId: string; previousWfirmaId: string; wfirmaId: string };

type FailedInvoice = PaidInvoice & {
  candidates?: RecoveryCandidate[];
  error: string;
};

type SyncPayload = {
  confirmedReplacement?: ConfirmedReplacement;
  month?: string;
  invoiceIds?: string[];
};

export async function GET(request: NextRequest) {
  return syncPayments(request);
}

export async function POST(request: NextRequest) {
  return syncPayments(request);
}

async function syncPayments(request: NextRequest) {
  const authError = await authorizeSync(request);
  if (authError) return authError;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Brak konfiguracji Supabase." }, { status: 500 });
  }

  const wfirma = getWfirmaConfig();
  if (wfirma.error || !wfirma.config) {
    return NextResponse.json({ error: wfirma.error }, { status: 500 });
  }

  const payload = await syncPayload(request);
  if (payload.confirmedReplacement && (request.method !== "POST" || payload.invoiceIds?.length !== 1 || payload.invoiceIds[0] !== payload.confirmedReplacement.invoiceId)) {
    return NextResponse.json({ error: "Nieprawidłowe potwierdzenie powiązania faktury." }, { status: 400 });
  }
  if (payload.confirmedReplacement) {
    const confirmationAuth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do zmiany powiązania faktury.");
    if (confirmationAuth.error) return confirmationAuth.error;
  }
  const resolveBankAccount = createInvoiceBankAccountResolver(admin, wfirma.config);
  const requestedMonth = syncMonth(request, payload);
  const requestedInvoiceIds = syncInvoiceIds(payload);
  const requestedRange = requestedMonth ? monthRange(requestedMonth) : null;
  let query = admin
    .from("faktury")
    .select("id,numer,data_wystawienia,termin_platnosci,okres,kontrahent_nip,kwota_netto,kwota_vat,kwota_brutto,wfirma_id,wfirma_pdf_path,wfirma_pdf_name,status")
    .in("status", (requestedMonth || requestedInvoiceIds.length > 0) ? [...STATUSES_TO_CHECK, "oplacona"] : STATUSES_TO_CHECK)
    .neq("kategoria", "korekta")
    .not("wfirma_id", "is", null)
    .order("termin_platnosci", { ascending: true });

  if (requestedInvoiceIds.length > 0) {
    query = query.in("id", requestedInvoiceIds);
  }

  if (requestedRange) {
    query = query.or(
      `and(data_wystawienia.gte.${requestedRange.dateFrom},data_wystawienia.lte.${requestedRange.dateTo}),and(okres.gte.${requestedRange.dateFrom},okres.lte.${requestedRange.dateTo})`
    );
  }

  const { data, error } = await query.limit(MAX_INVOICES_PER_RUN);

  if (error) {
    return NextResponse.json({ error: "Nie udało się pobrać faktur do sprawdzenia." }, { status: 500 });
  }

  const invoices = ((data || []) as InvoiceRow[]).filter((invoice) => stringify(invoice.wfirma_id));
  const lookupErrors = new Map<string, string>();
  const recoveryCandidates = new Map<string, RecoveryCandidate[]>();
  const wfirmaInvoicesById = payload.confirmedReplacement ? new Map<string, WfirmaInvoice>()
    : await loadWfirmaInvoicesByMonth(admin, wfirma.config, invoices, requestedMonth, lookupErrors, recoveryCandidates);
  const paid: PaidInvoice[] = [];
  const failed: FailedInvoice[] = [];
  const refreshed: { invoiceId: string; number: string | null; pdf: boolean }[] = [];

  for (const invoice of invoices) {
    const wfirmaId = stringify(invoice.wfirma_id);
    const baseResult = { invoiceId: invoice.id, number: invoice.numer, wfirmaId };

    try {
      let wfirmaInvoice = wfirmaInvoicesById.get(wfirmaId);
      if (payload.confirmedReplacement?.invoiceId === invoice.id) {
        wfirmaInvoice = await loadConfirmedReplacement(admin, wfirma.config, invoice, payload.confirmedReplacement);
      } else if (recoveryCandidates.get(wfirmaId)?.length) {
        throw new Error("Wybierz fakturę wystawioną w miejsce tego dokumentu.");
      }
      if (!wfirmaInvoice) throw new Error(lookupErrors.get(wfirmaId) || "Nie znaleziono faktury w wFirmie. Jeśli szkic został wystawiony pod nowym numerem, trzeba potwierdzić numer dokumentu docelowego.");

      if (requestedMonth || requestedInvoiceIds.length > 0) {
        const syncResult = await syncWfirmaInvoiceSnapshot(admin, wfirma.config, invoice, wfirmaInvoice, resolveBankAccount);
        wfirmaInvoice = syncResult.remoteInvoice;
        if (syncResult.updatedNumber || syncResult.savedPdf) {
          refreshed.push({ invoiceId: invoice.id, number: syncResult.invoiceNumber, pdf: syncResult.savedPdf });
        }
      }

      if (!isPaidInvoice(wfirmaInvoice)) {
        await admin
          .from("faktury")
          .update({
            wfirma_synced_at: new Date().toISOString(),
            wfirma_sync_error: null,
          })
          .eq("id", invoice.id);
        continue;
      }

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
      failed.push({ ...baseResult, error: message, candidates: recoveryCandidates.get(wfirmaId) });
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
    refreshed,
    paid,
    failed,
  });
}

async function loadWfirmaInvoicesByMonth(
  admin: SupabaseClient,
  config: Parameters<typeof findWfirmaInvoices>[0]["config"],
  invoices: InvoiceRow[],
  requestedMonth: string | null,
  lookupErrors = new Map<string, string>(),
  recoveryCandidates?: Map<string, RecoveryCandidate[]>
) {
  let listingError: string | null = null;
  const months = syncSearchMonths(invoices, requestedMonth);
  const invoicesById = new Map<string, WfirmaInvoice>();
  const requestedWfirmaIds = new Set(invoices.map((invoice) => stringify(invoice.wfirma_id)).filter(Boolean));

  for (const month of months) {
    if (hasAllRequestedInvoices(invoicesById, requestedWfirmaIds)) break;
    const range = monthRange(month);
    let page = 1;
    const limit = 100;

    while (page <= 20) {
      try {
        const response = await retryWfirmaRead(() => findWfirmaInvoices({
          config,
          dateFrom: range.dateFrom,
          dateTo: range.dateTo,
          page,
          limit,
        }));
        const wfirmaInvoices = extractWfirmaInvoices(response);
        for (const invoice of wfirmaInvoices) {
          if (isCorrectionInvoice(invoice)) continue;
          const id = stringify(invoice.id);
          if (id) invoicesById.set(id, invoice);
        }
        if (hasAllRequestedInvoices(invoicesById, requestedWfirmaIds)) break;
        if (wfirmaInvoices.length < limit) break;
      } catch (error) {
        listingError = error instanceof Error ? error.message : "Nieznany błąd odczytu listy faktur.";
        console.error("Nie udało się pobrać faktur z wFirmy dla miesiąca.", {
          month,
          page,
          error: error instanceof Error ? error.message : error,
        });
        break;
      }
      page += 1;
    }
  }

  const reservedIds = new Set(invoices.map(invoice => stringify(invoice.wfirma_id)).filter(Boolean));
  for (const invoice of invoices) {
    const wfirmaId = stringify(invoice.wfirma_id);
    // Read this exact ID before resolving a formerly saved draft.
    let currentMatch = invoicesById.get(wfirmaId);
    if (!currentMatch || isDraftInvoiceNumber(currentMatch)) {
      try {
        const direct = firstWfirmaInvoice(await retryWfirmaRead(() => getWfirmaInvoice(config, wfirmaId)));
        if (direct && stringify(direct.id) === wfirmaId) {
          currentMatch = direct;
          invoicesById.set(wfirmaId, direct);
        }
      } catch (error) {
        lookupErrors.set(wfirmaId, `Nie udało się odczytać faktury z wFirmy: ${error instanceof Error ? error.message : "Nieznany błąd połączenia."}`);
      }
    }
    if (currentMatch && !isDraftInvoiceNumber(currentMatch)) continue;
    const replacement = findMatchingFinalWfirmaInvoice(invoice, Array.from(invoicesById.values()), reservedIds);
    if (!replacement) {
      if (recoveryCandidates) {
        const possible = Array.from(invoicesById.values()).filter(candidate => isRecoveryCandidate(invoice, candidate) && !reservedIds.has(stringify(candidate.id)));
        if (possible.length) {
          const occupied = await admin.from("faktury").select("wfirma_id").in("wfirma_id", possible.map(candidate => stringify(candidate.id))).neq("id", invoice.id);
          if (!occupied.error) {
            const used = new Set((occupied.data || []).map(row => stringify(row.wfirma_id)));
            recoveryCandidates.set(wfirmaId, possible.filter(candidate => !used.has(stringify(candidate.id))).map(candidate => ({
              wfirmaId: stringify(candidate.id), number: stringify(candidate.fullnumber || candidate.number),
              date: dateOnly(candidate.date), gross: numberValue(candidate.total_composed ?? candidate.total), nip: normalizeNip(wfirmaInvoiceContractorNip(candidate)),
            })));
          }
        }
      }
      if (!currentMatch && listingError) lookupErrors.set(wfirmaId, `Nie udało się przeszukać faktur w wFirmie: ${listingError}`);
      continue;
    }
    const nextId = stringify(replacement.id);
    const occupied = await admin.from("faktury").select("id").eq("wfirma_id", nextId).neq("id", invoice.id).maybeSingle();
    if (occupied.error || occupied.data) continue;
    invoicesById.set(wfirmaId, replacement);
    reservedIds.add(nextId);
  }

  return invoicesById;
}


async function retryWfirmaRead<T>(read: () => Promise<T>, pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await read(); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const httpStatus = Number((error as { httpStatus?: number } | null)?.httpStatus);
      const transientStatus = httpStatus === 429 || httpStatus >= 500 && httpStatus <= 599;
      if (attempt >= 2 || (!transientStatus && !/fetch failed|network|timed? ?out|timeout|ECONNRESET|EAI_AGAIN|wFirma (429|50[0234])\b/i.test(message))) throw error;
      await pause(attempt === 0 ? 400 : 1200);
    }
  }
}

function isRecoveryCandidate(invoice: InvoiceRow, candidate: WfirmaInvoice) {
  const nip = normalizeNip(invoice.kontrahent_nip);
  const month = dateOnly(candidate.date)?.slice(0, 7);
  return Boolean(nip && stringify(candidate.id) && stringify(candidate.fullnumber || candidate.number)
    && normalizeNip(wfirmaInvoiceContractorNip(candidate)) === nip
    && !isDraftInvoiceNumber(candidate) && !isCorrectionInvoice(candidate)
    && month && syncSearchMonths([invoice], null).includes(month));
}

async function loadConfirmedReplacement(admin: SupabaseClient, config: Parameters<typeof getWfirmaInvoice>[0], invoice: InvoiceRow, confirmation: ConfirmedReplacement) {
  if (confirmation.previousWfirmaId !== stringify(invoice.wfirma_id) || !/^\d+$/.test(confirmation.wfirmaId)) {
    throw new Error("Powiązanie faktury zmieniło się. Odśwież listę i wybierz ponownie.");
  }
  const candidate = firstWfirmaInvoice(await retryWfirmaRead(() => getWfirmaInvoice(config, confirmation.wfirmaId)));
  if (!candidate || stringify(candidate.id) !== confirmation.wfirmaId || !isRecoveryCandidate(invoice, candidate)) {
    throw new Error("Wybrana faktura nie pasuje do kontrahenta lub okresu tego dokumentu.");
  }
  const occupied = await admin.from("faktury").select("id").eq("wfirma_id", confirmation.wfirmaId).neq("id", invoice.id).maybeSingle();
  if (occupied.error) throw new Error("Nie udało się sprawdzić powiązania faktury. Spróbuj ponownie.");
  if (occupied.data) throw new Error("Wybrana faktura jest już powiązana z innym dokumentem w aplikacji.");
  return candidate;
}

function syncSearchMonths(invoices: InvoiceRow[], requestedMonth: string | null) {
  const months = new Set<string>();
  if (requestedMonth) {
    addMonthWithNeighbours(months, requestedMonth);
  }

  for (const invoice of invoices) {
    const issueMonth = dateOnly(invoice.data_wystawienia)?.slice(0, 7);
    const periodMonth = dateOnly(invoice.okres)?.slice(0, 7);
    if (requestedMonth) {
      if (issueMonth) addMonthWithNeighbours(months, issueMonth);
      if (periodMonth) addMonthWithNeighbours(months, periodMonth);
    } else {
      if (issueMonth) addMonthWithNeighbours(months, issueMonth);
      else if (periodMonth) addMonthWithNeighbours(months, periodMonth);
    }
  }

  return [...months].filter(isValidMonth);
}

function hasAllRequestedInvoices(invoicesById: Map<string, WfirmaInvoice>, requestedWfirmaIds: Set<string>) {
  if (requestedWfirmaIds.size === 0) return true;
  return [...requestedWfirmaIds].every((wfirmaId) => invoicesById.has(wfirmaId));
}

function addMonthWithNeighbours(months: Set<string>, month: string) {
  months.add(month);
  months.add(shiftMonth(month, -1));
  months.add(shiftMonth(month, 1));
}

function findMatchingFinalWfirmaInvoice(invoice: InvoiceRow, candidates: WfirmaInvoice[], reservedWfirmaIds: Set<string>) {
  const nip = normalizeNip(invoice.kontrahent_nip);
  if (!nip) return null;
  const number = stringify(invoice.numer).trim();
  const isDraft = !number || number.toUpperCase().startsWith("WRF");
  const matches = candidates.filter(candidate => {
    const id = stringify(candidate.id);
    if (!id || reservedWfirmaIds.has(id) || isDraftInvoiceNumber(candidate) || isCorrectionInvoice(candidate)
      || normalizeNip(wfirmaInvoiceContractorNip(candidate)) !== nip) return false;
    if (!isDraft) return stringify(candidate.fullnumber || candidate.number).trim() === number;
    const issueDate = dateOnly(invoice.data_wystawienia);
    const gross = numberValue(candidate.total_composed ?? candidate.total);
    return Boolean(issueDate && issueDate === dateOnly(candidate.date))
      && numberValue(invoice.kwota_brutto) > 0 && Math.abs(gross - numberValue(invoice.kwota_brutto)) < 0.02;
  });
  return matches.length === 1 ? matches[0] : null;
}

function isDraftInvoiceNumber(invoice: WfirmaInvoice) {
  const number = stringify(invoice.fullnumber || invoice.number).toUpperCase();
  return normalizeText(invoice.type).includes("draft") || number.startsWith("WRF");
}

function isCorrectionInvoice(invoice: WfirmaInvoice) {
  const type = normalizeText(invoice.type);
  const number = stringify(invoice.fullnumber || invoice.number).toUpperCase();
  return type.includes("correction") || type.includes("korekt") || number.startsWith("FK");
}

function wfirmaInvoiceContractorNip(invoice: WfirmaInvoice) {
  const direct = stringify(invoice.contractor_nip || invoice.contractor_tax_id || invoice.contractor?.nip || invoice.contractor?.tax_id);
  if (direct) return direct;
  return firstNestedValue(invoice, /(^|_)(nip|tax_id)$/i);
}

function firstNestedValue(value: unknown, keyPattern: RegExp): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstNestedValue(item, keyPattern);
      if (found) return found;
    }
    return "";
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keyPattern.test(key)) {
      const text = stringify(child);
      if (text) return text;
    }
    const nested = firstNestedValue(child, keyPattern);
    if (nested) return nested;
  }

  return "";
}

async function authorizeSync(request: NextRequest) {
  const secretResult = validateSyncSecret(request);
  if (secretResult === true) return null;
  if (secretResult) return secretResult;

  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do sprawdzania płatności w wFirmie.");
  return auth.error;
}

async function syncWfirmaInvoiceSnapshot(
  admin: SupabaseClient,
  config: Parameters<typeof findWfirmaInvoices>[0]["config"],
  invoice: InvoiceRow,
  wfirmaInvoice: WfirmaInvoice,
  resolveBankAccount: () => Promise<RequiredInvoiceBankAccount>
) {
  const wfirmaId = stringify(invoice.wfirma_id);
  // Monthly listings are not a complete detail snapshot after external edits.
  const detailId = stringify(wfirmaInvoice.id) || wfirmaId;
  const detail = firstWfirmaInvoice(await retryWfirmaRead(() => getWfirmaInvoice(config, detailId)));
  if (!detail || stringify(detail.id) !== detailId) throw new Error("wFirma nie zwróciła szczegółów tej faktury. Zachowano dotychczasowe dane.");
  wfirmaInvoice = detail;
  if (isWfirmaDraft(wfirmaInvoice)) {
    wfirmaInvoice = await ensureDraftInvoiceBankAccount(config, stringify(wfirmaInvoice.id) || wfirmaId, await resolveBankAccount());
  }
  const nextWfirmaId = stringify(wfirmaInvoice.id) || wfirmaId;
  if (nextWfirmaId !== wfirmaId && !isRecoveryCandidate(invoice, wfirmaInvoice)) {
    throw new Error("Dane wybranej faktury zmieniły się. Odśwież listę i wybierz ponownie.");
  }
  const invoiceNumber = stringify(wfirmaInvoice.fullnumber || wfirmaInvoice.number) || invoice.numer;
  const issueDate = dateOnly(wfirmaInvoice.date);
  const saleDate = dateOnly(wfirmaInvoice.disposaldate);
  const paymentDate = dateOnly(wfirmaInvoice.payment_date);
  const finalPaymentDate = specialInvoicePaymentDate(invoice, issueDate) || paymentDate;
  const { net, tax, gross } = wfirmaInvoiceAmounts(wfirmaInvoice);
  const lines = extractWfirmaInvoiceLines(wfirmaInvoice);
  if (lines.length === 0 && (net !== 0 || gross !== 0)) throw new Error("wFirma nie zwróciła pozycji faktury. Zachowano dotychczasowe szczegóły.");
  const totals = lines.reduce<{ net: number; tax: number; gross: number }>((sum, line) => {
    const value = wfirmaLineAmounts(line);
    return { net: sum.net + value.net, tax: sum.tax + value.tax, gross: sum.gross + value.gross };
  }, { net: 0, tax: 0, gross: 0 });
  if (![net, tax, gross, totals.net, totals.tax, totals.gross].every(Number.isFinite)
    || Math.abs(totals.net - net) > 0.021 || Math.abs(totals.tax - tax) > 0.021 || Math.abs(totals.gross - gross) > 0.021) {
    throw new Error("Kwoty i pozycje z wFirmy są niespójne. Zachowano dotychczasową fakturę; spróbuj odświeżyć ponownie.");
  }
  const updatedNumber = Boolean(invoiceNumber && invoiceNumber !== invoice.numer);
  let pdfResult: { path: string | null; name: string | null; error: string | null } | null = null;

  if (nextWfirmaId && !isDraftInvoiceNumber(wfirmaInvoice)) {
    pdfResult = await saveWfirmaInvoicePdf({
      admin,
      invoiceId: invoice.id,
      invoiceNumber,
      wfirmaId: nextWfirmaId,
      config,
    });
  }

  const updatePayload: Record<string, unknown> = {
    expected_wfirma_id: wfirmaId,
    wfirma_synced_at: new Date().toISOString(),
    opis: stringify(wfirmaInvoice.description) || null,
  };

  if (updatedNumber) updatePayload.numer = invoiceNumber;
  if (nextWfirmaId && nextWfirmaId !== wfirmaId) updatePayload.wfirma_id = nextWfirmaId;
  if (wfirmaInvoice.hash) updatePayload.wfirma_url = `https://wfirma.pl/faktury/podglad/${wfirmaInvoice.hash}`;
  if (issueDate) updatePayload.data_wystawienia = issueDate;
  if (saleDate) updatePayload.data_sprzedazy = saleDate;
  if (finalPaymentDate) updatePayload.termin_platnosci = finalPaymentDate;
  updatePayload.kwota_netto = net;
  updatePayload.kwota_vat = tax;
  updatePayload.kwota_brutto = gross;

  if (pdfResult?.path) {
    updatePayload.wfirma_pdf_path = pdfResult.path;
    updatePayload.wfirma_pdf_name = pdfResult.name;
    updatePayload.wfirma_pdf_synced_at = new Date().toISOString();
    updatePayload.wfirma_sync_error = null;
  } else if (pdfResult?.error) {
    throw new Error(`Nie udało się pobrać aktualnego PDF z wFirmy. Zachowano dotychczasową fakturę: ${pdfResult.error}`);
  }

  await replaceInvoiceLines(admin, invoice.id, lines, updatePayload);

  return {
    invoiceNumber,
    updatedNumber,
    savedPdf: Boolean(pdfResult?.path),
    remoteInvoice: wfirmaInvoice,
  };
}

function specialInvoicePaymentDate(invoice: InvoiceRow, syncedIssueDate?: string | null) {
  const nip = normalizeNip(invoice.kontrahent_nip);
  const issueDate = dateOnly(syncedIssueDate) || dateOnly(invoice.data_wystawienia);
  if (!issueDate || !["5273158702", "5273221116"].includes(nip)) return null;

  const issueMonthDate = new Date(`${issueDate.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(issueMonthDate.getTime())) return null;

  const dueDate = new Date(Date.UTC(issueMonthDate.getUTCFullYear(), issueMonthDate.getUTCMonth() + 1, 14));
  return dueDate.toISOString().slice(0, 10);
}


async function saveWfirmaInvoicePdf(params: {
  admin: SupabaseClient;
  invoiceId: string;
  invoiceNumber: string | null;
  wfirmaId: string;
  config: Parameters<typeof downloadWfirmaInvoicePdf>[0];
}) {
  try {
    const pdf = await retryWfirmaRead(() => downloadWfirmaInvoicePdf(params.config, params.wfirmaId));
    const name = buildInvoicePdfName(params.invoiceNumber, params.wfirmaId);
    const path = `${params.invoiceId}/${Date.now()}-${name}`;
    const upload = await params.admin.storage.from(INVOICE_PDF_BUCKET).upload(path, pdf, {
      contentType: "application/pdf",
      upsert: true,
    });

    if (upload.error) throw upload.error;
    return { path, name, error: null as string | null };
  } catch (error) {
    return { path: null, name: null, error: error instanceof Error ? error.message : "Nieznany błąd pobierania PDF." };
  }
}

async function replaceInvoiceLines(
  admin: SupabaseClient,
  invoiceId: string,
  lines: WfirmaInvoiceLine[],
  header: Record<string, unknown>
) {
  const records = lines.map((line, index) => {
    const { net, tax, gross } = wfirmaLineAmounts(line);
    return {
      faktura_id: invoiceId,
      source_key: stringify(line.id) ? `wfirma:${stringify(line.id)}` : `wfirma-index:${index + 1}`,
      nazwa: stringify(line.name) || "Pozycja faktury",
      ilosc: numberValue(line.count) || 1,
      jednostka: stringify(line.unit) || "szt.",
      cena_netto: numberValue(line.price) || net,
      stawka_vat: stringify(line.vat) || "23%",
      kwota_netto: net,
      kwota_vat: tax,
      kwota_brutto: gross,
      sort_order: index,
    };
  });

  const { error } = await admin.rpc("sync_wfirma_invoice_snapshot", {
    public_invoice_id: invoiceId,
    public_lines: records,
    public_header: header,
  });
  if (error) throw new Error(error.code === "23505"
    ? "Ta faktura wFirmy jest już powiązana z inną fakturą w aplikacji. Zachowano dotychczasowe dane."
    : `Nie udało się odświeżyć faktury z wFirmy: ${error.message}`);
}

async function syncPayload(request: NextRequest) {
  try {
    return (await request.json()) as SyncPayload;
  } catch {
    return {};
  }
}

function syncMonth(request: NextRequest, payload: SyncPayload) {
  const queryMonth = request.nextUrl.searchParams.get("month")?.trim();
  if (isValidMonth(queryMonth)) return queryMonth || null;

  const bodyMonth = stringify(payload.month);
  return isValidMonth(bodyMonth) ? bodyMonth : null;
}

function syncInvoiceIds(payload: SyncPayload) {
  return Array.isArray(payload.invoiceIds)
    ? payload.invoiceIds.filter((id) => /^[0-9a-f-]{36}$/i.test(stringify(id)))
    : [];
}

function isValidMonth(value: string | null | undefined) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value || "");
}

function validateSyncSecret(request: NextRequest) {
  const expected = process.env.WFIRMA_PAYMENT_SYNC_SECRET?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  const provided = headerSecret || querySecret;

  if (!provided) return null;

  if (!expected) {
    return NextResponse.json({ error: "Brak WFIRMA_PAYMENT_SYNC_SECRET w konfiguracji aplikacji." }, { status: 500 });
  }

  if (provided !== expected) {
    return NextResponse.json({ error: "Brak dostępu do nocnego sprawdzania płatności." }, { status: 401 });
  }

  return true;
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
    ...collectPaymentValues(invoice),
  ].map(normalizeText);

  if (values.some((value) => PAID_VALUES.has(value))) return true;
  if (values.some((value) => UNPAID_VALUES.has(value))) return false;

  return false;
}

function collectPaymentValues(value: unknown, path: string[] = []): unknown[] {
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPaymentValues(item, [...path, String(index)]));
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const currentPath = [...path, key];
    const normalizedPath = normalizeText(currentPath.join("_"));
    const direct = /payment|paid|platnosc|płatność|oplac|opłac|zaplac|zapłac|settle/.test(normalizedPath)
      ? [child]
      : [];
    return [...direct, ...collectPaymentValues(child, currentPath)];
  });
}

function normalizeText(value: unknown) {
  return stringify(value).toLowerCase();
}

function normalizeNip(value: unknown) {
  return stringify(value).replace(/\D/g, "");
}

function numberValue(value: unknown) {
  const parsed = Number(stringify(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: unknown) {
  const text = stringify(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}


function monthRange(month: string) {
  const dateFrom = `${month}-01`;
  const nextMonth = new Date(`${dateFrom}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const dateTo = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { dateFrom, dateTo };
}

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function buildInvoicePdfName(invoiceNumber: string | null, wfirmaId: string) {
  const base = sanitizeFileNamePart(invoiceNumber || `wfirma-${wfirmaId}`);
  return `${base || "faktura"}.pdf`;
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

function stringify(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
