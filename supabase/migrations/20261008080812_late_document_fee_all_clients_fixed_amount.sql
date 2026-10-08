-- Apply the same late-document fee to every client, retaining the existing date threshold.
do $$
declare
  definition text;
  old_condition text := $text$    client_record.model_fakturowania = 'z_gory'
    and coalesce(client_record.nazwa, '') not ilike '%Śremski Klub Sportowy Warta%'
    and coalesce(client_record.nazwa, '') not ilike '%Adalbertus%'
    and settlement_record.data_dostarczenia_dokumentow is not null$text$;
  old_amount text := 'fee_amount := greatest(150, round(coalesce(client_record.abonament, 0) * 0.1, 2));';
begin
  definition := pg_get_functiondef('public.sync_late_documents_fee(uuid)'::regprocedure);
  if position(old_condition in definition) = 0 or position(old_amount in definition) = 0 then
    raise exception 'Late document fee generator changed; review patch.';
  end if;
  definition := replace(definition, old_condition,
    '    settlement_record.data_dostarczenia_dokumentow is not null');
  definition := replace(definition, old_amount, 'fee_amount := 150;');
  execute definition;
end $$;
