create table if not exists public.rodo_rejestr_zmian_przegladow (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  data_wpisu date,
  obszar text,
  rodzaj text,
  opis_skrocony text not null,
  osoba_odpowiedzialna text,
  status text not null default 'planowane',
  powod text,
  wynik text,
  nastepny_przeglad date,
  pelny_opis text,
  uwagi text,
  constraint rodo_rejestr_zmian_przegladow_status_check
    check (status in ('planowane', 'wykonane', 'wymaga_dzialania', 'anulowane'))
);

create index if not exists rodo_rejestr_zmian_przegladow_created_at_idx
  on public.rodo_rejestr_zmian_przegladow(created_at desc);
create index if not exists rodo_rejestr_zmian_przegladow_status_idx
  on public.rodo_rejestr_zmian_przegladow(status);

alter table public.rodo_rejestr_zmian_przegladow enable row level security;

drop policy if exists rodo_rejestr_zmian_przegladow_management_select on public.rodo_rejestr_zmian_przegladow;
create policy rodo_rejestr_zmian_przegladow_management_select
  on public.rodo_rejestr_zmian_przegladow
  for select
  to authenticated
  using (public.current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists rodo_rejestr_zmian_przegladow_management_insert on public.rodo_rejestr_zmian_przegladow;
create policy rodo_rejestr_zmian_przegladow_management_insert
  on public.rodo_rejestr_zmian_przegladow
  for insert
  to authenticated
  with check (public.current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists rodo_rejestr_zmian_przegladow_management_update on public.rodo_rejestr_zmian_przegladow;
create policy rodo_rejestr_zmian_przegladow_management_update
  on public.rodo_rejestr_zmian_przegladow
  for update
  to authenticated
  using (public.current_user_role() in ('owner', 'manager', 'admin'))
  with check (public.current_user_role() in ('owner', 'manager', 'admin'));

grant select, insert, update on public.rodo_rejestr_zmian_przegladow to authenticated;

create table if not exists public.rodo_rejestr_incydentow_naruszen (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  data_wykrycia date,
  typ text,
  opis_skrocony text not null,
  ryzyko text,
  zgloszenie_uodo text,
  status text not null default 'nowe',
  data_zdarzenia date,
  kategorie_danych text,
  liczba_osob text,
  skutki text,
  decyzja text,
  termin_72h timestamptz,
  data_zgloszenia timestamptz,
  osoby_zawiadomione text,
  dzialania_naprawcze text,
  osoba_prowadzaca text,
  uwagi text,
  constraint rodo_rejestr_incydentow_naruszen_status_check
    check (status in ('nowe', 'w_analizie', 'zgloszone', 'zamkniete')),
  constraint rodo_rejestr_incydentow_naruszen_ryzyko_check
    check (ryzyko is null or ryzyko in ('brak_ryzyka', 'ryzyko', 'wysokie_ryzyko'))
);

create index if not exists rodo_rejestr_incydentow_naruszen_created_at_idx
  on public.rodo_rejestr_incydentow_naruszen(created_at desc);
create index if not exists rodo_rejestr_incydentow_naruszen_status_idx
  on public.rodo_rejestr_incydentow_naruszen(status);

alter table public.rodo_rejestr_incydentow_naruszen enable row level security;

drop policy if exists rodo_rejestr_incydentow_naruszen_management_select on public.rodo_rejestr_incydentow_naruszen;
create policy rodo_rejestr_incydentow_naruszen_management_select
  on public.rodo_rejestr_incydentow_naruszen
  for select
  to authenticated
  using (public.current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists rodo_rejestr_incydentow_naruszen_management_insert on public.rodo_rejestr_incydentow_naruszen;
create policy rodo_rejestr_incydentow_naruszen_management_insert
  on public.rodo_rejestr_incydentow_naruszen
  for insert
  to authenticated
  with check (public.current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists rodo_rejestr_incydentow_naruszen_management_update on public.rodo_rejestr_incydentow_naruszen;
create policy rodo_rejestr_incydentow_naruszen_management_update
  on public.rodo_rejestr_incydentow_naruszen
  for update
  to authenticated
  using (public.current_user_role() in ('owner', 'manager', 'admin'))
  with check (public.current_user_role() in ('owner', 'manager', 'admin'));

grant select, insert, update on public.rodo_rejestr_incydentow_naruszen to authenticated;

create table if not exists public.rodo_rejestr_osob_upowaznionych (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  imie_nazwisko text not null,
  rola_stanowisko text,
  zakres_upowaznienia text,
  systemy_obszary text,
  data_nadania date,
  data_cofniecia date,
  status text not null default 'aktywne',
  nadajacy text,
  podstawa_nadania text,
  uwagi text,
  constraint rodo_rejestr_osob_upowaznionych_status_check
    check (status in ('aktywne', 'wygasle', 'cofniete'))
);

create index if not exists rodo_rejestr_osob_upowaznionych_created_at_idx
  on public.rodo_rejestr_osob_upowaznionych(created_at desc);
create index if not exists rodo_rejestr_osob_upowaznionych_status_idx
  on public.rodo_rejestr_osob_upowaznionych(status);

alter table public.rodo_rejestr_osob_upowaznionych enable row level security;

drop policy if exists rodo_rejestr_osob_upowaznionych_management_select on public.rodo_rejestr_osob_upowaznionych;
create policy rodo_rejestr_osob_upowaznionych_management_select
  on public.rodo_rejestr_osob_upowaznionych
  for select
  to authenticated
  using (public.current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists rodo_rejestr_osob_upowaznionych_management_insert on public.rodo_rejestr_osob_upowaznionych;
create policy rodo_rejestr_osob_upowaznionych_management_insert
  on public.rodo_rejestr_osob_upowaznionych
  for insert
  to authenticated
  with check (public.current_user_role() in ('owner', 'manager', 'admin'));

drop policy if exists rodo_rejestr_osob_upowaznionych_management_update on public.rodo_rejestr_osob_upowaznionych;
create policy rodo_rejestr_osob_upowaznionych_management_update
  on public.rodo_rejestr_osob_upowaznionych
  for update
  to authenticated
  using (public.current_user_role() in ('owner', 'manager', 'admin'))
  with check (public.current_user_role() in ('owner', 'manager', 'admin'));

grant select, insert, update on public.rodo_rejestr_osob_upowaznionych to authenticated;
