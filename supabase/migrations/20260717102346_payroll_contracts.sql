create table if not exists public.kadry_umowy (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid not null references public.klienci(id) on delete cascade,
  imie text not null,
  nazwisko text not null,
  typ_umowy text not null,
  numer_umowy text,
  data_poczatku date,
  data_konca date,
  badania_lekarskie_wazne_do date,
  szkolenie_bhp_wazne_do date,
  legitymacja_studencka_wazna_do date,
  constraint kadry_umowy_typ_umowy_check check (typ_umowy in ('umowa_o_prace', 'umowa_cywilnoprawna', 'student'))
);

create index if not exists kadry_umowy_klient_id_idx on public.kadry_umowy(klient_id);
create index if not exists kadry_umowy_typ_umowy_idx on public.kadry_umowy(typ_umowy);
create index if not exists kadry_umowy_nazwisko_idx on public.kadry_umowy(nazwisko, imie);

alter table public.kadry_umowy enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kadry_umowy'
      and policyname = 'kadry_umowy_authenticated_select'
  ) then
    create policy kadry_umowy_authenticated_select
      on public.kadry_umowy
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kadry_umowy'
      and policyname = 'kadry_umowy_authenticated_insert'
  ) then
    create policy kadry_umowy_authenticated_insert
      on public.kadry_umowy
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kadry_umowy'
      and policyname = 'kadry_umowy_authenticated_update'
  ) then
    create policy kadry_umowy_authenticated_update
      on public.kadry_umowy
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'kadry_umowy'
      and policyname = 'kadry_umowy_authenticated_delete'
  ) then
    create policy kadry_umowy_authenticated_delete
      on public.kadry_umowy
      for delete
      to authenticated
      using (true);
  end if;
end;
$$;

grant select, insert, update, delete on public.kadry_umowy to authenticated;

comment on table public.kadry_umowy is
  'Umowy kadrowe przypisane do klientów obsługiwanych kadrowo.';
