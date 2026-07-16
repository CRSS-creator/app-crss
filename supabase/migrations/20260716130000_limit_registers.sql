create table if not exists public.limity_rejestry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  typ text not null check (typ in ('vat', 'wnt', 'kasa_fiskalna')),
  limit_roczny numeric(14,2) not null default 0,
  uwagi text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (klient_id, typ)
);

create table if not exists public.limity_miesieczne (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  limit_id uuid not null references public.limity_rejestry(id) on delete cascade,
  rok integer not null,
  miesiac integer not null check (miesiac between 1 and 12),
  kwota numeric(14,2) not null default 0,
  updated_by uuid references public.profiles(id),
  unique (limit_id, rok, miesiac)
);

create index if not exists limity_rejestry_typ_idx on public.limity_rejestry(typ);
create index if not exists limity_rejestry_klient_idx on public.limity_rejestry(klient_id);
create index if not exists limity_miesieczne_limit_year_idx on public.limity_miesieczne(limit_id, rok, miesiac);

alter table public.limity_rejestry enable row level security;
alter table public.limity_miesieczne enable row level security;

drop policy if exists limity_rejestry_select_app_users on public.limity_rejestry;
create policy limity_rejestry_select_app_users
on public.limity_rejestry
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

drop policy if exists limity_rejestry_insert_app_users on public.limity_rejestry;
create policy limity_rejestry_insert_app_users
on public.limity_rejestry
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

drop policy if exists limity_rejestry_update_app_users on public.limity_rejestry;
create policy limity_rejestry_update_app_users
on public.limity_rejestry
for update
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'))
with check (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

drop policy if exists limity_miesieczne_select_app_users on public.limity_miesieczne;
create policy limity_miesieczne_select_app_users
on public.limity_miesieczne
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

drop policy if exists limity_miesieczne_insert_app_users on public.limity_miesieczne;
create policy limity_miesieczne_insert_app_users
on public.limity_miesieczne
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

drop policy if exists limity_miesieczne_update_app_users on public.limity_miesieczne;
create policy limity_miesieczne_update_app_users
on public.limity_miesieczne
for update
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'))
with check (public.get_current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

grant select, insert, update on public.limity_rejestry to authenticated;
grant select, insert, update on public.limity_miesieczne to authenticated;
