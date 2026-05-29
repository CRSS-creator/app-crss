create or replace function public.crm_default_sales_tasks_for_stage(p_stage text)
returns table(etap text, tytul text)
language sql
stable
as $$
  values
    ('nowy_lead', 'Uzupełnij źródło leada'),
    ('nowy_lead', 'Skontaktuj się z leadem do 30 minut'),
    ('kontakt_proba_kontaktu', 'Zadzwoń lub odpisz i zaproponuj termin rozmowy online'),
    ('kontakt_proba_kontaktu', 'Jeśli brak odpowiedzi, ustaw kolejne zadanie follow-up'),
    ('kontakt_proba_kontaktu', 'Zapisz wynik kontaktu'),
    ('rozmowa_online', 'Zapisz powód kontaktu'),
    ('rozmowa_online', 'Zbierz minimum danych do wyceny'),
    ('rozmowa_online', 'Zapisz, czy przygotowujemy propozycję'),
    ('propozycja_wspolpracy_wyslana', 'Zapisz datę wysłania propozycji'),
    ('propozycja_wspolpracy_wyslana', 'Ustaw follow-up D+2'),
    ('propozycja_wspolpracy_wyslana', 'Ustaw follow-up D+5'),
    ('decyzja', 'Zamknij szansę jako wygrana albo przegrana'),
    ('decyzja', 'Jeśli przegrana, zapisz powód')
$$;

create or replace function public.crm_insert_default_sales_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_zadania (crm_id, etap, tytul, status)
  select new.id, defaults.etap, defaults.tytul, 'do_zrobienia'
  from public.crm_default_sales_tasks_for_stage(coalesce(new.etap, 'nowy_lead')) as defaults
  where defaults.etap = coalesce(new.etap, 'nowy_lead')
    and not exists (
      select 1
      from public.crm_zadania existing
      where existing.crm_id = new.id
        and existing.etap = defaults.etap
        and existing.tytul = defaults.tytul
    );

  return new;
end;
$$;

drop trigger if exists crm_insert_default_sales_tasks_trigger on public.crm_szanse_sprzedazy;
create trigger crm_insert_default_sales_tasks_trigger
after insert on public.crm_szanse_sprzedazy
for each row
execute function public.crm_insert_default_sales_tasks();

insert into public.crm_zadania (crm_id, etap, tytul, status)
select lead.id, defaults.etap, defaults.tytul, 'do_zrobienia'
from public.crm_szanse_sprzedazy lead
join public.crm_default_sales_tasks_for_stage(coalesce(lead.etap, 'nowy_lead')) as defaults
  on defaults.etap = coalesce(lead.etap, 'nowy_lead')
where not exists (
  select 1
  from public.crm_zadania existing
  where existing.crm_id = lead.id
    and existing.etap = defaults.etap
    and existing.tytul = defaults.tytul
);
