create table if not exists public.kadry_zus_preferencja_powiadomienia_historia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  recipient_email text not null,
  subject text not null,
  message text not null,
  html text,
  schemat_zus text,
  nastepny_schemat_zus text,
  data_konca_ulgi date,
  miesiac_od date,
  rok_skladki integer,
  skladka_miesieczna numeric(14,2),
  sent_by uuid references auth.users(id) on delete set null,
  sent_by_name text,
  sent_by_email text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists kadry_zus_preferencja_powiadomienia_historia_klient_idx
  on public.kadry_zus_preferencja_powiadomienia_historia(klient_id, created_at desc);

create index if not exists kadry_zus_preferencja_powiadomienia_historia_created_at_idx
  on public.kadry_zus_preferencja_powiadomienia_historia(created_at desc);

alter table public.kadry_zus_preferencja_powiadomienia_historia enable row level security;

drop policy if exists kadry_zus_preferencja_powiadomienia_historia_select_app_users on public.kadry_zus_preferencja_powiadomienia_historia;
create policy kadry_zus_preferencja_powiadomienia_historia_select_app_users
on public.kadry_zus_preferencja_powiadomienia_historia
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_zus_preferencja_powiadomienia_historia.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists kadry_zus_preferencja_powiadomienia_historia_insert_app_users on public.kadry_zus_preferencja_powiadomienia_historia;
create policy kadry_zus_preferencja_powiadomienia_historia_insert_app_users
on public.kadry_zus_preferencja_powiadomienia_historia
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = kadry_zus_preferencja_powiadomienia_historia.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

grant select, insert on public.kadry_zus_preferencja_powiadomienia_historia to authenticated;

comment on table public.kadry_zus_preferencja_powiadomienia_historia is
  'Historia powiadomien wyslanych do klientow o koncu preferencji ZUS i wysokosci skladek od kolejnego miesiaca.';
