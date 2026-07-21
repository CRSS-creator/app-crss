create or replace function public.create_due_zus_small_plus_check_notifications(
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
  notify_date date := public.previous_polish_business_day(make_date(extract(year from public_due_date)::integer, 12, 20));
begin
  if public_due_date <> notify_date then
    return 0;
  end if;

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
    'zus_small_plus_check_due',
    'Sprawdź Mały ZUS Plus klienta',
    'Sprawdź, czy klient ' || coalesce(client.nazwa, 'bez nazwy') || ' spełnia warunki do Małego ZUS Plus na rok ' || target_year || '.',
    'unread',
    'high',
    'klienci',
    client.id,
    client.opiekun_id,
    jsonb_build_object(
      'notification_kind', 'zus_small_plus_check_due',
      'due_date', notify_date::text,
      'year', target_year,
      'client_id', client.id,
      'client_name', client.nazwa,
      'client_nip', client.nip,
      'zus_scheme', client.schemat_zus,
      'recipient_kind', 'caregiver',
      'target_module', 'kadry',
      'target_tab', 'zus_przedsiebiorcy'
    )
  from public.klienci client
  where client.opiekun_id is not null
    and coalesce(client.aktywny, true) = true
    and lower(coalesce(client.schemat_zus, '')) in ('duży zus', 'duzy zus')
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'zus_small_plus_check_due'
        and notification.related_table = 'klienci'
        and notification.related_id = client.id
        and notification.recipient_id = client.opiekun_id
        and notification.metadata->>'year' = target_year::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_zus_small_plus_check_notifications(date) from public;
grant execute on function public.create_due_zus_small_plus_check_notifications(date) to authenticated;

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
    where jobname = 'create_zus_small_plus_check_notifications_yearly'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_zus_small_plus_check_notifications_yearly',
      '35 7 * 12 *',
      $job$select public.create_due_zus_small_plus_check_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować powiadomień o weryfikacji Małego ZUS Plus: %', sqlerrm;
end;
$$;

comment on function public.create_due_zus_small_plus_check_notifications(date) is
  'Tworzy powiadomienia dla opiekunow ksiegowych w ostatni dzien roboczy nie pozniej niz 20 grudnia, aby sprawdzili warunki do Malego ZUS Plus dla klientow na Duzym ZUS.';
