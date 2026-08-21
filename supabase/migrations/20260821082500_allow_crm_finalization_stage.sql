alter table public.crm_szanse_sprzedazy
  drop constraint if exists crm_szanse_etap_check;

alter table public.crm_szanse_sprzedazy
  add constraint crm_szanse_etap_check
  check (
    etap = any (
      array[
        'nowy_lead'::text,
        'kontakt_proba_kontaktu'::text,
        'rozmowa_online'::text,
        'propozycja_wspolpracy_wyslana'::text,
        'decyzja'::text,
        'finalizacja_podpisanie_umowy'::text,
        'zamknieta'::text
      ]
    )
  );

alter table public.crm_zadania
  drop constraint if exists crm_zadania_etap_check;

alter table public.crm_zadania
  add constraint crm_zadania_etap_check
  check (
    etap = any (
      array[
        'nowy_lead'::text,
        'kontakt_proba_kontaktu'::text,
        'rozmowa_online'::text,
        'propozycja_wspolpracy_wyslana'::text,
        'decyzja'::text,
        'finalizacja_podpisanie_umowy'::text
      ]
    )
  );
