do $$
declare
  function_sql text;
begin
  select pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure)
  into function_sql;

  function_sql := replace(
    function_sql,
    'when coalesce(client_record.nazwa, '''') ilike ''%Prestige%HR%''',
    'when coalesce(client_record.nazwa, '''') ilike ''%Prestige%HR%''
        or coalesce(client_record.nazwa, '''') ilike ''%P&P Immobiliare%'''
  );

  if function_sql = pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure) then
    raise exception 'Nie znaleziono warunku Prestige HR w ensure_invoice_for_settlement.';
  end if;

  execute function_sql;
end;
$$;

update public.faktury invoice
set termin_platnosci = (date_trunc('month', invoice.okres)::date + interval '1 month' + interval '13 days')::date
from public.klienci client
where invoice.klient_id = client.id
  and coalesce(client.nazwa, '') ilike '%P&P Immobiliare%'
  and invoice.automatyczna = true
  and invoice.okres is not null
  and invoice.wfirma_sync_status = 'nie_wyslano'
  and invoice.numer is null;
