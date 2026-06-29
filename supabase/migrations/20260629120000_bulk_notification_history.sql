create table if not exists public.komunikaty_historia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sent_by uuid references public.profiles(id) on delete set null,
  sent_by_name text,
  subject text not null,
  message text not null,
  recipients_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  filter_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists komunikaty_historia_created_at_idx
  on public.komunikaty_historia(created_at desc);

alter table public.komunikaty_historia enable row level security;

grant select on public.komunikaty_historia to authenticated;
grant insert on public.komunikaty_historia to authenticated;

drop policy if exists komunikaty_historia_select_app_users on public.komunikaty_historia;
create policy komunikaty_historia_select_app_users
on public.komunikaty_historia
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
