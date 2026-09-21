-- One recurring-task reminder per caregiver and due date, not per realization.
-- Keep the existing type so the deployed application can display the digest.
create schema if not exists private;

create unique index if not exists powiadomienia_recurring_digest_unique_idx
  on public.powiadomienia (recipient_id, (metadata->>'due_date'))
  where type = 'recurring_task_due_today'
    and metadata->>'notification_kind' = 'recurring_task_due_digest';

create or replace function private.sync_recurring_due_notification(
  p_recipient_id uuid, p_due_date date, p_create boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  task_count integer;
  client_count integer;
  task_items jsonb;
  notification_priority text;
  notification_metadata jsonb;
  notification_body text;
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
  where c.opiekun_id = p_recipient_id and r.termin = p_due_date
    and r.status in ('do_zrobienia', 'w_trakcie');

  notification_metadata := jsonb_build_object(
    'notification_kind', 'recurring_task_due_digest', 'due_date', p_due_date,
    'task_count', task_count, 'client_count', client_count, 'items', task_items);
  notification_body := case when task_count = 0
    then 'Brak otwartych zadań cyklicznych z terminem ' || to_char(p_due_date, 'DD.MM.YYYY') || '.'
    else 'Otwarte zadania cykliczne: ' || task_count || '. Klienci: ' || client_count
      || '. Termin: ' || to_char(p_due_date, 'DD.MM.YYYY') || '. Szczegóły w rozliczeniach.' end;

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
    select c.opiekun_id, r.termin
    from public.zadania_cykliczne_realizacje r
    join public.klienci c on c.id = r.klient_id and c.aktywny is true
    join public.zadania_cykliczne t on t.id = r.zadanie_cykliczne_id and t.aktywne is true
    join public.profiles p on p.id = c.opiekun_id and p.aktywne is true
    where r.termin = public_due_date and r.status in ('do_zrobienia', 'w_trakcie')
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

-- Consolidate only recurring-task notifications. Preserve the oldest timestamp
-- and read state (unread if at least one constituent reminder is still unread).
insert into public.powiadomienia (
  type, title, status, read_at, created_at, related_table, recipient_id, metadata
)
select 'recurring_task_due_today', 'Zadania cykliczne — podsumowanie',
  case when bool_or(n.status = 'unread') then 'unread' else 'read' end,
  case when bool_or(n.status = 'unread') then null else max(n.read_at) end,
  min(n.created_at), 'zadania_cykliczne_realizacje', n.recipient_id,
  jsonb_build_object('notification_kind', 'recurring_task_due_digest', 'due_date', n.metadata->>'due_date')
from public.powiadomienia n
where n.type = 'recurring_task_due_today' and n.related_table = 'zadania_cykliczne_realizacje'
  and n.related_id is not null and n.recipient_id is not null
  and n.metadata->>'due_date' is not null
group by n.recipient_id, n.metadata->>'due_date'
on conflict do nothing;

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

delete from public.powiadomienia n
where n.type = 'recurring_task_due_today' and n.related_table = 'zadania_cykliczne_realizacje'
  and n.related_id is not null
  and exists (
    select 1 from public.powiadomienia digest
    where digest.type = 'recurring_task_due_today'
      and digest.metadata->>'notification_kind' = 'recurring_task_due_digest'
      and digest.recipient_id = n.recipient_id
      and digest.metadata->>'due_date' = n.metadata->>'due_date'
  );

-- Refresh existing digests immediately after completion/deletion/rescheduling.
-- This trigger writes notifications only; it never changes tasks or clients.
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
      and (n.metadata->>'due_date' = case when tg_op <> 'INSERT' then old.termin::text end
        or n.metadata->>'due_date' = case when tg_op <> 'DELETE' then new.termin::text end)
    order by n.recipient_id, n.metadata->>'due_date'
  loop
    perform private.sync_recurring_due_notification(digest.recipient_id, digest.due_date, false);
  end loop;
  return null;
end;
$$;
revoke all on function private.refresh_recurring_due_notification_on_change() from public, anon, authenticated;
create trigger refresh_recurring_due_notification_after_change
after insert or delete or update of status, termin, klient_id, zadanie_cykliczne_id, priorytet, tytul
on public.zadania_cykliczne_realizacje
for each row execute function private.refresh_recurring_due_notification_on_change();
