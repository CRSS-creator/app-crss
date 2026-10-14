create table public.zamykanie_roku_ift2r (
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2200),
  rodzaj text not null check (rodzaj in ('jdg', 'full')),
  status text not null check (status in ('wyslane', 'do_wyslania', 'brak_wysylki')),
  primary key (klient_id, rok, rodzaj)
);
alter table public.zamykanie_roku_ift2r enable row level security;
grant select, insert, update on public.zamykanie_roku_ift2r to authenticated;
create policy ift2r_read on public.zamykanie_roku_ift2r for select to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy ift2r_insert on public.zamykanie_roku_ift2r for insert to authenticated
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy ift2r_update on public.zamykanie_roku_ift2r for update to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'))
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
