create extension if not exists pgcrypto;

create table if not exists public.wfirma_webhook_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  result text not null default 'received',
  wfirma_id text,
  invoice_number text,
  invoice_id uuid references public.faktury(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists wfirma_webhook_events_created_at_idx
on public.wfirma_webhook_events(created_at desc);

create index if not exists wfirma_webhook_events_result_idx
on public.wfirma_webhook_events(result);

create index if not exists wfirma_webhook_events_wfirma_id_idx
on public.wfirma_webhook_events(wfirma_id)
where wfirma_id is not null;

alter table public.wfirma_webhook_events enable row level security;

grant select on public.wfirma_webhook_events to authenticated;

drop policy if exists wfirma_webhook_events_select_management on public.wfirma_webhook_events;
create policy wfirma_webhook_events_select_management
on public.wfirma_webhook_events
for select
to authenticated
using (public.current_user_role() in ('owner', 'admin'));
