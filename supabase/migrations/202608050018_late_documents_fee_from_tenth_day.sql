do $$
declare
  function_sql text;
begin
  select pg_get_functiondef('public.sync_late_documents_fee(uuid)'::regprocedure)
  into function_sql;

  function_sql := replace(
    function_sql,
    'and settlement_record.data_dostarczenia_dokumentow >= (documents_due_date + interval ''10 days'')::date;',
    'and settlement_record.data_dostarczenia_dokumentow >= (documents_due_date + interval ''3 days'')::date;'
  );

  if function_sql = pg_get_functiondef('public.sync_late_documents_fee(uuid)'::regprocedure) then
    raise exception 'Nie znaleziono warunku 10-dniowego bufora w sync_late_documents_fee.';
  end if;

  execute function_sql;
end;
$$;

delete from public.rozliczenia_oplaty_dodatkowe fee
using public.rozliczenia_miesieczne settlement
where fee.rozliczenie_id = settlement.id
  and fee.nazwa = 'Opłata za nieterminowe dostarczenie dokumentów'
  and (
    coalesce(fee.uwagi, '') like 'Automatyczna opłata%'
    or coalesce(fee.uwagi, '') ilike 'Dokumenty za okres%'
  )
  and settlement.data_dostarczenia_dokumentow is not null
  and settlement.okres is not null
  and settlement.data_dostarczenia_dokumentow < (
    (date_trunc('month', settlement.okres)::date + interval '1 month' + interval '6 days')::date
    + interval '3 days'
  )::date;
