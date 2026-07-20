update public.powiadomienia notification
set
  recipient_id = task.osoba_id,
  metadata = coalesce(notification.metadata, '{}'::jsonb) || jsonb_build_object(
    'task_id', task.id,
    'task_title', task.tytul,
    'task_status', task.status,
    'client_id', task.klient_id
  )
from public.zadania task
where notification.type = 'task_due_today'
  and notification.related_table = 'zadania'
  and notification.related_id = task.id
  and task.osoba_id is not null
  and notification.recipient_id is distinct from task.osoba_id;

update public.powiadomienia notification
set recipient_id = null
where notification.type = 'task_due_today'
  and notification.related_table = 'zadania'
  and not exists (
    select 1
    from public.zadania task
    where task.id = notification.related_id
      and task.osoba_id is not null
  );

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
  where notification.type = 'task_due_today'
    and notification.related_table = 'zadania'
    and notification.status = 'read'
    and (
      not exists (
        select 1
        from public.zadania task
        where task.id = notification.related_id
          and task.osoba_id is not null
      )
      or exists (
        select 1
        from public.zadania task
        where task.id = notification.related_id
          and (
            task.osoba_id is null
            or notification.recipient_id is distinct from task.osoba_id
            or task.status not in ('do_zrobienia', 'w_trakcie')
            or task.termin is null
            or notification.metadata->>'due_date' is null
            or (task.termin at time zone 'Europe/Warsaw')::date::text <> notification.metadata->>'due_date'
          )
      )
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
      'client_id', task.klient_id,
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
