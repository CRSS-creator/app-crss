alter table public.crm_oferty
  drop column if exists podsumowanie_rozmowy,
  drop column if exists potrzeby_klienta,
  drop column if exists opis_pakietu,
  drop column if exists cena_standard,
  drop column if exists cena_premium,
  drop column if exists cena_wdrozenia,
  drop column if exists zakres;
