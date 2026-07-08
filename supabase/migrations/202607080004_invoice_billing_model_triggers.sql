create or replace function public.ensure_invoice_for_settlement(
  public_settlement_id uuid,
  public_invoice_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  settlement_record public.rozliczenia_miesieczne;
  client_record public.klienci;
  settlement_period date;
  invoice_date date := coalesce(public_invoice_date, current_date);
  invoice_record public.faktury;
  fee_record record;
  subscription_net numeric(12, 2);
  subscription_vat numeric(12, 2);
  subscription_gross numeric(12, 2);
  extra_net numeric(12, 2);
  extra_vat numeric(12, 2);
  extra_gross numeric(12, 2);
  total_net numeric(12, 2);
  total_vat numeric(12, 2);
  total_gross numeric(12, 2);
begin
  select *
  into settlement_record
  from public.rozliczenia_miesieczne
  where id = public_settlement_id;

  if not found then
    return null;
  end if;

  select *
  into client_record
  from public.klienci
  where id = settlement_record.klient_id;

  if not found or coalesce(client_record.abonament, 0) <= 0 then
    return null;
  end if;

  settlement_period := date_trunc('month', settlement_record.okres)::date;

  subscription_net := round(coalesce(client_record.abonament, 0), 2);
  subscription_vat := round(subscription_net * 0.23, 2);
  subscription_gross := subscription_net + subscription_vat;

  insert into public.faktury (
    klient_id,
    typ,
    status,
    zrodlo,
    data_wystawienia,
    data_sprzedazy,
    termin_platnosci,
    okres,
    automatyczna,
    kontrahent_nazwa,
    kontrahent_nip,
    kontrahent_email,
    waluta,
    kwota_netto,
    kwota_vat,
    kwota_brutto,
    opis,
    wfirma_sync_status,
    created_by
  )
  values (
    client_record.id,
    'sprzedaz',
    'szkic',
    'aplikacja',
    invoice_date,
    settlement_period,
    invoice_date + interval '7 days',
    settlement_period,
    true,
    coalesce(client_record.nazwa, 'Klient'),
    client_record.nip,
    client_record.email,
    'PLN',
    subscription_net,
    subscription_vat,
    subscription_gross,
    'abonament księgowy za miesiąc ' || public.polish_month_label(settlement_period),
    'nie_wyslano',
    auth.uid()
  )
  on conflict (klient_id, okres) where automatyczna = true and klient_id is not null and okres is not null
  do update set
    kontrahent_nazwa = excluded.kontrahent_nazwa,
    kontrahent_nip = excluded.kontrahent_nip,
    kontrahent_email = excluded.kontrahent_email,
    data_wystawienia = excluded.data_wystawienia,
    data_sprzedazy = excluded.data_sprzedazy,
    termin_platnosci = excluded.termin_platnosci,
    opis = excluded.opis
  returning * into invoice_record;

  insert into public.faktury_pozycje (
    faktura_id,
    source_key,
    nazwa,
    ilosc,
    jednostka,
    cena_netto,
    stawka_vat,
    kwota_netto,
    kwota_vat,
    kwota_brutto,
    sort_order
  )
  values (
    invoice_record.id,
    'abonament',
    'abonament księgowy za miesiąc ' || public.polish_month_label(settlement_period),
    1,
    'mies.',
    subscription_net,
    '23%',
    subscription_net,
    subscription_vat,
    subscription_gross,
    0
  )
  on conflict (faktura_id, source_key) where source_key is not null
  do update set
    nazwa = excluded.nazwa,
    cena_netto = excluded.cena_netto,
    kwota_netto = excluded.kwota_netto,
    kwota_vat = excluded.kwota_vat,
    kwota_brutto = excluded.kwota_brutto;

  for fee_record in
    select *
    from public.rozliczenia_oplaty_dodatkowe
    where rozliczenie_id = settlement_record.id
      and (faktura_id is null or faktura_id = invoice_record.id)
  loop
    extra_net := round(coalesce(fee_record.kwota_netto, 0) * coalesce(fee_record.ilosc, 1), 2);
    extra_vat := round(extra_net * 0.23, 2);
    extra_gross := extra_net + extra_vat;

    insert into public.faktury_pozycje (
      faktura_id,
      source_key,
      rozliczenie_oplata_id,
      nazwa,
      ilosc,
      jednostka,
      cena_netto,
      stawka_vat,
      kwota_netto,
      kwota_vat,
      kwota_brutto,
      sort_order
    )
    values (
      invoice_record.id,
      'oplata:' || fee_record.id::text,
      fee_record.id,
      fee_record.nazwa,
      coalesce(fee_record.ilosc, 1),
      'szt.',
      coalesce(fee_record.kwota_netto, 0),
      '23%',
      extra_net,
      extra_vat,
      extra_gross,
      100
    )
    on conflict (rozliczenie_oplata_id) where rozliczenie_oplata_id is not null
    do update set
      nazwa = excluded.nazwa,
      ilosc = excluded.ilosc,
      cena_netto = excluded.cena_netto,
      kwota_netto = excluded.kwota_netto,
      kwota_vat = excluded.kwota_vat,
      kwota_brutto = excluded.kwota_brutto;

    update public.rozliczenia_oplaty_dodatkowe
    set faktura_id = invoice_record.id,
        fakturowane_at = coalesce(fakturowane_at, now())
    where id = fee_record.id
      and (faktura_id is null or faktura_id = invoice_record.id);
  end loop;

  select
    coalesce(sum(position.kwota_netto), 0),
    coalesce(sum(position.kwota_vat), 0),
    coalesce(sum(position.kwota_brutto), 0)
  into total_net, total_vat, total_gross
  from public.faktury_pozycje position
  where position.faktura_id = invoice_record.id;

  update public.faktury
  set kwota_netto = total_net,
      kwota_vat = total_vat,
      kwota_brutto = total_gross
  where id = invoice_record.id;

  update public.rozliczenia_miesieczne
  set faktura_wystawiona = true
  where id = settlement_record.id
    and faktura_wystawiona is distinct from true;

  return invoice_record.id;
end;
$$;

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

    if client_billing_model = 'z_dolu' then
      perform public.ensure_invoice_for_settlement(new.id, current_date);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rozliczenia_miesieczne_invoice_after_taxes_sent on public.rozliczenia_miesieczne;
create trigger rozliczenia_miesieczne_invoice_after_taxes_sent
after update of status_ksiegowosci on public.rozliczenia_miesieczne
for each row
execute function public.create_invoice_after_taxes_sent();

revoke all on function public.ensure_invoice_for_settlement(uuid, date) from public;

revoke all on function public.ensure_subscription_invoices(date) from public;
grant execute on function public.ensure_subscription_invoices(date) to authenticated;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select jobid into existing_job_id
    from cron.job
    where jobname = 'generate_subscription_invoices_monthly'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'generate_subscription_invoices_monthly',
      '5 0 1 * *',
      $job$select public.ensure_subscription_invoices(current_date);$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować automatycznego wystawiania faktur: %', sqlerrm;
end;
$$;
