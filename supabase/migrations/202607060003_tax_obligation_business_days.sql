create or replace function public.polish_easter_sunday(public_year integer)
returns date
language sql
immutable
as $$
  with parts as (
    select
      public_year % 19 as a,
      public_year / 100 as b,
      public_year % 100 as c
  ),
  calculated as (
    select
      a,
      b,
      c,
      b / 4 as d,
      b % 4 as e,
      (b + 8) / 25 as f
    from parts
  ),
  calculated_more as (
    select
      a,
      b,
      c,
      d,
      e,
      f,
      (b - f + 1) / 3 as g,
      c / 4 as i,
      c % 4 as k
    from calculated
  ),
  result as (
    select
      ((19 * a + b - d - g + 15) % 30) as h,
      i,
      k,
      e,
      a
    from calculated_more
  ),
  final_parts as (
    select
      h,
      ((32 + 2 * e + 2 * i - h - k) % 7) as l,
      a
    from result
  ),
  final_result as (
    select
      h,
      l,
      ((a + 11 * h + 22 * l) / 451) as m
    from final_parts
  )
  select make_date(
    public_year,
    ((h + l - 7 * m + 114) / 31)::integer,
    (((h + l - 7 * m + 114) % 31) + 1)::integer
  )
  from final_result;
$$;

create or replace function public.is_polish_non_working_day(public_date date)
returns boolean
language sql
immutable
as $$
  select
    extract(isodow from public_date)::integer in (6, 7)
    or to_char(public_date, 'MM-DD') in (
      '01-01',
      '01-06',
      '05-01',
      '05-03',
      '08-15',
      '11-01',
      '11-11',
      '12-24',
      '12-25',
      '12-26'
    )
    or public_date in (
      public.polish_easter_sunday(extract(year from public_date)::integer),
      public.polish_easter_sunday(extract(year from public_date)::integer) + 1,
      public.polish_easter_sunday(extract(year from public_date)::integer) + 49,
      public.polish_easter_sunday(extract(year from public_date)::integer) + 60
    );
$$;

create or replace function public.next_polish_business_day(public_date date)
returns date
language plpgsql
immutable
as $$
declare
  adjusted_date date := public_date;
begin
  while public.is_polish_non_working_day(adjusted_date) loop
    adjusted_date := adjusted_date + 1;
  end loop;

  return adjusted_date;
end;
$$;

create or replace function public.tax_obligation_due_date(public_period date, public_due_day integer)
returns date
language sql
stable
as $$
  select public.next_polish_business_day(
    (date_trunc('month', public_period)::date + interval '1 month' + ((public_due_day - 1) || ' days')::interval)::date
  );
$$;
