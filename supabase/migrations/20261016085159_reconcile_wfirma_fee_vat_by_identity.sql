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

