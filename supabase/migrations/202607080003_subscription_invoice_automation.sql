alter table public.faktury
  add column if not exists okres date,
  add column if not exists automatyczna boolean not null default false;

alter table public.faktury_pozycje
  add column if not exists source_key text,
  add column if not exists rozliczenie_oplata_id uuid references public.rozliczenia_oplaty_dodatkowe(id) on delete set null;

alter table public.rozliczenia_oplaty_dodatkowe
  add column if not exists faktura_id uuid references public.faktury(id) on delete set null,
  add column if not exists fakturowane_at timestamptz;

create unique index if not exists faktury_auto_klient_okres_unique
on public.faktury (klient_id, okres)
where automatyczna = true and klient_id is not null and okres is not null;

create unique index if not exists faktury_pozycje_source_key_unique
on public.faktury_pozycje (faktura_id, source_key)
where source_key is not null;

create unique index if not exists faktury_pozycje_rozliczenie_oplata_unique
on public.faktury_pozycje (rozliczenie_oplata_id)
where rozliczenie_oplata_id is not null;

create index if not exists rozliczenia_oplaty_faktura_id_idx
on public.rozliczenia_oplaty_dodatkowe (faktura_id);

create or replace function public.polish_month_label(public_period date)
returns text
language sql
stable
as $$
  select case extract(month from public_period)::int
    when 1 then 'styczeń'
    when 2 then 'luty'
    when 3 then 'marzec'
    when 4 then 'kwiecień'
    when 5 then 'maj'
    when 6 then 'czerwiec'
    when 7 then 'lipiec'
    when 8 then 'sierpień'
    when 9 then 'wrzesień'
    when 10 then 'październik'
    when 11 then 'listopad'
    when 12 then 'grudzień'
  end || ' ' || extract(year from public_period)::int;
$$;

create or replace function public.ensure_subscription_invoices(public_invoice_month date default date_trunc('month', current_date)::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_month date := date_trunc('month', public_invoice_month)::date;
  first_invoice_month date;
  invoice_record public.faktury;
  client_record public.klienci;
  fee_record record;
  processed integer := 0;
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
  if auth.uid() is not null and public.current_user_role() not in ('owner', 'admin') then
    raise exception 'Brak uprawnień do generowania faktur.';
  end if;

  for client_record in
    select *
    from public.klienci k
    where k.model_fakturowania = 'z_gory'
      and coalesce(k.abonament, 0) > 0
      and (k.aktywny = true or lower(coalesce(k.status_klienta, '')) = 'onboarding')
      and (k.ostatni_okres_rozliczeniowy is null or date_trunc('month', k.ostatni_okres_rozliczeniowy)::date >= invoice_month)
  loop
    first_invoice_month := case
      when client_record.pierwszy_okres_rozliczeniowy is null then invoice_month
      else (date_trunc('month', client_record.pierwszy_okres_rozliczeniowy)::date + interval '1 month')::date
    end;

    continue when first_invoice_month > invoice_month;

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
      invoice_month,
      invoice_month,
      invoice_month + interval '7 days',
      invoice_month,
      true,
      coalesce(client_record.nazwa, 'Klient'),
      client_record.nip,
      client_record.email,
      'PLN',
      subscription_net,
      subscription_vat,
      subscription_gross,
      'abonament księgowy za miesiąc ' || public.polish_month_label(invoice_month),
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
      'abonament księgowy za miesiąc ' || public.polish_month_label(invoice_month),
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
      select fee.*
      from public.rozliczenia_oplaty_dodatkowe fee
      join public.rozliczenia_miesieczne settlement on settlement.id = fee.rozliczenie_id
      where settlement.klient_id = client_record.id
        and date_trunc('month', settlement.okres)::date < invoice_month
        and fee.created_at < invoice_month::timestamptz
        and fee.faktura_id is null
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
      on conflict (rozliczenie_oplata_id) where rozliczenie_oplata_id is not null do nothing;

      update public.rozliczenia_oplaty_dodatkowe
      set faktura_id = invoice_record.id,
          fakturowane_at = coalesce(fakturowane_at, now())
      where id = fee_record.id
        and faktura_id is null;
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

    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

revoke all on function public.ensure_subscription_invoices(date) from public;
grant execute on function public.ensure_subscription_invoices(date) to authenticated;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'Nie udało się włączyć pg_cron: %', sqlerrm;
end;
$$;

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
      $job$select public.ensure_subscription_invoices(date_trunc('month', current_date)::date);$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować automatycznego wystawiania faktur: %', sqlerrm;
end;
$$;
