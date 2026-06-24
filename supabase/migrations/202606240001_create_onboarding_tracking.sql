create table if not exists public.onboarding_etapy (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  etap text not null check (etap in ('contract', 'rodo', 'aml', 'powers', 'wfirma', 'drive', 'recurring')),
  status text not null default 'do_wykonania' check (status in ('do_wykonania', 'w_toku', 'gotowe', 'zablokowane')),
  uwagi text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint onboarding_etapy_klient_etap_unique unique (klient_id, etap)
);

create table if not exists public.onboarding_historia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  onboarding_etap_id uuid references public.onboarding_etapy(id) on delete set null,
  etap text,
  akcja text not null,
  old_status text,
  new_status text,
  opis text not null,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists onboarding_etapy_klient_id_idx on public.onboarding_etapy(klient_id);
create index if not exists onboarding_etapy_status_idx on public.onboarding_etapy(status);
create index if not exists onboarding_historia_klient_id_idx on public.onboarding_historia(klient_id);
create index if not exists onboarding_historia_created_at_idx on public.onboarding_historia(created_at desc);

create or replace function public.touch_onboarding_etapy_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists onboarding_etapy_touch_updated_at on public.onboarding_etapy;
create trigger onboarding_etapy_touch_updated_at
before update on public.onboarding_etapy
for each row
execute function public.touch_onboarding_etapy_updated_at();

alter table public.onboarding_etapy enable row level security;
alter table public.onboarding_historia enable row level security;

drop policy if exists onboarding_etapy_select_authenticated on public.onboarding_etapy;
create policy onboarding_etapy_select_authenticated
on public.onboarding_etapy
for select
to authenticated
using (true);

drop policy if exists onboarding_etapy_insert_authenticated on public.onboarding_etapy;
create policy onboarding_etapy_insert_authenticated
on public.onboarding_etapy
for insert
to authenticated
with check (true);

drop policy if exists onboarding_etapy_update_authenticated on public.onboarding_etapy;
create policy onboarding_etapy_update_authenticated
on public.onboarding_etapy
for update
to authenticated
using (true)
with check (true);

drop policy if exists onboarding_etapy_delete_authenticated on public.onboarding_etapy;
create policy onboarding_etapy_delete_authenticated
on public.onboarding_etapy
for delete
to authenticated
using (true);

drop policy if exists onboarding_historia_select_authenticated on public.onboarding_historia;
create policy onboarding_historia_select_authenticated
on public.onboarding_historia
for select
to authenticated
using (true);

drop policy if exists onboarding_historia_insert_authenticated on public.onboarding_historia;
create policy onboarding_historia_insert_authenticated
on public.onboarding_historia
for insert
to authenticated
with check (true);

grant select, insert, update, delete on public.onboarding_etapy to authenticated;
grant select, insert on public.onboarding_historia to authenticated;
