create table if not exists public.zus_przedsiebiorcy_skladki_historia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  skladka_id uuid references public.zus_przedsiebiorcy_skladki(id) on delete set null,
  operacja text not null check (operacja in ('insert', 'update', 'snapshot')),
  rok integer not null,
  schemat_zus text not null,
  poprzednia_skladka_miesieczna numeric(14,2),
  skladka_miesieczna numeric(14,2) not null,
  poprzednie_uwagi text,
  uwagi text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_by_name text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists zus_przedsiebiorcy_skladki_historia_skladka_idx
  on public.zus_przedsiebiorcy_skladki_historia(skladka_id, created_at desc);

create index if not exists zus_przedsiebiorcy_skladki_historia_rok_schemat_idx
  on public.zus_przedsiebiorcy_skladki_historia(rok, schemat_zus, created_at desc);

alter table public.zus_przedsiebiorcy_skladki_historia enable row level security;

drop policy if exists zus_przedsiebiorcy_skladki_historia_select_app_users on public.zus_przedsiebiorcy_skladki_historia;
create policy zus_przedsiebiorcy_skladki_historia_select_app_users
on public.zus_przedsiebiorcy_skladki_historia
for select
to authenticated
using (public.current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

grant select on public.zus_przedsiebiorcy_skladki_historia to authenticated;

create or replace function public.record_zus_przedsiebiorcy_skladki_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  actor_name text;
begin
  if tg_op = 'UPDATE'
    and new.rok is not distinct from old.rok
    and new.schemat_zus is not distinct from old.schemat_zus
    and new.skladka_miesieczna is not distinct from old.skladka_miesieczna
    and new.uwagi is not distinct from old.uwagi
    and new.updated_by is not distinct from old.updated_by
  then
    return new;
  end if;

  actor_id := coalesce(new.updated_by, auth.uid());

  select coalesce(profile.full_name, profile.email)
  into actor_name
  from public.profiles profile
  where profile.id = actor_id;

  insert into public.zus_przedsiebiorcy_skladki_historia (
    skladka_id,
    operacja,
    rok,
    schemat_zus,
    poprzednia_skladka_miesieczna,
    skladka_miesieczna,
    poprzednie_uwagi,
    uwagi,
    changed_by,
    changed_by_name,
    metadata
  )
  values (
    new.id,
    lower(tg_op),
    new.rok,
    new.schemat_zus,
    case when tg_op = 'UPDATE' then old.skladka_miesieczna else null end,
    new.skladka_miesieczna,
    case when tg_op = 'UPDATE' then old.uwagi else null end,
    new.uwagi,
    actor_id,
    actor_name,
    jsonb_build_object('source', 'trigger')
  );

  return new;
end;
$$;

revoke all on function public.record_zus_przedsiebiorcy_skladki_history() from public;
revoke all on function public.record_zus_przedsiebiorcy_skladki_history() from authenticated;

drop trigger if exists zus_przedsiebiorcy_skladki_history_trigger on public.zus_przedsiebiorcy_skladki;
create trigger zus_przedsiebiorcy_skladki_history_trigger
after insert or update on public.zus_przedsiebiorcy_skladki
for each row
execute function public.record_zus_przedsiebiorcy_skladki_history();

insert into public.zus_przedsiebiorcy_skladki_historia (
  skladka_id,
  operacja,
  rok,
  schemat_zus,
  skladka_miesieczna,
  uwagi,
  changed_by,
  changed_by_name,
  metadata
)
select
  rate.id,
  'snapshot',
  rate.rok,
  rate.schemat_zus,
  rate.skladka_miesieczna,
  rate.uwagi,
  rate.updated_by,
  coalesce(profile.full_name, profile.email),
  jsonb_build_object('source', 'initial_snapshot')
from public.zus_przedsiebiorcy_skladki rate
left join public.profiles profile on profile.id = rate.updated_by
where not exists (
  select 1
  from public.zus_przedsiebiorcy_skladki_historia history
  where history.skladka_id = rate.id
    and history.operacja = 'snapshot'
);

create or replace function public.create_due_zus_preferential_rate_notifications(
  public_due_date date default ((now() at time zone 'Europe/Warsaw')::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  target_year integer := extract(year from public_due_date)::integer;
begin
  if extract(month from public_due_date)::integer <> 2
    or extract(day from public_due_date)::integer <> 1
  then
    return 0;
  end if;

  if exists (
    select 1
    from public.zus_przedsiebiorcy_skladki rate
    where rate.rok = target_year
      and lower(rate.schemat_zus) = lower('Preferencyjny ZUS')
      and rate.skladka_miesieczna > 0
  ) then
    return 0;
  end if;

  insert into public.powiadomienia (
    type,
    title,
    body,
    status,
    priority,
    recipient_id,
    metadata
  )
  select
    'zus_preferential_rate_due',
    'Uzupełnij składkę preferencyjną ZUS',
    'Uzupełnij wysokość składki na Preferencyjnym ZUS na rok ' || target_year || '.',
    'unread',
    'high',
    profile.id,
    jsonb_build_object(
      'notification_kind', 'zus_preferential_rate_due',
      'due_date', public_due_date::text,
      'year', target_year,
      'target_module', 'kadry',
      'target_tab', 'zus_przedsiebiorcy',
      'scheme', 'Preferencyjny ZUS'
    )
  from public.profiles profile
  where lower(coalesce(profile.role, '')) = 'manager'
    and coalesce(profile.aktywne, true)
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'zus_preferential_rate_due'
        and notification.recipient_id = profile.id
        and notification.metadata->>'year' = target_year::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_zus_preferential_rate_notifications(date) from public;
grant execute on function public.create_due_zus_preferential_rate_notifications(date) to authenticated;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'Nie udało się włączyć pg_cron: %', sqlerrm;
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select jobid into existing_job_id
    from cron.job
    where jobname = 'create_zus_preferential_rate_notifications_yearly'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_zus_preferential_rate_notifications_yearly',
      '0 7 1 2 *',
      $job$select public.create_due_zus_preferential_rate_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować powiadomień o składce preferencyjnej ZUS: %', sqlerrm;
end;
$$;

comment on table public.zus_przedsiebiorcy_skladki_historia is
  'Historia zmian rocznych stawek ZUS przedsiebiorcy.';

comment on function public.create_due_zus_preferential_rate_notifications(date) is
  'Tworzy 1 lutego powiadomienia dla managerow o uzupelnieniu stawki Preferencyjny ZUS.';
