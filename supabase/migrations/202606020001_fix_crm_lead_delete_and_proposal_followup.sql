create or replace function public.crm_add_business_days(start_date date, business_days integer)
returns date
language plpgsql
immutable
as $$
declare
  result_date date := start_date;
  added_days integer := 0;
begin
  if business_days <= 0 then
    return start_date;
  end if;

  while added_days < business_days loop
    result_date := result_date + 1;
    if extract(isodow from result_date) between 1 and 5 then
      added_days := added_days + 1;
    end if;
  end loop;

  return result_date;
end;
$$;

create or replace function public.delete_crm_lead(public_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  can_delete boolean;
  offer_ids uuid[];
begin
  select public.current_user_role() in ('owner', 'admin', 'manager')
    or public.get_current_user_role() in ('owner', 'admin', 'manager')
  into can_delete;

  if not coalesce(can_delete, false) then
    raise exception 'Access denied';
  end if;

  select coalesce(array_agg(id), '{}'::uuid[])
  into offer_ids
  from public.crm_oferty
  where crm_id = public_lead_id;

  delete from public.powiadomienia
  where (related_table = 'crm_szanse_sprzedazy' and related_id = public_lead_id)
     or (related_table = 'crm_oferty' and related_id = any(offer_ids))
     or (metadata->>'lead_id') = public_lead_id::text
     or (metadata->>'crm_id') = public_lead_id::text;

  delete from public.crm_szanse_sprzedazy
  where id = public_lead_id;
end;
$$;

grant execute on function public.delete_crm_lead(uuid) to authenticated;

create or replace function public.schedule_crm_offer_followup(public_offer_id uuid)
returns public.crm_zadania
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_offer public.crm_oferty;
  followup_date date := public.crm_add_business_days(current_date, 2);
  selected_task public.crm_zadania;
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

  select *
  into selected_task
  from public.crm_zadania
  where crm_id = selected_offer.crm_id
    and etap = 'propozycja_wspolpracy_wyslana'
    and tytul = 'Follow-up po wysłanej propozycji'
    and status <> 'zrobione'
  order by created_at desc
  limit 1;

  if selected_task.id is null then
    insert into public.crm_zadania (crm_id, etap, tytul, opis, status, termin)
    values (
      selected_offer.crm_id,
      'propozycja_wspolpracy_wyslana',
      'Follow-up po wysłanej propozycji',
      'Skontaktuj się z klientem 2 dni robocze po wysłaniu propozycji współpracy.',
      'do_zrobienia',
      followup_date
    )
    returning * into selected_task;
  else
    update public.crm_zadania
    set
      termin = followup_date,
      updated_at = now()
    where id = selected_task.id
    returning * into selected_task;
  end if;

  return selected_task;
end;
$$;

grant execute on function public.schedule_crm_offer_followup(uuid) to authenticated;
