create table if not exists public.kadry_a1 (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  data_uzyskania_a1 date,
  data_konca_a1 date,
  procent_przychodow_zagranicznych numeric(5, 2) not null default 0,
  uwagi text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint kadry_a1_client_unique unique (klient_id),
  constraint kadry_a1_percent_check check (procent_przychodow_zagranicznych >= 0 and procent_przychodow_zagranicznych <= 100)
);

create index if not exists kadry_a1_klient_id_idx on public.kadry_a1(klient_id);
create index if not exists kadry_a1_data_konca_idx on public.kadry_a1(data_konca_a1);

alter table public.kadry_a1 enable row level security;

drop policy if exists kadry_a1_select_app_users on public.kadry_a1;
create policy kadry_a1_select_app_users
on public.kadry_a1
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_insert_app_users on public.kadry_a1;
create policy kadry_a1_insert_app_users
on public.kadry_a1
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_update_app_users on public.kadry_a1;
create policy kadry_a1_update_app_users
on public.kadry_a1
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

grant select, insert, update on public.kadry_a1 to authenticated;

comment on table public.kadry_a1 is 'Rejestr klientów z obsługą zaświadczeń A1.';
