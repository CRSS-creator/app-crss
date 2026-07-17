alter table public.klienci
add column if not exists kadry_umowy_o_prace boolean not null default false,
add column if not exists kadry_umowy_cywilnoprawne boolean not null default false,
add column if not exists kadry_studenci boolean not null default false;

comment on column public.klienci.kadry_umowy_o_prace is
  'Czy w obsłudze kadrowej klienta występują umowy o pracę.';

comment on column public.klienci.kadry_umowy_cywilnoprawne is
  'Czy w obsłudze kadrowej klienta występują umowy cywilnoprawne.';

comment on column public.klienci.kadry_studenci is
  'Czy w obsłudze kadrowej klienta występują studenci.';
