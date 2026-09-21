-- Notifications in month M concern actual realizations for settlement month M-1.
-- Some stored task deadlines are still in the settlement month. Translate those
-- only for notifications; never change task/settlement data or shift an already
-- next-month deadline for a second time.
create or replace function private.recurring_notification_due_date(
  p_period date, p_task_due_date date, p_template_day integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  period_start date := date_trunc('month', p_period::timestamp)::date;
  next_month date := (period_start + interval '1 month')::date;
  template_day integer := greatest(coalesce(p_template_day, 1), 1);
  notification_day integer;
begin
  if p_period is null or p_task_due_date is null then return null; end if;
  if date_trunc('month', p_task_due_date::timestamp)::date <> period_start then
    return p_task_due_date;
  end if;
  -- Preserve configured end-of-month days, including February -> March.
  -- A manually changed day is preserved instead of resetting it to the template.
  notification_day := case when p_task_due_date = period_start + least(template_day,
    extract(day from next_month - 1)::integer) - 1 then template_day
    else extract(day from p_task_due_date)::integer end;
  return next_month + least(notification_day,
    extract(day from next_month + interval '1 month - 1 day')::integer) - 1;
end;
$$;
revoke all on function private.recurring_notification_due_date(date,date,integer) from public, anon, authenticated;

create or replace function private.sync_recurring_due_notification(
  p_recipient_id uuid, p_due_date date, p_create boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement_period date := (date_trunc('month', p_due_date::timestamp) - interval '1 month')::date;
  task_count integer;
  client_count integer;
  task_items jsonb;
  notification_priority text;
  notification_metadata jsonb;
  notification_body text;
  client_names text;
  task_names text;
  periods text;
  inserted_count integer := 0;
begin
  if p_recipient_id is null or p_due_date is null then return 0; end if;
  -- Serialize creation/refresh for the same digest across tabs and users.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'recurring_due_notification:' || p_recipient_id::text || ':' || p_due_date::text, 0));

  select count(*), count(distinct r.klient_id),
    coalesce(jsonb_agg(jsonb_build_object(
      'realization_id', r.id, 'client_id', r.klient_id,
      'client_name', c.nazwa, 'task_title', r.tytul, 'period', r.okres
    ) order by r.id), '[]'::jsonb),
    case when bool_or(r.priorytet in ('pilne', 'wysoki')) then 'high' else 'normal' end
  into task_count, client_count, task_items, notification_priority
  from public.zadania_cykliczne_realizacje r
  join public.klienci c on c.id = r.klient_id and c.aktywny is true
  join public.zadania_cykliczne t on t.id = r.zadanie_cykliczne_id and t.aktywne is true
  join public.profiles p on p.id = c.opiekun_id and p.aktywne is true
  where c.opiekun_id = p_recipient_id and r.okres = settlement_period
    and private.recurring_notification_due_date(r.okres, r.termin, t.dzien_miesiaca) = p_due_date
    and r.status in ('do_zrobienia', 'w_trakcie');

  notification_metadata := jsonb_build_object(
    'notification_kind', 'recurring_task_due_digest', 'due_date', p_due_date,
    'settlement_period', settlement_period,
    'task_count', task_count, 'client_count', client_count, 'items', task_items);
  select string_agg(clients.client_name, ', ' order by clients.client_name)
  into client_names from (
    select distinct item->>'client_id' as client_id, coalesce(item->>'client_name', 'Klient bez nazwy') as client_name
    from jsonb_array_elements(task_items) item
    order by client_name, client_id limit 3
  ) clients;
  select string_agg(distinct coalesce(item->>'task_title', 'Zadanie cykliczne'), '; ' order by coalesce(item->>'task_title', 'Zadanie cykliczne')),
    string_agg(distinct to_char((item->>'period')::date, 'MM.YYYY'), ', ' order by to_char((item->>'period')::date, 'MM.YYYY'))
  into task_names, periods from jsonb_array_elements(task_items) item;
  notification_body := case when task_count = 0
    then 'Brak otwartych zadań cyklicznych za okres ' || to_char(settlement_period, 'MM.YYYY') || ' z terminem ' || to_char(p_due_date, 'DD.MM.YYYY') || '.'
    else case when client_count = 1 then 'Klient: ' else 'Klienci: ' end || client_names
      || case when client_count > 3 then ' (oraz ' || (client_count - 3) || ' pozostałych)' else '' end
      || '. Otwarte zadania (' || task_count || '): ' || task_names
      || '. Okres rozliczeniowy: ' || coalesce(periods, 'nie podano')
      || '. Termin: ' || to_char(p_due_date, 'DD.MM.YYYY') || '.' end;

  if p_create and task_count > 0 then
    insert into public.powiadomienia (
      type, title, body, priority, related_table, recipient_id, metadata
    ) values (
      'recurring_task_due_today', 'Zadania cykliczne — podsumowanie', notification_body,
      notification_priority, 'zadania_cykliczne_realizacje', p_recipient_id, notification_metadata
    ) on conflict do nothing;
    get diagnostics inserted_count = row_count;
  end if;

  -- Never turn a read digest back into unread on polling, new tasks or reopening.
  -- Keep an empty, read digest as the idempotency record for that date.
  update public.powiadomienia n
  set title = 'Zadania cykliczne — podsumowanie', body = notification_body,
      priority = notification_priority, metadata = notification_metadata,
      status = case when task_count = 0 then 'read' else n.status end,
      read_at = case when task_count = 0 then coalesce(n.read_at, now()) else n.read_at end
  where n.type = 'recurring_task_due_today' and n.recipient_id = p_recipient_id
    and n.metadata->>'notification_kind' = 'recurring_task_due_digest'
    and n.metadata->>'due_date' = p_due_date::text
    and (n.metadata is distinct from notification_metadata
      or n.body is distinct from notification_body or n.priority is distinct from notification_priority
      or (task_count = 0 and n.status = 'unread'));
  return inserted_count;
