create or replace function public.previous_polish_business_day(public_date date)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  adjusted_date date := public_date;
begin
  while public.is_polish_non_working_day(adjusted_date) loop
    adjusted_date := adjusted_date - 1;
  end loop;

  return adjusted_date;
end;
$$;

create or replace function public.create_due_zus_preference_expiry_notifications(
  public_due_date date default ((now() at time zone 'Europe/Warsaw')::date)
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
    status,
    priority,
    related_table,
    related_id,
    recipient_id,
    metadata
  )
  with due_items as (
    select
      client.id as client_id,
      client.nazwa as client_name,
      client.nip as client_nip,
      client.opiekun_id as recipient_id,
      client.schemat_zus,
      client.zus_preferencja_start,
      client.zus_preferencja_koniec,
      public.previous_polish_business_day(client.zus_preferencja_koniec - 7) as notify_date,
      'before_end'::text as notification_kind,
      'Kończy się preferencja ZUS klienta'::text as title,
      'U klienta ' || coalesce(client.nazwa, 'bez nazwy') || ' kończy się preferencja ZUS w dniu ' || client.zus_preferencja_koniec::text || '. Poinformuj klienta i pamiętaj o przerejestrowaniu Klienta w ZUS.'::text as body,
      'Poinformuj klienta i pamiętaj o przerejestrowaniu Klienta w ZUS.'::text as action_text
    from public.klienci client
    where client.zus_preferencja_koniec is not null
      and client.opiekun_id is not null
      and coalesce(client.aktywny, true) = true

    union all

    select
      client.id,
      client.nazwa,
      client.nip,
      client.opiekun_id,
      client.schemat_zus,
      client.zus_preferencja_start,
      client.zus_preferencja_koniec,
      public.previous_polish_business_day(client.zus_preferencja_koniec + 1),
      'after_end',
      'Przerejestruj klienta w ZUS',
      'U klienta ' || coalesce(client.nazwa, 'bez nazwy') || ' zakończyła się preferencja ZUS w dniu ' || client.zus_preferencja_koniec::text || '. Przerejestruj Klienta w ZUS albo sprawdź status przerejestrowania, jeżeli zostało już wykonane.',
      'Przerejestruj Klienta w ZUS albo sprawdź status przerejestrowania, jeżeli zostało już wykonane.'
    from public.klienci client
    where client.zus_preferencja_koniec is not null
      and client.opiekun_id is not null
      and coalesce(client.aktywny, true) = true
  )
  select
    'zus_preference_expiry',
    due_items.title,
    due_items.body,
    'unread',
    'high',
    'klienci',
    due_items.client_id,
    due_items.recipient_id,
    jsonb_build_object(
      'notification_kind', due_items.notification_kind,
      'due_date', due_items.zus_preferencja_koniec::text,
      'notify_date', due_items.notify_date::text,
      'client_id', due_items.client_id,
      'client_name', due_items.client_name,
      'client_nip', due_items.client_nip,
      'zus_scheme', due_items.schemat_zus,
      'zus_preference_start', due_items.zus_preferencja_start,
      'zus_preference_end', due_items.zus_preferencja_koniec,
      'client_request', due_items.action_text,
      'recipient_kind', 'caregiver',
      'target_module', 'kadry',
      'target_tab', 'zus_przedsiebiorcy'
    )
  from due_items
  where due_items.notify_date = public_due_date
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'zus_preference_expiry'
        and notification.related_table = 'klienci'
        and notification.related_id = due_items.client_id
        and notification.recipient_id = due_items.recipient_id
        and notification.metadata->>'notification_kind' = due_items.notification_kind
        and notification.metadata->>'due_date' = due_items.zus_preferencja_koniec::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.previous_polish_business_day(date) from public;
grant execute on function public.previous_polish_business_day(date) to authenticated;

revoke all on function public.create_due_zus_preference_expiry_notifications(date) from public;
grant execute on function public.create_due_zus_preference_expiry_notifications(date) to authenticated;

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
    where jobname = 'create_zus_preference_expiry_notifications_daily'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_zus_preference_expiry_notifications_daily',
      '25 7 * * *',
      $job$select public.create_due_zus_preference_expiry_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować powiadomień o końcu preferencji ZUS: %', sqlerrm;
end;
$$;

comment on function public.previous_polish_business_day(date) is
  'Zwraca podana date albo ostatni dzien roboczy przed nia, jezeli wypada w polski dzien wolny.';

comment on function public.create_due_zus_preference_expiry_notifications(date) is
  'Tworzy powiadomienia dla opiekunow ksiegowych tydzien przed koncem preferencji ZUS i po jej zakonczeniu.';
