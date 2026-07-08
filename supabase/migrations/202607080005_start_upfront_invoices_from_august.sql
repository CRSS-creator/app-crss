create or replace function public.ensure_subscription_invoices(public_invoice_month date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_date date := coalesce(public_invoice_month, current_date);
  settlement_period date := (date_trunc('month', coalesce(public_invoice_month, current_date))::date - interval '1 month')::date;
  settlement_record public.rozliczenia_miesieczne;
  processed integer := 0;
begin
  if auth.uid() is not null and public.current_user_role() not in ('owner', 'admin') then
    raise exception 'Brak uprawnień do generowania faktur.';
  end if;

  if invoice_date < date '2026-08-01' then
    return 0;
  end if;

  perform public.ensure_monthly_settlements(settlement_period);

  for settlement_record in
    select settlement.*
    from public.rozliczenia_miesieczne settlement
    join public.klienci client on client.id = settlement.klient_id
    where settlement.okres = settlement_period
      and client.model_fakturowania = 'z_gory'
      and coalesce(client.abonament, 0) > 0
      and (client.aktywny = true or lower(coalesce(client.status_klienta, '')) = 'onboarding')
      and (client.pierwszy_okres_rozliczeniowy is null or date_trunc('month', client.pierwszy_okres_rozliczeniowy)::date <= settlement_period)
      and (client.ostatni_okres_rozliczeniowy is null or date_trunc('month', client.ostatni_okres_rozliczeniowy)::date >= settlement_period)
  loop
    perform public.ensure_invoice_for_settlement(settlement_record.id, invoice_date);
    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

revoke all on function public.ensure_subscription_invoices(date) from public;
grant execute on function public.ensure_subscription_invoices(date) to authenticated;

with deleted_invoices as (
  delete from public.faktury invoice
  using public.klienci client
  where invoice.klient_id = client.id
    and client.model_fakturowania = 'z_gory'
    and invoice.automatyczna = true
    and invoice.data_wystawienia < date '2026-08-01'
    and invoice.status = 'szkic'
    and invoice.wfirma_sync_status in ('nie_wyslano', 'w_kolejce', 'blad')
  returning invoice.klient_id, invoice.okres
)
update public.rozliczenia_miesieczne settlement
set faktura_wystawiona = false
from deleted_invoices deleted
where settlement.klient_id = deleted.klient_id
  and settlement.okres = deleted.okres
  and not exists (
    select 1
    from public.faktury invoice
    where invoice.klient_id = settlement.klient_id
      and invoice.okres = settlement.okres
      and invoice.automatyczna = true
  );
