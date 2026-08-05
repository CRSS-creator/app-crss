revoke all on function public.has_existing_standard_wfirma_invoice(uuid, date, uuid) from anon, authenticated;
revoke all on function public.prevent_duplicate_standard_invoice_draft() from anon, authenticated;
