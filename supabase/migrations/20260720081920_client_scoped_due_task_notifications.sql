update public.powiadomienia notification
set
  recipient_id = client.opiekun_id,
  metadata = coalesce(notification.metadata, '{}'::jsonb) || jsonb_build_object(
    'client_id', realization.klient_id,
    'client_name', client.nazwa
  )
from public.zadania_cykliczne_realizacje realization
join public.klienci client on client.id = realization.klient_id
where notification.type = 'recurring_task_due_today'
  and notification.related_table = 'zadania_cykliczne_realizacje'
  and notification.related_id = realization.id
  and client.opiekun_id is not null
  and notification.recipient_id is distinct from client.opiekun_id;

update public.powiadomienia notification
set recipient_id = null
where notification.type = 'recurring_task_due_today'
  and notification.related_table = 'zadania_cykliczne_realizacje'
  and not exists (
    select 1
    from public.zadania_cykliczne_realizacje realization
    join public.klienci client on client.id = realization.klient_id
    where realization.id = notification.related_id
      and client.opiekun_id is not null
  );

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
    and notification.status = 'read'
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
