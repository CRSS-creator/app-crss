alter table public.zadania_cykliczne
  add column if not exists kod_systemowy text,
  add column if not exists wymaga_obslugi_kadrowej boolean;

create unique index if not exists zadania_cykliczne_kod_systemowy_unique
  on public.zadania_cykliczne(kod_systemowy)
  where kod_systemowy is not null;

comment on column public.zadania_cykliczne.kod_systemowy is
  'Techniczny kod domyślnego szablonu CRSS. Służy do bezpiecznej aktualizacji szablonów bez duplikatów.';

comment on column public.zadania_cykliczne.wymaga_obslugi_kadrowej is
  'Warunek kadrowy dla szablonu: true = tylko klienci z obsługą kadrową, false = tylko bez kadr, null = dowolnie.';

update public.zadania_cykliczne
set aktywne = false
where klient_id is null
  and kod_systemowy is null
  and tytul in (
    'Przyjęcie i weryfikacja dokumentów',
    'Księgowanie dokumentów',
    'Weryfikacja podatków i wysyłka informacji do klienta',
    'Przygotowanie JPK VAT',
    'Zamknięcie roku i przygotowanie CIT-8',
    'Przygotowanie rozliczenia rocznego właściciela'
  );

insert into public.zadania_cykliczne (
  kod_systemowy,
  tytul,
  opis,
  formy_prawne,
  formy_opodatkowania,
  wymaga_czynnego_vat,
  wymaga_vat_ue,
  wymaga_obslugi_kadrowej,
  czestotliwosc,
  miesiac_roczny,
  dzien_miesiaca,
  priorytet,
  osoba_id,
  aktywne
)
values
  ('crss_m_entity_documents_collect', 'Odebranie kompletu dokumentów', null, array['sp. z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[], null, null, null, null, 'miesieczne', null, 7, 'normalny', null, true),
  ('crss_m_entity_bank_statement', 'Księgowanie wyciągu bankowego', null, array['sp. z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[], null, null, null, null, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_entity_documents_count', 'Wpisanie liczby dokumentów', null, array['sp. z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[], null, null, null, null, 'miesieczne', null, 20, 'normalny', null, true),
  ('crss_m_entity_account_balances', 'Sprawdzenie sald kont księgowych', null, array['sp. z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[], null, null, null, null, 'miesieczne', null, 30, 'normalny', null, true),
  ('crss_m_entity_unsettled_receivables', 'Informacja o nierozliczonych rozrachunkach', null, array['sp. z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[], null, null, null, null, 'miesieczne', null, 30, 'normalny', null, true),

  ('crss_m_jdg_documents_collect', 'Odebranie kompletu dokumentów', null, array['JDG']::text[], null, null, null, null, 'miesieczne', null, 7, 'normalny', null, true),
  ('crss_m_jdg_documents_count', 'Wpisanie liczby dokumentów', null, array['JDG']::text[], null, null, null, null, 'miesieczne', null, 20, 'normalny', null, true),

  ('crss_m_pit_income_tax_info', 'Informacja o wysokości zaliczki na podatek dochodowy', null, null, array['Skala podatkowa', 'Podatek liniowy', 'Ryczałt']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_pit_owner_zus_declaration', 'Deklaracja ZUS DRA przedsiębiorcy', null, null, array['Skala podatkowa', 'Podatek liniowy', 'Ryczałt']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_pit_owner_zus_info', 'Informacja o wysokości składek ZUS do zapłaty', null, null, array['Skala podatkowa', 'Podatek liniowy', 'Ryczałt']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_pit_cost_documents', 'Księgowanie dokumentów kosztowych', null, null, array['Skala podatkowa', 'Podatek liniowy', 'Ryczałt']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_pit_revenue_documents', 'Księgowanie dokumentów przychodowych', null, null, array['Skala podatkowa', 'Podatek liniowy', 'Ryczałt']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),

  ('crss_m_cit_advance_info', 'Informacja o wysokości zaliczki CIT', null, null, array['CIT']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_cit_cost_documents', 'Księgowanie dokumentów kosztowych', null, null, array['CIT']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_cit_revenue_documents', 'Księgowanie dokumentów przychodowych', null, null, array['CIT']::text[], null, null, null, 'miesieczne', null, 18, 'normalny', null, true),

  ('crss_m_vat_jpk_v7', 'Sporządzenie JPK_V7', null, null, null, true, null, null, 'miesieczne', null, 23, 'normalny', null, true),
  ('crss_m_vat_payment_info', 'Informacja o wysokości VAT do zapłaty', null, null, null, true, null, null, 'miesieczne', null, 23, 'normalny', null, true),
  ('crss_m_vat_ue_declaration', 'Deklaracja VAT-UE', null, null, null, null, true, null, 'miesieczne', null, 25, 'normalny', null, true),
  ('crss_m_vat9m_declaration', 'Deklaracja VAT-9M', 'Tylko dla klientów: czynny VAT = nie oraz VAT-UE = tak.', null, null, false, true, null, 'miesieczne', null, 23, 'normalny', null, true),
  ('crss_m_vat9m_payment_info', 'Informacja o wysokości VAT-9M do zapłaty', 'Tylko dla klientów: czynny VAT = nie oraz VAT-UE = tak.', null, null, false, true, null, 'miesieczne', null, 23, 'normalny', null, true),

  ('crss_m_payroll_payroll_list', 'Sporządzenie listy płac', null, null, null, null, null, true, 'miesieczne', null, 13, 'normalny', null, true),
  ('crss_m_payroll_zus_dra_non_jdg', 'Deklaracja ZUS DRA', 'Nie dotyczy JDG.', array['sp. z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[], null, null, null, true, 'miesieczne', null, 13, 'normalny', null, true),
  ('crss_m_payroll_zus_payment_non_jdg', 'Informacja o wysokości składek ZUS do zapłaty', 'Nie dotyczy JDG.', array['sp. z o.o.', 'prosta spółka akcyjna', 'organizacja']::text[], null, null, null, true, 'miesieczne', null, 13, 'normalny', null, true),
  ('crss_m_payroll_pit4_info', 'Informacja o wysokości zaliczki na PIT-4', null, null, null, null, null, true, 'miesieczne', null, 18, 'normalny', null, true),
  ('crss_m_payroll_employees_count', 'Wpisanie liczby zatrudnionych', null, null, null, null, null, true, 'miesieczne', null, 20, 'normalny', null, true),
  ('crss_m_payroll_booking', 'Księgowanie list płac', null, null, null, null, null, true, 'miesieczne', null, 20, 'normalny', null, true)
on conflict (kod_systemowy) where kod_systemowy is not null do update
set
  tytul = excluded.tytul,
  opis = excluded.opis,
  formy_prawne = excluded.formy_prawne,
  formy_opodatkowania = excluded.formy_opodatkowania,
  wymaga_czynnego_vat = excluded.wymaga_czynnego_vat,
  wymaga_vat_ue = excluded.wymaga_vat_ue,
  wymaga_obslugi_kadrowej = excluded.wymaga_obslugi_kadrowej,
  czestotliwosc = excluded.czestotliwosc,
  miesiac_roczny = excluded.miesiac_roczny,
  dzien_miesiaca = excluded.dzien_miesiaca,
  priorytet = excluded.priorytet,
  aktywne = excluded.aktywne,
  updated_at = now();

drop function if exists public.ensure_recurring_task_realizations(date);

create or replace function public.ensure_recurring_task_realizations(public_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.zadania_cykliczne_realizacje (
    zadanie_cykliczne_id,
    klient_id,
    rozliczenie_id,
    okres,
    termin,
    tytul,
    opis,
    priorytet,
    osoba_id
  )
  select
    z.id,
    k.id,
    r.id,
    public_period,
    public.recurring_task_due_date(public_period, z.dzien_miesiaca, case when z.czestotliwosc = 'roczne' then z.miesiac_roczny else null end),
    z.tytul,
    z.opis,
    z.priorytet,
    coalesce(z.osoba_id, k.opiekun_id)
  from public.zadania_cykliczne z
  join public.klienci k on k.aktywny = true
  left join public.rozliczenia_miesieczne r on r.klient_id = k.id and r.okres = public_period
  where z.aktywne = true
    and (k.pierwszy_okres_rozliczeniowy is null or date_trunc('month', k.pierwszy_okres_rozliczeniowy)::date <= public_period)
    and (k.ostatni_okres_rozliczeniowy is null or date_trunc('month', k.ostatni_okres_rozliczeniowy)::date >= public_period)
    and (z.klient_id is null or z.klient_id = k.id)
    and (z.klient_id is not null or z.formy_prawne is null or cardinality(z.formy_prawne) = 0 or k.forma_prawna = any(z.formy_prawne))
    and (z.klient_id is not null or z.formy_opodatkowania is null or cardinality(z.formy_opodatkowania) = 0 or k.forma_opodatkowania = any(z.formy_opodatkowania))
    and (z.klient_id is not null or z.wymaga_czynnego_vat is null or k.czynny_vat = z.wymaga_czynnego_vat)
    and (z.klient_id is not null or z.wymaga_vat_ue is null or k.vat_ue = z.wymaga_vat_ue)
    and (z.klient_id is not null or z.wymaga_obslugi_kadrowej is null or k.obsluga_kadrowa = z.wymaga_obslugi_kadrowej)
    and (coalesce(z.czestotliwosc, 'miesieczne') = 'miesieczne' or z.miesiac_roczny = extract(month from public_period)::integer)
  on conflict (zadanie_cykliczne_id, klient_id, okres) do nothing;
end;
$$;

drop function if exists public.ensure_monthly_settlements(date);

create or replace function public.ensure_monthly_settlements(public_period date default date_trunc('month', current_date)::date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rozliczenia_miesieczne (
    klient_id,
    okres,
    status_ksiegowosci,
    liczba_dokumentow,
    liczba_pracownikow,
    liczba_zleceniobiorcow,
    faktura_wystawiona
  )
  select
    k.id,
    public_period,
    'czeka_na_dokumenty',
    0,
    0,
    0,
    false
  from public.klienci k
  where k.aktywny = true
    and (k.pierwszy_okres_rozliczeniowy is null or date_trunc('month', k.pierwszy_okres_rozliczeniowy)::date <= public_period)
    and (k.ostatni_okres_rozliczeniowy is null or date_trunc('month', k.ostatni_okres_rozliczeniowy)::date >= public_period)
    and not exists (
      select 1 from public.rozliczenia_miesieczne r
      where r.klient_id = k.id and r.okres = public_period
    );

  perform public.ensure_recurring_task_realizations(public_period);
end;
$$;

grant execute on function public.ensure_recurring_task_realizations(date) to authenticated;
grant execute on function public.ensure_monthly_settlements(date) to authenticated;
