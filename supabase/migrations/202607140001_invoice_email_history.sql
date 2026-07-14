create table if not exists public.faktury_email_history (
  id uuid primary key default gen_random_uuid(),
  faktura_id uuid not null references public.faktury(id) on delete cascade,
  created_at timestamptz not null default now(),
  recipient_email text not null,
  subject text not null,
  status text not null default 'wyslane' check (status in ('wyslane', 'blad')),
  error text,
  invoice_number text,
  wfirma_pdf_path text,
  wfirma_pdf_name text,
  sent_by uuid references public.profiles(id) on delete set null,
  sent_by_name text
);

create index if not exists faktury_email_history_faktura_id_idx
  on public.faktury_email_history(faktura_id, created_at desc);

create index if not exists faktury_email_history_created_at_idx
  on public.faktury_email_history(created_at desc);

alter table public.faktury_email_history enable row level security;

grant select, insert on public.faktury_email_history to authenticated;

drop policy if exists faktury_email_history_select_management on public.faktury_email_history;
create policy faktury_email_history_select_management
on public.faktury_email_history
for select
to authenticated
using (public.current_user_role() in ('owner', 'admin'));

drop policy if exists faktury_email_history_insert_management on public.faktury_email_history;
create policy faktury_email_history_insert_management
on public.faktury_email_history
for insert
to authenticated
with check (public.current_user_role() in ('owner', 'admin'));
