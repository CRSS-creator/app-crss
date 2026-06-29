alter table public.klienci
  add column if not exists koszt_dodatkowego_dokumentu numeric(12,2);

comment on column public.klienci.koszt_dodatkowego_dokumentu is
  'Indywidualna opłata za dodatkowy dokument księgowy ponad limit klienta.';
