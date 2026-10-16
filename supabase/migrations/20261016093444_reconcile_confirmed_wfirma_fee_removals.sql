alter table public.rozliczenia_oplaty_dodatkowe
  add column wfirma_removal_confirmed boolean not null default false;
comment on column public.rozliczenia_oplaty_dodatkowe.wfirma_removal_confirmed is
  'Explicitly confirmed removal from the remote invoice; retain invoice linkage to prevent rebilling.';

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


-- User confirmed removal of these two fees from FV 45/10/2026 in wFirma.
do $$
declare affected integer;
begin
  update public.rozliczenia_oplaty_dodatkowe f set
    wfirma_removal_confirmed=true,
    billing_hold_reason=concat_ws('; ', nullif(f.billing_hold_reason,''),
      'Właściciel potwierdził usunięcie z FV 45/10/2026 we wFirmie 16.10.2026. Nie naliczać ponownie.')
  from public.faktury i
  where f.faktura_id=i.id and i.numer='FV 45/10/2026'
    and i.kontrahent_nazwa='Stowarzyszenie Pomerania Sports'
    and f.ilosc=1 and ((f.nazwa='Korekta deklaracji' and f.kwota_netto=200)
      or (f.nazwa='Opłata za nieterminowe dostarczenie dokumentów' and f.kwota_netto=150));
  get diagnostics affected=row_count;
  if affected<>2 then raise exception 'Expected exactly two confirmed removed fees, got %',affected; end if;
end $$;

create function public.sync_wfirma_invoice_snapshot(public_invoice_id uuid, public_header jsonb, public_lines jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if jsonb_typeof(public_header) is distinct from 'object' or jsonb_typeof(public_lines) is distinct from 'array' then
    raise exception 'Nieprawidłowe dane faktury z wFirmy.';
  end if;
  perform 1 from public.faktury where id=public_invoice_id for update;
  if not found then raise exception 'Nie znaleziono faktury.'; end if;
  update public.faktury set
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
  if jsonb_array_length(public_lines)>0 then
    perform public.replace_wfirma_invoice_lines(public_invoice_id,public_lines);
  end if;
end $$;
revoke all on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) to service_role;
