alter table public.klienci
  add column kilka_abonamentow boolean not null default false,
  add column abonamenty_progi jsonb not null default '[]'::jsonb,
  add column abonamenty_od date;

create function public.valid_subscription_tiers(enabled boolean, tiers jsonb, base_amount numeric, base_limit integer, starts_on date)
returns boolean language plpgsql immutable security invoker set search_path = public as $$
declare item jsonb; previous_limit integer := 0; previous_amount numeric := 0; amount numeric; document_limit integer;
begin
  if jsonb_typeof(tiers) is distinct from 'array' then return false; end if;
  if not enabled then return tiers = '[]'::jsonb and starts_on is null; end if;
  if jsonb_array_length(tiers) < 2 or starts_on is null or starts_on <> date_trunc('month', starts_on)::date then return false; end if;
  for item in select value from jsonb_array_elements(tiers) loop
    if jsonb_typeof(item->'abonament') is distinct from 'number'
      or jsonb_typeof(item->'limit_dokumentow') is distinct from 'number' then return false; end if;
    amount := (item->>'abonament')::numeric;
    if (item->>'limit_dokumentow')::numeric <> trunc((item->>'limit_dokumentow')::numeric) then return false; end if;
    document_limit := (item->>'limit_dokumentow')::integer;
    if amount <= 0 or amount <> round(amount, 2) or amount < previous_amount or document_limit <= previous_limit then return false; end if;
    previous_amount := amount; previous_limit := document_limit;
  end loop;
  return base_amount is not distinct from (tiers->0->>'abonament')::numeric
    and base_limit is not distinct from (tiers->0->>'limit_dokumentow')::integer;
exception when others then return false;
end $$;

alter table public.klienci add constraint klienci_valid_subscription_tiers
  check (public.valid_subscription_tiers(kilka_abonamentow, abonamenty_progi, abonament, limit_dokumentow, abonamenty_od));

create function public.subscription_tier_for_documents(tiers jsonb, documents integer)
returns table(abonament numeric, limit_dokumentow integer)
language sql immutable security invoker set search_path = public as $$
  select (value->>'abonament')::numeric, (value->>'limit_dokumentow')::integer
  from jsonb_array_elements(tiers)
  order by ((value->>'limit_dokumentow')::integer >= greatest(coalesce(documents, 0), 0)) desc,
    case when (value->>'limit_dokumentow')::integer >= greatest(coalesce(documents, 0), 0)
      then (value->>'limit_dokumentow')::integer else -(value->>'limit_dokumentow')::integer end
  limit 1
