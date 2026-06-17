create table if not exists public.rodo_umowy_powierzenia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid references public.klienci(id) on delete set null,
  umowa_ksiegowa_id uuid references public.crm_umowy(id) on delete set null,
  status text not null default 'szkic',
  numer_umowy text,
  nazwa_klienta text not null,
  siedziba text,
  nip text,
  reprezentant text,
  email_klienta text,
  zakres_powierzenia text,
  uwagi text,
  wygenerowany_pdf_path text,
  wygenerowany_pdf_name text,
  podpisany_pdf_path text,
  podpisany_pdf_name text,
  podpisana_at timestamptz,
  constraint rodo_umowy_powierzenia_status_check check (status in ('szkic', 'wygenerowana', 'wyslana_do_podpisu', 'podpisana', 'anulowana'))
);

create index if not exists rodo_umowy_powierzenia_klient_id_idx on public.rodo_umowy_powierzenia(klient_id);
create index if not exists rodo_umowy_powierzenia_umowa_ksiegowa_id_idx on public.rodo_umowy_powierzenia(umowa_ksiegowa_id);
create index if not exists rodo_umowy_powierzenia_status_idx on public.rodo_umowy_powierzenia(status);

alter table public.rodo_umowy_powierzenia enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rodo_umowy_powierzenia'
      and policyname = 'rodo_umowy_powierzenia_authenticated_select'
  ) then
    create policy rodo_umowy_powierzenia_authenticated_select
      on public.rodo_umowy_powierzenia
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rodo_umowy_powierzenia'
      and policyname = 'rodo_umowy_powierzenia_authenticated_insert'
  ) then
    create policy rodo_umowy_powierzenia_authenticated_insert
      on public.rodo_umowy_powierzenia
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rodo_umowy_powierzenia'
      and policyname = 'rodo_umowy_powierzenia_authenticated_update'
  ) then
    create policy rodo_umowy_powierzenia_authenticated_update
      on public.rodo_umowy_powierzenia
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'rodo_umowy_powierzenia'
      and policyname = 'rodo_umowy_powierzenia_authenticated_delete'
  ) then
    create policy rodo_umowy_powierzenia_authenticated_delete
      on public.rodo_umowy_powierzenia
      for delete
      to authenticated
      using (true);
  end if;
end $$;

grant select, insert, update, delete on public.rodo_umowy_powierzenia to authenticated;
