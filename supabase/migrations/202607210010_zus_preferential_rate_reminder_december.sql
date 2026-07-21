create or replace function public.create_due_zus_preferential_rate_notifications(
  public_due_date date default ((now() at time zone 'Europe/Warsaw')::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  target_year integer := extract(year from public_due_date)::integer + 1;
begin
  if extract(month from public_due_date)::integer <> 12
    or extract(day from public_due_date)::integer <> 10
  then
    return 0;
  end if;

  if exists (
    select 1
    from public.zus_przedsiebiorcy_skladki rate
    where rate.rok = target_year
      and lower(rate.schemat_zus) = lower('Preferencyjny ZUS')
      and rate.skladka_miesieczna > 0
  ) then
    return 0;
  end if;

  insert into public.powiadomienia (
    type,
    title,
    body,
    status,
    priority,
    recipient_id,
    metadata
  )
  select
    'zus_preferential_rate_due',
    'Uzupełnij składkę preferencyjną ZUS',
    'Uzupełnij wysokość składki na Preferencyjnym ZUS na rok ' || target_year || '.',
    'unread',
    'high',
    profile.id,
    jsonb_build_object(
      'notification_kind', 'zus_preferential_rate_due',
      'due_date', public_due_date::text,
      'year', target_year,
      'target_module', 'kadry',
      'target_tab', 'zus_przedsiebiorcy',
      'scheme', 'Preferencyjny ZUS'
    )
  from public.profiles profile
  where lower(coalesce(profile.role, '')) = 'manager'
    and coalesce(profile.aktywne, true)
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'zus_preferential_rate_due'
        and notification.recipient_id = profile.id
        and notification.metadata->>'year' = target_year::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_zus_preferential_rate_notifications(date) from public;
grant execute on function public.create_due_zus_preferential_rate_notifications(date) to authenticated;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select jobid into existing_job_id
    from cron.job
    where jobname = 'create_zus_preferential_rate_notifications_yearly'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_zus_preferential_rate_notifications_yearly',
      '0 7 10 12 *',
      $job$select public.create_due_zus_preferential_rate_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się przeplanować powiadomień o składce preferencyjnej ZUS: %', sqlerrm;
end;
$$;

comment on function public.create_due_zus_preferential_rate_notifications(date) is
  'Tworzy 10 grudnia powiadomienia dla managerow o uzupelnieniu stawki Preferencyjny ZUS na kolejny rok.';
