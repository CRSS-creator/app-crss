-- Change only document description text; preserve billing calculations.
do $$
declare
  definition text;
  duplicate_note text := $text$  if coalesce(client_record.limit_dokumentow, 0) > 0 and extra_documents_count > 0 then
    invoice_description_parts := invoice_description_parts || format(
      'Dokumenty w abonamencie: %s, dokumenty faktycznie dostarczone: %s.',
      coalesce(client_record.limit_dokumentow, 0),
      coalesce(settlement_record.liczba_dokumentow, 0)
    );
  end if;
$text$;
  old_prefix text := $text$'Usługa dodatkowa: ' || trim(fee_record.uwagi)$text$;
begin
  definition := pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure);
  if position(duplicate_note in definition) = 0 or position(old_prefix in definition) = 0 then
    raise exception 'Invoice description generator changed; review patch.';
  end if;
  definition := replace(definition, duplicate_note, '');
  definition := replace(definition, old_prefix,
    $text$case when fee_record.billing_origin = 'documents' then '' else 'Usługa dodatkowa: ' end || trim(fee_record.uwagi)$text$);
  execute definition;

  definition := pg_get_functiondef('public.sync_document_overage_fee(uuid)'::regprocedure);
  if position('faktycznie dostarczone w okresie %s' in definition) = 0 then
    raise exception 'Document fee description generator changed; review patch.';
  end if;
  execute replace(definition, 'faktycznie dostarczone w okresie %s', 'faktycznie dostarczone za okres %s');
end $$;

-- Refresh text on pending document fees without triggering invoice recalculation.
do $$
declare previous_refresh text := current_setting('crss.fee_refresh', true);
begin
  perform set_config('crss.fee_refresh', 'on', true);
  update public.rozliczenia_oplaty_dodatkowe f
  set uwagi = replace(f.uwagi, 'faktycznie dostarczone w okresie ', 'faktycznie dostarczone za okres ')
  where f.billing_origin = 'documents'
    and f.uwagi like 'Limit dokumentów zgodnie z umową:%faktycznie dostarczone w okresie %'
    and (f.faktura_id is null or exists (
      select 1 from public.faktury i where i.id = f.faktura_id
        and i.status = 'szkic' and i.wfirma_id is null
        and i.wfirma_sync_status in ('nie_wyslano', 'blad')
    ));
  perform set_config('crss.fee_refresh', coalesce(previous_refresh, ''), true);
end $$;

-- Preserve every other sentence and all invoice amounts, lines and dates.
with descriptions as (
  select id, nullif(btrim(regexp_replace(
    replace(opis, 'Usługa dodatkowa: Limit dokumentów zgodnie z umową:', 'Limit dokumentów zgodnie z umową:'),
    'Dokumenty w abonamencie: [0-9]+[;,] dokumenty faktycznie dostarczone: [0-9]+\.([ \t]*(\r?\n|\\n))?',
    '', 'g'
  ), E'\r\n '), '') as opis
  from public.faktury
  where status = 'szkic' and wfirma_id is null
    and wfirma_sync_status in ('nie_wyslano', 'blad')
), corrected as (
  select id, regexp_replace(opis,
    '(Limit dokumentów zgodnie z umową: [0-9]+, faktycznie dostarczone) w okresie ',
    '\1 za okres ', 'g') as opis
  from descriptions
)
update public.faktury i set opis = c.opis
from corrected c where i.id = c.id and i.opis is distinct from c.opis;
