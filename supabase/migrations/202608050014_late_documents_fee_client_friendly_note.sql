create or replace function public.sync_late_documents_fee(public_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settlement_record public.rozliczenia_miesieczne;
  client_record public.klienci;
  fee_id uuid;
  should_apply boolean := false;
  fee_amount numeric(12, 2);
  documents_due_date date;
  late_fee_name text := 'Opłata za nieterminowe dostarczenie dokumentów';
  late_fee_note text;
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

  if client_record.id is null then
    return;
  end if;

  documents_due_date := (
    date_trunc('month', settlement_record.okres)::date + interval '1 month' + interval '6 days'
  )::date;

  should_apply :=
    client_record.model_fakturowania = 'z_gory'
    and coalesce(client_record.nazwa, '') not ilike '%Śremski Klub Sportowy Warta%'
    and coalesce(client_record.nazwa, '') not ilike '%Adalbertus%'
    and settlement_record.data_dostarczenia_dokumentow is not null
    and settlement_record.data_dostarczenia_dokumentow > documents_due_date;

  delete from public.rozliczenia_oplaty_dodatkowe fee
  where fee.rozliczenie_id = settlement_record.id
    and fee.nazwa = late_fee_name
    and (
      coalesce(fee.uwagi, '') like 'Automatyczna opłata%'
      or coalesce(fee.uwagi, '') ilike 'Dokumenty za okres%'
    )
    and fee.id not in (
      select kept.id
      from public.rozliczenia_oplaty_dodatkowe kept
      where kept.rozliczenie_id = settlement_record.id
        and kept.nazwa = late_fee_name
        and (
          coalesce(kept.uwagi, '') like 'Automatyczna opłata%'
          or coalesce(kept.uwagi, '') ilike 'Dokumenty za okres%'
        )
      order by kept.created_at asc
      limit 1
    );

  select fee.id
  into fee_id
  from public.rozliczenia_oplaty_dodatkowe fee
  where fee.rozliczenie_id = settlement_record.id
    and fee.nazwa = late_fee_name
    and (
      coalesce(fee.uwagi, '') like 'Automatyczna opłata%'
      or coalesce(fee.uwagi, '') ilike 'Dokumenty za okres%'
    )
  order by fee.created_at asc
  limit 1;

  if not should_apply then
    if fee_id is not null then
      delete from public.rozliczenia_oplaty_dodatkowe where id = fee_id;
    end if;
    return;
  end if;

  fee_amount := greatest(150, round(coalesce(client_record.abonament, 0) * 0.1, 2));
  late_fee_note := format(
    'Dokumenty za okres %s dostarczono %s; zgodnie z umową powinny być dostarczone do %s.',
    to_char(date_trunc('month', settlement_record.okres)::date, 'YYYY-MM'),
    to_char(settlement_record.data_dostarczenia_dokumentow, 'DD.MM.YYYY'),
    to_char(documents_due_date, 'DD.MM.YYYY')
  );

  if fee_id is not null then
    update public.rozliczenia_oplaty_dodatkowe
    set oplata_id = null,
        nazwa = late_fee_name,
        kwota_netto = fee_amount,
        ilosc = 1,
        uwagi = late_fee_note
    where id = fee_id;
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
      null,
      late_fee_name,
      fee_amount,
      1,
      late_fee_note,
      auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.sync_late_documents_fee(uuid) from public;
grant execute on function public.sync_late_documents_fee(uuid) to authenticated;

update public.rozliczenia_oplaty_dodatkowe fee
set uwagi = regexp_replace(coalesce(fee.uwagi, ''), '^Automatyczna opłata:\\s*', '', 'i')
where fee.nazwa = 'Opłata za nieterminowe dostarczenie dokumentów'
  and coalesce(fee.uwagi, '') like 'Automatyczna opłata:%';
