alter table public.klienci
  add column if not exists pierwszy_okres_rozliczeniowy date,
  add column if not exists ostatni_okres_rozliczeniowy date;

comment on column public.klienci.pierwszy_okres_rozliczeniowy is
  'Pierwszy miesiąc współpracy/rozliczeń klienta, zapisany jako pierwszy dzień miesiąca.';

comment on column public.klienci.ostatni_okres_rozliczeniowy is
  'Ostatni miesiąc współpracy/rozliczeń klienta, opcjonalny, zapisany jako pierwszy dzień miesiąca.';
