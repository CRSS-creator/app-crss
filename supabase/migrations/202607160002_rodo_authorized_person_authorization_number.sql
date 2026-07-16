alter table public.rodo_rejestr_osob_upowaznionych
  add column if not exists numer_upowaznienia text;

create index if not exists rodo_rejestr_osob_upowaznionych_numer_idx
  on public.rodo_rejestr_osob_upowaznionych(numer_upowaznienia);
