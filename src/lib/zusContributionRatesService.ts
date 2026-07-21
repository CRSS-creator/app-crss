import { supabase } from "@/lib/supabaseClient";

export type ZusContributionRate = {
  id: string;
  created_at: string;
  updated_at: string;
  rok: number;
  schemat_zus: string;
  skladka_miesieczna: number | string;
  uwagi: string | null;
  updated_by: string | null;
};

export async function fetchZusContributionRates(year: number) {
  return supabase
    .from("zus_przedsiebiorcy_skladki")
    .select("*")
    .eq("rok", year)
    .order("schemat_zus", { ascending: true });
}

export async function upsertZusContributionRate(year: number, scheme: string, monthlyAmount: number, notes?: string | null) {
  const userId = (await supabase.auth.getUser()).data.user?.id || null;
  return supabase
    .from("zus_przedsiebiorcy_skladki")
    .upsert({
      rok: year,
      schemat_zus: scheme,
      skladka_miesieczna: monthlyAmount,
      uwagi: notes?.trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "rok,schemat_zus" })
    .select("*")
    .single();
}
