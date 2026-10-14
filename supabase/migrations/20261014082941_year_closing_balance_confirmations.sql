create table public.zamykanie_roku_salda (
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2200),
  zrobione boolean not null default false,
  primary key (klient_id, rok)
);
alter table public.zamykanie_roku_salda enable row level security;
grant select, insert, update on public.zamykanie_roku_salda to authenticated;
create policy salda_read on public.zamykanie_roku_salda for select to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy salda_insert on public.zamykanie_roku_salda for insert to authenticated
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy salda_update on public.zamykanie_roku_salda for update to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'))
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
