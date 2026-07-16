alter table public.rodo_umowy_powierzenia
  add column if not exists data_wygasniecia date;

create index if not exists rodo_umowy_powierzenia_data_wygasniecia_idx
  on public.rodo_umowy_powierzenia(data_wygasniecia);
