-- Keep the original business rules. Cache only a completed calculation for unchanged inputs.
create table private.due_notification_runs (
  scope text primary key,
  input_signature text not null,
  completed_at timestamptz,
  last_attempt_at timestamptz not null default now(),
  last_error text
);
revoke all on private.due_notification_runs from public,anon,authenticated;
alter table private.due_notification_runs enable row level security;

create function private.notification_input_signature() returns text
language sql stable security definer set search_path='' as $signature$
select md5(concat_ws('|', (now() at time zone 'Europe/Warsaw')::date::text,
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.klienci r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.profiles r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.zadania r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.zadania_cykliczne r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.zadania_cykliczne_realizacje r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.klient_karty_formularze r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.kadry_umowy r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.kadry_a1 r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.zus_przedsiebiorcy_skladki r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.aml_rejestr_klientow r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.crm_szanse_sprzedazy r),
  (select md5(coalesce(jsonb_agg(to_jsonb(r) order by r.id)::text,'[]')) from public.powiadomienia r)
));
$signature$;
revoke all on function private.notification_input_signature() from public,anon,authenticated;

create function private.refresh_due_notifications_cached() returns jsonb
language plpgsql security definer set search_path='' as $refresh$
declare
  input_hash text;
  caller_scope text := coalesce(auth.uid()::text,'system');
  function_name text;
  failures text[] := '{}';
  generated integer;
  total_generated integer := 0;
begin
  input_hash := private.notification_input_signature();
  if exists(select 1 from private.due_notification_runs r
    where r.scope in (caller_scope,'system') and r.input_signature=input_hash
      and r.completed_at > clock_timestamp()-interval '5 minutes' and r.last_error is null) then
    return jsonb_build_object('cached',true,'generated',0);
  end if;
  -- One generator across cron, tabs and users; recheck after obtaining the lock.
  perform pg_advisory_xact_lock(187461,1);
  input_hash := private.notification_input_signature();
  if exists(select 1 from private.due_notification_runs r
    where r.scope in (caller_scope,'system') and r.input_signature=input_hash
      and r.completed_at > clock_timestamp()-interval '5 minutes' and r.last_error is null) then
    return jsonb_build_object('cached',true,'generated',0);
  end if;
  foreach function_name in array array['create_due_task_notifications','create_due_crm_follow_up_notifications','create_due_recurring_task_notifications','create_due_client_card_notifications','create_due_rodo_review_notifications','create_due_onboarding_completion_notifications','create_due_payroll_contract_notifications','create_due_payroll_a1_notifications','create_due_zus_preferential_rate_notifications','create_due_zus_preference_expiry_notifications','create_due_zus_small_plus_check_notifications','create_due_aml_next_verification_notifications']
  loop
    begin
      execute format('select public.%I()',function_name) into generated;
      total_generated := total_generated+coalesce(generated,0);
    exception when others then
      failures := array_append(failures,function_name || ': ' || sqlerrm);
    end;
  end loop;
  -- Save the PRE-run signature: concurrent input changes can never be accepted as processed.
  -- A run inserting notifications may require one additional reconciliation, then becomes a read.
  insert into private.due_notification_runs(scope,input_signature,completed_at,last_attempt_at,last_error)
  values(caller_scope,input_hash,case when cardinality(failures)=0 then clock_timestamp() end,
    clock_timestamp(),nullif(array_to_string(failures,E'\n'),''))
  on conflict(scope) do update set input_signature=excluded.input_signature,
    completed_at=excluded.completed_at,last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error;
  if cardinality(failures)>0 then
    raise warning 'Notification generation failed: %',array_to_string(failures,'; ');
  end if;
  return jsonb_build_object('cached',false,'generated',total_generated,
    'error',nullif(array_to_string(failures,E'\n'),''));
end;
$refresh$;
revoke all on function private.refresh_due_notifications_cached() from public,anon,authenticated;

create function public.refresh_due_notifications() returns jsonb
language plpgsql security definer set search_path='' as $public_refresh$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and aktywne is true) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  return private.refresh_due_notifications_cached();
end;
$public_refresh$;
revoke all on function public.refresh_due_notifications() from public,anon;
grant execute on function public.refresh_due_notifications() to authenticated;

-- Replace the old overlapping notification jobs with one shared job. Invoice jobs stay unchanged.
do $jobs$
declare existing_job record;
begin
  for existing_job in select jobid from cron.job where jobname in (
    'create_onboarding_completion_overdue_notifications_daily',
    'create_payroll_contract_expiry_notifications_daily',
    'create_zus_preferential_rate_notifications_yearly',
    'create_zus_preference_expiry_notifications_daily',
    'create_zus_small_plus_check_notifications_yearly',
    'create_aml_next_verification_notifications_daily',
    'create_crm_follow_up_notifications_daily')
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
  perform cron.schedule('refresh_due_notifications_shared','*/5 * * * *',
    'select private.refresh_due_notifications_cached();');
end;
$jobs$;
