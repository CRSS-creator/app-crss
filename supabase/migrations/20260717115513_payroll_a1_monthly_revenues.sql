create table if not exists public.kadry_a1_przychody_miesieczne (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  a1_id uuid not null references public.kadry_a1(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2100),
  miesiac integer not null check (miesiac between 1 and 12),
  przychod_krajowy numeric(14, 2) not null default 0,
  przychod_zagraniczny numeric(14, 2) not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  constraint kadry_a1_przychody_month_unique unique (a1_id, rok, miesiac),
  constraint kadry_a1_przychody_nonnegative check (przychod_krajowy >= 0 and przychod_zagraniczny >= 0)
);

create index if not exists kadry_a1_przychody_a1_idx on public.kadry_a1_przychody_miesieczne(a1_id);
create index if not exists kadry_a1_przychody_year_month_idx on public.kadry_a1_przychody_miesieczne(rok, miesiac);

alter table public.kadry_a1_przychody_miesieczne enable row level security;

drop policy if exists kadry_a1_przychody_select_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_select_app_users
on public.kadry_a1_przychody_miesieczne
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_przychody_insert_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_insert_app_users
on public.kadry_a1_przychody_miesieczne
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_przychody_update_app_users on public.kadry_a1_przychody_miesieczne;
create policy kadry_a1_przychody_update_app_users
on public.kadry_a1_przychody_miesieczne
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.kadry_a1 a1
    join public.klienci klient on klient.id = a1.klient_id
    where a1.id = kadry_a1_przychody_miesieczne.a1_id
      and klient.opiekun_id = auth.uid()
  )
);

grant select, insert, update on public.kadry_a1_przychody_miesieczne to authenticated;

comment on table public.kadry_a1_przychody_miesieczne is 'Miesięczne przychody krajowe i zagraniczne dla rejestru A1.';
