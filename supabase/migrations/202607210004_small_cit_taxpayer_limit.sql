alter table public.limity_rejestry
  drop constraint if exists limity_rejestry_typ_check;

alter table public.limity_rejestry
  add constraint limity_rejestry_typ_check
  check (typ in ('vat', 'wnt', 'kasa_fiskalna', 'maly_podatnik_cit'));
