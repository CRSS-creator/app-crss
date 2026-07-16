import { supabase } from "@/lib/supabaseClient";

export type RodoRegisterKind = "changes" | "incidents" | "authorizedPersons";

export type RodoRegisterBaseRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type RodoChangeReviewRecord = RodoRegisterBaseRecord & {
  data_wpisu: string | null;
  obszar: string | null;
  rodzaj: string | null;
  opis_skrocony: string;
  osoba_odpowiedzialna: string | null;
  status: string;
  powod: string | null;
  wynik: string | null;
  nastepny_przeglad: string | null;
  pelny_opis: string | null;
  uwagi: string | null;
};

export type RodoIncidentRecord = RodoRegisterBaseRecord & {
  data_wykrycia: string | null;
  typ: string | null;
  opis_skrocony: string;
  ryzyko: string | null;
  zgloszenie_uodo: string | null;
  status: string;
  data_zdarzenia: string | null;
  kategorie_danych: string | null;
  liczba_osob: string | null;
  skutki: string | null;
  decyzja: string | null;
  termin_72h: string | null;
  data_zgloszenia: string | null;
  osoby_zawiadomione: string | null;
  dzialania_naprawcze: string | null;
  osoba_prowadzaca: string | null;
  uwagi: string | null;
};

export type RodoAuthorizedPersonRecord = RodoRegisterBaseRecord & {
  imie_nazwisko: string;
  rola_stanowisko: string | null;
  zakres_upowaznienia: string | null;
  systemy_obszary: string | null;
  data_nadania: string | null;
  data_cofniecia: string | null;
  status: string;
  nadajacy: string | null;
  podstawa_nadania: string | null;
  uwagi: string | null;
};

export type RodoAdditionalRegisterRecord =
  | RodoChangeReviewRecord
  | RodoIncidentRecord
  | RodoAuthorizedPersonRecord;

export type RodoRegisterPayload = Record<string, string | null>;

const REGISTER_TABLES: Record<RodoRegisterKind, string> = {
  changes: "rodo_rejestr_zmian_przegladow",
  incidents: "rodo_rejestr_incydentow_naruszen",
  authorizedPersons: "rodo_rejestr_osob_upowaznionych",
};

export async function fetchRodoRegisterRecords(kind: RodoRegisterKind) {
  return supabase
    .from(REGISTER_TABLES[kind])
    .select("*")
    .order("created_at", { ascending: false });
}

export async function createRodoRegisterRecord(kind: RodoRegisterKind, payload: RodoRegisterPayload) {
  const createdBy = await getCurrentUserId();

  return supabase
    .from(REGISTER_TABLES[kind])
    .insert({ ...payload, created_by: createdBy })
    .select("*")
    .single();
}

export async function updateRodoRegisterRecord(kind: RodoRegisterKind, recordId: string, payload: RodoRegisterPayload) {
  return supabase
    .from(REGISTER_TABLES[kind])
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", recordId)
    .select("*")
    .single();
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}
