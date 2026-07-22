create table if not exists public.aml_formularze_wstepne (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  aml_rejestr_id uuid references public.aml_rejestr_klientow(id) on delete set null,
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

create index if not exists aml_formularze_wstepne_klient_created_idx
  on public.aml_formularze_wstepne(klient_id, created_at desc);

create index if not exists aml_formularze_wstepne_status_idx
  on public.aml_formularze_wstepne(status);

drop trigger if exists trg_aml_formularze_wstepne_updated_at on public.aml_formularze_wstepne;
create trigger trg_aml_formularze_wstepne_updated_at
  before update on public.aml_formularze_wstepne
  for each row
  execute function public.touch_updated_at();

alter table public.aml_formularze_wstepne enable row level security;

drop policy if exists aml_formularze_wstepne_select_app_users on public.aml_formularze_wstepne;
create policy aml_formularze_wstepne_select_app_users
on public.aml_formularze_wstepne
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_formularze_wstepne_insert_app_users on public.aml_formularze_wstepne;
create policy aml_formularze_wstepne_insert_app_users
on public.aml_formularze_wstepne
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_formularze_wstepne_update_app_users on public.aml_formularze_wstepne;
create policy aml_formularze_wstepne_update_app_users
on public.aml_formularze_wstepne
for update
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin'))
with check (public.get_current_user_role() in ('owner', 'manager', 'admin'));

grant select, insert, update on public.aml_formularze_wstepne to authenticated;
