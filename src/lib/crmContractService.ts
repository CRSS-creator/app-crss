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

export async function requestCrmContractGeneration(contract: CrmContract) {
  const response = await fetch("/api/crm/contracts/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      data: null,
      error: new Error(payload?.error || "Nie udało się wygenerować umowy."),
    };
  }

  return { data: payload, error: null };
}

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
  const result = await supabase
    .from("crm_umowy")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", contractId)
    .select("*")
    .single();

  if (result.error || !result.data) return result;

  const contract = result.data as CrmContract;
  if (contract.status === "podpisana" && contract.klient_id && !contract.onboarding_uruchomiony_at) {
    const onboardingResult = await startOnboardingFromSignedContract(contract.id);
    if (!onboardingResult.error && onboardingResult.data) {
      return onboardingResult;
    }

    console.error("Nie udało się uruchomić onboardingu z podpisanej umowy:", onboardingResult.error);
  }

  return result;
}

export async function startOnboardingFromSignedContract(contractId: string) {
  return supabase
    .rpc("start_onboarding_from_signed_contract", { public_contract_id: contractId })
    .single();
}

export async function uploadCrmContractPdf(
  contractId: string,
  file: File,
  field: "generated" | "signed"
) {
  const contractResult = field === "generated"
    ? await supabase
        .from("crm_umowy")
        .select("numer_umowy, nazwa_klienta")
        .eq("id", contractId)
        .maybeSingle()
    : { data: null, error: null };

  if (contractResult.error) return { data: null, error: contractResult.error };

  const generatedFileName = contractResult.data
    ? buildGeneratedContractFileName(contractResult.data.numer_umowy, contractResult.data.nazwa_klienta)
    : null;
  const fileName = sanitizeFileName(generatedFileName || file.name || "umowa.pdf");
  const displayFileName = field === "generated" ? fileName : file.name || fileName;
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
        podpisany_pdf_name: displayFileName,
        podpisana_at: new Date().toISOString(),
      }
    : {
        status: "wygenerowana",
        wygenerowany_pdf_path: storagePath,
        wygenerowany_pdf_name: displayFileName,
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
    return { data: null, error: new Error("Nie można usunąć podpisanej umowy.") };
  }

  const deleteResult = await supabase
    .from("crm_umowy")
    .delete()
    .eq("id", contract.id)
    .neq("status", "podpisana")
    .is("podpisany_pdf_path", null)
    .select("id")
    .maybeSingle();

  if (deleteResult.error) return { data: null, error: deleteResult.error };
  if (!deleteResult.data) {
    return { data: null, error: new Error("Umowa nie została usunięta. Sprawdź status umowy lub uprawnienia w Supabase.") };
  }

  const paths = [
    contract.wygenerowany_pdf_path,
    contract.podpisany_pdf_path,
  ].filter(Boolean) as string[];

  if (paths.length > 0) {
    const storageResult = await supabase.storage
      .from(CRM_CONTRACTS_BUCKET)
      .remove(paths);

    if (storageResult.error) {
      console.warn("Umowa została usunięta z rejestru, ale nie udało się usunąć pliku PDF:", storageResult.error);
    }
  }

  return { data: deleteResult.data, error: null };
}

function buildGeneratedContractFileName(contractNumber: string | null, contractorName: string | null) {
  const numberPart = sanitizeFileNamePart(contractNumber || "bez-numeru");
  const contractorPart = sanitizeFileNamePart(contractorName || "kontrahent");
  return `umowa_${numberPart}_${contractorPart}.pdf`;
}

function sanitizeFileNamePart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "brak";
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