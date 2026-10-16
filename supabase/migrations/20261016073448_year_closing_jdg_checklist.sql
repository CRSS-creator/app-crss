create table public.zamykanie_roku_jdg (
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2200),
  zadanie text not null check (zadanie in ('pit_roczny', 'skladka_zdrowotna')),
  zrobione boolean not null default false,
  primary key (klient_id, rok, zadanie)
);
alter table public.zamykanie_roku_jdg enable row level security;
grant select, insert, update on public.zamykanie_roku_jdg to authenticated;
create policy jdg_read on public.zamykanie_roku_jdg for select to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy jdg_insert on public.zamykanie_roku_jdg for insert to authenticated
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy jdg_update on public.zamykanie_roku_jdg for update to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'))
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
