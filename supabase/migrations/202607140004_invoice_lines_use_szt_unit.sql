do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure)
  into function_definition;

  function_definition := replace(function_definition, $old$'usł.'$old$, $new$'szt.'$new$);
  function_definition := replace(function_definition, $old$'usĹ‚.'$old$, $new$'szt.'$new$);

  execute function_definition;
end;
$$;

update public.faktury_pozycje
set jednostka = 'szt.'
where jednostka in ('usł.', 'usĹ‚.');
