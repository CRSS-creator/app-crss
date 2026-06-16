insert into public.zadania_cykliczne (
  tytul,
  opis,
  formy_prawne,
  formy_opodatkowania,
  wymaga_czynnego_vat,
  czestotliwosc,
  miesiac_roczny,
  dzien_miesiaca,
  priorytet,
  osoba_id,
  aktywne
)
select *
from (
  values
    (
      'Przyjęcie i weryfikacja dokumentów',
      'Sprawdzenie, czy klient przekazał komplet dokumentów za okres rozliczeniowy.',
      null::text[],
      null::text[],
      null::boolean,
      'miesieczne',
      null::integer,
      5,
      'normalny',
      null::uuid,
      true
    ),
    (
      'Księgowanie dokumentów',
      'Księgowanie dokumentów oraz bieżąca weryfikacja zapisów księgowych.',
      null::text[],
      null::text[],
      null::boolean,
      'miesieczne',
      null::integer,
      15,
      'normalny',
      null::uuid,
      true
    ),
    (
      'Weryfikacja podatków i wysyłka informacji do klienta',
      'Sprawdzenie podatków do zapłaty i przekazanie informacji klientowi.',
      null::text[],
      null::text[],
      null::boolean,
      'miesieczne',
      null::integer,
      20,
      'wysoki',
      null::uuid,
      true
    ),
    (
      'Przygotowanie JPK VAT',
      'Przygotowanie i weryfikacja pliku JPK VAT dla czynnych podatników VAT.',
      null::text[],
      null::text[],
      true::boolean,
      'miesieczne',
      null::integer,
      22,
      'wysoki',
      null::uuid,
      true
    ),
    (
      'Zamknięcie roku i przygotowanie CIT-8',
      'Roczne zamknięcie podatkowe dla podmiotów rozliczających CIT.',
      array['spółka z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[],
      array['CIT']::text[],
      null::boolean,
      'roczne',
      3,
      31,
      'wysoki',
      null::uuid,
      true
    ),
    (
      'Przygotowanie rozliczenia rocznego właściciela',
      'Roczne podsumowanie i przygotowanie danych do rozliczenia właściciela JDG.',
      array['JDG']::text[],
      array['Skala podatkowa', 'Podatek liniowy', 'Ryczałt']::text[],
      null::boolean,
      'roczne',
      4,
      30,
      'wysoki',
      null::uuid,
      true
    )
) as defaults(
  tytul,
  opis,
  formy_prawne,
  formy_opodatkowania,
  wymaga_czynnego_vat,
  czestotliwosc,
  miesiac_roczny,
  dzien_miesiaca,
  priorytet,
  osoba_id,
  aktywne
)
where not exists (
  select 1
  from public.zadania_cykliczne existing
  where existing.tytul = defaults.tytul
    and coalesce(existing.czestotliwosc, 'miesieczne') = defaults.czestotliwosc
);
