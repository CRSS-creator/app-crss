import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedServerUser } from "@/lib/serverAuth";

const ALLOWED_ROLES = new Set(["owner", "admin"]);
const INVOICE_PDF_BUCKET = "faktury-pdf";

type PdfUrlPayload = {
  invoiceId?: string;
};

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedServerUser(request, ALLOWED_ROLES, "Brak uprawnień do pobrania PDF faktury.");
  if (auth.error) return auth.error;

  let payload: PdfUrlPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane PDF faktury." }, { status: 400 });
  }

  const invoiceId = payload.invoiceId?.trim();
  if (!invoiceId) {
    return NextResponse.json({ error: "Brak ID faktury." }, { status: 400 });
  }

  const { data: invoice, error } = await auth.admin
    .from("faktury")
    .select("id,wfirma_pdf_path,wfirma_pdf_name")
    .eq("id", invoiceId)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Nie znaleziono faktury." }, { status: 404 });
  }

  if (!invoice.wfirma_pdf_path) {
    return NextResponse.json({ error: "Ta faktura nie ma jeszcze pobranego PDF." }, { status: 404 });
  }

  const signedUrl = await auth.admin.storage
    .from(INVOICE_PDF_BUCKET)
    .createSignedUrl(invoice.wfirma_pdf_path, 10 * 60);

  if (signedUrl.error || !signedUrl.data?.signedUrl) {
    return NextResponse.json({ error: "Nie udało się otworzyć PDF faktury." }, { status: 500 });
  }

  return NextResponse.json({
    url: signedUrl.data.signedUrl,
    name: invoice.wfirma_pdf_name || "faktura.pdf",
  });
}
