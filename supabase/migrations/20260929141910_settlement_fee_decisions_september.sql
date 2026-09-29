CREATE OR REPLACE FUNCTION public.sync_cassubian_monthly_additional_fee(public_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  settlement_record public.rozliczenia_miesieczne;
  client_record public.klienci;
  fee_definition_id uuid;
  fee_id uuid;
  old_fee_name constant text := 'Stała opłata miesięczna Cassubian';
  fee_name constant text := 'APC - Marek Hebel - stała opłata miesięczna';
  old_fee_note constant text := 'Automatyczna opłata miesięczna od okresu rozliczeniowego lipiec 2026.';
  fee_note constant text := 'opłata dodatkowa - zgodnie z umową';
begin
  select *
  into settlement_record
  from public.rozliczenia_miesieczne
  where id = public_settlement_id;

  if settlement_record.id is null then
    return;
  end if;

  select *
  into client_record
  from public.klienci
  where id = settlement_record.klient_id;

  if client_record.id is null
    or not public.is_cassubian_client(client_record.nip, client_record.nazwa)
    or date_trunc('month', settlement_record.okres)::date < date '2026-07-01' then
    return;
  end if;

  insert into public.oplaty_dodatkowe (
    nazwa,
    domyslna_kwota_netto,
    opis,
    aktywna
  )
  values (
    fee_name,
    250,
    'opłata dodatkowa - zgodnie z umową',
    true
  )
  on conflict (lower(nazwa))
  do update set
    domyslna_kwota_netto = 250,
    opis = excluded.opis,
    aktywna = true
  returning id into fee_definition_id;

  update public.oplaty_dodatkowe
  set aktywna = false
  where nazwa = old_fee_name
    and id <> fee_definition_id;

  update public.rozliczenia_oplaty_dodatkowe fee
  set oplata_id = fee_definition_id,
      nazwa = fee_name,
      kwota_netto = 250,
      ilosc = 1,
      uwagi = fee_note
  where fee.rozliczenie_id = settlement_record.id
    and fee.nazwa = old_fee_name
    and coalesce(fee.uwagi, '') = old_fee_note
    and fee.faktura_id is null;

  delete from public.rozliczenia_oplaty_dodatkowe fee
  where fee.rozliczenie_id = settlement_record.id
    and fee.nazwa = fee_name
    and coalesce(fee.uwagi, '') = fee_note
    and fee.id not in (
      select kept.id
      from public.rozliczenia_oplaty_dodatkowe kept
      where kept.rozliczenie_id = settlement_record.id
        and kept.nazwa = fee_name
        and coalesce(kept.uwagi, '') = fee_note
      order by kept.created_at asc
      limit 1
    );

  select fee.id
  into fee_id
  from public.rozliczenia_oplaty_dodatkowe fee
  where fee.rozliczenie_id = settlement_record.id
    and fee.nazwa = fee_name
    and coalesce(fee.uwagi, '') = fee_note
  order by fee.created_at asc
  limit 1;

  if fee_id is not null then
    update public.rozliczenia_oplaty_dodatkowe
    set oplata_id = fee_definition_id,
        nazwa = fee_name,
        kwota_netto = 250,
        ilosc = 1,
        uwagi = fee_note
    where id = fee_id
      and faktura_id is null;
  else
    insert into public.rozliczenia_oplaty_dodatkowe (
      rozliczenie_id,
      oplata_id,
      nazwa,
      kwota_netto,
      ilosc,
      uwagi,
      created_by
    )
    values (
      settlement_record.id,
      fee_definition_id,
      fee_name,
      250,
      1,
      fee_note,
      auth.uid()
    );
  end if;
end;
$function$;

update public.rozliczenia_oplaty_dodatkowe set uwagi = 'opłata dodatkowa - zgodnie z umową' where nazwa = 'APC - Marek Hebel - stała opłata miesięczna' and uwagi = 'Przychód z APC - Marek Hebel. Automatyczna opłata miesięczna na fakturze Cassubian od okresu rozliczeniowego lipiec 2026.';
update public.oplaty_dodatkowe set opis = 'opłata dodatkowa - zgodnie z umową' where nazwa = 'APC - Marek Hebel - stała opłata miesięczna';
