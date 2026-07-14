alter table public.klienci
  add column if not exists glowna_stawka_ryczaltu text;

comment on column public.klienci.glowna_stawka_ryczaltu is
  'Główna stawka ryczałtu wybrana w karcie klienta biura rachunkowego.';
