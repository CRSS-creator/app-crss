create table public.korekty_czasu_zadan (
  id uuid primary key default gen_random_uuid(),
  zadanie_id uuid references public.zadania(id) on delete cascade,
  zadanie_cykliczne_id uuid references public.zadania_cykliczne(id) on delete cascade,
  klient_id uuid references public.klienci(id) on delete cascade,
  miesiac_rozliczeniowy date,
  osoba_id uuid not null references public.profiles(id),
  duration_seconds bigint not null,
  created_at timestamptz not null default now(),
  constraint korekty_czasu_zadan_source check (num_nonnulls(zadanie_id, zadanie_cykliczne_id) = 1)
);
create index korekty_czasu_zadan_task_idx on public.korekty_czasu_zadan(zadanie_id);
create index korekty_czasu_zadan_recurring_idx on public.korekty_czasu_zadan(zadanie_cykliczne_id, klient_id, miesiac_rozliczeniowy);
alter table public.korekty_czasu_zadan enable row level security;
grant select, insert on public.korekty_czasu_zadan to authenticated;
create policy korekty_czasu_zadan_select on public.korekty_czasu_zadan
for select to authenticated using (
  (zadanie_id is not null and exists (select 1 from public.zadania z where z.id = korekty_czasu_zadan.zadanie_id and public.can_view_task(z.osoba_id)))
  or (zadanie_cykliczne_id is not null and exists (
    select 1 from public.zadania_cykliczne_realizacje r
    where public.can_access_client(r.klient_id)
      and r.zadanie_cykliczne_id = korekty_czasu_zadan.zadanie_cykliczne_id
      and r.klient_id is not distinct from korekty_czasu_zadan.klient_id
      and r.okres is not distinct from korekty_czasu_zadan.miesiac_rozliczeniowy
  ))
);
create policy korekty_czasu_zadan_insert on public.korekty_czasu_zadan
for insert to authenticated with check (
  osoba_id = (select auth.uid()) and (
    (zadanie_id is not null and exists (select 1 from public.zadania z where z.id = korekty_czasu_zadan.zadanie_id and public.can_view_task(z.osoba_id)))
    or (zadanie_cykliczne_id is not null and exists (
      select 1 from public.zadania_cykliczne_realizacje r
      where public.can_access_client(r.klient_id)
      and r.zadanie_cykliczne_id = korekty_czasu_zadan.zadanie_cykliczne_id
        and r.klient_id is not distinct from korekty_czasu_zadan.klient_id
        and r.okres is not distinct from korekty_czasu_zadan.miesiac_rozliczeniowy
    ))
  )
);
-- Corrections affect task totals only. Actual dated work entries remain untouched.
create or replace function public.set_task_total_time(
  public_task_id uuid,
  public_total_seconds bigint,
  public_recurring boolean default false,
  public_client_id uuid default null,
  public_period date default null
) returns void
language plpgsql security invoker set search_path = public
as $$
declare
  current_total bigint;
  correction_total bigint;
  task_client_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public_task_id is null or public_recurring is null or public_total_seconds is null
    or public_total_seconds < 0 or public_total_seconds > 2147483647 then
    raise exception 'Invalid task time';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws('|', public_task_id, public_recurring, public_client_id, public_period), 0));
  if public_recurring then
    if not exists (
      select 1 from public.zadania_cykliczne_realizacje r
      where public.can_access_client(r.klient_id)
        and r.zadanie_cykliczne_id = public_task_id
        and r.klient_id is not distinct from public_client_id
        and r.okres is not distinct from public_period
    ) then raise exception 'Task not found or access denied'; end if;
    task_client_id := public_client_id;
  else
    select z.klient_id into task_client_id from public.zadania z
    where z.id = public_task_id and public.can_view_task(z.osoba_id);
    if not found then raise exception 'Task not found or access denied'; end if;
  end if;

  if exists (
    select 1 from public.czas_pracy t where t.ended_at is null and (
      (not public_recurring and t.zadanie_id = public_task_id)
      or (public_recurring and t.zadanie_cykliczne_id = public_task_id
        and t.klient_id is not distinct from public_client_id
        and t.miesiac_rozliczeniowy is not distinct from public_period)
    )
  ) then raise exception 'Stop the active task timer before correcting time'; end if;

  select coalesce(sum(t.duration_seconds), 0) into current_total
  from public.czas_pracy t where
    (not public_recurring and t.zadanie_id = public_task_id)
    or (public_recurring and t.zadanie_cykliczne_id = public_task_id
      and t.klient_id is not distinct from public_client_id
      and t.miesiac_rozliczeniowy is not distinct from public_period);
  select coalesce(sum(t.duration_seconds), 0) into correction_total
  from public.korekty_czasu_zadan t where
    (not public_recurring and t.zadanie_id = public_task_id)
    or (public_recurring and t.zadanie_cykliczne_id = public_task_id
      and t.klient_id is not distinct from public_client_id
      and t.miesiac_rozliczeniowy is not distinct from public_period);
  if public_total_seconds = current_total + correction_total then return; end if;
  insert into public.korekty_czasu_zadan
    (zadanie_id, zadanie_cykliczne_id, klient_id, miesiac_rozliczeniowy, osoba_id, duration_seconds)
  values (
    case when not public_recurring then public_task_id end,
    case when public_recurring then public_task_id end,
    task_client_id, case when public_recurring then public_period end,
    auth.uid(), public_total_seconds - current_total - correction_total
  );
end;
$$;
revoke all on function public.set_task_total_time(uuid,bigint,boolean,uuid,date) from public, anon;
grant execute on function public.set_task_total_time(uuid,bigint,boolean,uuid,date) to authenticated;
