-- Exclude Valoris Capital and Zenitor using stable tax identifiers.
-- Patch only the entry guards; preserve the existing billing calculations.
do $migration$
declare
  definition text;
  anchor text;
begin
  definition := pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure);
  anchor := '  if public.is_apc_marek_hebel_client(client_record.nip, client_record.nazwa) then';
  if strpos(definition, anchor) = 0 then
    raise exception 'Unexpected ensure_invoice_for_settlement definition';
  end if;
  definition := replace(definition, anchor, $guard$  if regexp_replace(coalesce(client_record.nip, ''), '[^0-9]', '', 'g')
    in ('7851816159', '7851821195') then
    return null;
  end if;

$guard$ || anchor);
  execute definition;

  definition := pg_get_functiondef('public.claim_invoice_for_billing(uuid)'::regprocedure);
  anchor := '  if i.automatyczna then';
  if strpos(definition, anchor) = 0 then
    raise exception 'Unexpected claim_invoice_for_billing definition';
  end if;
  definition := replace(definition, anchor, $guard$  if regexp_replace(coalesce(i.kontrahent_nip, ''), '[^0-9]', '', 'g')
      in ('7851816159', '7851821195')
    or exists (
      select 1 from public.klienci c where c.id = i.klient_id
        and regexp_replace(coalesce(c.nip, ''), '[^0-9]', '', 'g')
          in ('7851816159', '7851821195')
    ) then
    raise exception 'Fakturowanie dla Valoris Capital i Zenitor jest wyłączone.';
  end if;

$guard$ || anchor);
  execute definition;
end;
$migration$;

-- Remove only empty, automatic local drafts; never touch issued invoices.
do $cleanup$
declare
  draft record;
begin
  for draft in
    select f.id, f.klient_id, f.okres
    from public.faktury f
    join public.klienci c on c.id = f.klient_id
    where regexp_replace(coalesce(c.nip, ''), '[^0-9]', '', 'g') in ('7851816159', '7851821195')
      and f.automatyczna and f.zrodlo = 'aplikacja' and f.status = 'szkic'
      and f.numer is null and f.wfirma_id is null
      and f.wfirma_sync_status = 'nie_wyslano'
      and f.kwota_netto = 0 and f.kwota_vat = 0 and f.kwota_brutto = 0
      and not exists (select 1 from public.faktury_pozycje p where p.faktura_id=f.id and p.kwota_brutto<>0)
    for update of f
  loop
    perform public.delete_local_invoice_draft(draft.id);
    update public.rozliczenia_miesieczne s set faktura_wystawiona = false
    where s.klient_id = draft.klient_id and s.okres = draft.okres
      and not exists (
        select 1 from public.faktury f where f.klient_id=s.klient_id
          and f.okres=s.okres and f.status<>'anulowana'
      );
  end loop;
end;
$cleanup$;
