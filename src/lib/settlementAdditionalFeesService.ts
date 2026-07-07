import { supabase } from "@/lib/supabaseClient";

export type AdditionalFeeDefinition = {
  id: string;
  created_at: string;
  updated_at: string;
  nazwa: string;
  domyslna_kwota_netto: number;
  opis: string | null;
  aktywna: boolean;
};

export type SettlementAdditionalFee = {
  id: string;
  created_at: string;
  rozliczenie_id: string;
  oplata_id: string | null;
  nazwa: string;
  kwota_netto: number;
  ilosc: number;
  uwagi: string | null;
};

export type AdditionalFeeDefinitionPayload = {
  nazwa: string;
  domyslna_kwota_netto: number;
  opis?: string | null;
  aktywna?: boolean;
};

export type SettlementAdditionalFeePayload = {
  rozliczenie_id: string;
  oplata_id?: string | null;
  nazwa: string;
  kwota_netto: number;
  ilosc?: number;
  uwagi?: string | null;
};

type LateDocumentsFeeClient = {
  abonament?: number | string | null;
  model_fakturowania?: string | null;
};

export type LateDocumentsFeeSettlement = {
  id: string;
  okres: string;
  data_dostarczenia_dokumentow?: string | null;
  klienci?: LateDocumentsFeeClient | LateDocumentsFeeClient[] | null;
};

const LATE_DOCUMENTS_FEE_NAME = "Opłata za nieterminowe dostarczenie dokumentów";
const LATE_DOCUMENTS_FEE_NOTE = "Automatyczna opłata: dokumenty dostarczone po 7. dniu miesiąca.";

export async function fetchAdditionalFeeDefinitions(includeInactive = false) {
  let query = supabase
    .from("oplaty_dodatkowe")
    .select("*")
    .order("aktywna", { ascending: false })
    .order("nazwa", { ascending: true });

  if (!includeInactive) query = query.eq("aktywna", true);
  return query;
}

export async function createAdditionalFeeDefinition(payload: AdditionalFeeDefinitionPayload) {
  return supabase
    .from("oplaty_dodatkowe")
    .insert(payload)
    .select("*")
    .single<AdditionalFeeDefinition>();
}

export async function updateAdditionalFeeDefinition(feeId: string, payload: Partial<AdditionalFeeDefinitionPayload>) {
  return supabase
    .from("oplaty_dodatkowe")
    .update(payload)
    .eq("id", feeId)
    .select("*")
    .single<AdditionalFeeDefinition>();
}

export async function deleteAdditionalFeeDefinition(feeId: string) {
  return supabase
    .from("oplaty_dodatkowe")
    .delete()
    .eq("id", feeId);
}

export async function fetchSettlementAdditionalFees(settlementId: string) {
  return supabase
    .from("rozliczenia_oplaty_dodatkowe")
    .select("*")
    .eq("rozliczenie_id", settlementId)
    .order("created_at", { ascending: true });
}

export async function fetchLateDocumentsFeeSettlement(settlementId: string) {
  return supabase
    .from("rozliczenia_miesieczne")
    .select("id, okres, data_dostarczenia_dokumentow, klienci(abonament, model_fakturowania)")
    .eq("id", settlementId)
    .single<LateDocumentsFeeSettlement>();
}

export async function createSettlementAdditionalFee(payload: SettlementAdditionalFeePayload) {
  return supabase
    .from("rozliczenia_oplaty_dodatkowe")
    .insert({ ...payload, ilosc: payload.ilosc ?? 1 })
    .select("*")
    .single<SettlementAdditionalFee>();
}

export async function updateSettlementAdditionalFee(feeId: string, payload: Partial<SettlementAdditionalFeePayload>) {
  return supabase
    .from("rozliczenia_oplaty_dodatkowe")
    .update(payload)
    .eq("id", feeId)
    .select("*")
    .single<SettlementAdditionalFee>();
}

export async function deleteSettlementAdditionalFee(feeId: string) {
  return supabase
    .from("rozliczenia_oplaty_dodatkowe")
    .delete()
    .eq("id", feeId);
}

export async function syncLateDocumentsAdditionalFee(settlement: LateDocumentsFeeSettlement) {
  const client = getLateDocumentsFeeClient(settlement.klienci);
  const existingResult = await supabase
    .from("rozliczenia_oplaty_dodatkowe")
    .select("*")
    .eq("rozliczenie_id", settlement.id)
    .eq("nazwa", LATE_DOCUMENTS_FEE_NAME);

  if (existingResult.error) return existingResult;

  const existingFees = ((existingResult.data || []) as SettlementAdditionalFee[])
    .filter((fee) => (fee.uwagi || "").startsWith("Automatyczna opłata"));
  const mainFee = existingFees[0] || null;
  const duplicateFees = existingFees.slice(1);

  if (duplicateFees.length > 0) {
    await Promise.all(duplicateFees.map((fee) => deleteSettlementAdditionalFee(fee.id)));
  }

  const shouldApply = shouldApplyLateDocumentsFee(settlement, client);
  if (!shouldApply) {
    if (mainFee) return deleteSettlementAdditionalFee(mainFee.id);
    return { data: null, error: null };
  }

  const amount = calculateLateDocumentsFeeAmount(client?.abonament);
  const payload = {
    rozliczenie_id: settlement.id,
    oplata_id: null,
    nazwa: LATE_DOCUMENTS_FEE_NAME,
    kwota_netto: amount,
    ilosc: 1,
    uwagi: LATE_DOCUMENTS_FEE_NOTE,
  };

  if (mainFee) {
    return updateSettlementAdditionalFee(mainFee.id, payload);
  }

  return createSettlementAdditionalFee(payload);
}

function shouldApplyLateDocumentsFee(settlement: LateDocumentsFeeSettlement, client: LateDocumentsFeeClient | null) {
  if (!client || client.model_fakturowania !== "z_gory") return false;
  const deliveredAt = toDate(settlement.data_dostarczenia_dokumentow);
  const dueAt = documentsDueDate(settlement.okres);
  if (!deliveredAt || !dueAt) return false;
  return deliveredAt.getTime() > dueAt.getTime();
}

function calculateLateDocumentsFeeAmount(subscription: number | string | null | undefined) {
  const subscriptionValue = Number(subscription || 0);
  return Math.max(150, Math.round(subscriptionValue * 0.1 * 100) / 100);
}

function getLateDocumentsFeeClient(client: LateDocumentsFeeSettlement["klienci"]) {
  if (Array.isArray(client)) return client[0] || null;
  return client || null;
}

function documentsDueDate(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return null;
  return new Date(year, month, 7, 12, 0, 0, 0);
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
