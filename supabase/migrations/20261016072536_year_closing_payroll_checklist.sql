create table public.zamykanie_roku_kadry (
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2200),
  zadanie text not null check (zadanie in ('pit11_us', 'pit11_klient', 'pit4r', 'zus_roczna')),
  zrobione boolean not null default false,
  primary key (klient_id, rok, zadanie)
);
alter table public.zamykanie_roku_kadry enable row level security;
grant select, insert, update on public.zamykanie_roku_kadry to authenticated;
create policy kadry_read on public.zamykanie_roku_kadry for select to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy kadry_insert on public.zamykanie_roku_kadry for insert to authenticated
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy kadry_update on public.zamykanie_roku_kadry for update to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'))
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
