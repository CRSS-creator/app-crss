create or replace function public.create_due_task_notifications(public_due_date date default ((now() at time zone 'Europe/Warsaw')::date))
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  delete from public.powiadomienia notification
  using public.zadania task
  where notification.type = 'task_due_today'
    and notification.related_table = 'zadania'
    and notification.related_id = task.id
    and (
      task.status not in ('do_zrobienia', 'w_trakcie')
      or task.termin is null
      or (task.termin at time zone 'Europe/Warsaw')::date <> public_due_date
      or notification.metadata->>'due_date' <> public_due_date::text
    );

  delete from public.powiadomienia notification
  where notification.type = 'task_due_today'
    and notification.related_table = 'zadania'
    and not exists (
      select 1
      from public.zadania task
      where task.id = notification.related_id
    );

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
  select
    'task_due_today',
    'Zadanie na dziś',
    coalesce(task.tytul, 'Zadanie') || ' powinno być wykonane dzisiaj.',
    case when task.priorytet in ('pilne', 'wysoki') then 'high' else 'normal' end,
    'zadania',
    task.id,
    task.osoba_id,
    jsonb_build_object(
      'task_id', task.id,
      'task_title', task.tytul,
      'task_status', task.status,
      'due_date', public_due_date,
      'notification_kind', 'due_today'
    )
  from public.zadania task
  where task.osoba_id is not null
    and task.termin is not null
    and (task.termin at time zone 'Europe/Warsaw')::date = public_due_date
    and task.status in ('do_zrobienia', 'w_trakcie')
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'task_due_today'
        and notification.related_table = 'zadania'
        and notification.related_id = task.id
        and notification.recipient_id = task.osoba_id
        and notification.metadata->>'due_date' = public_due_date::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.create_due_task_notifications(date) to authenticated;

create or replace function public.create_due_recurring_task_notifications(public_due_date date default ((now() at time zone 'Europe/Warsaw')::date))
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  delete from public.powiadomienia notification
  using public.zadania_cykliczne_realizacje realization
  where notification.type = 'recurring_task_due_today'
    and notification.related_table = 'zadania_cykliczne_realizacje'
    and notification.related_id = realization.id
    and (
      realization.status not in ('do_zrobienia', 'w_trakcie')
      or realization.termin <> public_due_date
      or notification.metadata->>'due_date' <> public_due_date::text
    );

  delete from public.powiadomienia notification
  where notification.type = 'recurring_task_due_today'
    and notification.related_table = 'zadania_cykliczne_realizacje'
    and not exists (
      select 1
      from public.zadania_cykliczne_realizacje realization
      where realization.id = notification.related_id
    );

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
  select
    'recurring_task_due_today',
    'Zadanie cykliczne na dziś',
    coalesce(realization.tytul, 'Zadanie cykliczne') || ' powinno być wykonane dzisiaj dla klienta ' || coalesce(client.nazwa, 'bez nazwy') || '.',
    case when realization.priorytet in ('pilne', 'wysoki') then 'high' else 'normal' end,
    'zadania_cykliczne_realizacje',
    realization.id,
    coalesce(realization.osoba_id, client.opiekun_id),
    jsonb_build_object(
      'recurring_task_realization_id', realization.id,
      'recurring_task_id', realization.zadanie_cykliczne_id,
      'client_id', realization.klient_id,
      'client_name', client.nazwa,
      'settlement_id', realization.rozliczenie_id,
      'period', realization.okres,
      'due_date', public_due_date,
      'task_title', realization.tytul,
      'task_status', realization.status,
      'notification_kind', 'recurring_task_due_today'
    )
  from public.zadania_cykliczne_realizacje realization
  join public.klienci client on client.id = realization.klient_id
  where coalesce(realization.osoba_id, client.opiekun_id) is not null
    and realization.termin = public_due_date
    and realization.status in ('do_zrobienia', 'w_trakcie')
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'recurring_task_due_today'
        and notification.related_table = 'zadania_cykliczne_realizacje'
        and notification.related_id = realization.id
        and notification.recipient_id = coalesce(realization.osoba_id, client.opiekun_id)
        and notification.metadata->>'due_date' = public_due_date::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.create_due_recurring_task_notifications(date) to authenticated;
