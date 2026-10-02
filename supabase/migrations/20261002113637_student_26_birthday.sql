alter table public.kadry_umowy add column data_urodzenia date;
alter table public.kadry_umowy add column data_26_urodzin date
  generated always as ((data_urodzenia + interval '26 years')::date) stored;

-- Extend the existing reminder scheduler, preserving its recipients and timing.
do $migration$
declare
  definition text := pg_get_functiondef('public.create_due_payroll_contract_notifications(date,integer)'::regprocedure);
  marker text := '  ), due_items as (';
begin
  if strpos(definition, marker) = 0 then raise exception 'Unexpected payroll reminder definition'; end if;
  definition := replace(definition, marker, $branch$
    union all
    select contract.id, contract.klient_id, contract.imie, contract.nazwisko,
      contract.typ_umowy, contract.numer_umowy, contract.data_poczatku,
      contract.data_26_urodzin, 'student_26_birthday', 'ukończenie 26 lat',
      'Prosimy o kontakt z opiekunem w sprawie ukończenia 26 lat przez studenta lub ucznia.'
    from public.kadry_umowy contract
    where contract.typ_umowy = 'student'
      and contract.data_urodzenia is not null
      and contract.archived_at is null
      and (contract.data_poczatku is null or contract.data_poczatku <= contract.data_26_urodzin)
      and (contract.data_konca is null or contract.data_konca >= contract.data_26_urodzin)
  ), due_items as ($branch$);
  definition := replace(definition,
    '''U klienta '' || coalesce(due_items.client_name, ''bez nazwy'') || '' kończy się: ''',
    '''U klienta '' || coalesce(due_items.client_name, ''bez nazwy'') || case when due_items.date_kind = ''student_26_birthday'' then '' zbliża się: '' else '' kończy się: '' end');
  execute definition;
end;
$migration$;
