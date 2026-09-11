-- MKS Jedynka Poznan: defer August 2026 only; September keeps upfront billing.

CREATE OR REPLACE FUNCTION public.ensure_invoice_for_settlement(public_settlement_id uuid, public_invoice_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  settlement_record public.rozliczenia_miesieczne;
  client_record public.klienci;
  settlement_period date;
  invoice_date date := coalesce(public_invoice_date, current_date);
  invoice_record public.faktury;
  fee_record record;
  month_label text;
  subscription_net numeric(12, 2);
  subscription_vat numeric(12, 2);
  subscription_gross numeric(12, 2);
  payroll_net numeric(12, 2);
  payroll_vat numeric(12, 2);
  payroll_gross numeric(12, 2);
  extra_documents_count integer;
  extra_documents_net numeric(12, 2);
  extra_documents_vat numeric(12, 2);
  extra_documents_gross numeric(12, 2);
  extra_net numeric(12, 2);
  extra_vat numeric(12, 2);
  extra_gross numeric(12, 2);
  total_net numeric(12, 2);
  total_vat numeric(12, 2);
  total_gross numeric(12, 2);
  invoice_description_parts text[] := array[]::text[];
  invoice_description text;
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

  if public.is_apc_marek_hebel_client(client_record.nip, client_record.nazwa) then
    return null;
  end if;

  settlement_period := date_trunc('month', settlement_record.okres)::date;
  -- One-month exception: MKS August waits for the completed settlement.
  if (regexp_replace(coalesce(client_record.nip, ''), '[^0-9]', '', 'g') = '9721378590'
        and date_trunc('month', settlement_period)::date = date '2026-08-01')
    and settlement_record.status_ksiegowosci is distinct from 'podatki_wyslane' then
    return null;
  end if;

  month_label := public.polish_month_label(settlement_period);

  subscription_net := round(coalesce(client_record.abonament, 0), 2);
  subscription_vat := round(subscription_net * 0.23, 2);
  subscription_gross := subscription_net + subscription_vat;

  payroll_net := round(
    greatest(coalesce(settlement_record.liczba_pracownikow, 0), 0) * coalesce(client_record.koszt_obslugi_pracownika, 0)
    + greatest(coalesce(settlement_record.liczba_zleceniobiorcow, 0), 0) * coalesce(client_record.koszt_obslugi_zleceniobiorcy, 0),
    2
  );
  payroll_vat := round(payroll_net * 0.23, 2);
  payroll_gross := payroll_net + payroll_vat;

  extra_documents_count := case
    when coalesce(client_record.limit_dokumentow, 0) > 0
      and coalesce(client_record.koszt_dodatkowego_dokumentu, 0) > 0
    then greatest(
      coalesce(settlement_record.liczba_dokumentow, 0) - coalesce(client_record.limit_dokumentow, 0),
      0
    )
    else 0
  end;
  extra_documents_net := round(extra_documents_count * coalesce(client_record.koszt_dodatkowego_dokumentu, 0), 2);
  extra_documents_vat := round(extra_documents_net * 0.23, 2);
  extra_documents_gross := extra_documents_net + extra_documents_vat;

  if coalesce(client_record.obsluga_kadrowa, false) and payroll_net > 0 then
    invoice_description_parts := invoice_description_parts || format(
      'Liczba pracowników wg umów: pracownicy: %s, zleceniobiorcy: %s.',
      coalesce(settlement_record.liczba_pracownikow, 0),
      coalesce(settlement_record.liczba_zleceniobiorcow, 0)
    );
  end if;

  if coalesce(client_record.limit_dokumentow, 0) > 0 and extra_documents_count > 0 then
    invoice_description_parts := invoice_description_parts || format(
      'Dokumenty w abonamencie: %s, dokumenty faktycznie dostarczone: %s.',
      coalesce(client_record.limit_dokumentow, 0),
      coalesce(settlement_record.liczba_dokumentow, 0)
    );
  end if;

  invoice_description := nullif(array_to_string(invoice_description_parts, E'\n'), '');

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
    case
      when regexp_replace(coalesce(client_record.nip, ''), '\D', '', 'g') in ('5273158702', '5273221116')
        then (date_trunc('month', settlement_period)::date + interval '1 month' + interval '13 days')::date
      else (invoice_date + interval '7 days')::date
    end,
    settlement_period,
    true,
    coalesce(client_record.nazwa, 'Klient'),
    client_record.nip,
    client_record.email,
    'PLN',
    subscription_net,
    subscription_vat,
    subscription_gross,
    invoice_description,
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

  delete from public.faktury_pozycje
  where faktura_id = invoice_record.id
    and source_key in ('kadry', 'dodatkowe_dokumenty');

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
    'Abonament księgowy za miesiąc ' || month_label,
    1,
    'szt.',
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
    jednostka = excluded.jednostka,
    cena_netto = excluded.cena_netto,
    kwota_netto = excluded.kwota_netto,
    kwota_vat = excluded.kwota_vat,
    kwota_brutto = excluded.kwota_brutto;

  if coalesce(client_record.obsluga_kadrowa, false) and payroll_net > 0 then
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
      'kadry',
      'Usługa kadrowa za miesiąc ' || month_label,
      1,
      'szt.',
      payroll_net,
      '23%',
      payroll_net,
      payroll_vat,
      payroll_gross,
      10
    )
    on conflict (faktura_id, source_key) where source_key is not null
    do update set
      nazwa = excluded.nazwa,
      jednostka = excluded.jednostka,
      cena_netto = excluded.cena_netto,
      kwota_netto = excluded.kwota_netto,
      kwota_vat = excluded.kwota_vat,
      kwota_brutto = excluded.kwota_brutto;
  end if;

  if extra_documents_count > 0 and extra_documents_net > 0 then
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
      'dodatkowe_dokumenty',
      'Dodatkowe dokumenty za miesiąc ' || month_label,
      extra_documents_count,
      'szt.',
      coalesce(client_record.koszt_dodatkowego_dokumentu, 0),
      '23%',
      extra_documents_net,
      extra_documents_vat,
      extra_documents_gross,
      20
    )
    on conflict (faktura_id, source_key) where source_key is not null
    do update set
      nazwa = excluded.nazwa,
      ilosc = excluded.ilosc,
      jednostka = excluded.jednostka,
      cena_netto = excluded.cena_netto,
      kwota_netto = excluded.kwota_netto,
      kwota_vat = excluded.kwota_vat,
      kwota_brutto = excluded.kwota_brutto;
  end if;

  for fee_record in
    select
      fee.*,
      fee_settlement.okres as fee_period,
      fee_client.nazwa as fee_client_name,
      public.is_apc_marek_hebel_client(fee_client.nip, fee_client.nazwa) as is_apc_fee
    from public.rozliczenia_oplaty_dodatkowe fee
    join public.rozliczenia_miesieczne fee_settlement on fee_settlement.id = fee.rozliczenie_id
    join public.klienci fee_client on fee_client.id = fee_settlement.klient_id
    where (
        fee_settlement.klient_id = client_record.id
        or (
          public.is_cassubian_client(client_record.nip, client_record.nazwa)
          and public.is_apc_marek_hebel_client(fee_client.nip, fee_client.nazwa)
        )
      )
      and (
        fee.rozliczenie_id = settlement_record.id
        or (
          fee.faktura_id is null
          and date_trunc('month', fee_settlement.okres)::date <= settlement_period
        )
      )
      and (fee.faktura_id is null or fee.faktura_id = invoice_record.id)
    order by date_trunc('month', fee_settlement.okres)::date, fee.created_at
  loop
    if nullif(trim(coalesce(fee_record.uwagi, '')), '') is not null
      and not fee_record.is_apc_fee then
      invoice_description_parts := invoice_description_parts || (
        'Usługa dodatkowa: ' || trim(fee_record.uwagi)
      );
    end if;

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
      sort_order,
      cfo_przychod_kategoria
    )
    values (
      invoice_record.id,
      'oplata:' || fee_record.id::text,
      fee_record.id,
      case
        when fee_record.is_apc_fee then 'Opłata dodatkowa'
        else fee_record.nazwa
      end,
      coalesce(fee_record.ilosc, 1),
      'szt.',
      coalesce(fee_record.kwota_netto, 0),
      '23%',
      extra_net,
      extra_vat,
      extra_gross,
      100,
      case
        when fee_record.is_apc_fee or coalesce(fee_record.uwagi, '') ilike '%Przychód z APC%' then 'abonamenty'
        else null
      end
    )
    on conflict (rozliczenie_oplata_id) where rozliczenie_oplata_id is not null
    do update set
      nazwa = excluded.nazwa,
      ilosc = excluded.ilosc,
      jednostka = excluded.jednostka,
      cena_netto = excluded.cena_netto,
      kwota_netto = excluded.kwota_netto,
      kwota_vat = excluded.kwota_vat,
      kwota_brutto = excluded.kwota_brutto,
      cfo_przychod_kategoria = coalesce(excluded.cfo_przychod_kategoria, faktury_pozycje.cfo_przychod_kategoria);

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

  invoice_description := nullif(array_to_string(invoice_description_parts, E'\n'), '');

  update public.faktury
  set kwota_netto = total_net,
      kwota_vat = total_vat,
      kwota_brutto = total_gross,
      opis = invoice_description
  where id = invoice_record.id;

  update public.rozliczenia_miesieczne
  set faktura_wystawiona = true
  where id = settlement_record.id
    and faktura_wystawiona is distinct from true;

  return invoice_record.id;
