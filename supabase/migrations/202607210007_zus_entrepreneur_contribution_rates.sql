create table if not exists public.zus_przedsiebiorcy_skladki (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rok integer not null check (rok between 2000 and 2100),
  schemat_zus text not null,
  skladka_miesieczna numeric(14,2) not null default 0,
  uwagi text,
  updated_by uuid references public.profiles(id),
  unique (rok, schemat_zus)
);

create index if not exists zus_przedsiebiorcy_skladki_rok_idx
on public.zus_przedsiebiorcy_skladki(rok);

alter table public.zus_przedsiebiorcy_skladki enable row level security;

drop policy if exists zus_przedsiebiorcy_skladki_select_app_users on public.zus_przedsiebiorcy_skladki;
create policy zus_przedsiebiorcy_skladki_select_app_users
on public.zus_przedsiebiorcy_skladki
for select
to authenticated
using (public.current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

drop policy if exists zus_przedsiebiorcy_skladki_insert_app_users on public.zus_przedsiebiorcy_skladki;
create policy zus_przedsiebiorcy_skladki_insert_app_users
on public.zus_przedsiebiorcy_skladki
for insert
to authenticated
with check (public.current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

drop policy if exists zus_przedsiebiorcy_skladki_update_app_users on public.zus_przedsiebiorcy_skladki;
create policy zus_przedsiebiorcy_skladki_update_app_users
on public.zus_przedsiebiorcy_skladki
for update
to authenticated
using (public.current_user_role() in ('owner', 'manager', 'admin', 'accountant'))
with check (public.current_user_role() in ('owner', 'manager', 'admin', 'accountant'));

grant select, insert, update on public.zus_przedsiebiorcy_skladki to authenticated;

comment on table public.zus_przedsiebiorcy_skladki is
  'Roczne wysokosci miesiecznych skladek ZUS dla schematow ZUS przedsiebiorcy.';
