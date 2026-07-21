alter table public.klienci
  add column if not exists zus_preferencja_start date,
  add column if not exists zus_preferencja_koniec date;

comment on column public.klienci.zus_preferencja_start is
  'Data rozpoczecia preferencji ZUS przedsiebiorcy dla JDG.';

comment on column public.klienci.zus_preferencja_koniec is
  'Data konca preferencji ZUS przedsiebiorcy dla JDG.';
