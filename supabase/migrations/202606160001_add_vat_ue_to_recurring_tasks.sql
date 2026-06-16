alter table public.zadania_cykliczne
  add column if not exists wymaga_vat_ue boolean;

comment on column public.zadania_cykliczne.wymaga_vat_ue is
  'Warunek VAT-UE dla szablonu zadania cyklicznego: true = tylko VAT-UE, false = tylko bez VAT-UE, null = dowolnie.';
