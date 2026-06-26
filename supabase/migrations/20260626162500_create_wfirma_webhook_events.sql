create table if not exists public.wfirma_webhook_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text,
  source_ip text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  processing_status text not null default 'new' check (processing_status in ('new', 'processed', 'ignored', 'error')),
  processing_error text
);

create index if not exists wfirma_webhook_events_created_at_idx
on public.wfirma_webhook_events (created_at desc);

create index if not exists wfirma_webhook_events_event_type_idx
on public.wfirma_webhook_events (event_type);

alter table public.wfirma_webhook_events enable row level security;

grant select on public.wfirma_webhook_events to authenticated;

drop policy if exists wfirma_webhook_events_select_management on public.wfirma_webhook_events;
create policy wfirma_webhook_events_select_management
on public.wfirma_webhook_events
for select
to authenticated
using (public.current_user_role() in ('owner', 'manager', 'admin'));
