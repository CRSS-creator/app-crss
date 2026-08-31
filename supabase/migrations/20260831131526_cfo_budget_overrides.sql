create table if not exists public.cfo_budget_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  okres date not null,
  typ text not null check (typ in ('przychod', 'koszt')),
  kategoria text not null,
  podkategoria text,
  opis text not null,
  kwota_plan numeric(12, 2) not null default 0,
  kwota_cashflow numeric(12, 2) not null default 0,
  powtarzanie text not null default 'jednorazowo' check (powtarzanie in ('jednorazowo', 'od_miesiaca')),
  aktywne boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint cfo_budget_overrides_period_start_check check (okres = date_trunc('month', okres)::date),
  constraint cfo_budget_overrides_revenue_category_check check (
    typ <> 'przychod'
    or kategoria in ('abonamenty', 'kadry_place', 'uslugi_dodatkowe', 'wdrozenia', 'pozostale')
  ),
  constraint cfo_budget_overrides_cost_category_check check (
    typ <> 'koszt'
    or kategoria in ('koszty_zespolu', 'lokal_infrastruktura', 'systemy_technologia', 'marketing_sprzedaz', 'administracja_ogolne', 'zarzad_wlasciciel', 'jednorazowe_nadzwyczajne')
  )
);

create index if not exists cfo_budget_overrides_okres_idx
  on public.cfo_budget_overrides(okres);

create index if not exists cfo_budget_overrides_type_period_idx
  on public.cfo_budget_overrides(typ, okres);

alter table public.cfo_budget_overrides enable row level security;

grant select, insert, update, delete on public.cfo_budget_overrides to authenticated;

drop policy if exists cfo_budget_overrides_owner_all on public.cfo_budget_overrides;
create policy cfo_budget_overrides_owner_all on public.cfo_budget_overrides
for all to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

create or replace function public.cfo_budget_overrides_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

revoke all on function public.cfo_budget_overrides_touch_updated_at() from public, anon;

drop trigger if exists cfo_budget_overrides_touch_updated_at on public.cfo_budget_overrides;
create trigger cfo_budget_overrides_touch_updated_at
before update on public.cfo_budget_overrides
for each row
execute function public.cfo_budget_overrides_touch_updated_at();
