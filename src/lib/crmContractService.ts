import { supabase } from "@/lib/supabaseClient";

export type CrmContractType = "KH" | "KU";
export type CrmContractStatus = "szkic" | "wygenerowana" | "wyslana_do_podpisu" | "podpisana" | "anulowana";

export type CrmContract = {
  id: string;
  created_at: string;
  updated_at: string;
  crm_id: string | null;
  klient_id: string | null;
  typ_umowy: CrmContractType;
  status: CrmContractStatus;
  numer_umowy: string | null;
  data_zawarcia: string | null;
  miejsce_zawarcia: string | null;
  pierwszy_okres: string | null;
  nazwa_klienta: string;
  siedziba: string | null;
  rejestr: string | null;
  krs: string | null;
  nip: string | null;
  reprezentant: string | null;
  email_klienta: string | null;
  abonament_netto: number | null;
  limit_dokumentow: number | null;
  obsluga_kadrowa: boolean;
  ustalenia_indywidualne: string | null;
  wygenerowany_pdf_path: string | null;
  wygenerowany_pdf_name: string | null;
  podpisany_pdf_path: string | null;
  podpisany_pdf_name: string | null;
  podpisana_at: string | null;
  onboarding_uruchomiony_at: string | null;
  crm_szanse_sprzedazy?: {
    nazwa: string | null;
    osoba_kontaktowa: string | null;
    email: string | null;
    etap: string | null;
    status: string | null;
  } | null;
  klienci?: {
    nazwa: string | null;
    nip: string | null;
    forma_prawna: string | null;
    forma_opodatkowania: string | null;
    status_klienta: string | null;
  } | null;
};

export type CrmContractPayload = {
  crm_id?: string | null;
  klient_id?: string | null;
  typ_umowy: CrmContractType;
  status?: CrmContractStatus;
  numer_umowy?: string | null;
  data_zawarcia?: string | null;
  miejsce_zawarcia?: string | null;
  pierwszy_okres?: string | null;
  nazwa_klienta: string;
  siedziba?: string | null;
  rejestr?: string | null;
  krs?: string | null;
  nip?: string | null;
  reprezentant?: string | null;
  email_klienta?: string | null;
  abonament_netto?: number | null;
  limit_dokumentow?: number | null;
  obsluga_kadrowa?: boolean;
  ustalenia_indywidualne?: string | null;
  wygenerowany_pdf_path?: string | null;
  wygenerowany_pdf_name?: string | null;
  podpisany_pdf_path?: string | null;
  podpisany_pdf_name?: string | null;
  podpisana_at?: string | null;
  onboarding_uruchomiony_at?: string | null;
};

const CRM_CONTRACTS_BUCKET = "crm-umowy";

export async function fetchCrmContracts() {
  return supabase
    .from("crm_umowy")
    .select("*, crm_szanse_sprzedazy(nazwa, osoba_kontaktowa, email, etap, status), klienci(nazwa, nip, forma_prawna, forma_opodatkowania, status_klienta)")
    .order("created_at", { ascending: false });
}

export async function createCrmContract(payload: CrmContractPayload) {
  return supabase
    .from("crm_umowy")
    .insert(payload)
    .select("*")
    .single();
}

export async function updateCrmContract(contractId: string, payload: Partial<CrmContractPayload>) {
  return supabase
    .from("crm_umowy")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .select("*")
    .single();
}

export async function uploadCrmContractPdf(
  contractId: string,
  file: File,
  field: "generated" | "signed"
) {
  const fileName = sanitizeFileName(file.name || "umowa.pdf");
  const storagePath = `${contractId}/${field}/${Date.now()}-${fileName}`;
  const upload = await supabase.storage
    .from(CRM_CONTRACTS_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });

  if (upload.error) return { data: null, error: upload.error };

  const payload: Partial<CrmContractPayload> = field === "signed"
    ? {
        status: "podpisana",
        podpisany_pdf_path: storagePath,
        podpisany_pdf_name: file.name || fileName,
        podpisana_at: new Date().toISOString(),
      }
    : {
        status: "wygenerowana",
        wygenerowany_pdf_path: storagePath,
        wygenerowany_pdf_name: file.name || fileName,
      };

  return updateCrmContract(contractId, payload);
}

export async function createCrmContractSignedUrl(path: string) {
  return supabase.storage
    .from(CRM_CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 10);
}

export async function deleteUnsignedCrmContract(contract: CrmContract) {
  if (contract.status === "podpisana" || contract.podpisany_pdf_path) {
    return { error: new Error("Nie można usunąć podpisanej umowy.") };
  }

  const paths = [
    contract.wygenerowany_pdf_path,
    contract.podpisany_pdf_path,
  ].filter(Boolean) as string[];

  if (paths.length > 0) {
    const storageResult = await supabase.storage
      .from(CRM_CONTRACTS_BUCKET)
      .remove(paths);

    if (storageResult.error) return { error: storageResult.error };
  }

  return supabase
    .from("crm_umowy")
    .delete()
    .eq("id", contract.id)
    .neq("status", "podpisana")
    .is("podpisany_pdf_path", null);
}

function sanitizeFileName(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned.toLowerCase().endsWith(".pdf") ? cleaned : `${cleaned || "umowa"}.pdf`;
}
