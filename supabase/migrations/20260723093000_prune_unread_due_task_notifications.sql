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
  where notification.type = 'recurring_task_due_today'
    and notification.related_table = 'zadania_cykliczne_realizacje'
    and (
      not exists (
        select 1
        from public.zadania_cykliczne_realizacje realization
        join public.klienci client on client.id = realization.klient_id
        where realization.id = notification.related_id
          and client.opiekun_id is not null
      )
      or exists (
        select 1
        from public.zadania_cykliczne_realizacje realization
        join public.klienci client on client.id = realization.klient_id
        where realization.id = notification.related_id
          and (
            client.opiekun_id is null
            or notification.recipient_id is distinct from client.opiekun_id
            or realization.status not in ('do_zrobienia', 'w_trakcie')
            or realization.termin is null
            or notification.metadata->>'due_date' is null
            or realization.termin::text <> notification.metadata->>'due_date'
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
    'recurring_task_due_today',
    'Zadanie cykliczne na dziś',
    coalesce(realization.tytul, 'Zadanie cykliczne') || ' powinno być wykonane dzisiaj dla klienta ' || coalesce(client.nazwa, 'bez nazwy') || '.',
    case when realization.priorytet in ('pilne', 'wysoki') then 'high' else 'normal' end,
    'zadania_cykliczne_realizacje',
    realization.id,
    client.opiekun_id,
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
  where client.opiekun_id is not null
    and realization.termin = public_due_date
    and realization.status in ('do_zrobienia', 'w_trakcie')
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'recurring_task_due_today'
        and notification.related_table = 'zadania_cykliczne_realizacje'
        and notification.related_id = realization.id
        and notification.recipient_id = client.opiekun_id
        and notification.metadata->>'due_date' = public_due_date::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.create_due_recurring_task_notifications(date) to authenticated;

create or replace function public.prune_due_task_notifications_on_task_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'zadania' then
    delete from public.powiadomienia notification
    where notification.type = 'task_due_today'
      and notification.related_table = 'zadania'
      and notification.related_id = new.id
      and (
        new.status not in ('do_zrobienia', 'w_trakcie')
        or new.termin is null
        or notification.recipient_id is distinct from new.osoba_id
        or notification.metadata->>'due_date' is null
        or (new.termin at time zone 'Europe/Warsaw')::date::text <> notification.metadata->>'due_date'
      );
  elsif tg_table_name = 'zadania_cykliczne_realizacje' then
    delete from public.powiadomienia notification
    where notification.type = 'recurring_task_due_today'
      and notification.related_table = 'zadania_cykliczne_realizacje'
      and notification.related_id = new.id
      and (
        new.status not in ('do_zrobienia', 'w_trakcie')
        or new.termin is null
        or notification.metadata->>'due_date' is null
        or new.termin::text <> notification.metadata->>'due_date'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists prune_due_task_notifications_after_task_change on public.zadania;
create trigger prune_due_task_notifications_after_task_change
after insert or update of status, termin, osoba_id on public.zadania
for each row
execute function public.prune_due_task_notifications_on_task_change();

drop trigger if exists prune_due_recurring_task_notifications_after_change on public.zadania_cykliczne_realizacje;
create trigger prune_due_recurring_task_notifications_after_change
after insert or update of status, termin on public.zadania_cykliczne_realizacje
for each row
execute function public.prune_due_task_notifications_on_task_change();