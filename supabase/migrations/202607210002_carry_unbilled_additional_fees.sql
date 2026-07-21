do $$
declare
  function_sql text;
  old_fragment text := $old$
  for fee_record in
    select *
    from public.rozliczenia_oplaty_dodatkowe
    where rozliczenie_id = settlement_record.id
      and (faktura_id is null or faktura_id = invoice_record.id)
  loop
$old$;
  new_fragment text := $new$
  for fee_record in
    select fee.*
    from public.rozliczenia_oplaty_dodatkowe fee
    join public.rozliczenia_miesieczne fee_settlement on fee_settlement.id = fee.rozliczenie_id
    where fee_settlement.klient_id = client_record.id
      and (
        fee.rozliczenie_id = settlement_record.id
        or (
          fee.faktura_id is null
          and date_trunc('month', fee_settlement.okres)::date < settlement_period
        )
      )
      and (fee.faktura_id is null or fee.faktura_id = invoice_record.id)
    order by date_trunc('month', fee_settlement.okres)::date, fee.created_at
  loop
$new$;
begin
  select pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure)
  into function_sql;

  if position(old_fragment in function_sql) = 0 then
    raise exception 'Nie znaleziono fragmentu opłat dodatkowych w ensure_invoice_for_settlement.';
  end if;

  function_sql := replace(function_sql, old_fragment, new_fragment);
  execute function_sql;
end $$;
