alter table public.klienci
  add column if not exists zus_maly_plus_spelnia_warunki boolean not null default false,
  add column if not exists zus_maly_plus_skladka_spoleczna numeric(14,2);

comment on column public.klienci.zus_maly_plus_spelnia_warunki is
  'Czy klient spelnia warunki do Malego ZUS Plus.';

comment on column public.klienci.zus_maly_plus_skladka_spoleczna is
  'Indywidualna wysokosc skladek spolecznych klienta na Malym ZUS Plus.';
