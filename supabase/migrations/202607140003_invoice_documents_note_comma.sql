do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    $old$'Dokumenty w abonamencie: %s; dokumenty faktycznie dostarczone: %s.'$old$,
    $new$'Dokumenty w abonamencie: %s, dokumenty faktycznie dostarczone: %s.'$new$
  );

  execute function_definition;
end;
$$;

update public.faktury
set opis = regexp_replace(
  opis,
  'Dokumenty w abonamencie: ([0-9]+); dokumenty faktycznie dostarczone:',
  'Dokumenty w abonamencie: \1, dokumenty faktycznie dostarczone:',
  'g'
)
where opis ~ 'Dokumenty w abonamencie: [0-9]+; dokumenty faktycznie dostarczone:';
