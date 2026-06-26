alter table public.rozliczenia_miesieczne
  add column if not exists przypomnienie_dokumenty_wyslane_at timestamptz,
  add column if not exists przypomnienie_dokumenty_wyslane_przez uuid references public.profiles(id) on delete set null,
  add column if not exists przypomnienie_dokumenty_wyslane_przez_nazwa text;
