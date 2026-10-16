alter table public.zamykanie_roku_jdg
  drop constraint zamykanie_roku_jdg_zadanie_check,
  add constraint zamykanie_roku_jdg_zadanie_check
    check (zadanie in ('pit_roczny', 'pit_us', 'pit_klient', 'skladka_zdrowotna'));

alter table public.zamykanie_roku_ift2r
  add column sporzadzony boolean not null default false,
  add column wyslany_us boolean not null default false,
  add column wyslany_klient boolean not null default false;
