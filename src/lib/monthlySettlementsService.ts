import { supabase } from "@/lib/supabaseClient";

export type SettlementStatus =
  | "czeka_na_dokumenty"
  | "dokumenty_kompletne_biuro"
  | "w_trakcie_ksiegowania"
  | "do_sprawdzenia"
  | "sprawdzone_zatwierdzone"
  | "podatki_wyslane";

type SettlementClientProfile = {
  full_name: string | null;
  email: string | null;
};

type SettlementClient = {
  id?: string;
  nazwa: string | null;
  nip: string | null;
  email: string | null;
  opiekun_id: string | null;
  abonament: number | null;
  model_fakturowania: string | null;
  forma_prawna: string | null;
  forma_opodatkowania: string | null;
  czynny_vat: boolean | null;
  vat_ue: boolean | null;
  obsluga_kadrowa: boolean | null;
  profiles?: SettlementClientProfile | SettlementClientProfile[] | null;
};

export type MonthlySettlement = {
  id: string;
  created_at: string;
  klient_id: string;
  okres: string;
  status_ksiegowosci: SettlementStatus;
  liczba_dokumentow: number;
  liczba_pracownikow: number;
  liczba_zleceniobiorcow: number;
  data_dostarczenia_dokumentow: string | null;
  przypomnienie_dokumenty_wyslane_at: string | null;
  przypomnienie_dokumenty_wyslane_przez: string | null;
  przypomnienie_dokumenty_wyslane_przez_nazwa: string | null;
  uwagi: string | null;
  klienci?: SettlementClient | SettlementClient[] | null;
};

export type SettlementUpdatePayload = {
  status_ksiegowosci?: SettlementStatus;
  liczba_dokumentow?: number;
  liczba_pracownikow?: number;
  liczba_zleceniobiorcow?: number;
  data_dostarczenia_dokumentow?: string | null;
  uwagi?: string | null;
};

export type SettlementProgress = {
  rozliczenie_id: string;
  total_tasks: number;
  done_tasks: number;
  progress: number;
};

const SETTLEMENT_SELECT = `
  *,
  klienci!rozliczenia_miesieczne_klient_id_fkey (
    id,
    nazwa,
    nip,
    email,
    opiekun_id,
    abonament,
    model_fakturowania,
    forma_prawna,
    forma_opodatkowania,
    czynny_vat,
    vat_ue,
    obsluga_kadrowa,
    profiles!klienci_opiekun_id_fkey (
      full_name,
      email
    )
  )
`;

export async function ensureCurrentMonthSettlements(period?: string) {
  return supabase.rpc("ensure_monthly_settlements", { public_period: period || undefined });
}

export async function fetchMonthlySettlements(period: string) {
  return supabase
    .from("rozliczenia_miesieczne")
    .select(SETTLEMENT_SELECT)
    .eq("okres", period)
    .order("created_at", { ascending: false });
}

export async function updateMonthlySettlement(settlementId: string, payload: SettlementUpdatePayload) {
  return supabase
    .from("rozliczenia_miesieczne")
    .update(payload)
    .eq("id", settlementId)
    .select(SETTLEMENT_SELECT)
    .single();
}

export async function fetchSettlementTaskProgress(period: string) {
  return supabase.rpc("settlement_task_progress", { public_period: period });
}

export async function sendDocumentsReminder(settlementId: string) {
  const sessionResult = await supabase.auth.getSession();
  const token = sessionResult.data.session?.access_token;

  return fetch("/api/rozliczenia/document-reminder", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ settlementId }),
  });
}
