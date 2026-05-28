create or replace function public.create_task_assignment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.osoba_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.osoba_id is not distinct from new.osoba_id then
    return new;
  end if;

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
  values (
    'task_assigned',
    'Nowe zadanie',
    coalesce(new.tytul, 'Zadanie') || case when new.termin is not null then ' · termin: ' || to_char(new.termin at time zone 'Europe/Warsaw', 'DD.MM.YYYY') else '' end,
    case when new.priorytet = 'pilne' then 'high' else 'normal' end,
    'zadania',
    new.id,
    new.osoba_id,
    jsonb_build_object(
      'task_id', new.id,
      'task_title', new.tytul,
      'task_status', new.status,
      'due_at', new.termin,
      'notification_kind', 'assignment'
    )
  );

  return new;
end;
$$;

drop trigger if exists zadania_assignment_notification on public.zadania;
create trigger zadania_assignment_notification
after insert or update of osoba_id on public.zadania
for each row
execute function public.create_task_assignment_notification();

create or replace function public.create_due_task_notifications(public_due_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
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
    and task.status not in ('zrobione', 'anulowane')
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

drop policy if exists powiadomienia_select_app_users on public.powiadomienia;
create policy powiadomienia_select_app_users
on public.powiadomienia
for select
to authenticated
using (
  case
    when type in ('task_assigned', 'task_due_today') then recipient_id = auth.uid()
    else recipient_id = auth.uid() or public.current_user_role() in ('owner', 'admin', 'manager', 'accountant')
  end
);

drop policy if exists powiadomienia_update_app_users on public.powiadomienia;
create policy powiadomienia_update_app_users
on public.powiadomienia
for update
to authenticated
using (
  case
    when type in ('task_assigned', 'task_due_today') then recipient_id = auth.uid()
    else recipient_id = auth.uid() or public.current_user_role() in ('owner', 'admin', 'manager', 'accountant')
  end
)
with check (
  case
    when type in ('task_assigned', 'task_due_today') then recipient_id = auth.uid()
    else recipient_id = auth.uid() or public.current_user_role() in ('owner', 'admin', 'manager', 'accountant')
  end
);
