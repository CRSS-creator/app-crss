-- Owner-requested seller account for every invoice created through CRSS.
-- The server resolves this number to company_account.id in the current wFirma company.
create or replace function public.required_invoice_bank_account()
returns text language sql immutable set search_path=public as $$
  select '14102041600000210203508322'::text
$$;
revoke all on function public.required_invoice_bank_account() from public,anon,authenticated;
grant execute on function public.required_invoice_bank_account() to service_role;
