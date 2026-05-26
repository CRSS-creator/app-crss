-- Moduł Zadania: zadania operacyjne, rejestr czasu pracy i dokumenty.
-- Zasady widoczności:
-- - owner widzi zadania wszystkich,
-- - manager widzi wszystkie zadania poza zadaniami osób z rolą owner,
-- - admin i accountant widzą tylko zadania przypisane do siebie.

create extension if not exists pgcrypto;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
  limit 1
$$;

create or replace function public.profile_role(profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = profile_id
  limit 1
$$;

create or replace function public.can_view_task(task_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_role text;
  task_owner_role text;
begin
  viewer_role := public.current_user_role();

  if viewer_role = 'owner' then
    return true;
  end if;

  if viewer_role = 'manager' then
    task_owner_role := public.profile_role(task_owner_id);
    return coalesce(task_owner_role, '') <> 'owner';
  end if;

  if viewer_role in ('admin', 'accountant') then
    return task_owner_id = auth.uid();
  end if;

  return false;
end;
$$;

create or replace function public.can_assign_task_to(task_owner_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer_role text;
  task_owner_role text;
begin
  viewer_role := public.current_user_role();

  if viewer_role = 'owner' then
    return true;
  end if;

  if viewer_role = 'manager' then
    task_owner_role := public.profile_role(task_owner_id);
    return coalesce(task_owner_role, '') <> 'owner';
  end if;

  if viewer_role in ('admin', 'accountant') then
    return task_owner_id = auth.uid();
  end if;

  return false;
end;
$$;

create table if not exists public.zadania (
  id uuid primary key default gen_random_uuid(),
  tytul text not null,
  opis text,
  status text not null default 'do_zrobienia'
    check (status in ('do_zrobienia', 'w_trakcie', 'zrobione', 'anulowane')),
  priorytet text not null default 'normalny'
    check (priorytet in ('niski', 'normalny', 'wysoki', 'pilne')),
  termin timestamptz,
  osoba_id uuid not null references public.profiles(id) on delete restrict,
  klient_id uuid references public.klienci(id) on delete set null,
  czy_wewnetrzne boolean not null default false,
  notatki text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zadania_klient_albo_wewnetrzne check (
    (czy_wewnetrzne = true and klient_id is null)
    or
    (czy_wewnetrzne = false and klient_id is not null)
  )
);

create index if not exists zadania_osoba_id_idx on public.zadania(osoba_id);
create index if not exists zadania_klient_id_idx on public.zadania(klient_id);
create index if not exists zadania_status_idx on public.zadania(status);
create index if not exists zadania_termin_idx on public.zadania(termin);

create table if not exists public.czas_pracy (
  id uuid primary key default gen_random_uuid(),
  zadanie_id uuid references public.zadania(id) on delete cascade,
  zadanie_cykliczne_id uuid,
  klient_id uuid references public.klienci(id) on delete set null,
  osoba_id uuid not null references public.profiles(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  miesiac_rozliczeniowy date,
  opis text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint czas_pracy_zrodlo_check check (
    zadanie_id is not null or zadanie_cykliczne_id is not null
  ),
  constraint czas_pracy_zakonczony_po_starcie check (
    ended_at is null or ended_at >= started_at
  ),
  constraint czas_pracy_duration_check check (
    duration_seconds is null or duration_seconds >= 0
  )
);

create index if not exists czas_pracy_zadanie_id_idx on public.czas_pracy(zadanie_id);
create index if not exists czas_pracy_klient_miesiac_idx on public.czas_pracy(klient_id, miesiac_rozliczeniowy);
create index if not exists czas_pracy_osoba_id_idx on public.czas_pracy(osoba_id);

create table if not exists public.zadania_dokumenty (
  id uuid primary key default gen_random_uuid(),
  zadanie_id uuid not null references public.zadania(id) on delete cascade,
  nazwa text not null,
  sciezka text not null,
  rozmiar integer,
  typ text,
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists zadania_dokumenty_zadanie_id_idx on public.zadania_dokumenty(zadanie_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.prepare_time_entry()
returns trigger
language plpgsql
as $$
begin
  if new.ended_at is not null then
    new.duration_seconds := greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::integer);
  else
    new.duration_seconds := null;
  end if;

  new.miesiac_rozliczeniowy := date_trunc('month', new.started_at)::date;

  if new.zadanie_id is not null then
    select z.klient_id
    into new.klient_id
    from public.zadania z
    where z.id = new.zadanie_id;
  end if;

  return new;
end;
$$;

drop trigger if exists zadania_touch_updated_at on public.zadania;
create trigger zadania_touch_updated_at
before update on public.zadania
for each row execute function public.touch_updated_at();

drop trigger if exists czas_pracy_touch_updated_at on public.czas_pracy;
create trigger czas_pracy_touch_updated_at
before update on public.czas_pracy
for each row execute function public.touch_updated_at();

drop trigger if exists czas_pracy_prepare on public.czas_pracy;
create trigger czas_pracy_prepare
before insert or update on public.czas_pracy
for each row execute function public.prepare_time_entry();

alter table public.zadania enable row level security;
alter table public.czas_pracy enable row level security;
alter table public.zadania_dokumenty enable row level security;

drop policy if exists zadania_select_visible on public.zadania;
create policy zadania_select_visible
on public.zadania
for select
to authenticated
using (public.can_view_task(osoba_id));

drop policy if exists zadania_insert_allowed on public.zadania;
create policy zadania_insert_allowed
on public.zadania
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.can_assign_task_to(osoba_id)
);

drop policy if exists zadania_update_allowed on public.zadania;
create policy zadania_update_allowed
on public.zadania
for update
to authenticated
using (public.can_view_task(osoba_id))
with check (public.can_assign_task_to(osoba_id));

drop policy if exists zadania_delete_allowed on public.zadania;
create policy zadania_delete_allowed
on public.zadania
for delete
to authenticated
using (public.current_user_role() in ('owner', 'manager') and public.can_view_task(osoba_id));

drop policy if exists czas_pracy_select_visible on public.czas_pracy;
create policy czas_pracy_select_visible
on public.czas_pracy
for select
to authenticated
using (
  public.can_view_task(osoba_id)
  or exists (
    select 1
    from public.zadania z
    where z.id = czas_pracy.zadanie_id
      and public.can_view_task(z.osoba_id)
  )
);

drop policy if exists czas_pracy_insert_own_visible_task on public.czas_pracy;
create policy czas_pracy_insert_own_visible_task
on public.czas_pracy
for insert
to authenticated
with check (
  osoba_id = auth.uid()
  and (
    zadanie_id is null
    or exists (
      select 1
      from public.zadania z
      where z.id = zadanie_id
        and public.can_view_task(z.osoba_id)
    )
  )
);

drop policy if exists czas_pracy_update_own on public.czas_pracy;
create policy czas_pracy_update_own
on public.czas_pracy
for update
to authenticated
using (osoba_id = auth.uid())
with check (osoba_id = auth.uid());

drop policy if exists czas_pracy_delete_managers_or_own on public.czas_pracy;
create policy czas_pracy_delete_managers_or_own
on public.czas_pracy
for delete
to authenticated
using (
  osoba_id = auth.uid()
  or public.current_user_role() in ('owner', 'manager')
);

drop policy if exists zadania_dokumenty_select_visible on public.zadania_dokumenty;
create policy zadania_dokumenty_select_visible
on public.zadania_dokumenty
for select
to authenticated
using (
  exists (
    select 1
    from public.zadania z
    where z.id = zadania_dokumenty.zadanie_id
      and public.can_view_task(z.osoba_id)
  )
);

drop policy if exists zadania_dokumenty_insert_visible on public.zadania_dokumenty;
create policy zadania_dokumenty_insert_visible
on public.zadania_dokumenty
for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1
    from public.zadania z
    where z.id = zadanie_id
      and public.can_view_task(z.osoba_id)
  )
);

drop policy if exists zadania_dokumenty_delete_allowed on public.zadania_dokumenty;
create policy zadania_dokumenty_delete_allowed
on public.zadania_dokumenty
for delete
to authenticated
using (
  uploaded_by = auth.uid()
  or public.current_user_role() in ('owner', 'manager')
);

insert into storage.buckets (id, name, public)
values ('zadania-dokumenty', 'zadania-dokumenty', false)
on conflict (id) do nothing;

drop policy if exists zadania_storage_select_visible on storage.objects;
create policy zadania_storage_select_visible
on storage.objects
for select
to authenticated
using (
  bucket_id = 'zadania-dokumenty'
  and exists (
    select 1
    from public.zadania_dokumenty d
    join public.zadania z on z.id = d.zadanie_id
    where d.sciezka = storage.objects.name
      and public.can_view_task(z.osoba_id)
  )
);

drop policy if exists zadania_storage_insert_authenticated on storage.objects;
create policy zadania_storage_insert_authenticated
on storage.objects
for insert
to authenticated
with check (bucket_id = 'zadania-dokumenty');

drop policy if exists zadania_storage_delete_allowed on storage.objects;
create policy zadania_storage_delete_allowed
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'zadania-dokumenty'
  and exists (
    select 1
    from public.zadania_dokumenty d
    where d.sciezka = storage.objects.name
      and (
        d.uploaded_by = auth.uid()
        or public.current_user_role() in ('owner', 'manager')
      )
  )
);
