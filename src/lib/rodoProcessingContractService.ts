import { supabase } from "@/lib/supabaseClient";

const RODO_CONTRACTS_BUCKET = "crm-umowy";

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

export async function requestRodoProcessingContractGeneration(contract: RodoProcessingContract) {
  const response = await fetch("/api/rodo/contracts/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      error: data?.error || "Nie udało się wygenerować umowy powierzenia.",
      data: null,
      status: response.status,
    };
  }

  return { error: null, data, status: response.status };
}

export async function createRodoProcessingContractSignedUrl(path: string) {
  return supabase.storage
    .from(RODO_CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 10);
}

export async function uploadSignedRodoProcessingContractPdf(contractId: string, file: File) {
  const fileName = sanitizeFileName(file.name || "podpisana-umowa-powierzenia.pdf");
  const storagePath = `rodo/${contractId}/signed/${Date.now()}-${fileName}`;
  const uploadResult = await supabase.storage
    .from(RODO_CONTRACTS_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadResult.error) return { data: null, error: uploadResult.error };

  return updateRodoProcessingContract(contractId, {
    status: "podpisana",
    podpisany_pdf_path: storagePath,
    podpisany_pdf_name: fileName,
    podpisana_at: new Date().toISOString(),
  });
}

export async function deleteGeneratedRodoProcessingContractPdf(contract: RodoProcessingContract) {
  if (!contract.wygenerowany_pdf_path) {
    return { data: contract, error: null };
  }

  const storageResult = await supabase.storage
    .from(RODO_CONTRACTS_BUCKET)
    .remove([contract.wygenerowany_pdf_path]);

  if (storageResult.error) {
    return { data: null, error: storageResult.error };
  }

  const nextStatus: RodoProcessingContractStatus = contract.status === "wygenerowana" ? "szkic" : contract.status;

  return updateRodoProcessingContract(contract.id, {
    status: nextStatus,
    wygenerowany_pdf_path: null,
    wygenerowany_pdf_name: null,
  });
}

function sanitizeFileName(value: string) {
  const extension = value.toLowerCase().endsWith(".pdf") ? "" : ".pdf";
  return `${value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "podpisana-umowa-powierzenia"}${extension}`;
}
