do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.ensure_invoice_for_settlement(uuid,date)'::regprocedure)
  into function_definition;

  function_definition := replace(
    function_definition,
    'if coalesce(client_record.obsluga_kadrowa, false) then
    invoice_description_parts := invoice_description_parts || format(',
    'if coalesce(client_record.obsluga_kadrowa, false)
     and (greatest(coalesce(settlement_record.liczba_pracownikow, 0), 0) > 0
       or greatest(coalesce(settlement_record.liczba_zleceniobiorcow, 0), 0) > 0) then
    invoice_description_parts := invoice_description_parts || format('
  );

  execute function_definition;
end;
$$;

update public.faktury
set opis = nullif(
  btrim(
    replace(
      replace(
        coalesce(opis, ''),
        'Liczba pracowników wg umów: pracownicy 0, zleceniobiorcy 0.' || E'\n',
        ''
      ),
      'Liczba pracowników wg umów: pracownicy 0, zleceniobiorcy 0.',
      ''
    )
  ),
  ''
)
where opis like '%Liczba pracowników wg umów: pracownicy 0, zleceniobiorcy 0.%';
