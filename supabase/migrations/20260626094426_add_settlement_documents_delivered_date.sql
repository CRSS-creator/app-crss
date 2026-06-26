alter table public.rozliczenia_miesieczne
  add column if not exists data_dostarczenia_dokumentow date;
