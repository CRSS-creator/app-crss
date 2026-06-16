alter table public.klienci
  add column if not exists model_fakturowania text not null default 'z_dolu';

alter table public.klienci
  drop constraint if exists klienci_model_fakturowania_check;

alter table public.klienci
  add constraint klienci_model_fakturowania_check
  check (model_fakturowania in ('z_gory', 'z_dolu'));

comment on column public.klienci.model_fakturowania is 'Model wystawiania faktury: z_gory albo z_dolu.';
