create table public.cfo_budget_payment_plans (
  id uuid primary key default gen_random_uuid(),
  nazwa text not null check (length(trim(nazwa)) > 0),
  rodzaj text not null check (rodzaj in ('monthly','installments','once','target')),
  kategoria text not null check (kategoria in ('koszty_zespolu','lokal_infrastruktura','systemy_technologia','marketing_sprzedaz','administracja_ogolne','zarzad_wlasciciel','jednorazowe_nadzwyczajne')),
  podkategoria text not null default '',
  kwota_brutto numeric(14,2) not null check (kwota_brutto >= 0),
  kwota_netto numeric(14,2) check (kwota_netto >= 0),
  pierwszy_miesiac date not null check (extract(day from pierwszy_miesiac) = 1),
  ostatni_miesiac date check (extract(day from ostatni_miesiac) = 1 and ostatni_miesiac >= pierwszy_miesiac),
  liczba_rat integer check (liczba_rat between 1 and 600),
  koszt_id uuid references public.cfo_koszty(id) on delete restrict,
  aktywny boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  check ((rodzaj = 'installments' and liczba_rat is not null) or (rodzaj <> 'installments' and liczba_rat is null)),
  check (rodzaj <> 'target' or (kwota_netto is null and koszt_id is null and ostatni_miesiac is null)),
  check (rodzaj not in ('once','target') or ostatni_miesiac is null),
  check (rodzaj <> 'installments' or kwota_netto is null)
);
create unique index cfo_budget_payment_target_unique
  on public.cfo_budget_payment_plans(kategoria,podkategoria,pierwszy_miesiac) where rodzaj='target' and aktywny;
create unique index cfo_budget_payment_cost_unique
  on public.cfo_budget_payment_plans(koszt_id) where koszt_id is not null and aktywny;
alter table public.cfo_budget_payment_plans enable row level security;
revoke all on public.cfo_budget_payment_plans from anon;
grant select,insert,update,delete on public.cfo_budget_payment_plans to authenticated;
create policy cfo_budget_payment_plans_owner_all on public.cfo_budget_payment_plans
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');
comment on table public.cfo_budget_payment_plans is 'Explicit budget schedules and absolute cash targets; legacy delta overrides remain unchanged.';
