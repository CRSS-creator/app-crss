create or replace function public.create_due_payroll_contract_notifications(
  public_due_date date default ((now() at time zone 'Europe/Warsaw')::date),
  public_days_ahead integer default 30
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
      client.opiekun_id
    from contract_dates
    join public.klienci client on client.id = contract_dates.klient_id
    where contract_dates.due_date between public_due_date and public_due_date + greatest(public_days_ahead, 0)
      and coalesce(client.aktywny, true) = true
  ), recipients as (
    select
      due_items.*,
      due_items.opiekun_id as recipient_id,
      'caregiver'::text as recipient_kind
    from due_items
    where due_items.opiekun_id is not null

    union

    select
      due_items.*,
      profile.id as recipient_id,
      'manager'::text as recipient_kind
    from due_items
    join public.profiles profile
      on lower(coalesce(profile.role, '')) in ('owner', 'manager')
     and coalesce(profile.aktywne, true) = true
  )
  select
    'payroll_contract_expiry',
    'Kadry: ' || recipients.title_suffix,
    recipients.title_suffix || ' u klienta ' || coalesce(recipients.client_name, 'bez nazwy') || '. ' || recipients.client_request,
    case
      when recipients.due_date <= public_due_date + interval '7 days' then 'high'
      else 'normal'
    end,
    'kadry_umowy',
    recipients.contract_id,
    recipients.recipient_id,
    jsonb_build_object(
      'notification_kind', 'payroll_contract_expiry',
      'date_kind', recipients.date_kind,
      'due_date', recipients.due_date,
      'days_ahead', public_days_ahead,
      'client_id', recipients.klient_id,
      'client_name', recipients.client_name,
      'client_nip', recipients.client_nip,
      'employee_name', trim(recipients.imie || ' ' || recipients.nazwisko),
      'contract_type', recipients.typ_umowy,
      'contract_number', recipients.numer_umowy,
      'start_date', recipients.data_poczatku,
      'client_request', recipients.client_request,
      'recipient_kind', recipients.recipient_kind
    )
  from recipients
  where recipients.recipient_id is not null
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'payroll_contract_expiry'
        and notification.related_table = 'kadry_umowy'
        and notification.related_id = recipients.contract_id
        and notification.recipient_id = recipients.recipient_id
        and notification.metadata->>'date_kind' = recipients.date_kind
        and notification.metadata->>'due_date' = recipients.due_date::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_payroll_contract_notifications(date, integer) from public;
grant execute on function public.create_due_payroll_contract_notifications(date, integer) to authenticated;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'Nie udało się włączyć pg_cron: %', sqlerrm;
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select jobid into existing_job_id
    from cron.job
    where jobname = 'create_payroll_contract_expiry_notifications_daily'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_payroll_contract_expiry_notifications_daily',
      '20 7 * * *',
      $job$select public.create_due_payroll_contract_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować powiadomień kadrowych: %', sqlerrm;
end;
$$;
