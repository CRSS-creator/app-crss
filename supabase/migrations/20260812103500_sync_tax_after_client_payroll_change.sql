create or replace function public.ensure_client_settlements_for_period_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_first_period date := date_trunc('month', old.pierwszy_okres_rozliczeniowy)::date;
  new_first_period date := date_trunc('month', new.pierwszy_okres_rozliczeniowy)::date;
  old_last_period date := date_trunc('month', old.ostatni_okres_rozliczeniowy)::date;
  new_last_period date := date_trunc('month', new.ostatni_okres_rozliczeniowy)::date;
  latest_closed_period date := (date_trunc('month', (now() at time zone 'Europe/Warsaw')::date)::date - interval '1 month')::date;
  range_start date;
  range_end date;
  period_to_sync date;
begin
  if new.id is distinct from old.id then
    return new;
  end if;

  if latest_closed_period is null then
    return new;
  end if;

  if new_last_period is not null
    and old_last_period is not null
    and new_last_period > old_last_period then
    range_start := greatest(
      old_last_period + interval '1 month',
      coalesce(new_first_period, old_last_period + interval '1 month')
    )::date;
    range_end := least(new_last_period, latest_closed_period);

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
      coalesce((old_first_period - interval '1 month')::date, latest_closed_period),
      coalesce(new_last_period, latest_closed_period),
      latest_closed_period
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
    and (new_first_period is null or new_first_period <= latest_closed_period)
    and (new_last_period is null or new_last_period >= latest_closed_period) then
    perform public.ensure_monthly_settlements(latest_closed_period);
    perform public.ensure_client_recurring_task_realizations(new.id, latest_closed_period);
    perform public.ensure_tax_obligations(latest_closed_period);
  end if;

  return new;
end;
$$;

revoke all on function public.ensure_client_settlements_for_period_change()
from public, anon, authenticated;
