drop trigger if exists rozliczenia_miesieczne_lock_update on public.rozliczenia_miesieczne;

drop function if exists public.prevent_locked_settlement_update();

create or replace function public.ensure_monthly_settlements(public_period date default date_trunc('month', current_date)::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  insert into public.rozliczenia_miesieczne (
    klient_id,
    okres,
    status_ksiegowosci,
    liczba_dokumentow,
    liczba_pracownikow,
    liczba_zleceniobiorcow
  )
  select
    id,
    public_period,
    'czeka_na_dokumenty',
    0,
    0,
    0
  from public.klienci
  where aktywny = true
    and not exists (
      select 1
      from public.rozliczenia_miesieczne r
      where r.klient_id = klienci.id
        and r.okres = public_period
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.ensure_monthly_settlements(date) to authenticated;
