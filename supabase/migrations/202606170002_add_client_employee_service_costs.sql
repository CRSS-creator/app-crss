alter table public.klienci
  add column if not exists koszt_obslugi_pracownika numeric(12,2),
  add column if not exists koszt_obslugi_zleceniobiorcy numeric(12,2);

comment on column public.klienci.koszt_obslugi_pracownika is
  'Indywidualny koszt obsługi jednego pracownika dla klienta.';

comment on column public.klienci.koszt_obslugi_zleceniobiorcy is
  'Indywidualny koszt obsługi jednego zleceniobiorcy dla klienta.';
