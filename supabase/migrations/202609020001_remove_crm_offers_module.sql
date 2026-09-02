drop function if exists public.accept_crm_offer(uuid, text);
drop function if exists public.record_crm_offer_decision(uuid, text, text);
drop function if exists public.record_crm_offer_decision(uuid, text, text, text);
drop function if exists public.reset_crm_offer_after_pdf_removal(uuid);
drop function if exists public.schedule_crm_offer_followup(uuid);

update public.crm_szanse_sprzedazy
set
  etap = 'decyzja',
  updated_at = now()
where etap = 'propozycja_wspolpracy_wyslana';

update public.crm_zadania
set
  etap = 'decyzja',
  updated_at = now()
where etap = 'propozycja_wspolpracy_wyslana';

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
    ('decyzja', 'Zadzwoń/napisz i domknij oraz przejdź do finalizacji'),
    ('decyzja', 'Jeśli przegrana, zapisz powód'),
    ('finalizacja_podpisanie_umowy', 'Wyślij umowę'),
    ('finalizacja_podpisanie_umowy', 'Jeśli wygrana ok, jeśli przegrana zapisz powód')
$$;

create or replace function public.delete_crm_lead(public_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  can_delete boolean;
begin
  select public.current_user_role() in ('owner', 'admin', 'manager')
    or public.get_current_user_role() in ('owner', 'admin', 'manager')
  into can_delete;

  if not coalesce(can_delete, false) then
    raise exception 'Access denied';
  end if;

  delete from public.powiadomienia
  where (related_table = 'crm_szanse_sprzedazy' and related_id = public_lead_id)
     or (metadata->>'lead_id') = public_lead_id::text
     or (metadata->>'crm_id') = public_lead_id::text;

  delete from public.crm_szanse_sprzedazy
  where id = public_lead_id;
end;
$$;

grant execute on function public.delete_crm_lead(uuid) to authenticated;

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
        'decyzja'::text,
        'finalizacja_podpisanie_umowy'::text
      ]
    )
  );

drop table if exists public.crm_oferta_events cascade;
drop table if exists public.crm_oferty cascade;

alter table public.crm_szanse_sprzedazy
  drop column if exists data_wyslania_oferty;
