alter table public.cfo_rachunki_bankowe
  add column if not exists rodzaj_srodkow text not null default 'nieokreslone'
  check (rodzaj_srodkow in ('operacyjne', 'vat', 'nieokreslone'));
comment on column public.cfo_rachunki_bankowe.rodzaj_srodkow is
  'CFO: operator classifies available cash versus VAT-restricted funds; unknown accounts are excluded from available cash.';

