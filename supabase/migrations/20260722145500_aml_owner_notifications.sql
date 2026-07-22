create or replace function public.create_due_aml_next_verification_notifications(
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
  select
    'aml_next_verification_due',
    'Konieczna ponowna weryfikacja AML',
    'Dla klienta ' || coalesce(client.nazwa, 'bez nazwy') || ' ponowna weryfikacja AML jest wymagana w dniu ' || register.nastepna_weryfikacja_at::text || '.',
    'unread',
    'high',
    'aml_rejestr_klientow',
    register.id,
    owner_profile.id,
    jsonb_build_object(
      'notification_kind', 'aml_next_verification_due',
      'recipient_kind', 'owner',
      'target_module', 'aml',
      'client_id', client.id,
      'client_name', client.nazwa,
      'client_nip', client.nip,
      'aml_register_id', register.id,
      'next_verification_date', register.nastepna_weryfikacja_at::text,
      'notify_date', public_due_date::text
    )
  from public.aml_rejestr_klientow register
  join public.klienci client on client.id = register.klient_id
  join public.profiles owner_profile on owner_profile.role = 'owner'
    and coalesce(owner_profile.aktywne, true) = true
  where register.nastepna_weryfikacja_at is not null
    and register.nastepna_weryfikacja_at - 1 = public_due_date
    and coalesce(client.aktywny, true) = true
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'aml_next_verification_due'
        and notification.related_table = 'aml_rejestr_klientow'
        and notification.related_id = register.id
        and notification.recipient_id = owner_profile.id
        and notification.metadata->>'notification_kind' = 'aml_next_verification_due'
        and notification.metadata->>'next_verification_date' = register.nastepna_weryfikacja_at::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_aml_next_verification_notifications(date) from public;
grant execute on function public.create_due_aml_next_verification_notifications(date) to authenticated;

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
    where jobname = 'create_aml_next_verification_notifications_daily'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_aml_next_verification_notifications_daily',
      '30 7 * * *',
      $job$select public.create_due_aml_next_verification_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować powiadomień AML: %', sqlerrm;
end;
$$;

comment on function public.create_due_aml_next_verification_notifications(date) is
  'Tworzy powiadomienia dla ownerow dzien przed konieczna ponowna weryfikacja AML klienta.';
