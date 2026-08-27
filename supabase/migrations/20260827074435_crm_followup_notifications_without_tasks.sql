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
    ('decyzja', 'Zadzwoń/napisz i domknij oraz przejdź do finalizacji'),
    ('decyzja', 'Jeśli przegrana, zapisz powód'),
    ('finalizacja_podpisanie_umowy', 'Wyślij umowę'),
    ('finalizacja_podpisanie_umowy', 'Jeśli wygrana ok, jeśli przegrana zapisz powód')
$$;

create or replace function public.schedule_crm_offer_followup(public_offer_id uuid)
returns public.crm_zadania
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_offer public.crm_oferty;
  followup_date date := public.crm_add_business_days(current_date, 2);
begin
  select *
  into selected_offer
  from public.crm_oferty
  where id = public_offer_id;

  if selected_offer.id is null then
    raise exception 'Offer not found';
  end if;

  if not (
    public.current_user_role() in ('owner', 'admin', 'manager')
    or public.get_current_user_role() in ('owner', 'admin', 'manager')
    or selected_offer.created_by = auth.uid()
  ) then
    raise exception 'Access denied';
  end if;

  update public.crm_szanse_sprzedazy
  set
    data_wyslania_oferty = coalesce(data_wyslania_oferty, now()),
    data_follow_up = followup_date::timestamptz,
    etap = 'propozycja_wspolpracy_wyslana',
    updated_at = now()
  where id = selected_offer.crm_id;

  return null;
end;
$$;
