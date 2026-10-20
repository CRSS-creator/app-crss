create table public.cfo_przychody_reczne (
  id uuid primary key default gen_random_uuid(),
  opis text not null check (length(trim(opis)) > 0),
  zrodlo text not null check (length(trim(zrodlo)) > 0),
  rodzaj text not null default 'dotacja' check (rodzaj in ('dotacja','pozostale')),
  okres date not null check (okres = date_trunc('month',okres)::date),
  data_dokumentu date not null,
  numer_dokumentu text,
  kwota_netto numeric(14,2) not null check (kwota_netto > 0 and kwota_netto <> 'NaN'::numeric),
  kwota_brutto numeric(14,2) not null check (kwota_brutto >= kwota_netto and kwota_brutto <> 'NaN'::numeric),
  termin_wplywu date,
  data_wplywu date check (data_wplywu <= (now() at time zone 'Europe/Warsaw')::date),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null
);
alter table public.cfo_przychody_reczne enable row level security;
revoke all on public.cfo_przychody_reczne from anon;
grant select, insert, update, delete on public.cfo_przychody_reczne to authenticated;
create policy cfo_manual_revenue_owner_all on public.cfo_przychody_reczne
  for all to authenticated using (public.current_user_role()='owner')
  with check (public.current_user_role()='owner');
create index cfo_manual_revenue_period_idx on public.cfo_przychody_reczne(okres);
create index cfo_manual_revenue_creator_idx on public.cfo_przychody_reczne(created_by);
