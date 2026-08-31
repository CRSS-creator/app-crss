create or replace function public.recurring_task_due_date_for_template(
  public_period date,
  task_day integer,
  annual_month integer,
  task_title text
)
returns date
language sql
stable
set search_path = public
as $$
  with due_month as (
    select case
      when coalesce(task_title, '') in (
        'Przesłanie informacji o nierozliczonych rozrachunkach i fakturach',
        'Sprawdzenie sald kont księgowych'
      )
        then (date_trunc('month', public_period)::date + interval '1 month')::date
      else make_date(
        extract(year from public_period)::integer,
        coalesce(annual_month, extract(month from public_period)::integer),
        1
      )
    end as month_start
  )
  select (
    month_start
    + (
      least(
        greatest(coalesce(task_day, 1), 1),
        extract(day from (date_trunc('month', month_start)::date + interval '1 month - 1 day'))::integer
      ) - 1
    )
  )::date
  from due_month;
$$;

revoke all on function public.recurring_task_due_date_for_template(date, integer, integer, text)
from public, anon;
grant execute on function public.recurring_task_due_date_for_template(date, integer, integer, text) to authenticated;
