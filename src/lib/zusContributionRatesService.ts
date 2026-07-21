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

export type ZusPreferenceNotificationHistory = {
  id: string;
  created_at: string;
  klient_id: string;
  recipient_email: string;
  subject: string;
  message: string;
  html: string | null;
  schemat_zus: string | null;
  nastepny_schemat_zus: string | null;
  data_konca_ulgi: string | null;
  miesiac_od: string | null;
  rok_skladki: number | null;
  skladka_miesieczna: number | string | null;
  sent_by: string | null;
  sent_by_name: string | null;
  sent_by_email: string | null;
  metadata: Record<string, unknown>;
};

export type ZusContributionRateHistory = {
  id: string;
  created_at: string;
  skladka_id: string | null;
  operacja: "insert" | "update" | "snapshot";
  rok: number;
  schemat_zus: string;
  poprzednia_skladka_miesieczna: number | string | null;
  skladka_miesieczna: number | string;
  poprzednie_uwagi: string | null;
  uwagi: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  metadata: Record<string, unknown>;
};

export async function fetchZusContributionRates(year: number) {
  return supabase
    .from("zus_przedsiebiorcy_skladki")
    .select("*")
    .eq("rok", year)
    .order("schemat_zus", { ascending: true });
}

export async function fetchZusContributionRateHistory(year?: number) {
  let query = supabase
    .from("zus_przedsiebiorcy_skladki_historia")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (year) query = query.eq("rok", year);
  return query;
}

export async function fetchZusPreferenceNotificationHistory() {
  return supabase
    .from("kadry_zus_preferencja_powiadomienia_historia")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
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

export async function sendZusPreferenceClientNotifications(clientIds: string[]) {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  if (!token) {
    return { data: null, error: new Error("Brak aktywnej sesji.") };
  }

  try {
    const response = await fetch("/api/kadry/zus-preferences/send-client-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clientIds }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { data: null, error: new Error(payload?.error || "Nie udało się wysłać powiadomień ZUS do klientów.") };
    }

    return { data: payload, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Nie udało się połączyć z wysyłką powiadomień ZUS."),
    };
  }
}
