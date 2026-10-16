-- History is private to the service role; it contains invoice details.
create table public.wfirma_invoice_sync_history (
  id uuid primary key default gen_random_uuid(),
  faktura_id uuid not null references public.faktury(id),
  created_at timestamptz not null default now(),
  before_header jsonb not null, before_lines jsonb not null,
  after_header jsonb not null, after_lines jsonb not null
);
create index wfirma_invoice_sync_history_invoice_idx on public.wfirma_invoice_sync_history(faktura_id,created_at desc);
alter table public.wfirma_invoice_sync_history enable row level security;
revoke all on public.wfirma_invoice_sync_history from public,anon,authenticated;
grant select,insert on public.wfirma_invoice_sync_history to service_role;

create or replace function public.replace_wfirma_invoice_lines(
  public_invoice_id uuid, public_lines jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  linked record;
  candidate integer;
  candidates integer;
  accept_edits boolean := current_setting('crss.wfirma_accept_remote_edits',true) = public_invoice_id::text;
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
    -- Exact remote IDs survive edits to amounts, names and quantities.
    if accept_edits and linked.source_key ~ '^wfirma:[0-9]+$' then
      select count(*), min(e.ordinality::integer) into candidates, candidate
      from jsonb_array_elements(public_lines) with ordinality e(value, ordinality)
      where not (mappings ? e.ordinality::text) and e.value->>'source_key'=linked.source_key;
      if candidates=0 then
        select count(*), min(e.ordinality::integer) into candidates, candidate
        from jsonb_array_elements(public_lines) with ordinality e(value, ordinality)
        where not (mappings ? e.ordinality::text) and trim(e.value->>'nazwa')=trim(linked.nazwa)
          and (e.value->>'ilosc')::numeric=linked.ilosc
          and (e.value->>'kwota_netto')::numeric=linked.kwota_netto;
      end if;
    end if;
    -- Preserve fee identity when an old snapshot has stale VAT.
    -- Only a unique remote ID with unchanged name, quantity and net may match.
    if candidates = 0 and linked.source_key ~ '^wfirma:[0-9]+$' then
      select count(*), min(e.ordinality::integer) into candidates, candidate
      from jsonb_array_elements(public_lines) with ordinality e(value, ordinality)
      where not (mappings ? e.ordinality::text)
        and e.value->>'source_key' = linked.source_key
        and trim(e.value->>'nazwa') = trim(linked.nazwa)
        and (e.value->>'ilosc')::numeric = linked.ilosc
        and (e.value->>'kwota_netto')::numeric = linked.kwota_netto
        and (e.value->>'kwota_vat')::numeric >= 0
        and (e.value->>'kwota_brutto')::numeric =
          (e.value->>'kwota_netto')::numeric + (e.value->>'kwota_vat')::numeric
        and (select count(*) from jsonb_array_elements(public_lines) x(value)
          where x.value->>'source_key' = linked.source_key) = 1;
    end if;
    if accept_edits and candidates<>1 then
      update public.rozliczenia_oplaty_dodatkowe set wfirma_removal_confirmed=true,
        billing_hold_reason=coalesce(billing_hold_reason,'Pozycja zmieniona lub usunięta w wFirmie. Rozliczona historycznie; nie naliczać ponownie.')
      where id=linked.rozliczenie_oplata_id;
      continue;
    end if;
    if candidates = 0 and exists (
      select 1 from public.rozliczenia_oplaty_dodatkowe f
      where f.id=linked.rozliczenie_oplata_id and f.wfirma_removal_confirmed
    ) then
      continue;
    end if;
    if candidates = 0 then
      raise exception 'Opłata dodatkowa "%" nie ma zgodnej pozycji w wFirmie. Zachowano dotychczasowe powiązania; wyjaśnij zmianę faktury.', linked.nazwa;
    end if;
    mappings := mappings || jsonb_build_object(candidate::text, linked.rozliczenie_oplata_id);
    categories := categories || jsonb_build_object(candidate::text, linked.cfo_przychod_kategoria);
  end loop;

  if accept_edits then
    update public.rozliczenia_oplaty_dodatkowe f set wfirma_removal_confirmed=true,
      billing_hold_reason=coalesce(billing_hold_reason,'Brak pozycji w aktualnej fakturze wFirmy. Zachowano historyczne rozliczenie; nie naliczać ponownie.')
    where f.faktura_id=public_invoice_id and not exists (
      select 1 from public.faktury_pozycje p where p.faktura_id=public_invoice_id and p.rozliczenie_oplata_id=f.id);
  end if;
  -- Do not erase evidence of a fee that was already detached by the old importer.
  if exists (
    select 1 from public.rozliczenia_oplaty_dodatkowe f
    where f.faktura_id = public_invoice_id
      and not f.wfirma_removal_confirmed
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


create or replace function public.sync_wfirma_invoice_snapshot(public_invoice_id uuid, public_header jsonb, public_lines jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare
  previous_header jsonb;
  previous_lines jsonb;
  next_header jsonb;
  next_lines jsonb;
  previous_mode text := current_setting('crss.wfirma_accept_remote_edits',true);
  net numeric; tax numeric; gross numeric;
begin
  if jsonb_typeof(public_header) is distinct from 'object' or jsonb_typeof(public_lines) is distinct from 'array' then
    raise exception 'Nieprawidłowe dane faktury z wFirmy.';
  end if;
  perform 1 from public.faktury where id=public_invoice_id for update;
  if not found then raise exception 'Nie znaleziono faktury.'; end if;
  select to_jsonb(i) into previous_header from public.faktury i where id=public_invoice_id;
  select coalesce(jsonb_agg(to_jsonb(p)-array['id','created_at','updated_at'] order by p.sort_order,p.source_key),'[]'::jsonb)
    into previous_lines from public.faktury_pozycje p where p.faktura_id=public_invoice_id;
  if not (public_header ?& array['kwota_netto','kwota_vat','kwota_brutto']) then
    raise exception 'Brak kompletnych kwot faktury z wFirmy.';
  end if;
  select coalesce(sum((e->>'kwota_netto')::numeric),0),coalesce(sum((e->>'kwota_vat')::numeric),0),
    coalesce(sum((e->>'kwota_brutto')::numeric),0) into net,tax,gross from jsonb_array_elements(public_lines) e;
  if exists(select 1 from jsonb_array_elements(public_lines) e
    where nullif(e->>'source_key','') is null or nullif(e->>'nazwa','') is null
      or (e->>'kwota_netto') is null or (e->>'kwota_vat') is null or (e->>'kwota_brutto') is null
      or abs((e->>'kwota_netto')::numeric+(e->>'kwota_vat')::numeric-(e->>'kwota_brutto')::numeric)>0.02)
    or (public_header->>'kwota_netto') is null or (public_header->>'kwota_vat') is null or (public_header->>'kwota_brutto') is null
    or abs(net-(public_header->>'kwota_netto')::numeric)>0.02
    or abs(tax-(public_header->>'kwota_vat')::numeric)>0.02
    or abs(gross-(public_header->>'kwota_brutto')::numeric)>0.02 then
    raise exception 'Kwoty i pozycje z wFirmy są niespójne. Zachowano dotychczasową fakturę.';
  end if;
  perform set_config('crss.wfirma_accept_remote_edits',public_invoice_id::text,true);
  update public.faktury set
    opis=case when public_header ? 'opis' then public_header->>'opis' else opis end,
    numer=case when public_header ? 'numer' then (public_header->>'numer')::text else numer end,
    wfirma_id=case when public_header ? 'wfirma_id' then (public_header->>'wfirma_id')::text else wfirma_id end,
    wfirma_url=case when public_header ? 'wfirma_url' then (public_header->>'wfirma_url')::text else wfirma_url end,
    data_wystawienia=case when public_header ? 'data_wystawienia' then (public_header->>'data_wystawienia')::date else data_wystawienia end,
    data_sprzedazy=case when public_header ? 'data_sprzedazy' then (public_header->>'data_sprzedazy')::date else data_sprzedazy end,
    termin_platnosci=case when public_header ? 'termin_platnosci' then (public_header->>'termin_platnosci')::date else termin_platnosci end,
    kwota_netto=case when public_header ? 'kwota_netto' then (public_header->>'kwota_netto')::numeric else kwota_netto end,
    kwota_vat=case when public_header ? 'kwota_vat' then (public_header->>'kwota_vat')::numeric else kwota_vat end,
    kwota_brutto=case when public_header ? 'kwota_brutto' then (public_header->>'kwota_brutto')::numeric else kwota_brutto end,
    wfirma_synced_at=case when public_header ? 'wfirma_synced_at' then (public_header->>'wfirma_synced_at')::timestamptz else wfirma_synced_at end,
    wfirma_pdf_path=case when public_header ? 'wfirma_pdf_path' then (public_header->>'wfirma_pdf_path')::text else wfirma_pdf_path end,
    wfirma_pdf_name=case when public_header ? 'wfirma_pdf_name' then (public_header->>'wfirma_pdf_name')::text else wfirma_pdf_name end,
    wfirma_pdf_synced_at=case when public_header ? 'wfirma_pdf_synced_at' then (public_header->>'wfirma_pdf_synced_at')::timestamptz else wfirma_pdf_synced_at end,
    wfirma_sync_error=case when public_header ? 'wfirma_sync_error' then (public_header->>'wfirma_sync_error')::text else wfirma_sync_error end
  where id=public_invoice_id;
  perform public.replace_wfirma_invoice_lines(public_invoice_id,public_lines);
  perform set_config('crss.wfirma_accept_remote_edits',coalesce(previous_mode,''),true);
  select to_jsonb(i) into next_header from public.faktury i where id=public_invoice_id;
  select coalesce(jsonb_agg(to_jsonb(p)-array['id','created_at','updated_at'] order by p.sort_order,p.source_key),'[]'::jsonb)
    into next_lines from public.faktury_pozycje p where p.faktura_id=public_invoice_id;
  if (previous_header-array['wfirma_synced_at','wfirma_pdf_path','wfirma_pdf_name','wfirma_pdf_synced_at','wfirma_sync_error','updated_at'])
     is distinct from (next_header-array['wfirma_synced_at','wfirma_pdf_path','wfirma_pdf_name','wfirma_pdf_synced_at','wfirma_sync_error','updated_at'])
     or previous_lines is distinct from next_lines then
    insert into public.wfirma_invoice_sync_history(faktura_id,before_header,before_lines,after_header,after_lines)
      values(public_invoice_id,previous_header,previous_lines,next_header,next_lines);
  end if;
end $$;
revoke all on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) to service_role;