$$;
revoke all on function public.valid_subscription_tiers(boolean,jsonb,numeric,integer,date) from public, anon;
revoke all on function public.subscription_tier_for_documents(jsonb,integer) from public, anon;
grant execute on function public.valid_subscription_tiers(boolean,jsonb,numeric,integer,date) to authenticated, service_role;
grant execute on function public.subscription_tier_for_documents(jsonb,integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prevent_unauthorized_client_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  user_role text;
begin
  -- Allow only the derived activation performed by the onboarding trigger.
  -- Direct edits and changes to any other client fields still require permission.
  if pg_trigger_depth() > 1
    and new.status_klienta = 'Aktywny'
    and new.aktywny is true
    and public.client_onboarding_is_complete(old.id)
    and (to_jsonb(new) - array['status_klienta', 'aktywny'])
      = (to_jsonb(old) - array['status_klienta', 'aktywny'])
  then
    return new;
  end if;

  select public.get_current_user_role() into user_role;

  if user_role in ('owner', 'manager', 'admin') then
    return new;
  end if;

  if public.is_ada_own_client_editor(old.id) then
    if new.opiekun_id is distinct from old.opiekun_id then
      raise exception 'Brak uprawnień do zmiany opiekuna klienta.';
    end if;

    return new;
  end if;

  if user_role = 'accountant' then
    if
      new.nazwa is distinct from old.nazwa or
      new.nip is distinct from old.nip or
      new.forma_prawna is distinct from old.forma_prawna or
      new.forma_opodatkowania is distinct from old.forma_opodatkowania or
      new.abonament is distinct from old.abonament or
      new.kilka_abonamentow is distinct from old.kilka_abonamentow or
      new.abonamenty_progi is distinct from old.abonamenty_progi or
      new.abonamenty_od is distinct from old.abonamenty_od or
      new.status_klienta is distinct from old.status_klienta or
      new.opiekun_id is distinct from old.opiekun_id or
      new.obsluga_kadrowa is distinct from old.obsluga_kadrowa
    then
      raise exception 'Brak uprawnień do edycji danych administracyjnych klienta.';
    end if;

    return new;
  end if;

  raise exception 'Brak uprawnień do edycji klienta.';
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_document_overage_fee(public_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.rozliczenia_miesieczne;
  c public.klienci;
  expected numeric;
  tier_amount numeric;
  tier_limit integer;
  subscription_baseline numeric;
  uses_tiers boolean;
  committed numeric;
  remaining numeric;
  document_quantity numeric;
  document_unit_price numeric;
  mutable_id uuid;
  hold_reason text;
  previous_refresh text := current_setting('crss.fee_refresh',true);
begin
  select * into s from public.rozliczenia_miesieczne where id=public_settlement_id;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.klient_id::text,0));
  select * into s from public.rozliczenia_miesieczne where id=public_settlement_id for update;
  select * into c from public.klienci where id=s.klient_id;
  uses_tiers := c.kilka_abonamentow and s.okres >= c.abonamenty_od;
  if uses_tiers then
    select t.abonament, t.limit_dokumentow into tier_amount, tier_limit
      from public.subscription_tier_for_documents(c.abonamenty_progi, s.liczba_dokumentow) t;
    -- Issued subscriptions stay unchanged. Only the unbilled difference is carried forward.
    select sum(p.kwota_netto) into subscription_baseline
      from public.faktury i join public.faktury_pozycje p on p.faktura_id=i.id
      where i.klient_id=s.klient_id and i.okres=s.okres and i.kategoria='standardowa'
        and i.status<>'anulowana' and p.source_key='abonament'
        and (i.wfirma_id is not null or i.status<>'szkic' or i.wfirma_sync_status='w_kolejce');
    subscription_baseline := coalesce(subscription_baseline,
      case when c.model_fakturowania='z_gory' then c.abonament else tier_amount end);
    expected := greatest(tier_amount - subscription_baseline, 0)
      + greatest(coalesce(s.liczba_dokumentow,0)-tier_limit,0) * greatest(coalesce(c.koszt_dodatkowego_dokumentu,0),0);
  else
  expected := case when coalesce(c.limit_dokumentow,0)>0 then
    greatest(coalesce(s.liczba_dokumentow,0)-c.limit_dokumentow,0)
      * greatest(coalesce(c.koszt_dodatkowego_dokumentu,0),0) else 0 end;
  end if;
  select coalesce(sum(f.kwota_netto*f.ilosc),0) into committed
  from public.rozliczenia_oplaty_dodatkowe f join public.faktury i on i.id=f.faktura_id
  where f.rozliczenie_id=s.id and f.billing_origin='documents'
    and (i.wfirma_id is not null or i.status<>'szkic' or i.wfirma_sync_status='w_kolejce');
  remaining := greatest(round(expected-s.documents_accounted_net-committed,2),0);
  select f.id into mutable_id from public.rozliczenia_oplaty_dodatkowe f
  left join public.faktury i on i.id=f.faktura_id
  where f.rozliczenie_id=s.id and f.billing_origin='documents'
    and (f.faktura_id is null or (i.wfirma_id is null and i.status='szkic'
      and i.wfirma_sync_status in ('nie_wyslano','blad')))
  order by f.created_at limit 1;
  -- A failed send can make an earlier reservation editable again while a later
  -- delta is still pending. Consolidate those mutable rows before recalculating.
  perform set_config('crss.fee_refresh','on',true);
  delete from public.rozliczenia_oplaty_dodatkowe f
  where f.rozliczenie_id=s.id and f.billing_origin='documents' and f.id<>mutable_id
    and (f.faktura_id is null or exists(select 1 from public.faktury i where i.id=f.faktura_id
      and i.wfirma_id is null and i.status='szkic' and i.wfirma_sync_status in ('nie_wyslano','blad')));
  perform set_config('crss.fee_refresh',coalesce(previous_refresh,''),true);
  if s.okres < date '2026-09-01' and s.id <> '80a52328-db8d-4ac5-bbe7-bcdf09fc9918' then
    hold_reason := 'Historyczna dopłata wymaga uzgodnienia z wystawionymi fakturami. Nie doliczać ponownie bez sprawdzenia.';
  end if;
  if s.id='378e90f0-640e-4c37-9b06-0ea871737deb' then
    hold_reason := 'Metalowe PSA: właściciel wystawia dopłatę samodzielnie. Powiązać z wystawioną fakturą.';
  end if;
  document_quantity := 1;
  document_unit_price := remaining;
  if not uses_tiers and coalesce(c.koszt_dodatkowego_dokumentu,0)>0
    and mod(remaining,c.koszt_dodatkowego_dokumentu)=0 then
    document_unit_price := c.koszt_dodatkowego_dokumentu;
    document_quantity := remaining/document_unit_price;
  end if;
  if mutable_id is not null then
    update public.rozliczenia_oplaty_dodatkowe set kwota_netto=document_unit_price, ilosc=document_quantity,
      nazwa=case when uses_tiers then 'Rozliczenie progów abonamentu za miesiąc '||public.polish_month_label(s.okres) else nazwa end,
      uwagi=case when uses_tiers then format('Abonament dla %s dokumentów: %s zł, limit progu: %s. Nadwyżka powyżej limitu według umowy.',s.liczba_dokumentow,tier_amount,tier_limit) else format('Limit dokumentów zgodnie z umową: %s, faktycznie dostarczone za okres %s: %s.',c.limit_dokumentow,to_char(s.okres,'MM/YYYY'),s.liczba_dokumentow) end
    where id=mutable_id;
  elsif remaining>0 then
    insert into public.rozliczenia_oplaty_dodatkowe (
      rozliczenie_id,nazwa,kwota_netto,ilosc,billing_origin,billing_period,billing_hold_reason,uwagi
    ) values (s.id,case when uses_tiers then 'Rozliczenie progów abonamentu za miesiąc ' else 'Dodatkowe dokumenty za miesiąc ' end||public.polish_month_label(s.okres),
      document_unit_price,document_quantity,'documents',public.additional_fee_billing_period(s.id),hold_reason,
      case when uses_tiers then format('Abonament dla %s dokumentów: %s zł, limit progu: %s. Nadwyżka powyżej limitu według umowy.',s.liczba_dokumentow,tier_amount,tier_limit) else format('Limit dokumentów zgodnie z umową: %s, faktycznie dostarczone za okres %s: %s.',c.limit_dokumentow,to_char(s.okres,'MM/YYYY'),s.liczba_dokumentow) end);
  end if;
