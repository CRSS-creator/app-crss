-- Replace a remote snapshot atomically, preserving the identity of billed fees.
-- A changed/missing fee line requires explicit reconciliation instead of losing
-- the relationship or charging the customer again.
create or replace function public.replace_wfirma_invoice_lines(
  public_invoice_id uuid, public_lines jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  linked record;
  candidate integer;
  candidates integer;
  mappings jsonb := '{}'::jsonb;
  categories jsonb := '{}'::jsonb;
  previous_snapshot text := current_setting('crss.invoice_snapshot',true);
begin
  if jsonb_typeof(public_lines) is distinct from 'array' then
    raise exception 'Nieprawidłowa lista pozycji faktury.';
  end if;
  perform 1 from public.faktury where id = public_invoice_id for update;
  if not found then raise exception 'Nie znaleziono faktury.'; end if;

  for linked in
    select p.* from public.faktury_pozycje p
    where p.faktura_id = public_invoice_id and p.rozliczenie_oplata_id is not null
    order by p.id
  loop
    select count(*), min(e.ordinality::integer) into candidates, candidate
    from jsonb_array_elements(public_lines) with ordinality e(value, ordinality)
    where not (mappings ? e.ordinality::text)
      and trim(e.value->>'nazwa') = trim(linked.nazwa)
      and (e.value->>'ilosc')::numeric = linked.ilosc
      and (e.value->>'kwota_netto')::numeric = linked.kwota_netto
      and (e.value->>'kwota_vat')::numeric = linked.kwota_vat;
    if candidates = 0 then
      raise exception 'Opłata dodatkowa "%" nie ma zgodnej pozycji w wFirmie. Zachowano dotychczasowe powiązania; wyjaśnij zmianę faktury.', linked.nazwa;
    end if;
    mappings := mappings || jsonb_build_object(candidate::text, linked.rozliczenie_oplata_id);
    categories := categories || jsonb_build_object(candidate::text, linked.cfo_przychod_kategoria);
  end loop;

  -- Do not erase evidence of a fee that was already detached by the old importer.
  if exists (
    select 1 from public.rozliczenia_oplaty_dodatkowe f
    where f.faktura_id = public_invoice_id
      and not exists (select 1 from public.faktury_pozycje p
        where p.faktura_id = public_invoice_id and p.rozliczenie_oplata_id = f.id)
  ) then
    raise exception 'Faktura zawiera opłatę bez powiązanej pozycji. Wymaga uzgodnienia przed synchronizacją.';
  end if;

  perform set_config('crss.invoice_snapshot',public_invoice_id::text,true);
  delete from public.faktury_pozycje where faktura_id = public_invoice_id;
  insert into public.faktury_pozycje (
    faktura_id, source_key, rozliczenie_oplata_id, nazwa, ilosc,
    jednostka, cena_netto, stawka_vat, kwota_netto, kwota_vat,
    kwota_brutto, sort_order, cfo_przychod_kategoria
  )
  select public_invoice_id, e.value->>'source_key',
    (mappings->>e.ordinality::text)::uuid, e.value->>'nazwa',
    (e.value->>'ilosc')::numeric, e.value->>'jednostka',
    (e.value->>'cena_netto')::numeric, e.value->>'stawka_vat',
    (e.value->>'kwota_netto')::numeric, (e.value->>'kwota_vat')::numeric,
    (e.value->>'kwota_brutto')::numeric, (e.value->>'sort_order')::integer,
    categories->>e.ordinality::text
  from jsonb_array_elements(public_lines) with ordinality e(value, ordinality);
  perform set_config('crss.invoice_snapshot',coalesce(previous_snapshot,''),true);
end;
$$;
revoke all on function public.replace_wfirma_invoice_lines(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.replace_wfirma_invoice_lines(uuid,jsonb) to service_role;

alter table public.rozliczenia_oplaty_dodatkowe
  add column billing_origin text not null default 'manual',
  add column billing_period date,
  add column billing_hold_reason text;
alter table public.rozliczenia_miesieczne
  add column documents_accounted_net numeric(12,2) not null default 0,
  add column documents_accounted_reason text;

-- Imported document lines were not linked to settlement fees. Keep a separate
-- baseline rather than inventing invoice links for these historical amounts.
update public.rozliczenia_miesieczne s set
  documents_accounted_net = coalesce((
    select max(invoice_documents.net) from (
      select sum(p.kwota_netto) net from public.faktury i
      join public.faktury_pozycje p on p.faktura_id = i.id
      where i.klient_id = s.klient_id and i.okres = s.okres
        and i.wfirma_id is not null and i.status <> 'anulowana'
        and (p.source_key = 'dodatkowe_dokumenty' or p.nazwa ilike 'Dodatkowe dokumenty%'
          or p.nazwa ilike 'Dokumenty dodatkowe%')
      group by i.id
    ) invoice_documents
  ),0),
  documents_accounted_reason = 'Pozycje dokumentów na historycznych fakturach; stan na 29.09.2026'
where s.okres < date '2026-09-01';

-- Exact owner decisions: do not resurrect waived document overages.
update public.rozliczenia_miesieczne s set
  documents_accounted_net = case when coalesce(c.limit_dokumentow,0) > 0
    then greatest(coalesce(s.liczba_dokumentow,0)-c.limit_dokumentow,0)
      * greatest(coalesce(c.koszt_dodatkowego_dokumentu,0),0) else 0 end,
  documents_accounted_reason = 'Odstąpienie właściciela od dopłaty 29.09.2026'
from public.klienci c where c.id=s.klient_id and s.id in (
 'f8351fcd-55fb-43d0-adbb-2869ad42f943','900e7d2f-a6c2-41e1-971d-5445f0b87b88',
 '3c6049c7-5397-4b41-9e8d-67ae107eb07d','e25591e4-5e66-47ad-8198-ff1be4b6d761',
 '0b944440-368c-4a58-8bcf-661e82d2dee4','34ac221e-8fed-4e0c-8e31-c28b41876cd3',
 'd4ee52bf-33c5-44e4-9964-13fa0ecb45ac','6c95a700-81e7-4a0f-a94f-75f5a4b6c5f2',
 '128e26a5-624c-459b-93be-ce593763750d');

create or replace function public.additional_fee_billing_period(public_settlement_id uuid)
returns date language sql stable security definer set search_path=public as $$
  select (date_trunc('month',s.okres) + case when c.model_fakturowania='z_gory'
    then interval '1 month' else interval '0 months' end)::date
  from public.rozliczenia_miesieczne s join public.klienci c on c.id=s.klient_id
  where s.id=public_settlement_id
$$;
revoke all on function public.additional_fee_billing_period(uuid) from public,anon,authenticated;

update public.rozliczenia_oplaty_dodatkowe
set billing_period=public.additional_fee_billing_period(rozliczenie_id);

-- Restore four exact name/amount matches detached by the old importer.
with matches as (
  select f.id fee_id,p.id line_id,count(*) over(partition by f.id) candidate_count
  from public.rozliczenia_oplaty_dodatkowe f
  join public.faktury_pozycje p on p.faktura_id=f.faktura_id
  where p.rozliczenie_oplata_id is null and p.nazwa=f.nazwa
    and p.ilosc=f.ilosc and p.kwota_netto=round(f.kwota_netto*f.ilosc,2)
    and not exists(select 1 from public.faktury_pozycje linked where linked.rozliczenie_oplata_id=f.id)
)
update public.faktury_pozycje p set rozliczenie_oplata_id=m.fee_id
from matches m where p.id=m.line_id and m.candidate_count=1;

-- Verified against the fee's service note and the July invoice line. The previous
-- September link pointed at an invoice containing only the subscription.
update public.rozliczenia_oplaty_dodatkowe f
set faktura_id=p.faktura_id
from public.faktury_pozycje p
where f.id='a27c8d19-e10f-45c5-b6cc-1df0dbe3abbd'
  and p.id='a093e409-6ff8-4a16-8bf1-da611defd0f9'
  and p.kwota_netto=round(f.kwota_netto*f.ilosc,2) and p.rozliczenie_oplata_id is null;
update public.faktury_pozycje p set rozliczenie_oplata_id=f.id
from public.rozliczenia_oplaty_dodatkowe f
where f.id='a27c8d19-e10f-45c5-b6cc-1df0dbe3abbd'
  and p.id='a093e409-6ff8-4a16-8bf1-da611defd0f9'
  and p.faktura_id=f.faktura_id and p.rozliczenie_oplata_id is null;

create or replace function public.sync_document_overage_fee(public_settlement_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  s public.rozliczenia_miesieczne;
  c public.klienci;
  expected numeric;
  committed numeric;
  remaining numeric;
  mutable_id uuid;
  hold_reason text;
  previous_refresh text := current_setting('crss.fee_refresh',true);
begin
  select * into s from public.rozliczenia_miesieczne where id=public_settlement_id;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(s.klient_id::text,0));
  select * into s from public.rozliczenia_miesieczne where id=public_settlement_id for update;
  select * into c from public.klienci where id=s.klient_id;
  expected := case when coalesce(c.limit_dokumentow,0)>0 then
    greatest(coalesce(s.liczba_dokumentow,0)-c.limit_dokumentow,0)
      * greatest(coalesce(c.koszt_dodatkowego_dokumentu,0),0) else 0 end;
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
  if mutable_id is not null then
    update public.rozliczenia_oplaty_dodatkowe set kwota_netto=remaining, ilosc=1
    where id=mutable_id;
  elsif remaining>0 then
    insert into public.rozliczenia_oplaty_dodatkowe (
      rozliczenie_id,nazwa,kwota_netto,ilosc,billing_origin,billing_period,billing_hold_reason,uwagi
    ) values (s.id,'Dodatkowe dokumenty za miesiąc '||public.polish_month_label(s.okres),
      remaining,1,'documents',public.additional_fee_billing_period(s.id),hold_reason,
      format('Dokumenty: %s; limit: %s; stawka: %s zł netto.',s.liczba_dokumentow,c.limit_dokumentow,c.koszt_dodatkowego_dokumentu));
  end if;
end;
$$;
revoke all on function public.sync_document_overage_fee(uuid) from public,anon,authenticated;

create or replace function public.prepare_additional_fee()
returns trigger language plpgsql security definer set search_path=public as $$
declare client_id uuid; frozen boolean;
begin
  select klient_id into client_id from public.rozliczenia_miesieczne
  where id=case when tg_op='DELETE' then old.rozliczenie_id else new.rozliczenie_id end;
  perform pg_advisory_xact_lock(hashtextextended(client_id::text,0));
  if tg_op<>'INSERT' and old.faktura_id is not null then
    select (wfirma_id is not null or status<>'szkic' or wfirma_sync_status='w_kolejce')
    into frozen from public.faktury where id=old.faktura_id;
    if frozen and (tg_op='DELETE' or row(new.nazwa,new.kwota_netto,new.ilosc,new.rozliczenie_id)
      is distinct from row(old.nazwa,old.kwota_netto,old.ilosc,old.rozliczenie_id)) then
      raise exception 'Opłata jest na wystawionej lub wysyłanej fakturze. Dodaj osobną dopłatę albo uzgodnij korektę.';
    end if;
  end if;
  if tg_op='DELETE' then
    delete from public.faktury_pozycje where rozliczenie_oplata_id=old.id;
    return old;
  end if;
  if new.billing_period is null or (tg_op='UPDATE' and new.rozliczenie_id<>old.rozliczenie_id) then
    new.billing_period := public.additional_fee_billing_period(new.rozliczenie_id);
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_additional_fee() from public,anon,authenticated;
create trigger prepare_additional_fee before insert or update or delete
on public.rozliczenia_oplaty_dodatkowe for each row execute function public.prepare_additional_fee();

create or replace function public.track_document_overage()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.sync_document_overage_fee(new.id);
  return new;
end;
$$;
revoke all on function public.track_document_overage() from public,anon,authenticated;
create trigger track_document_overage after insert or update of liczba_dokumentow,okres,klient_id
on public.rozliczenia_miesieczne for each row execute function public.track_document_overage();

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

  delete from public.faktury_pozycje p using public.rozliczenia_oplaty_dodatkowe f
  where p.faktura_id=invoice_record.id and p.rozliczenie_oplata_id=f.id
    and (f.kwota_netto*f.ilosc<=0 or f.billing_period>settlement_period or f.billing_hold_reason is not null);
  update public.rozliczenia_oplaty_dodatkowe f set faktura_id=null,fakturowane_at=null
  where f.faktura_id=invoice_record.id and not exists
    (select 1 from public.faktury_pozycje p where p.rozliczenie_oplata_id=f.id and p.faktura_id=invoice_record.id);

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
      and fee.billing_period <= settlement_period
      and fee.billing_hold_reason is null
      and fee.kwota_netto * fee.ilosc > 0
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
        when fee_record.is_apc_fee or fee_record.oplata_id='f6b592d3-949a-4ed0-a3de-e35467417aec' then 'abonamenty'
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
      opis = invoice_description
  where id = invoice_record.id;

  update public.rozliczenia_miesieczne
  set faktura_wystawiona = true
  where id = settlement_record.id
    and faktura_wystawiona is distinct from true;

  perform set_config('crss.fee_refresh',coalesce(previous_refresh,''),true);
  return invoice_record.id;
end;
$function$
;

create or replace function public.claim_invoice_for_billing(public_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare i public.faktury; settlement_id uuid; rebuilt uuid; result jsonb;
begin
  select * into i from public.faktury where id=public_invoice_id;
  if not found then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(i.klient_id::text,0));
  select * into i from public.faktury where id=public_invoice_id for update;
  if i.wfirma_id is not null or i.status<>'szkic' or i.zrodlo<>'aplikacja'
    or i.wfirma_sync_status not in ('nie_wyslano','blad') then return null; end if;
  if i.automatyczna then
    select id into settlement_id from public.rozliczenia_miesieczne
      where klient_id=i.klient_id and okres=i.okres;
    if settlement_id is null then raise exception 'Brak rozliczenia źródłowego faktury.'; end if;
    rebuilt := public.ensure_invoice_for_settlement(settlement_id,coalesce(i.data_wystawienia,current_date));
    if rebuilt is distinct from i.id then raise exception 'Istnieje inna faktura dla tego okresu.'; end if;
  end if;
  update public.faktury set wfirma_sync_status='w_kolejce',wfirma_sync_error=null
    where id=i.id returning * into i;
  select to_jsonb(i) || jsonb_build_object(
    'klienci',(select jsonb_build_object('email',email) from public.klienci where id=i.klient_id),
    'faktury_pozycje',coalesce((select jsonb_agg(to_jsonb(p) order by p.sort_order,p.id)
      from public.faktury_pozycje p where p.faktura_id=i.id),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.claim_invoice_for_billing(uuid) from public,anon,authenticated;
grant execute on function public.claim_invoice_for_billing(uuid) to service_role;

create or replace function public.refresh_existing_fee_draft()
returns trigger language plpgsql security definer set search_path=public as $$
declare source_id uuid; target_id uuid; issue_date date;
begin
  if current_setting('crss.fee_refresh',true)='on' then return null; end if;
  if tg_op='UPDATE' and row(new.rozliczenie_id,new.nazwa,new.kwota_netto,new.ilosc,new.uwagi,new.billing_period,new.billing_hold_reason)
    is not distinct from row(old.rozliczenie_id,old.nazwa,old.kwota_netto,old.ilosc,old.uwagi,old.billing_period,old.billing_hold_reason) then
    return null;
  end if;
  source_id := case when tg_op='DELETE' then old.rozliczenie_id else new.rozliczenie_id end;
  select target.id,i.data_wystawienia into target_id,issue_date
  from public.rozliczenia_miesieczne origin
  join public.faktury i on i.klient_id=origin.klient_id
  join public.rozliczenia_miesieczne target on target.klient_id=i.klient_id and target.okres=i.okres
  where origin.id=source_id and i.automatyczna and i.status='szkic'
    and i.wfirma_id is null and i.wfirma_sync_status in ('nie_wyslano','blad')
    and i.okres>=public.additional_fee_billing_period(source_id)
  order by i.okres,i.created_at limit 1;
  if target_id is not null then
    perform public.ensure_invoice_for_settlement(target_id,coalesce(issue_date,current_date));
  end if;
  return null;
end;
$$;
revoke all on function public.refresh_existing_fee_draft() from public,anon,authenticated;
create trigger refresh_existing_fee_draft after insert or update or delete
on public.rozliczenia_oplaty_dodatkowe for each row execute function public.refresh_existing_fee_draft();

-- Protect callers still using the old send endpoint: an outdated draft must
-- fail visibly rather than omit an eligible fee during the application rollout.
create or replace function public.validate_invoice_fee_claim()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.wfirma_sync_status='w_kolejce' and old.wfirma_sync_status<>'w_kolejce'
    and new.automatyczna then
    perform pg_advisory_xact_lock(hashtextextended(new.klient_id::text,0));
    perform public.sync_document_overage_fee(s.id)
      from public.rozliczenia_miesieczne s where s.klient_id=new.klient_id and s.okres<=new.okres;
    if exists (
      select 1 from public.rozliczenia_oplaty_dodatkowe f
      join public.rozliczenia_miesieczne s on s.id=f.rozliczenie_id
      where s.klient_id=new.klient_id and f.billing_period<=new.okres
        and f.billing_hold_reason is null and f.kwota_netto*f.ilosc>0
        and (f.faktura_id is null or f.faktura_id=new.id)
        and not exists(select 1 from public.faktury_pozycje p
          where p.faktura_id=new.id and p.rozliczenie_oplata_id=f.id
            and p.kwota_netto=round(f.kwota_netto*f.ilosc,2)
            and p.ilosc=f.ilosc and p.cena_netto=f.kwota_netto)
    ) then
      raise exception 'Szkic nie zawiera aktualnych opłat dodatkowych. Przelicz fakturę przed wysłaniem.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_invoice_fee_claim() from public,anon,authenticated;
create trigger validate_invoice_fee_claim before update of wfirma_sync_status on public.faktury
for each row execute function public.validate_invoice_fee_claim();

create or replace function public.protect_additional_fee_line()
returns trigger language plpgsql security definer set search_path=public as $$
declare f public.rozliczenia_oplaty_dodatkowe; i public.faktury;
begin
  if old.rozliczenie_oplata_id is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if current_setting('crss.invoice_snapshot',true)=old.faktura_id::text then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select * into i from public.faktury where id=old.faktura_id;
  if i.wfirma_id is not null or i.status<>'szkic' or i.wfirma_sync_status='w_kolejce' then
    raise exception 'Nie można usunąć ani zmienić powiązanej opłaty na wystawionej lub wysyłanej fakturze.';
  end if;
  if tg_op='DELETE' then
    -- A removed draft position releases the liability for the next reconciliation.
    -- Deleting the underlying fee itself remains an explicit waiver by the operator.
    if pg_trigger_depth()=1 then
      update public.rozliczenia_oplaty_dodatkowe set faktura_id=null,fakturowane_at=null
        where id=old.rozliczenie_oplata_id and faktura_id=old.faktura_id;
    end if;
    return old;
  end if;
  select * into f from public.rozliczenia_oplaty_dodatkowe where id=old.rozliczenie_oplata_id;
  if new.rozliczenie_oplata_id is distinct from old.rozliczenie_oplata_id
    or new.faktura_id is distinct from old.faktura_id
    or new.kwota_netto is distinct from round(f.kwota_netto*f.ilosc,2)
    or new.ilosc is distinct from f.ilosc or new.cena_netto is distinct from f.kwota_netto then
    raise exception 'Zmień opłatę w rozliczeniu klienta, aby zachować zgodność z fakturą.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_additional_fee_line() from public,anon,authenticated;
create trigger protect_additional_fee_line before update or delete on public.faktury_pozycje
for each row execute function public.protect_additional_fee_line();

create or replace function public.delete_local_invoice_draft(public_invoice_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare i public.faktury; fee_ids uuid[];
begin
  select * into i from public.faktury where id=public_invoice_id for update;
  if not found then return; end if;
  if i.wfirma_id is not null or i.status<>'szkic' or i.zrodlo<>'aplikacja'
    or i.wfirma_sync_status not in ('nie_wyslano','blad') then
    raise exception 'Można usunąć tylko lokalny szkic przed wysłaniem do wFirmy.';
  end if;
  select array_agg(id) into fee_ids from public.rozliczenia_oplaty_dodatkowe where faktura_id=i.id;
  delete from public.faktury where id=i.id;
  update public.rozliczenia_oplaty_dodatkowe set fakturowane_at=null
    where id=any(fee_ids) and faktura_id is null;
end;
$$;
revoke all on function public.delete_local_invoice_draft(uuid) from public,anon,authenticated;
grant execute on function public.delete_local_invoice_draft(uuid) to service_role;

create or replace function public.confirm_invoice_additional_fees()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.wfirma_id is not null then
    update public.rozliczenia_oplaty_dodatkowe f set fakturowane_at=coalesce(f.fakturowane_at,now())
    where f.faktura_id=new.id and exists (select 1 from public.faktury_pozycje p
      where p.faktura_id=new.id and p.rozliczenie_oplata_id=f.id);
  end if;
  return new;
end;
$$;
revoke all on function public.confirm_invoice_additional_fees() from public,anon,authenticated;
create trigger confirm_invoice_additional_fees after update of wfirma_id
on public.faktury for each row execute function public.confirm_invoice_additional_fees();

-- Backfill liabilities without creating or issuing invoices. Historical unknowns
-- are visible but held; only the explicitly agreed IDIL August carry is released.
do $$ declare s record; begin
  for s in select id from public.rozliczenia_miesieczne order by klient_id,okres,id loop
    perform public.sync_document_overage_fee(s.id);
  end loop;
end $$;

CREATE OR REPLACE FUNCTION public.sync_late_documents_fee(public_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  perform pg_advisory_xact_lock(hashtextextended(client_record.id::text,0));
  if exists (select 1 from public.rozliczenia_oplaty_dodatkowe f join public.faktury i on i.id=f.faktura_id
    where f.rozliczenie_id=settlement_record.id and f.nazwa=late_fee_name
      and (i.wfirma_id is not null or i.status<>'szkic' or i.wfirma_sync_status='w_kolejce')) then
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
    and settlement_record.data_dostarczenia_dokumentow >= (documents_due_date + interval '3 days')::date;

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
$function$
;

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
        and (coalesce(client.abonament, 0)>0 or exists (
          select 1 from public.rozliczenia_oplaty_dodatkowe fee
          join public.rozliczenia_miesieczne origin on origin.id=fee.rozliczenie_id
          where origin.klient_id=client.id and fee.faktura_id is null
            and fee.billing_period<=settlement.okres and fee.billing_hold_reason is null
            and fee.kwota_netto*fee.ilosc>0))
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
        and (coalesce(client.abonament, 0)>0 or exists (
          select 1 from public.rozliczenia_oplaty_dodatkowe fee
          join public.rozliczenia_miesieczne origin on origin.id=fee.rozliczenie_id
          where origin.klient_id=client.id and fee.faktura_id is null
            and fee.billing_period<=settlement.okres and fee.billing_hold_reason is null
            and fee.kwota_netto*fee.ilosc>0))
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
      and (coalesce(client.abonament, 0)>0 or exists (
          select 1 from public.rozliczenia_oplaty_dodatkowe fee
          join public.rozliczenia_miesieczne origin on origin.id=fee.rozliczenie_id
          where origin.klient_id=client.id and fee.faktura_id is null
            and fee.billing_period<=settlement.okres and fee.billing_hold_reason is null
            and fee.kwota_netto*fee.ilosc>0))
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
$function$
;
revoke all on function public.ensure_invoice_for_settlement(uuid,date) from public,anon,authenticated;
grant execute on function public.ensure_invoice_for_settlement(uuid,date) to service_role;
revoke all on function public.sync_late_documents_fee(uuid) from public,anon,authenticated;
grant execute on function public.sync_late_documents_fee(uuid) to service_role;
