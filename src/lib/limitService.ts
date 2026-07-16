import { supabase } from "@/lib/supabaseClient";

export type LimitType = "vat" | "wnt" | "kasa_fiskalna";

export type LimitRegisterRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  typ: LimitType;
  limit_roczny: number | string;
  uwagi: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type LimitMonthlyRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  limit_id: string;
  rok: number;
  miesiac: number;
  kwota: number | string;
  updated_by: string | null;
};

const DEFAULT_ANNUAL_LIMITS: Record<LimitType, number> = {
  vat: 240000,
  wnt: 0,
  kasa_fiskalna: 0,
};

export async function fetchLimitRegisters() {
  return supabase
    .from("limity_rejestry")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function fetchLimitMonthlyRecords(year: number) {
  return supabase
    .from("limity_miesieczne")
    .select("*")
    .eq("rok", year)
    .order("miesiac", { ascending: true });
}

export async function addClientToLimit(clientId: string, type: LimitType) {
  const userId = (await supabase.auth.getUser()).data.user?.id || null;
  return supabase
    .from("limity_rejestry")
    .insert({
      klient_id: clientId,
      typ: type,
      limit_roczny: DEFAULT_ANNUAL_LIMITS[type],
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();
}

export async function updateLimitRegister(id: string, values: { limit_roczny: number; uwagi?: string | null }) {
  const userId = (await supabase.auth.getUser()).data.user?.id || null;
  return supabase
    .from("limity_rejestry")
    .update({
      ...values,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
}

export async function upsertMonthlyLimitAmount(limitId: string, year: number, month: number, amount: number) {
  const userId = (await supabase.auth.getUser()).data.user?.id || null;
  return supabase
    .from("limity_miesieczne")
    .upsert({
      limit_id: limitId,
      rok: year,
      miesiac: month,
      kwota: amount,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "limit_id,rok,miesiac" })
    .select("*")
    .single();
}
