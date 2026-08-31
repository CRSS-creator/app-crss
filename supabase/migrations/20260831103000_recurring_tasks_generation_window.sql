create or replace function public.current_recurring_generation_period(reference_date date default ((now() at time zone 'Europe/Warsaw')::date))
returns date
language sql
stable
set search_path = public
as $$
  with month_bounds as (
    select
      date_trunc('month', reference_date)::date as month_start,
      (date_trunc('month', reference_date)::date + interval '1 month - 1 day')::date as month_end
  )
  select case
    when reference_date >= (month_end - interval '14 days')::date then month_start
    else (month_start - interval '1 month')::date
  end
  from month_bounds;
$$;

revoke all on function public.current_recurring_generation_period(date) from public;
grant execute on function public.current_recurring_generation_period(date) to authenticated;

create or replace function public.ensure_monthly_settlements(public_period date default public.current_recurring_generation_period())
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

create or replace function public.ensure_client_settlements_for_period_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_first_period date := case when tg_op = 'UPDATE' then date_trunc('month', old.pierwszy_okres_rozliczeniowy)::date else null end;
  new_first_period date := date_trunc('month', new.pierwszy_okres_rozliczeniowy)::date;
  old_last_period date := case when tg_op = 'UPDATE' then date_trunc('month', old.ostatni_okres_rozliczeniowy)::date else null end;
  new_last_period date := date_trunc('month', new.ostatni_okres_rozliczeniowy)::date;
  latest_generation_period date := public.current_recurring_generation_period();
  range_start date;
  range_end date;
  period_to_sync date;
begin
  if latest_generation_period is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    range_start := coalesce(new_first_period, latest_generation_period);
    range_end := least(coalesce(new_last_period, latest_generation_period), latest_generation_period);

    period_to_sync := range_start;
    while period_to_sync <= range_end loop
      perform public.ensure_monthly_settlements(period_to_sync);
      perform public.ensure_client_recurring_task_realizations(new.id, period_to_sync);
      perform public.ensure_tax_obligations(period_to_sync);
      period_to_sync := (period_to_sync + interval '1 month')::date;
    end loop;

    return new;
  end if;

  if new.id is distinct from old.id then
    return new;
  end if;

  if new_last_period is not null
    and old_last_period is not null
    and new_last_period > old_last_period then
    range_start := greatest(
      old_last_period + interval '1 month',
      coalesce(new_first_period, old_last_period + interval '1 month')
    )::date;
    range_end := least(new_last_period, latest_generation_period);

    period_to_sync := range_start;
    while period_to_sync <= range_end loop
      perform public.ensure_monthly_settlements(period_to_sync);
      perform public.ensure_client_recurring_task_realizations(new.id, period_to_sync);
      perform public.ensure_tax_obligations(period_to_sync);
      period_to_sync := (period_to_sync + interval '1 month')::date;
    end loop;
  end if;

  if new_first_period is not null
    and (old_first_period is null or new_first_period < old_first_period) then
    range_start := new_first_period;
    range_end := least(
      coalesce((old_first_period - interval '1 month')::date, latest_generation_period),
      coalesce(new_last_period, latest_generation_period),
      latest_generation_period
    );

    period_to_sync := range_start;
    while period_to_sync <= range_end loop
      perform public.ensure_monthly_settlements(period_to_sync);
      perform public.ensure_client_recurring_task_realizations(new.id, period_to_sync);
      perform public.ensure_tax_obligations(period_to_sync);
      period_to_sync := (period_to_sync + interval '1 month')::date;
    end loop;
  end if;

  if (
    new.aktywny is distinct from old.aktywny
    or new.status_klienta is distinct from old.status_klienta
    or new.forma_prawna is distinct from old.forma_prawna
    or new.forma_opodatkowania is distinct from old.forma_opodatkowania
    or new.czynny_vat is distinct from old.czynny_vat
    or new.vat_ue is distinct from old.vat_ue
    or new.obsluga_kadrowa is distinct from old.obsluga_kadrowa
    or new.opiekun_id is distinct from old.opiekun_id
  )
    and (new_first_period is null or new_first_period <= latest_generation_period)
    and (new_last_period is null or new_last_period >= latest_generation_period) then
    perform public.ensure_monthly_settlements(latest_generation_period);
    perform public.ensure_client_recurring_task_realizations(new.id, latest_generation_period);
    perform public.ensure_tax_obligations(latest_generation_period);
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_client_settlements_for_period_change()
from public, anon, authenticated;

drop trigger if exists klienci_sync_settlements_after_period_change on public.klienci;

create trigger klienci_sync_settlements_after_period_change
after insert or update of
  pierwszy_okres_rozliczeniowy,
  ostatni_okres_rozliczeniowy,
  aktywny,
  status_klienta,
  forma_prawna,
  forma_opodatkowania,
  czynny_vat,
  vat_ue,
  obsluga_kadrowa,
  opiekun_id
on public.klienci
for each row
execute function public.ensure_client_settlements_for_period_change();
