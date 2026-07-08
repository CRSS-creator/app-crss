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

  settlement_period := date_trunc('month', settlement_record.okres)::date;
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

  extra_documents_count := greatest(
    coalesce(settlement_record.liczba_dokumentow, 0) - coalesce(client_record.limit_dokumentow, 0),
    0
  );
  extra_documents_net := round(extra_documents_count * coalesce(client_record.koszt_dodatkowego_dokumentu, 0), 2);
  extra_documents_vat := round(extra_documents_net * 0.23, 2);
  extra_documents_gross := extra_documents_net + extra_documents_vat;

  if coalesce(client_record.obsluga_kadrowa, false) then
    invoice_description_parts := invoice_description_parts || format(
      'Liczba pracowników wg umów: pracownicy %s, zleceniobiorcy %s.',
      coalesce(settlement_record.liczba_pracownikow, 0),
      coalesce(settlement_record.liczba_zleceniobiorcow, 0)
    );
  end if;

  if extra_documents_count > 0 then
    invoice_description_parts := invoice_description_parts || format(
      'Dokumenty w abonamencie: %s; dokumenty faktycznie dostarczone: %s.',
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
    'usł.',
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
      'usł.',
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
    select *
    from public.rozliczenia_oplaty_dodatkowe
    where rozliczenie_id = settlement_record.id
      and (faktura_id is null or faktura_id = invoice_record.id)
  loop
    if nullif(trim(coalesce(fee_record.uwagi, '')), '') is not null then
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
      jednostka = excluded.jednostka,
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
$$;

revoke all on function public.ensure_invoice_for_settlement(uuid, date) from public;
