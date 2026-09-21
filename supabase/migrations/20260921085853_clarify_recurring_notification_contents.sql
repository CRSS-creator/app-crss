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
  where c.opiekun_id = p_recipient_id and r.termin = p_due_date
    and r.status in ('do_zrobienia', 'w_trakcie');

  notification_metadata := jsonb_build_object(
    'notification_kind', 'recurring_task_due_digest', 'due_date', p_due_date,
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
    then 'Brak otwartych zadań cyklicznych z terminem ' || to_char(p_due_date, 'DD.MM.YYYY') || '.'
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

-- Refresh text without creating new alerts or resetting read state.
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
