import { supabase } from "@/lib/supabaseClient";

const CLIENT_SELECT = `
      id,
      nazwa,
      nip,
      telefon,
      email,
      adres_dzialalnosci,
      osoba_kontaktowa,
      forma_prawna,
      forma_opodatkowania,
      glowna_stawka_ryczaltu,
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

const CLIENT_SELECT_WITHOUT_ADDRESS = `
      id,
      nazwa,
      nip,
      telefon,
      email,
      osoba_kontaktowa,
      forma_prawna,
      forma_opodatkowania,
      glowna_stawka_ryczaltu,
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

type ClientProfile = Omit<ClientCaregiver, "id">;

type ClientCaregiversResult = {
  data: ClientCaregiver[];
  error: Error | null;
};

type ClientRow = {
  opiekun_id?: string | null;
  profiles?: ClientProfile | ClientProfile[] | null;
  [key: string]: unknown;
};

async function hydrateClientsWithCaregivers<T extends ClientRow>(
  clients: T[] | null
): Promise<T[] | null> {
  if (!clients?.length) return clients;

  const { data: caregivers, error } = await fetchClientCaregivers();
  if (error || !caregivers.length) return clients;

  return clients.map((client) => {
    const profile = Array.isArray(client.profiles)
      ? client.profiles[0]
      : client.profiles;

    if (profile || !client.opiekun_id) return client;

    const caregiver = caregivers.find((item) => item.id === client.opiekun_id);
    if (!caregiver) return client;

    return {
      ...client,
      profiles: {
        full_name: caregiver.full_name,
        email: caregiver.email,
        role: caregiver.role,
        aktywne: caregiver.aktywne,
      },
    };
  });
}

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
  let result: Awaited<ReturnType<typeof supabase.from>> | any = await supabase
    .from("klienci")
    .select(CLIENT_SELECT)
    .order("nazwa", { ascending: true });

  if (isMissingBusinessAddressColumn(result.error)) {
    result = await supabase
      .from("klienci")
      .select(CLIENT_SELECT_WITHOUT_ADDRESS)
      .order("nazwa", { ascending: true });
  }

  if (result.error) return result;

  return {
    ...result,
    data: (await hydrateClientsWithCaregivers(
      result.data as unknown as ClientRow[] | null
    )) as unknown as typeof result.data,
  };
}

export async function updateClient(clientId: string, payload: Record<string, unknown>) {
  let result = await supabase
    .from("klienci")
    .update(payload)
    .eq("id", clientId)
    .select(CLIENT_SELECT)
    .single();

  if (isMissingBusinessAddressColumn(result.error)) {
    const { adres_dzialalnosci, ...payloadWithoutAddress } = payload;
    if (Object.keys(payloadWithoutAddress).length === 0) return result;

    result = await supabase
      .from("klienci")
      .update(payloadWithoutAddress)
      .eq("id", clientId)
      .select(CLIENT_SELECT_WITHOUT_ADDRESS)
      .single();
  }

  if (result.error) return result;

  const hydrated = await hydrateClientsWithCaregivers(
    result.data ? ([result.data] as unknown as ClientRow[]) : null
  );

  return {
    ...result,
    data: (hydrated?.[0] || result.data) as typeof result.data,
  };
}

export function normalizeClientNip(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export async function findClientByNip(nip: string | null | undefined) {
  const normalizedNip = normalizeClientNip(nip);
  if (!normalizedNip) return { data: null, error: null };

  const result = await supabase
    .from("klienci")
    .select("id,nazwa,nip,opiekun_id,status_klienta")
    .not("nip", "is", null);

  if (result.error) return { data: null, error: result.error };

  return {
    data:
      (result.data || []).find((client) => normalizeClientNip(client.nip) === normalizedNip) ||
      null,
    error: null,
  };
}

export async function createClient(payload: Record<string, unknown>) {
  return supabase
    .from("klienci")
    .insert(payload)
    .select("*")
    .single();
}

function isMissingBusinessAddressColumn(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message || "");
  return message.includes("adres_dzialalnosci");
}
