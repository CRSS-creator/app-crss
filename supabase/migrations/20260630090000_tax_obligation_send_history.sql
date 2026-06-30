create table if not exists public.zobowiazania_wysylki_historia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('email', 'sms')),
  settlement_id uuid references public.rozliczenia_miesieczne(id) on delete set null,
  client_id uuid references public.klienci(id) on delete set null,
  client_name text,
  client_nip text,
  period date not null,
  period_label text not null,
  subject text,
  recipient_email text,
  recipient_phone text,
  obligations jsonb not null default '[]'::jsonb,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_by_name text
);

create index if not exists zobowiazania_wysylki_historia_created_at_idx
  on public.zobowiazania_wysylki_historia(created_at desc);

create index if not exists zobowiazania_wysylki_historia_client_idx
  on public.zobowiazania_wysylki_historia(client_id, period desc);

alter table public.zobowiazania_wysylki_historia enable row level security;

grant select on public.zobowiazania_wysylki_historia to authenticated;

drop policy if exists zobowiazania_wysylki_historia_select_app_users on public.zobowiazania_wysylki_historia;
create policy zobowiazania_wysylki_historia_select_app_users
on public.zobowiazania_wysylki_historia
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.aktywne, true) = true
      and p.role in ('owner', 'manager', 'admin', 'accountant')
  )
);
