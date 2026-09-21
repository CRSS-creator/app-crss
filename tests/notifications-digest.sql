-- Run AFTER the migration in a transaction and ALWAYS ROLLBACK.
-- Uses an existing nonempty digest as a fixture, with no fixed customer/user IDs.
-- Completion changes below are temporary and are rolled back with the test.
do $$
declare
  digest public.powiadomienia%rowtype;
  before_count integer;
  realization_id uuid;
  realization_ids uuid[];
  before_other jsonb;
begin
  select * into strict digest from public.powiadomienia
  where type = 'recurring_task_due_today'
    and metadata->>'notification_kind' = 'recurring_task_due_digest'
    and (metadata->>'task_count')::integer > 1
  order by id limit 1;
  before_count := (digest.metadata->>'task_count')::integer;
  select jsonb_agg(to_jsonb(n) order by n.id) into before_other
    from public.powiadomienia n where type <> 'recurring_task_due_today';

  assert not exists (
    select 1 from public.powiadomienia n
    cross join lateral jsonb_array_elements(n.metadata->'items') item
    join public.klienci c on c.id = (item->>'client_id')::uuid
    where n.type = 'recurring_task_due_today' and c.aktywny is not true
  ), 'Inactive clients must not appear in digests';
  assert not exists (
    select 1 from public.powiadomienia where type = 'recurring_task_due_today' and related_id is not null
  ), 'Legacy per-task flood was not consolidated';

  assert public.create_due_recurring_task_notifications((digest.metadata->>'due_date')::date) = 0,
    'Repeated generation inserted another digest';
  begin
    insert into public.powiadomienia(type,title,recipient_id,metadata)
    values(digest.type,digest.title,digest.recipient_id,digest.metadata);
    raise exception 'Unique constraint did not reject duplicate digest';
  exception when unique_violation then null;
  end;

  update public.powiadomienia set status = 'read', read_at = now() where id = digest.id;
  perform public.create_due_recurring_task_notifications((digest.metadata->>'due_date')::date);
  assert (select status = 'read' from public.powiadomienia where id = digest.id), 'Read state lost on refresh';
  assert (select created_at = digest.created_at from public.powiadomienia where id = digest.id), 'Refresh reset original timestamp';

  select array_agg((item->>'realization_id')::uuid) into realization_ids
    from jsonb_array_elements(digest.metadata->'items') item;
  realization_id := realization_ids[1];
  update public.zadania_cykliczne_realizacje set status = 'zrobione' where id = realization_id;
  assert (select (metadata->>'task_count')::integer = before_count - 1
    from public.powiadomienia where id = digest.id), 'Completion did not refresh digest';

  update public.powiadomienia set status = 'unread', read_at = null where id = digest.id;
  update public.zadania_cykliczne_realizacje set status = 'zrobione' where id = any(realization_ids);
  assert (select status = 'read' and (metadata->>'task_count')::integer = 0
    from public.powiadomienia where id = digest.id), 'Empty digest did not leave unread inbox';
  update public.zadania_cykliczne_realizacje set status = 'do_zrobienia' where id = realization_id;
  perform public.create_due_recurring_task_notifications((digest.metadata->>'due_date')::date);
  assert (select status = 'read' and (metadata->>'task_count')::integer = 1
    from public.powiadomienia where id = digest.id), 'Reopened task recreated unread flood';

  assert before_other = (select jsonb_agg(to_jsonb(n) order by n.id)
    from public.powiadomienia n where type <> 'recurring_task_due_today'), 'Unrelated notifications changed';
  assert not has_function_privilege('anon', 'public.create_due_recurring_task_notifications(date)', 'execute'),
    'Anonymous caller can generate notifications';
  assert not has_function_privilege('authenticated', 'private.sync_recurring_due_notification(uuid,date,boolean)', 'execute'),
    'Internal synchronization is exposed';
end;
$$;
create temporary table notification_other_recipients_before as
select * from public.powiadomienia;
select set_config('request.jwt.claim.sub',(select recipient_id::text from public.powiadomienia where metadata->>'notification_kind'='recurring_task_due_digest' order by id limit 1),true);
set local role authenticated;
do $$
begin
  assert not exists(select 1 from public.powiadomienia where recipient_id is distinct from auth.uid()), 'RLS exposes another recipient';
  perform public.create_due_recurring_task_notifications();
  begin
    perform public.create_due_recurring_task_notifications(date '2000-01-01');
    raise exception 'Authenticated caller could generate historical floods';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;
do $$
begin
 assert not exists (
 (select * from public.powiadomienia where recipient_id is distinct from auth.uid()
  except select * from notification_other_recipients_before where recipient_id is distinct from auth.uid())
 union all
 (select * from notification_other_recipients_before where recipient_id is distinct from auth.uid()
  except select * from public.powiadomienia where recipient_id is distinct from auth.uid())
 ), 'Authenticated caller changed another recipient';
end;
$$;