end;
$$;
revoke all on function private.sync_recurring_due_notification(uuid, date, boolean) from public, anon, authenticated;

create or replace function public.create_due_recurring_task_notifications(
  public_due_date date default ((now() at time zone 'Europe/Warsaw')::date)
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  digest record;
  inserted_count integer := 0;
begin
  if caller_id is null and coalesce(current_setting('role', true), '') in ('anon', 'authenticated') then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if caller_id is not null then
    if not exists (select 1 from public.profiles where id = caller_id and aktywne is true) then
      return 0;
    end if;
    if public_due_date is distinct from (now() at time zone 'Europe/Warsaw')::date then
      raise exception 'Only the current due date is allowed' using errcode = '22023';
    end if;
  end if;

  for digest in
    select n.recipient_id, (n.metadata->>'due_date')::date as due_date
    from public.powiadomienia n
    where n.type = 'recurring_task_due_today'
      and n.metadata->>'notification_kind' = 'recurring_task_due_digest'
      and (caller_id is null or n.recipient_id = caller_id)
    union
    select c.opiekun_id, public_due_date
    from public.zadania_cykliczne_realizacje r
    join public.klienci c on c.id = r.klient_id and c.aktywny is true
    join public.zadania_cykliczne t on t.id = r.zadanie_cykliczne_id and t.aktywne is true
    join public.profiles p on p.id = c.opiekun_id and p.aktywne is true
    where r.okres = (date_trunc('month', public_due_date::timestamp) - interval '1 month')::date
      and private.recurring_notification_due_date(r.okres, r.termin, t.dzien_miesiaca) = public_due_date
      and r.status in ('do_zrobienia', 'w_trakcie')
      and (caller_id is null or c.opiekun_id = caller_id)
    order by 1, 2
  loop
    inserted_count := inserted_count + private.sync_recurring_due_notification(
      digest.recipient_id, digest.due_date, digest.due_date = public_due_date);
  end loop;
  return inserted_count;
end;
$$;
revoke all on function public.create_due_recurring_task_notifications(date) from public, anon;
grant execute on function public.create_due_recurring_task_notifications(date) to authenticated, service_role;

-- Refresh by settlement period: OLD/NEW.termin may still be in that period.
create or replace function private.refresh_recurring_due_notification_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare digest record;
begin
  for digest in
    select n.recipient_id, (n.metadata->>'due_date')::date as due_date
    from public.powiadomienia n
    where n.type = 'recurring_task_due_today'
      and n.metadata->>'notification_kind' = 'recurring_task_due_digest'
      and (n.metadata->>'settlement_period' = case when tg_op <> 'INSERT' then old.okres::text end
        or n.metadata->>'settlement_period' = case when tg_op <> 'DELETE' then new.okres::text end)
    order by n.recipient_id, n.metadata->>'due_date'
  loop
    perform private.sync_recurring_due_notification(digest.recipient_id, digest.due_date, false);
  end loop;
  return null;
end;
$$;
revoke all on function private.refresh_recurring_due_notification_on_change() from public, anon, authenticated;
drop trigger if exists refresh_recurring_due_notification_after_change on public.zadania_cykliczne_realizacje;
create trigger refresh_recurring_due_notification_after_change
after insert or delete or update of status, termin, okres, klient_id, zadanie_cykliczne_id, priorytet, tytul
on public.zadania_cykliczne_realizacje
for each row execute function private.refresh_recurring_due_notification_on_change();

-- Replace mistaken current-month task lists with actual previous-month tasks.
-- Completed previous-month work leaves an empty/read digest, not a false alert.
do $$
declare digest record;
begin
  for digest in
    select recipient_id, (metadata->>'due_date')::date as due_date
    from public.powiadomienia
    where type = 'recurring_task_due_today' and metadata->>'notification_kind' = 'recurring_task_due_digest'
    order by recipient_id, metadata->>'due_date'
  loop
    perform private.sync_recurring_due_notification(digest.recipient_id, digest.due_date, false);
  end loop;
end;
$$;
