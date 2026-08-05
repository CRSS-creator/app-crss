create or replace function public.has_existing_standard_wfirma_invoice(
  public_client_id uuid,
  public_period date,
  public_invoice_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.faktury invoice
    where invoice.klient_id = public_client_id
      and invoice.okres = public_period
      and coalesce(invoice.kategoria, 'standardowa') = 'standardowa'
      and invoice.status <> 'anulowana'
      and (invoice.wfirma_id is not null or invoice.zrodlo = 'wfirma')
      and (public_invoice_id is null or invoice.id <> public_invoice_id)
  );
$$;

revoke all on function public.has_existing_standard_wfirma_invoice(uuid, date, uuid) from public;

create or replace function public.prevent_duplicate_standard_invoice_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.klient_id is not null
    and new.okres is not null
    and coalesce(new.kategoria, 'standardowa') = 'standardowa'
    and new.status = 'szkic'
    and new.zrodlo = 'aplikacja'
    and new.wfirma_id is null
    and coalesce(new.wfirma_sync_status, 'nie_wyslano') in ('nie_wyslano', 'blad', 'w_kolejce')
    and public.has_existing_standard_wfirma_invoice(new.klient_id, new.okres, new.id)
  then
    raise exception 'Faktura standardowa za ten okres jest juz wystawiona w wFirmie.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_standard_invoice_draft_trigger on public.faktury;
create trigger prevent_duplicate_standard_invoice_draft_trigger
before insert or update of klient_id, okres, kategoria, status, zrodlo, wfirma_id, wfirma_sync_status
on public.faktury
for each row
execute function public.prevent_duplicate_standard_invoice_draft();

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
    raise exception 'Brak uprawnien do generowania faktur.';
  end if;

  perform public.ensure_monthly_settlements(settlement_period);

  if invoice_date >= date '2026-08-01' then
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
        and not public.has_existing_standard_wfirma_invoice(settlement.klient_id, settlement.okres)
    loop
      perform public.ensure_invoice_for_settlement(settlement_record.id, invoice_date);
      processed := processed + 1;
    end loop;
  end if;

  for settlement_record in
    select settlement.*
    from public.rozliczenia_miesieczne settlement
    join public.klienci client on client.id = settlement.klient_id
    where settlement.okres = settlement_period
      and settlement.status_ksiegowosci = 'podatki_wyslane'
      and client.model_fakturowania = 'z_dolu'
      and coalesce(client.abonament, 0) > 0
      and (client.aktywny = true or lower(coalesce(client.status_klienta, '')) = 'onboarding')
      and (client.pierwszy_okres_rozliczeniowy is null or date_trunc('month', client.pierwszy_okres_rozliczeniowy)::date <= settlement_period)
      and (client.ostatni_okres_rozliczeniowy is null or date_trunc('month', client.ostatni_okres_rozliczeniowy)::date >= settlement_period)
      and not public.has_existing_standard_wfirma_invoice(settlement.klient_id, settlement.okres)
  loop
    perform public.ensure_invoice_for_settlement(settlement_record.id, invoice_date);
    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

create or replace function public.create_invoice_after_taxes_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_billing_model text;
begin
  if new.status_ksiegowosci = 'podatki_wyslane'
    and old.status_ksiegowosci is distinct from new.status_ksiegowosci then
    select model_fakturowania
    into client_billing_model
    from public.klienci
    where id = new.klient_id;

    if client_billing_model = 'z_dolu'
      and not public.has_existing_standard_wfirma_invoice(new.klient_id, date_trunc('month', new.okres)::date) then
      perform public.ensure_invoice_for_settlement(new.id, current_date);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_duplicate_standard_invoice_draft() from public;
revoke all on function public.ensure_subscription_invoices(date) from public;
grant execute on function public.ensure_subscription_invoices(date) to authenticated;
