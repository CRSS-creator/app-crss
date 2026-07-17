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

export type PayrollA1NotificationHistory = {
  id: string;
  created_at: string;
  a1_id: string;
  klient_id: string;
  recipient_email: string;
  subject: string;
  message: string;
  html: string | null;
  sent_by: string | null;
  sent_by_name: string | null;
  sent_by_email: string | null;
  metadata: Record<string, unknown>;
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

export async function fetchPayrollA1NotificationHistory(a1Id: string) {
  return supabase
    .from("kadry_a1_powiadomienia_historia")
    .select("*")
    .eq("a1_id", a1Id)
    .order("created_at", { ascending: false })
    .limit(100);
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

export async function sendPayrollA1ClientNotification(a1Id: string) {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  if (!token) {
    return { data: null, error: new Error("Brak aktywnej sesji.") };
  }

  try {
    const response = await fetch("/api/kadry/a1/send-client-notification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ a1Id }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { data: null, error: new Error(payload?.error || "Nie udało się wysłać powiadomienia A1 do klienta.") };
    }

    return { data: payload, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Nie udało się połączyć z wysyłką powiadomienia A1."),
    };
  }
}
