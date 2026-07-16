create table if not exists public.aml_rejestr_klientow (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  status text not null default 'do_weryfikacji',
  poziom_ryzyka text,
  pep_status text,
  sankcje_status text,
  ostatnia_weryfikacja_at timestamptz,
  ostatnia_weryfikacja_by uuid references public.profiles(id),
  ostatnia_weryfikacja_id uuid,
  nastepna_weryfikacja_at date,
  uwagi text,
  unique (klient_id)
);

create index if not exists aml_rejestr_klientow_klient_idx on public.aml_rejestr_klientow(klient_id);
create index if not exists aml_rejestr_klientow_status_idx on public.aml_rejestr_klientow(status);
create index if not exists aml_rejestr_klientow_nastepna_weryfikacja_idx on public.aml_rejestr_klientow(nastepna_weryfikacja_at);

create table if not exists public.aml_weryfikacje (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  aml_rejestr_id uuid references public.aml_rejestr_klientow(id) on delete set null,
  wykonana_by uuid references public.profiles(id),
  status text not null default 'wykonana',
  wynik text not null default 'do_analizy',
  zrodla jsonb not null default '[]'::jsonb,
  dane jsonb not null default '{}'::jsonb,
  vat_status text,
  vies_status text,
  krs_status text,
  pep_status text,
  sankcje_status text,
  numer_krs text,
  numer_regon text,
  identyfikator_zapytania text,
  pdf_path text,
  pdf_name text
);

create index if not exists aml_weryfikacje_klient_idx on public.aml_weryfikacje(klient_id, created_at desc);
create index if not exists aml_weryfikacje_rejestr_idx on public.aml_weryfikacje(aml_rejestr_id, created_at desc);

create table if not exists public.aml_historia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  aml_rejestr_id uuid references public.aml_rejestr_klientow(id) on delete cascade,
  aml_weryfikacja_id uuid references public.aml_weryfikacje(id) on delete set null,
  akcja text not null,
  opis text not null,
  zmiany jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id)
);

create index if not exists aml_historia_klient_idx on public.aml_historia(klient_id, created_at desc);
create index if not exists aml_historia_rejestr_idx on public.aml_historia(aml_rejestr_id, created_at desc);

alter table public.aml_rejestr_klientow enable row level security;
alter table public.aml_weryfikacje enable row level security;
alter table public.aml_historia enable row level security;

drop policy if exists aml_rejestr_select_app_users on public.aml_rejestr_klientow;
create policy aml_rejestr_select_app_users
on public.aml_rejestr_klientow
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_rejestr_insert_app_users on public.aml_rejestr_klientow;
create policy aml_rejestr_insert_app_users
on public.aml_rejestr_klientow
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_rejestr_update_app_users on public.aml_rejestr_klientow;
create policy aml_rejestr_update_app_users
on public.aml_rejestr_klientow
for update
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin'))
with check (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_weryfikacje_select_app_users on public.aml_weryfikacje;
create policy aml_weryfikacje_select_app_users
on public.aml_weryfikacje
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_weryfikacje_insert_app_users on public.aml_weryfikacje;
create policy aml_weryfikacje_insert_app_users
on public.aml_weryfikacje
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_weryfikacje_update_app_users on public.aml_weryfikacje;
create policy aml_weryfikacje_update_app_users
on public.aml_weryfikacje
for update
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin'))
with check (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_historia_select_app_users on public.aml_historia;
create policy aml_historia_select_app_users
on public.aml_historia
for select
to authenticated
using (public.get_current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists aml_historia_insert_app_users on public.aml_historia;
create policy aml_historia_insert_app_users
on public.aml_historia
for insert
to authenticated
with check (public.get_current_user_role() in ('owner', 'manager', 'admin'));

insert into public.aml_rejestr_klientow (klient_id, status)
select client.id, 'do_weryfikacji'
from public.klienci client
where lower(coalesce(client.status_klienta, '')) = 'onboarding'
  and not exists (
    select 1
    from public.aml_rejestr_klientow aml
    where aml.klient_id = client.id
  );

create or replace function public.ensure_aml_register_for_onboarding_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.status_klienta, '')) = 'onboarding' then
    insert into public.aml_rejestr_klientow (klient_id, status)
    values (new.id, 'do_weryfikacji')
    on conflict (klient_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_aml_register_for_onboarding_client_trigger on public.klienci;
create trigger ensure_aml_register_for_onboarding_client_trigger
after insert or update of status_klienta on public.klienci
for each row
execute function public.ensure_aml_register_for_onboarding_client();

grant select, insert, update on public.aml_rejestr_klientow to authenticated;
grant select, insert, update on public.aml_weryfikacje to authenticated;
grant select, insert on public.aml_historia to authenticated;
