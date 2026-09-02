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

create or replace function public.crm_default_sales_tasks_for_stage(p_stage text)
returns table(etap text, tytul text)
language sql
stable
as $$
  values
    ('nowy_lead', 'Zapisz firmę i osobę kontaktową w CRM'),
    ('nowy_lead', 'Uzupełnij źródło leada'),
    ('nowy_lead', 'Kontakt do 30 minut w celu umówienia rozmowy z datą na dziś'),
    ('rozmowa_online', 'Zapisz powód kontaktu, dlaczego teraz / co nie działa u obecnego biura'),
    ('rozmowa_online', 'Zbierz minimum danych do wyceny'),
    ('rozmowa_online', 'Ustal kolejny krok i termin albo zamknij jako przegrana z powodem'),
    ('propozycja_wspolpracy_wyslana', 'Zapisz datę wysłania propozycji i zakres co obejmuje'),
    ('propozycja_wspolpracy_wyslana', 'Zadzwoń do klienta jak wyślesz ofertę'),
    ('decyzja', 'Zadzwoń/napisz i domknij oraz przejdź do finalizacji'),
    ('decyzja', 'Jeśli przegrana, zapisz powód'),
    ('finalizacja_podpisanie_umowy', 'Wyślij umowę'),
    ('finalizacja_podpisanie_umowy', 'Jeśli wygrana ok, jeśli przegrana zapisz powód')
$$;