end;
$function$;


CREATE OR REPLACE FUNCTION public.ensure_subscription_invoices(public_invoice_month date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  invoice_date date := coalesce(public_invoice_month, current_date);
  settlement_period date := (date_trunc('month', coalesce(public_invoice_month, current_date))::date - interval '1 month')::date;
  ewa_august_period constant date := date '2026-08-01';
  ewa_august_invoice_date constant date := public.last_polish_business_day_of_month(date '2026-08-01');
  settlement_record public.rozliczenia_miesieczne;
  processed integer := 0;
begin
  if auth.uid() is not null and public.current_user_role() not in ('owner', 'admin') then
    raise exception 'Brak uprawnien do generowania faktur.';
  end if;

  perform public.ensure_monthly_settlements(settlement_period);

  if invoice_date = ewa_august_invoice_date then
    perform public.ensure_monthly_settlements(ewa_august_period);

    for settlement_record in
      select settlement.*
      from public.rozliczenia_miesieczne settlement
      join public.klienci client on client.id = settlement.klient_id
      where settlement.okres = ewa_august_period
        and public.is_ewa_owczarz_client(client.nazwa)
        and coalesce(client.abonament, 0) > 0
        and (client.aktywny = true or lower(coalesce(client.status_klienta, '')) = 'onboarding')
        and (client.pierwszy_okres_rozliczeniowy is null or date_trunc('month', client.pierwszy_okres_rozliczeniowy)::date <= ewa_august_period)
        and (client.ostatni_okres_rozliczeniowy is null or date_trunc('month', client.ostatni_okres_rozliczeniowy)::date >= ewa_august_period)
    loop
      perform public.ensure_invoice_for_settlement(settlement_record.id, ewa_august_invoice_date);
      processed := processed + 1;
    end loop;
  end if;

  if invoice_date >= date '2026-08-01' then
    for settlement_record in
      select settlement.*
      from public.rozliczenia_miesieczne settlement
      join public.klienci client on client.id = settlement.klient_id
      where settlement.okres = settlement_period
        and client.model_fakturowania = 'z_gory'
        and not (regexp_replace(coalesce(client.nip, ''), '[^0-9]', '', 'g') = '9721378590'
        and date_trunc('month', settlement.okres)::date = date '2026-08-01')
        and not public.is_apc_marek_hebel_client(client.nip, client.nazwa)
        and coalesce(client.abonament, 0) > 0
        and (client.aktywny = true or lower(coalesce(client.status_klienta, '')) = 'onboarding')
        and (client.pierwszy_okres_rozliczeniowy is null or date_trunc('month', client.pierwszy_okres_rozliczeniowy)::date <= settlement_period)
        and (client.ostatni_okres_rozliczeniowy is null or date_trunc('month', client.ostatni_okres_rozliczeniowy)::date >= settlement_period)
        and not public.has_existing_standard_wfirma_invoice(settlement.klient_id, settlement.okres)
    loop
      perform public.ensure_invoice_for_settlement(
        settlement_record.id,
        public.invoice_issue_date_for_settlement(settlement_record.id, invoice_date)
      );
      processed := processed + 1;
    end loop;
  end if;

  for settlement_record in
    select settlement.*
    from public.rozliczenia_miesieczne settlement
    join public.klienci client on client.id = settlement.klient_id
    where settlement.okres = settlement_period
      and settlement.status_ksiegowosci = 'podatki_wyslane'
      and (client.model_fakturowania = 'z_dolu' or (regexp_replace(coalesce(client.nip, ''), '[^0-9]', '', 'g') = '9721378590'
        and date_trunc('month', settlement.okres)::date = date '2026-08-01'))
      and not public.is_apc_marek_hebel_client(client.nip, client.nazwa)
      and coalesce(client.abonament, 0) > 0
      and (client.aktywny = true or lower(coalesce(client.status_klienta, '')) = 'onboarding')
      and (client.pierwszy_okres_rozliczeniowy is null or date_trunc('month', client.pierwszy_okres_rozliczeniowy)::date <= settlement_period)
      and (client.ostatni_okres_rozliczeniowy is null or date_trunc('month', client.ostatni_okres_rozliczeniowy)::date >= settlement_period)
      and not public.has_existing_standard_wfirma_invoice(settlement.klient_id, settlement.okres)
  loop
    perform public.ensure_invoice_for_settlement(
      settlement_record.id,
      public.invoice_issue_date_for_settlement(settlement_record.id, invoice_date)
    );
    processed := processed + 1;
  end loop;

  return processed;
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_invoice_after_taxes_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  client_billing_model text;
  client_nip text;
  client_name text;
begin
  if new.status_ksiegowosci = 'podatki_wyslane'
    and old.status_ksiegowosci is distinct from new.status_ksiegowosci then
    select model_fakturowania, nip, nazwa
    into client_billing_model, client_nip, client_name
    from public.klienci
    where id = new.klient_id;

    if (client_billing_model = 'z_dolu' or (regexp_replace(coalesce(client_nip, ''), '[^0-9]', '', 'g') = '9721378590'
        and date_trunc('month', new.okres)::date = date '2026-08-01'))
      and not public.is_apc_marek_hebel_client(client_nip, client_name)
      and not public.has_existing_standard_wfirma_invoice(new.klient_id, date_trunc('month', new.okres)::date) then
      perform public.ensure_invoice_for_settlement(
        new.id,
        public.invoice_issue_date_for_settlement(new.id, current_date)
      );
    end if;
  end if;

  return new;
end;
$function$;

-- Withdraw only the unissued, unsent August automatic draft.
-- Keep the client's standard z_gory model, including September and later.
do $cleanup$
declare
  target_client uuid;
  target_settlement public.rozliczenia_miesieczne;
  draft public.faktury;
begin
  select id into strict target_client from public.klienci
  where regexp_replace(coalesce(nip, ''), '[^0-9]', '', 'g') = '9721378590';

  select * into target_settlement from public.rozliczenia_miesieczne
  where klient_id = target_client and okres = date '2026-08-01'
  for update;

  if found and target_settlement.status_ksiegowosci is distinct from 'podatki_wyslane' then
    for draft in
      select * from public.faktury
      where klient_id = target_client and okres = date '2026-08-01'
        and automatyczna = true and kategoria = 'standardowa'
        and status = 'szkic' and zrodlo = 'aplikacja'
        and nullif(trim(numer), '') is null
        and nullif(trim(wfirma_id), '') is null
        and wfirma_sync_status = 'nie_wyslano'
        and wfirma_synced_at is null and wfirma_pdf_path is null
      for update
    loop
      if exists (select 1 from public.faktury_email_history where faktura_id = draft.id)
        or exists (select 1 from public.cfo_transakcje_bankowe where faktura_id = draft.id)
        or exists (select 1 from public.cfo_rozbicia_platnosci where faktura_id = draft.id)
        or exists (select 1 from public.rozliczenia_oplaty_dodatkowe where faktura_id = draft.id) then
        raise exception 'MKS August draft has linked activity; refusing to withdraw it.';
      end if;
      delete from public.faktury where id = draft.id;
    end loop;

    update public.rozliczenia_miesieczne s
    set faktura_wystawiona = false
    where s.id = target_settlement.id
      and not exists (
        select 1 from public.faktury f
        where f.klient_id = s.klient_id and f.okres = s.okres
          and f.kategoria = 'standardowa' and f.status <> 'anulowana'
      );
  end if;
end;
$cleanup$;