end;
$function$;

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
  previous_refresh text := current_setting('crss.fee_refresh',true);
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

  if not found then
    return null;
  end if;

  if regexp_replace(coalesce(client_record.nip, ''), '[^0-9]', '', 'g')
    in ('7851816159', '7851821195') then
    return null;
  end if;

  settlement_period := date_trunc('month', settlement_record.okres)::date;
  -- MKS August and September 2026 wait for the completed settlement.
  if (regexp_replace(coalesce(client_record.nip, ''), '[^0-9]', '', 'g') = '9721378590'
        and date_trunc('month', settlement_period)::date in (date '2026-08-01',date '2026-09-01'))
    and settlement_record.status_ksiegowosci is distinct from 'podatki_wyslane' then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(client_record.id::text,0));
  select * into invoice_record from public.faktury
  where klient_id=client_record.id and okres=settlement_period
    and kategoria='standardowa' and status<>'anulowana'
    and (wfirma_id is not null or status<>'szkic' or wfirma_sync_status='w_kolejce')
  order by created_at limit 1 for update;
  if found then return invoice_record.id; end if;
  perform set_config('crss.fee_refresh','on',true);
  perform public.sync_document_overage_fee(s.id)
  from public.rozliczenia_miesieczne s
  where s.klient_id=client_record.id and s.okres<=settlement_period
  order by s.okres,s.id;

  month_label := public.polish_month_label(settlement_period);

  subscription_net := round(coalesce(client_record.abonament, 0), 2);
  if client_record.kilka_abonamentow and settlement_period >= client_record.abonamenty_od
    and client_record.model_fakturowania = 'z_dolu' then
    select round(t.abonament, 2) into subscription_net
      from public.subscription_tier_for_documents(client_record.abonamenty_progi, settlement_record.liczba_dokumentow) t;
  end if;
  subscription_vat := round(subscription_net * 0.23, 2);
  subscription_gross := subscription_net + subscription_vat;

  payroll_net := round(
    greatest(coalesce(settlement_record.liczba_pracownikow, 0), 0) * coalesce(client_record.koszt_obslugi_pracownika, 0)
    + greatest(coalesce(settlement_record.liczba_zleceniobiorcow, 0), 0) * coalesce(client_record.koszt_obslugi_zleceniobiorcy, 0),
    2
  );
  payroll_vat := round(payroll_net * 0.23, 2);
  payroll_gross := payroll_net + payroll_vat;


  -- No subscription and no billable services: do not create a zero-value draft.
  if subscription_net <= 0
    and not (coalesce(client_record.obsluga_kadrowa, false) and payroll_net > 0)
    and not exists (
      select 1
      from public.rozliczenia_oplaty_dodatkowe fee
      join public.rozliczenia_miesieczne origin on origin.id = fee.rozliczenie_id
      where origin.klient_id = client_record.id
        and fee.billing_period <= settlement_period
        and fee.billing_hold_reason is null
        and round(fee.kwota_netto * fee.ilosc, 2) > 0
        and (fee.faktura_id is null or exists (
          select 1 from public.faktury draft
          where draft.id = fee.faktura_id
            and draft.klient_id = client_record.id
            and draft.okres = settlement_period
            and draft.automatyczna
            and draft.status = 'szkic'
            and draft.wfirma_id is null
            and draft.wfirma_sync_status in ('nie_wyslano', 'blad')
        ))
    ) then
    perform set_config('crss.fee_refresh', coalesce(previous_refresh, ''), true);
    return null;
  end if;

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


  invoice_description := nullif(array_to_string(invoice_description_parts, E'\n'), '');

  select * into invoice_record from public.faktury
  where klient_id=client_record.id and okres=settlement_period and automatyczna
  for update;
  if found then
    update public.faktury set
      kontrahent_nazwa=coalesce(client_record.nazwa,'Klient'),
      kontrahent_nip=client_record.nip, kontrahent_email=client_record.email,
      data_wystawienia=invoice_date, data_sprzedazy=settlement_period,
      opis=case when opis_reczny then opis else invoice_description end
    where id=invoice_record.id returning * into invoice_record;
  else
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
    opis = case when faktury.opis_reczny then faktury.opis else excluded.opis end
  returning * into invoice_record;
  end if;

  delete from public.faktury_pozycje p using public.rozliczenia_oplaty_dodatkowe f
  where p.faktura_id=invoice_record.id and p.rozliczenie_oplata_id=f.id
    and (f.kwota_netto*f.ilosc<=0 or f.billing_period>settlement_period or f.billing_hold_reason is not null);
  update public.rozliczenia_oplaty_dodatkowe f set faktura_id=null,fakturowane_at=null
  where f.faktura_id=invoice_record.id and not exists
    (select 1 from public.faktury_pozycje p where p.rozliczenie_oplata_id=f.id and p.faktura_id=invoice_record.id);

  delete from public.faktury_pozycje
  where faktura_id = invoice_record.id
    and source_key in ('kadry', 'dodatkowe_dokumenty')
    and not reczna_edycja;

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
    nazwa = case when faktury_pozycje.reczna_edycja then faktury_pozycje.nazwa else excluded.nazwa end,
    jednostka = excluded.jednostka,
    cena_netto = excluded.cena_netto,
    kwota_netto = excluded.kwota_netto,
    kwota_vat = excluded.kwota_vat,
    kwota_brutto = excluded.kwota_brutto
  where not faktury_pozycje.reczna_edycja;

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
      nazwa = case when faktury_pozycje.reczna_edycja then faktury_pozycje.nazwa else excluded.nazwa end,
      jednostka = excluded.jednostka,
      cena_netto = excluded.cena_netto,
      kwota_netto = excluded.kwota_netto,
      kwota_vat = excluded.kwota_vat,
      kwota_brutto = excluded.kwota_brutto
  where not faktury_pozycje.reczna_edycja;
  end if;

  for fee_record in
    select
      fee.*,
      fee_settlement.okres as fee_period,
      fee_client.nazwa as fee_client_name
    from public.rozliczenia_oplaty_dodatkowe fee
    join public.rozliczenia_miesieczne fee_settlement on fee_settlement.id = fee.rozliczenie_id
    join public.klienci fee_client on fee_client.id = fee_settlement.klient_id
    where fee_settlement.klient_id = client_record.id
      and fee.billing_period <= settlement_period
      and fee.billing_hold_reason is null
      and fee.kwota_netto * fee.ilosc > 0
      and (fee.faktura_id is null or fee.faktura_id = invoice_record.id)
    order by date_trunc('month', fee_settlement.okres)::date, fee.created_at
  loop
    if nullif(trim(coalesce(fee_record.uwagi, '')), '') is not null then
      invoice_description_parts := invoice_description_parts || (
        case when fee_record.billing_origin = 'documents' then '' else 'Usługa dodatkowa: ' end || trim(fee_record.uwagi)
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
      fee_record.nazwa,
      coalesce(fee_record.ilosc, 1),
      'szt.',
      coalesce(fee_record.kwota_netto, 0),
      '23%',
      extra_net,
      extra_vat,
      extra_gross,
      100,
      null
    )
    on conflict (rozliczenie_oplata_id) where rozliczenie_oplata_id is not null
    do update set
      nazwa = case when faktury_pozycje.reczna_edycja then faktury_pozycje.nazwa else excluded.nazwa end,
      ilosc = excluded.ilosc,
      jednostka = excluded.jednostka,
      cena_netto = excluded.cena_netto,
      kwota_netto = excluded.kwota_netto,
      kwota_vat = excluded.kwota_vat,
      kwota_brutto = excluded.kwota_brutto,
      cfo_przychod_kategoria = coalesce(excluded.cfo_przychod_kategoria, faktury_pozycje.cfo_przychod_kategoria);

    if not exists (select 1 from public.faktury_pozycje
      where faktura_id=invoice_record.id and rozliczenie_oplata_id=fee_record.id
        and kwota_netto=extra_net) then
      raise exception 'Nie zapisano pozycji opłaty %. Faktura nie została zmieniona.', fee_record.id;
    end if;
    update public.rozliczenia_oplaty_dodatkowe
    set faktura_id = invoice_record.id,
        fakturowane_at = null
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
      opis = case when opis_reczny then opis else invoice_description end
  where id = invoice_record.id;

  update public.rozliczenia_miesieczne
  set faktura_wystawiona = true
  where id = settlement_record.id
    and faktura_wystawiona is distinct from true;

  perform set_config('crss.fee_refresh',coalesce(previous_refresh,''),true);
  return invoice_record.id;
end;
$function$;
