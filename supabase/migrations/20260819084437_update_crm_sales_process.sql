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
    ('rozmowa_online', 'Zapisz czy robimy ofertę'),
    ('rozmowa_online', 'Ustal kolejny krok i termin albo zamknij jako przegrana z powodem'),
    ('propozycja_wspolpracy_wyslana', 'Zapisz datę wysłania propozycji i zakres co obejmuje'),
    ('propozycja_wspolpracy_wyslana', 'Zadzwoń do klienta jak wyślesz ofertę'),
    ('propozycja_wspolpracy_wyslana', 'Ustaw zadanie follow-up na D+2'),
    ('propozycja_wspolpracy_wyslana', 'Ustaw drugi follow-up na D+5 opcjonalnie jeśli brak odpowiedzi po pierwszym'),
    ('decyzja', 'Zadzwoń/napisz i domknij oraz przejdź do finalizacji'),
    ('decyzja', 'Jeśli przegrana, zapisz powód'),
    ('finalizacja_podpisanie_umowy', 'Wyślij umowę'),
    ('finalizacja_podpisanie_umowy', 'Jeśli wygrana ok, jeśli przegrana zapisz powód')
$$;

update public.crm_szanse_sprzedazy
set
  etap = 'nowy_lead',
  updated_at = now()
where etap = 'kontakt_proba_kontaktu';

delete from public.crm_zadania task
using public.crm_szanse_sprzedazy lead,
  (
    values
      ('nowy_lead', 'Skontaktuj się z leadem do 30 minut'),
      ('kontakt_proba_kontaktu', 'Zadzwoń lub odpisz i zaproponuj termin rozmowy online'),
      ('kontakt_proba_kontaktu', 'Jeśli brak odpowiedzi, ustaw kolejne zadanie follow-up'),
      ('kontakt_proba_kontaktu', 'Zapisz wynik kontaktu'),
      ('rozmowa_online', 'Zapisz powód kontaktu'),
      ('propozycja_wspolpracy_wyslana', 'Zapisz datę wysłania propozycji'),
      ('propozycja_wspolpracy_wyslana', 'Ustaw follow-up D+2'),
      ('propozycja_wspolpracy_wyslana', 'Ustaw follow-up D+5'),
      ('decyzja', 'Zamknij szansę jako wygrana albo przegrana')
  ) as old_defaults(etap, tytul)
where task.crm_id = lead.id
  and coalesce(lead.status, 'otwarta') = 'otwarta'
  and task.status <> 'zrobione'
  and task.etap = old_defaults.etap
  and task.tytul = old_defaults.tytul
  and not exists (
    select 1
    from public.crm_default_sales_tasks_for_stage(coalesce(lead.etap, 'nowy_lead')) as new_defaults
    where new_defaults.etap = task.etap
      and new_defaults.tytul = task.tytul
  );

insert into public.crm_zadania (crm_id, etap, tytul, status)
select lead.id, defaults.etap, defaults.tytul, 'do_zrobienia'
from public.crm_szanse_sprzedazy lead
join public.crm_default_sales_tasks_for_stage(coalesce(lead.etap, 'nowy_lead')) as defaults
  on defaults.etap = coalesce(lead.etap, 'nowy_lead')
where coalesce(lead.status, 'otwarta') = 'otwarta'
  and not exists (
    select 1
    from public.crm_zadania existing
    where existing.crm_id = lead.id
      and existing.etap = defaults.etap
      and existing.tytul = defaults.tytul
  );

drop policy if exists "owner can delete crm tasks" on public.crm_zadania;
create policy "owner can delete crm tasks"
on public.crm_zadania
for delete
to authenticated
using (
  public.current_user_role() in ('owner', 'admin', 'manager', 'handlowiec')
  or public.get_current_user_role() in ('owner', 'admin', 'manager', 'handlowiec')
);
