do $$
declare
  function_sql text;
  old_fragment text := $old$
  extra_documents_count := greatest(
    coalesce(settlement_record.liczba_dokumentow, 0) - coalesce(client_record.limit_dokumentow, 0),
    0
  );
$old$;
  new_fragment text := $new$
  extra_documents_count := case
    when coalesce(client_record.limit_dokumentow, 0) > 0
      and coalesce(client_record.koszt_dodatkowego_dokumentu, 0) > 0
    then greatest(
      coalesce(settlement_record.liczba_dokumentow, 0) - coalesce(client_record.limit_dokumentow, 0),
      0
    )
    else 0
  end;
$new$;
begin
  select pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure)
  into function_sql;

  if position(old_fragment in function_sql) = 0 then
    raise exception 'Nie znaleziono fragmentu naliczania dodatkowych dokumentow w ensure_invoice_for_settlement.';
  end if;

  function_sql := replace(function_sql, old_fragment, new_fragment);
  execute function_sql;
end $$;
