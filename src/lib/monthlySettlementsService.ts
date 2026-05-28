import { supabase } from "@/lib/supabaseClient";

export type SettlementStatus =
  | "czeka_na_dokumenty"
  | "dokumenty_kompletne_biuro"
  | "w_trakcie_ksiegowania"
  | "do_sprawdzenia"
  | "sprawdzone_zatwierdzone"
  | "podatki_wyslane";

export type MonthlySettlement = {
  id: string;
  created_at: string;
  klient_id: string;
  okres: string;
  status_ksiegowosci: SettlementStatus;
  liczba_dokumentow: number;
  liczba_pracownikow: number;
  liczba_zleceniobiorcow: number;
  faktura_wystawiona: boolean;
  uwagi: string | null;
  klienci?: {
    id?: string;
    nazwa: string | null;
    nip: string | null;
    opiekun_id: string | null;
    profiles?: {
      full_name: string | null;
      email: string | null;
    }[] | null;
  } | {
    id?: string;
    nazwa: string | null;
    nip: string | null;
    opiekun_id: string | null;
    profiles?: {
      full_name: string | null;
      email: string | null;
    }[] | null;
  }[] | null;
};

export type SettlementUpdatePayload = {
  status_ksiegowosci?: SettlementStatus;
  liczba_dokumentow?: number;
  liczba_pracownikow?: number;
  liczba_zleceniobiorcow?: number;
  uwagi?: string | null;
  faktura_wystawiona?: boolean;
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
    opiekun_id,
    profiles!klienci_opiekun_id_fkey (
      full_name,
      email
    )
  )
`;

export async function ensureCurrentMonthSettlements() {
  return supabase.rpc("ensure_monthly_settlements");
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
