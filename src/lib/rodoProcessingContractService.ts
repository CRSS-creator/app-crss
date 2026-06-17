import { supabase } from "@/lib/supabaseClient";

export type RodoProcessingContractStatus = "szkic" | "wygenerowana" | "wyslana_do_podpisu" | "podpisana" | "anulowana";

export type RodoProcessingContract = {
  id: string;
  created_at: string;
  updated_at: string;
  klient_id: string | null;
  umowa_ksiegowa_id: string | null;
  status: RodoProcessingContractStatus;
  numer_umowy: string | null;
  nazwa_klienta: string;
  siedziba: string | null;
  nip: string | null;
  reprezentant: string | null;
  email_klienta: string | null;
  zakres_powierzenia: string | null;
  uwagi: string | null;
  wygenerowany_pdf_path: string | null;
  wygenerowany_pdf_name: string | null;
  podpisany_pdf_path: string | null;
  podpisany_pdf_name: string | null;
  podpisana_at: string | null;
  klienci?: {
    nazwa: string | null;
    nip: string | null;
    email: string | null;
    status_klienta: string | null;
  } | null;
  crm_umowy?: {
    numer_umowy: string | null;
    typ_umowy: string | null;
    status: string | null;
    nazwa_klienta: string | null;
  } | null;
};

export type RodoProcessingContractPayload = {
  klient_id?: string | null;
  umowa_ksiegowa_id?: string | null;
  status?: RodoProcessingContractStatus;
  numer_umowy?: string | null;
  nazwa_klienta: string;
  siedziba?: string | null;
  nip?: string | null;
  reprezentant?: string | null;
  email_klienta?: string | null;
  zakres_powierzenia?: string | null;
  uwagi?: string | null;
  wygenerowany_pdf_path?: string | null;
  wygenerowany_pdf_name?: string | null;
  podpisany_pdf_path?: string | null;
  podpisany_pdf_name?: string | null;
  podpisana_at?: string | null;
};

export async function fetchRodoProcessingContracts() {
  return supabase
    .from("rodo_umowy_powierzenia")
    .select(`
      *,
      klienci(nazwa, nip, email, status_klienta),
      crm_umowy(numer_umowy, typ_umowy, status, nazwa_klienta)
    `)
    .order("created_at", { ascending: false });
}

export async function createRodoProcessingContract(payload: RodoProcessingContractPayload) {
  return supabase
    .from("rodo_umowy_powierzenia")
    .insert(payload)
    .select("*")
    .single();
}

export async function updateRodoProcessingContract(contractId: string, payload: Partial<RodoProcessingContractPayload>) {
  return supabase
    .from("rodo_umowy_powierzenia")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .select("*")
    .single();
}
