import { supabase } from "@/lib/supabaseClient";

export async function fetchClientCaregivers() {
  return supabase
    .from("profiles")
    .select("id, full_name, email, role, aktywne")
    .in("role", ["owner", "manager", "admin", "accountant"])
    .neq("aktywne", false)
    .order("full_name", { ascending: true });
}

export async function fetchClients() {
  return supabase
    .from("klienci")
    .select(`
      id,
      nazwa,
      nip,
      telefon,
      email,
      forma_prawna,
      forma_opodatkowania,
      obsluga_kadrowa,
      status_klienta,
      abonament,
      model_fakturowania,
      czynny_vat,
      vat_ue,
      schemat_zus,
      limit_dokumentow,
      pierwszy_okres_rozliczeniowy,
      ostatni_okres_rozliczeniowy,
      koszt_obslugi_pracownika,
      koszt_obslugi_zleceniobiorcy,
      dodatkowe_uslugi,
      notatki,
      opiekun_id,
      profiles!klienci_opiekun_id_fkey (
        full_name,
        email,
        role,
        aktywne
      )
    `)
    .order("nazwa", { ascending: true });
}

export async function updateClient(clientId: string, payload: Record<string, unknown>) {
  return supabase
    .from("klienci")
    .update(payload)
    .eq("id", clientId);
}

export async function createClient(payload: Record<string, unknown>) {
  return supabase
    .from("klienci")
    .insert(payload)
    .select("*")
    .single();
}
