create or replace function public.finish_client_onboarding(public_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.onboarding_etapy
  set
    status = 'gotowe',
    updated_by = current_user_id,
    completed_at = coalesce(completed_at, now()),
    completed_by = coalesce(completed_by, current_user_id)
  where klient_id = public_client_id
    and status not in ('gotowe', 'papierowo', 'nowy_podmiot');

  update public.klienci
  set status_klienta = 'Aktywny'
  where id = public_client_id;

  insert into public.onboarding_historia (
    klient_id,
    onboarding_etap_id,
    etap,
    akcja,
    old_status,
    new_status,
    opis,
    created_by
  )
  values (
    public_client_id,
    null,
    null,
    'zakonczenie_onboardingu',
    null,
    'gotowe',
    'Zakonczono onboarding klienta.',
    current_user_id
  );
end;
$$;

revoke all on function public.finish_client_onboarding(uuid) from public;
grant execute on function public.finish_client_onboarding(uuid) to authenticated;

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
  where (k.aktywny = true or lower(coalesce(k.status_klienta, '')) = 'onboarding')
    and (k.pierwszy_okres_rozliczeniowy is null or date_trunc('month', k.pierwszy_okres_rozliczeniowy)::date <= public_period)
    and (k.ostatni_okres_rozliczeniowy is null or date_trunc('month', k.ostatni_okres_rozliczeniowy)::date >= public_period)
    and not exists (
      select 1
      from public.rozliczenia_miesieczne r
      where r.klient_id = k.id
        and r.okres = public_period
    );

  perform public.ensure_recurring_task_realizations(public_period);
  perform public.ensure_tax_obligations(public_period);
end;
$$;

grant execute on function public.ensure_monthly_settlements(date) to authenticated;
