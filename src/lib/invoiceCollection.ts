type InvoiceCollectionState = {
  typ?: string | null;
  kategoria?: string | null;
  status?: string | null;
};

export function isCorrectionInvoice(invoice: InvoiceCollectionState) {
  return invoice.typ === "korekta" || invoice.kategoria === "korekta";
}

export function isOverdueCollectionInvoice(invoice: InvoiceCollectionState) {
  return invoice.status === "przeterminowana" && !isCorrectionInvoice(invoice);
}
