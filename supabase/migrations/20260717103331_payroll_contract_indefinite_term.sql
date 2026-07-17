alter table public.kadry_umowy
add column if not exists umowa_na_czas_nieokreslony boolean not null default false;

comment on column public.kadry_umowy.umowa_na_czas_nieokreslony is
  'Czy umowa o pracę została zawarta na czas nieokreślony.';
