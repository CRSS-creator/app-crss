import { NextRequest, NextResponse } from "next/server";
import type { CrmContract } from "@/lib/crmContractService";

type GenerateContractRequest = {
  contract?: CrmContract;
};

const WEBHOOK_URL = process.env.CRSS_CONTRACT_GENERATION_WEBHOOK_URL;
const CALLBACK_SECRET = process.env.CRSS_CONTRACT_CALLBACK_SECRET;

export async function POST(request: NextRequest) {
  if (!WEBHOOK_URL) {
    return NextResponse.json(
      { error: "Brakuje zmiennej CRSS_CONTRACT_GENERATION_WEBHOOK_URL na serwerze." },
      { status: 500 }
    );
  }

  if (!CALLBACK_SECRET) {
    return NextResponse.json(
      { error: "Brakuje zmiennej CRSS_CONTRACT_CALLBACK_SECRET na serwerze." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null) as GenerateContractRequest | null;
  const contract = body?.contract;

  if (!contract?.id) {
    return NextResponse.json({ error: "Brakuje danych umowy." }, { status: 400 });
  }

  if (contract.typ_umowy !== "KH") {
    return NextResponse.json(
      { error: "Automatyczne generowanie jest obecnie dostępne dla wzoru KH." },
      { status: 400 }
    );
  }

  const origin = request.nextUrl.origin;
  const fileName = buildGeneratedContractFileName(contract.numer_umowy, contract.nazwa_klienta);
  const webhookPayload = {
    template: "umowa_crss_kh_n8n",
    contractId: contract.id,
    fileName,
    callbackUrl: `${origin}/api/crm/contracts/generated-pdf`,
    callbackSecret: CALLBACK_SECRET,
    fields: {
      numer_umowy: contract.numer_umowy || "",
      pierwszy_okres: contract.pierwszy_okres || "",
      nazwa_klienta: contract.nazwa_klienta || "",
      siedziba: contract.siedziba || "",
      nip: contract.nip || "",
      reprezentant: contract.reprezentant || "",
      email_klienta: contract.email_klienta || "",
      abonament_netto: contract.abonament_netto ?? "",
      limit_dokumentow: contract.limit_dokumentow ?? "",
      obsluga_kadrowa: contract.obsluga_kadrowa ? "tak" : "nie",
      ustalenia_indywidualne: contract.ustalenia_indywidualne || "",
    },
  };

  const webhookResponse = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookPayload),
  });

  if (!webhookResponse.ok) {
    const message = await webhookResponse.text().catch(() => "");
    return NextResponse.json(
      { error: `Automatyzacja zwróciła status ${webhookResponse.status}.`, details: message },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, fileName });
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
