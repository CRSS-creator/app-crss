alter table public.klienci
  add column if not exists osoba_kontaktowa text;

create table if not exists public.klient_karty_formularze (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'active' check (status in ('active', 'completed', 'revoked')),
  recipient_email text,
  recipient_name text,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_by_name text,
  completed_at timestamptz,
  completed_by_name text,
  completed_pdf_document_id uuid references public.klienci_dokumenty(id) on delete set null,
  form_data jsonb not null default '{}'::jsonb
);

create index if not exists klient_karty_formularze_klient_idx
  on public.klient_karty_formularze(klient_id);

create index if not exists klient_karty_formularze_status_idx
  on public.klient_karty_formularze(status);

drop trigger if exists trg_klient_karty_formularze_updated_at on public.klient_karty_formularze;
create trigger trg_klient_karty_formularze_updated_at
  before update on public.klient_karty_formularze
  for each row
  execute function public.touch_updated_at();

alter table public.klient_karty_formularze enable row level security;

drop policy if exists "Authenticated users can read client card forms" on public.klient_karty_formularze;
create policy "Authenticated users can read client card forms"
on public.klient_karty_formularze
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'manager', 'admin')
      and coalesce(p.aktywne, true) = true
  )
  or public.can_access_client(klient_id)
);

drop policy if exists "Authenticated users can create client card forms" on public.klient_karty_formularze;
create policy "Authenticated users can create client card forms"
on public.klient_karty_formularze
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'manager', 'admin')
      and coalesce(p.aktywne, true) = true
  )
  or public.can_access_client(klient_id)
);

drop policy if exists "Authenticated users can update client card forms" on public.klient_karty_formularze;
create policy "Authenticated users can update client card forms"
on public.klient_karty_formularze
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'manager', 'admin')
      and coalesce(p.aktywne, true) = true
  )
  or public.can_access_client(klient_id)
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'manager', 'admin')
      and coalesce(p.aktywne, true) = true
  )
  or public.can_access_client(klient_id)
);

grant select, insert, update on public.klient_karty_formularze to authenticated;
