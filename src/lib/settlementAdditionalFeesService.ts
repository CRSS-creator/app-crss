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
