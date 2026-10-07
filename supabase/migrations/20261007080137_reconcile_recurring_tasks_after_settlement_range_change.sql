-- Saving the client's settlement range also removes obsolete recurring instances.
-- Keep settlement records, invoices, obligations and recorded work time for history.
-- The existing trigger runs only after the caller is allowed to update the client.
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
  -- Reconcile already generated tasks in the same transaction as the client save.
  -- Compare accounting months, not task due dates (which can fall next month).
  delete from public.zadania_cykliczne_realizacje z
  where z.klient_id = new.id
    and (
      z.okres < new_first_period
      or z.okres >= (new_last_period + interval '1 month')::date
    );

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

-- Reconcile previously saved end dates, including suspended clients.
delete from public.zadania_cykliczne_realizacje z
using public.klienci k
where z.klient_id = k.id
  and z.okres >= (date_trunc('month', k.ostatni_okres_rozliczeniowy) + interval '1 month')::date;
