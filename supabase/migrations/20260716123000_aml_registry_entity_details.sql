alter table public.aml_rejestr_klientow
  add column if not exists dane_rejestrowe jsonb not null default '{}'::jsonb,
  add column if not exists beneficjenci_rzeczywisci jsonb not null default '[]'::jsonb,
  add column if not exists numer_regon text,
  add column if not exists numer_krs text,
  add column if not exists gus_status text,
  add column if not exists krs_status text,
  add column if not exists crbr_status text;

create index if not exists aml_rejestr_klientow_numer_regon_idx on public.aml_rejestr_klientow(numer_regon);
create index if not exists aml_rejestr_klientow_numer_krs_idx on public.aml_rejestr_klientow(numer_krs);
