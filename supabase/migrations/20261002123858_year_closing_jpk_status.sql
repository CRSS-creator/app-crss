create table public.zamykanie_roku_jpk (
 klient_id uuid not null references public.klienci(id) on delete cascade,
 rok integer not null check (rok between 2000 and 2200),
 rodzaj text not null check (rodzaj in ('jdg','full')),
 status text not null check (status in ('do_wyslania','wyslane','brak_wysylki','potrzebne_dane')),
 primary key(klient_id,rok,rodzaj)
);
alter table public.zamykanie_roku_jpk enable row level security;
grant select,insert,update on public.zamykanie_roku_jpk to authenticated;
create policy jpk_read on public.zamykanie_roku_jpk for select to authenticated
 using (public.get_current_user_role() in ('owner','admin','manager'));
create policy jpk_insert on public.zamykanie_roku_jpk for insert to authenticated
 with check (public.get_current_user_role() in ('owner','admin','manager'));
create policy jpk_update on public.zamykanie_roku_jpk for update to authenticated
 using (public.get_current_user_role() in ('owner','admin','manager'))
 with check (public.get_current_user_role() in ('owner','admin','manager'));
