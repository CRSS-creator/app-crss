import { supabase } from "@/lib/supabaseClient";

const CLIENT_SELECT = `
      id,
      nazwa,
      nip,
      telefon,
      email,
      osoba_kontaktowa,
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
      koszt_dodatkowego_dokumentu,
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
    `;

type ClientCaregiver = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  aktywne?: boolean | null;
};

type ClientCaregiversResult = {
  data: ClientCaregiver[];
  error: Error | null;
};

export async function fetchClientCaregivers(): Promise<ClientCaregiversResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    return { data: [], error: new Error("Brak aktywnej sesji użytkownika.") };
  }

  const response = await fetch("/api/onboarding/caregivers", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return {
      data: [],
      error: new Error(body?.error || "Nie udało się pobrać listy opiekunów."),
    };
  }

  const body = (await response.json()) as { caregivers?: ClientCaregiver[] };
  return { data: body.caregivers || [], error: null };
}

export async function fetchClients() {
  return supabase
    .from("klienci")
    .select(CLIENT_SELECT)
    .order("nazwa", { ascending: true });
}

export async function updateClient(clientId: string, payload: Record<string, unknown>) {
  return supabase
    .from("klienci")
    .update(payload)
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();
}

export async function createClient(payload: Record<string, unknown>) {
  return supabase
    .from("klienci")
    .insert(payload)
    .select("*")
    .single();
}
