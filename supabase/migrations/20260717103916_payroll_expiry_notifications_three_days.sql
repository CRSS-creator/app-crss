create or replace function public.create_due_payroll_contract_notifications(
  public_due_date date default ((now() at time zone 'Europe/Warsaw')::date),
  public_days_ahead integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.powiadomienia (
    type,
    title,
    body,
    priority,
    related_table,
    related_id,
    recipient_id,
    metadata
  )
  with contract_dates as (
    select
      contract.id as contract_id,
      contract.klient_id,
      contract.imie,
      contract.nazwisko,
      contract.typ_umowy,
      contract.numer_umowy,
      contract.data_poczatku,
      contract.data_konca as due_date,
      'contract_end'::text as date_kind,
      'Kończy się umowa'::text as title_suffix,
      'Prosimy o informację, czy przygotować nową umowę, przedłużyć obecną, czy nie kontynuować współpracy.'::text as client_request
    from public.kadry_umowy contract
    where contract.data_konca is not null
      and coalesce(contract.umowa_na_czas_nieokreslony, false) is false

    union all

    select
      contract.id,
      contract.klient_id,
      contract.imie,
      contract.nazwisko,
      contract.typ_umowy,
      contract.numer_umowy,
      contract.data_poczatku,
      contract.legitymacja_studencka_wazna_do,
      'student_card_expiry',
      'Kończy się ważność legitymacji studenckiej',
      'Prosimy o dostarczenie nowej, ważnej legitymacji studenckiej.'
    from public.kadry_umowy contract
    where contract.typ_umowy = 'student'
      and contract.legitymacja_studencka_wazna_do is not null
  ), due_items as (
    select
      contract_dates.*,
      client.nazwa as client_name,
      client.nip as client_nip,
      client.opiekun_id as recipient_id
    from contract_dates
    join public.klienci client on client.id = contract_dates.klient_id
    where contract_dates.due_date = public_due_date + greatest(public_days_ahead, 0)
      and coalesce(client.aktywny, true) = true
      and client.opiekun_id is not null
  )
  select
    'payroll_contract_expiry',
    'Kadry: ' || due_items.title_suffix,
    due_items.title_suffix || ' u klienta ' || coalesce(due_items.client_name, 'bez nazwy') || '. ' || due_items.client_request,
    'high',
    'kadry_umowy',
    due_items.contract_id,
    due_items.recipient_id,
    jsonb_build_object(
      'notification_kind', 'payroll_contract_expiry',
      'date_kind', due_items.date_kind,
      'due_date', due_items.due_date,
      'days_ahead', public_days_ahead,
      'client_id', due_items.klient_id,
      'client_name', due_items.client_name,
      'client_nip', due_items.client_nip,
      'employee_name', trim(due_items.imie || ' ' || due_items.nazwisko),
      'contract_type', due_items.typ_umowy,
      'contract_number', due_items.numer_umowy,
      'start_date', due_items.data_poczatku,
      'client_request', due_items.client_request,
      'recipient_kind', 'caregiver'
    )
  from due_items
  where not exists (
    select 1
    from public.powiadomienia notification
    where notification.type = 'payroll_contract_expiry'
      and notification.related_table = 'kadry_umowy'
      and notification.related_id = due_items.contract_id
      and notification.recipient_id = due_items.recipient_id
      and notification.metadata->>'date_kind' = due_items.date_kind
      and notification.metadata->>'due_date' = due_items.due_date::text
  );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_payroll_contract_notifications(date, integer) from public;
grant execute on function public.create_due_payroll_contract_notifications(date, integer) to authenticated;
