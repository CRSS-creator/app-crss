alter table public.klienci
  add column if not exists onboarding_opiekun_przypisany_at timestamptz;

alter table public.klienci disable trigger trg_prevent_unauthorized_client_updates;

with caregiver_history as (
  select
    client.id as klient_id,
    max(history.created_at) as assigned_at
  from public.klienci client
  join public.onboarding_historia history
    on history.klient_id = client.id
   and history.akcja = 'zmiana_opiekuna_ksiegowego'
   and history.new_status = client.opiekun_id::text
  group by client.id
), onboarding_history as (
  select
    klient_id,
    min(created_at) as started_at
  from public.onboarding_historia
  where akcja = 'uruchomienie_onboardingu'
  group by klient_id
)
update public.klienci client
set onboarding_opiekun_przypisany_at = coalesce(
  client.onboarding_opiekun_przypisany_at,
  caregiver_history.assigned_at,
  onboarding_history.started_at,
  client.created_at,
  now()
)
from caregiver_history
full join onboarding_history on onboarding_history.klient_id = caregiver_history.klient_id
where client.id = coalesce(caregiver_history.klient_id, onboarding_history.klient_id)
  and client.opiekun_id is not null
  and client.onboarding_opiekun_przypisany_at is null;

update public.klienci
set onboarding_opiekun_przypisany_at = coalesce(created_at, now())
where opiekun_id is not null
  and onboarding_opiekun_przypisany_at is null;

alter table public.klienci enable trigger trg_prevent_unauthorized_client_updates;

create or replace function public.set_onboarding_caregiver_assigned_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.opiekun_id is not null and new.onboarding_opiekun_przypisany_at is null then
      new.onboarding_opiekun_przypisany_at := now();
    end if;
    return new;
  end if;

  if new.opiekun_id is distinct from old.opiekun_id then
    if new.opiekun_id is null then
      new.onboarding_opiekun_przypisany_at := null;
    elsif new.onboarding_opiekun_przypisany_at is null
       or new.onboarding_opiekun_przypisany_at is not distinct from old.onboarding_opiekun_przypisany_at then
      new.onboarding_opiekun_przypisany_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_onboarding_caregiver_assigned_at_trigger on public.klienci;
create trigger set_onboarding_caregiver_assigned_at_trigger
before insert or update of opiekun_id on public.klienci
for each row
execute function public.set_onboarding_caregiver_assigned_at();

create or replace function public.create_due_onboarding_completion_notifications(
  public_due_at timestamptz default now()
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
  with overdue_clients as (
    select
      client.id,
      client.nazwa,
      client.nip,
      client.opiekun_id,
      client.onboarding_opiekun_przypisany_at,
      client.onboarding_opiekun_przypisany_at + interval '14 days' as deadline_at
    from public.klienci client
    where lower(coalesce(client.status_klienta, '')) = 'onboarding'
      and client.opiekun_id is not null
      and client.onboarding_opiekun_przypisany_at is not null
      and client.onboarding_opiekun_przypisany_at + interval '14 days' <= public_due_at
  ), recipients as (
    select
      overdue_clients.*,
      overdue_clients.opiekun_id as recipient_id,
      'caregiver'::text as recipient_kind
    from overdue_clients

    union

    select
      overdue_clients.*,
      profile.id as recipient_id,
      'manager'::text as recipient_kind
    from overdue_clients
    join public.profiles profile
      on lower(coalesce(profile.role, '')) = 'manager'
     and coalesce(profile.aktywne, true) = true
  )
  select
    'onboarding_completion_overdue',
    'Onboarding po terminie',
    'Onboarding klienta ' || coalesce(recipients.nazwa, 'bez nazwy') || ' powinien być już zakończony. Minęło 14 dni od przypisania opiekuna.',
    'high',
    'klienci',
    recipients.id,
    recipients.recipient_id,
    jsonb_build_object(
      'client_id', recipients.id,
      'client_name', recipients.nazwa,
      'client_nip', recipients.nip,
      'caregiver_id', recipients.opiekun_id,
      'caregiver_assigned_at', recipients.onboarding_opiekun_przypisany_at,
      'deadline_at', recipients.deadline_at,
      'recipient_kind', recipients.recipient_kind,
      'notification_kind', 'onboarding_completion_overdue'
    )
  from recipients
  where recipients.recipient_id is not null
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'onboarding_completion_overdue'
        and notification.related_table = 'klienci'
        and notification.related_id = recipients.id
        and notification.recipient_id = recipients.recipient_id
        and notification.metadata->>'notification_kind' = 'onboarding_completion_overdue'
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_onboarding_completion_notifications(timestamptz) from public;
grant execute on function public.create_due_onboarding_completion_notifications(timestamptz) to authenticated;

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
    where jobname = 'create_onboarding_completion_overdue_notifications_daily'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_onboarding_completion_overdue_notifications_daily',
      '15 7 * * *',
      $job$select public.create_due_onboarding_completion_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować powiadomień o przekroczonym onboardingu: %', sqlerrm;
end;
$$;
