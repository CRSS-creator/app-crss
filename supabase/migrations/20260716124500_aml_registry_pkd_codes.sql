alter table public.aml_rejestr_klientow
  add column if not exists kody_pkd jsonb not null default '[]'::jsonb;

create index if not exists aml_rejestr_klientow_kody_pkd_gin_idx on public.aml_rejestr_klientow using gin (kody_pkd);
