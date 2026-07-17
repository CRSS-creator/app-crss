import { supabase } from "@/lib/supabaseClient";

export type PayrollA1Record = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string;
  data_uzyskania_a1: string | null;
  data_konca_a1: string | null;
  procent_przychodow_zagranicznych: number | string;
  uwagi: string | null;
  created_by: string | null;
  updated_by: string | null;
};

export type PayrollA1MonthlyRevenue = {
  id: string;
  created_at: string;
  updated_at: string;
  a1_id: string;
  rok: number;
  miesiac: number;
  przychod_krajowy: number | string;
  przychod_zagraniczny: number | string;
  updated_by: string | null;
};

export type PayrollA1UpdatePayload = {
  data_uzyskania_a1?: string | null;
  data_konca_a1?: string | null;
  procent_przychodow_zagranicznych?: number;
  uwagi?: string | null;
};

export type PayrollA1MonthlyRevenuePayload = {
  a1_id: string;
  rok: number;
  miesiac: number;
  przychod_krajowy: number;
  przychod_zagraniczny: number;
};

export async function fetchPayrollA1Records() {
  return supabase
    .from("kadry_a1")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function fetchPayrollA1MonthlyRevenues() {
  return supabase
    .from("kadry_a1_przychody_miesieczne")
    .select("*")
    .order("rok", { ascending: true })
    .order("miesiac", { ascending: true });
}

export async function addClientToPayrollA1(clientId: string) {
  const userId = (await supabase.auth.getUser()).data.user?.id || null;
  return supabase
    .from("kadry_a1")
    .insert({
      klient_id: clientId,
      created_by: userId,
      updated_by: userId,
    })
    .select("*")
    .single();
}

export async function updatePayrollA1Record(id: string, values: PayrollA1UpdatePayload) {
  const userId = (await supabase.auth.getUser()).data.user?.id || null;
  return supabase
    .from("kadry_a1")
    .update({
      ...values,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
}

export async function upsertPayrollA1MonthlyRevenue(payload: PayrollA1MonthlyRevenuePayload) {
  const userId = (await supabase.auth.getUser()).data.user?.id || null;
  return supabase
    .from("kadry_a1_przychody_miesieczne")
    .upsert({
      ...payload,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "a1_id,rok,miesiac" })
    .select("*")
    .single();
}
