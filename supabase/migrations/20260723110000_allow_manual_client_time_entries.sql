alter table public.czas_pracy
drop constraint if exists czas_pracy_zrodlo_check;

alter table public.czas_pracy
add constraint czas_pracy_zrodlo_check check (
  zadanie_id is not null
  or zadanie_cykliczne_id is not null
  or (czy_wewnetrzne = true and klient_id is null)
  or (czy_wewnetrzne = false and klient_id is not null)
);
