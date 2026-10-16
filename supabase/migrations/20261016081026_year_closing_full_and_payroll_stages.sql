create table public.zamykanie_roku_full (
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rok integer not null check (rok between 2000 and 2200),
  zadanie text not null check (zadanie in ('cit_sporzadzony', 'cit_us', 'cit_klient', 'sf_sporzadzone', 'sf_wyslane', 'sf_uchwala', 'przeksiegowania_wf', 'przeniesienie_bo')),
  zrobione boolean not null default false,
  primary key (klient_id, rok, zadanie)
);
alter table public.zamykanie_roku_full enable row level security;
grant select, insert, update on public.zamykanie_roku_full to authenticated;
create policy full_read on public.zamykanie_roku_full for select to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy full_insert on public.zamykanie_roku_full for insert to authenticated
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));
create policy full_update on public.zamykanie_roku_full for update to authenticated
  using (public.get_current_user_role() in ('owner', 'admin', 'manager'))
  with check (public.get_current_user_role() in ('owner', 'admin', 'manager'));

alter table public.zamykanie_roku_kadry
  drop constraint zamykanie_roku_kadry_zadanie_check,
  add constraint zamykanie_roku_kadry_zadanie_check check (zadanie in (
    'pit11_sporzadzone', 'pit11_us', 'pit11_klient', 'pit4r', 'pit4r_klient', 'zus_roczna', 'zus_roczna_klient'
  ));
