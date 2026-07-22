alter table public.aml_formularze_wstepne
  add column if not exists wazny_do date;

create index if not exists aml_formularze_wstepne_wazny_do_idx
  on public.aml_formularze_wstepne(wazny_do);
