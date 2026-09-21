-- Run after the notification migrations inside BEGIN / ROLLBACK.
-- Pure calendar cases plus checks against actual task IDs in each digest.
do $$
begin
  assert private.recurring_notification_due_date('2026-08-01','2026-08-18',18) = date '2026-09-18',
    'August settlement must notify in September';
  assert private.recurring_notification_due_date('2026-08-01','2026-09-30',30) = date '2026-09-30',
    'Already next-month deadline must not shift twice';
  assert private.recurring_notification_due_date('2026-12-01','2026-12-18',18) = date '2027-01-18',
    'December settlement must notify in January of the next year';
  assert private.recurring_notification_due_date('2027-01-01','2027-01-31',31) = date '2027-02-28',
    'Deadline must fit a short month';
  assert private.recurring_notification_due_date('2028-01-01','2028-01-31',31) = date '2028-02-29',
    'Leap-year February must be supported';
  assert private.recurring_notification_due_date('2027-02-01','2027-02-28',31) = date '2027-03-31',
    'Configured day 31 must not become day 28 after February';
  assert private.recurring_notification_due_date('2026-08-01','2026-08-15',18) = date '2026-09-15',
    'A manually rescheduled day must be preserved';
  assert private.recurring_notification_due_date('2026-08-01',null,18) is null,
    'An unset deadline must not create notifications';
  assert (date_trunc('month', timestamp '2027-01-18') - interval '1 month')::date = date '2026-12-01',
    'January must select December realizations';

  -- Verify that actual source rows, not only their displayed labels, are M-1.
  assert not exists (
    select 1 from public.powiadomienia n
    cross join lateral jsonb_array_elements(n.metadata->'items') item
    left join public.zadania_cykliczne_realizacje r on r.id = (item->>'realization_id')::uuid
    where n.metadata->>'notification_kind' = 'recurring_task_due_digest'
      and (r.id is null or r.okres is distinct from
        (date_trunc('month', (n.metadata->>'due_date')::timestamp) - interval '1 month')::date
        or item->>'period' is distinct from r.okres::text
        or r.status not in ('do_zrobienia','w_trakcie'))
  ), 'Digest contains wrong-period or completed task IDs';

  assert not exists (
    select 1 from public.powiadomienia n
    where n.metadata->>'notification_kind' = 'recurring_task_due_digest'
      and (n.metadata->>'task_count')::integer is distinct from (
        select count(*) from public.zadania_cykliczne_realizacje r
        join public.klienci c on c.id = r.klient_id and c.aktywny is true
        join public.zadania_cykliczne t on t.id = r.zadanie_cykliczne_id and t.aktywne is true
        join public.profiles p on p.id = c.opiekun_id and p.aktywne is true
        where c.opiekun_id = n.recipient_id
          and r.okres = (date_trunc('month',(n.metadata->>'due_date')::timestamp) - interval '1 month')::date
          and private.recurring_notification_due_date(r.okres,r.termin,t.dzien_miesiaca) = (n.metadata->>'due_date')::date
          and r.status in ('do_zrobienia','w_trakcie')
      )
  ), 'Digest count differs from actual previous-period open tasks';
  assert not exists (
    select 1 from public.powiadomienia where metadata->>'notification_kind' = 'recurring_task_due_digest'
      and (metadata->>'task_count')::integer = 0 and status <> 'read'
  ), 'Completed previous-period work must not leave an unread alert';
end;
$$;
