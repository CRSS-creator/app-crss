create table if not exists public.kadry_a1_powiadomienia_historia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  a1_id uuid not null references public.kadry_a1(id) on delete cascade,
  klient_id uuid not null references public.klienci(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  message text not null,
  html text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_by_name text,
  sent_by_email text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists kadry_a1_powiadomienia_historia_a1_idx
  on public.kadry_a1_powiadomienia_historia(a1_id, created_at desc);

create index if not exists kadry_a1_powiadomienia_historia_klient_idx
  on public.kadry_a1_powiadomienia_historia(klient_id, created_at desc);

alter table public.kadry_a1_powiadomienia_historia enable row level security;

drop policy if exists kadry_a1_powiadomienia_historia_select_app_users on public.kadry_a1_powiadomienia_historia;
create policy kadry_a1_powiadomienia_historia_select_app_users
on public.kadry_a1_powiadomienia_historia
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1_powiadomienia_historia.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_a1_powiadomienia_historia_insert_app_users on public.kadry_a1_powiadomienia_historia;
create policy kadry_a1_powiadomienia_historia_insert_app_users
on public.kadry_a1_powiadomienia_historia
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_a1_powiadomienia_historia.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

grant select, insert on public.kadry_a1_powiadomienia_historia to authenticated;

comment on table public.kadry_a1_powiadomienia_historia is 'Historia powiadomień wysłanych do klientów w sprawie rozliczenia A1.';
