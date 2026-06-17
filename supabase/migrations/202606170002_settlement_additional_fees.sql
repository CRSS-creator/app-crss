create extension if not exists pgcrypto;

create table if not exists public.oplaty_dodatkowe (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nazwa text not null,
  domyslna_kwota_netto numeric(12, 2) not null default 0 check (domyslna_kwota_netto >= 0),
  opis text,
  aktywna boolean not null default true
);

create unique index if not exists oplaty_dodatkowe_nazwa_unique
on public.oplaty_dodatkowe (lower(nazwa));

create table if not exists public.rozliczenia_oplaty_dodatkowe (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  rozliczenie_id uuid not null references public.rozliczenia_miesieczne(id) on delete cascade,
  oplata_id uuid references public.oplaty_dodatkowe(id) on delete set null,
  nazwa text not null,
  kwota_netto numeric(12, 2) not null default 0 check (kwota_netto >= 0),
  ilosc numeric(12, 2) not null default 1 check (ilosc >= 0),
  uwagi text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid()
);

create index if not exists rozliczenia_oplaty_rozliczenie_idx
on public.rozliczenia_oplaty_dodatkowe (rozliczenie_id);

create index if not exists rozliczenia_oplaty_oplata_idx
on public.rozliczenia_oplaty_dodatkowe (oplata_id);

create or replace function public.touch_oplaty_dodatkowe_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists oplaty_dodatkowe_touch_updated_at on public.oplaty_dodatkowe;
create trigger oplaty_dodatkowe_touch_updated_at
before update on public.oplaty_dodatkowe
for each row
execute function public.touch_oplaty_dodatkowe_updated_at();

alter table public.oplaty_dodatkowe enable row level security;
alter table public.rozliczenia_oplaty_dodatkowe enable row level security;

grant select on public.oplaty_dodatkowe to authenticated;
grant insert, update, delete on public.oplaty_dodatkowe to authenticated;
grant select on public.rozliczenia_oplaty_dodatkowe to authenticated;
grant insert, update, delete on public.rozliczenia_oplaty_dodatkowe to authenticated;

drop policy if exists oplaty_dodatkowe_select_authenticated on public.oplaty_dodatkowe;
create policy oplaty_dodatkowe_select_authenticated
on public.oplaty_dodatkowe
for select
to authenticated
using (true);

drop policy if exists oplaty_dodatkowe_manage_owner_admin on public.oplaty_dodatkowe;
create policy oplaty_dodatkowe_manage_owner_admin
on public.oplaty_dodatkowe
for all
to authenticated
using (public.current_user_role() in ('owner', 'admin'))
with check (public.current_user_role() in ('owner', 'admin'));

drop policy if exists rozliczenia_oplaty_select_by_role on public.rozliczenia_oplaty_dodatkowe;
create policy rozliczenia_oplaty_select_by_role
on public.rozliczenia_oplaty_dodatkowe
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.rozliczenia_miesieczne settlement
    join public.klienci klient on klient.id = settlement.klient_id
    where settlement.id = rozliczenia_oplaty_dodatkowe.rozliczenie_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists rozliczenia_oplaty_insert_by_role on public.rozliczenia_oplaty_dodatkowe;
create policy rozliczenia_oplaty_insert_by_role
on public.rozliczenia_oplaty_dodatkowe
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.current_user_role() in ('owner', 'manager', 'admin')
    or exists (
      select 1
      from public.rozliczenia_miesieczne settlement
      join public.klienci klient on klient.id = settlement.klient_id
      where settlement.id = rozliczenie_id
        and klient.opiekun_id = auth.uid()
    )
  )
);

drop policy if exists rozliczenia_oplaty_update_by_role on public.rozliczenia_oplaty_dodatkowe;
create policy rozliczenia_oplaty_update_by_role
on public.rozliczenia_oplaty_dodatkowe
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.rozliczenia_miesieczne settlement
    join public.klienci klient on klient.id = settlement.klient_id
    where settlement.id = rozliczenia_oplaty_dodatkowe.rozliczenie_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.rozliczenia_miesieczne settlement
    join public.klienci klient on klient.id = settlement.klient_id
    where settlement.id = rozliczenie_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists rozliczenia_oplaty_delete_by_role on public.rozliczenia_oplaty_dodatkowe;
create policy rozliczenia_oplaty_delete_by_role
on public.rozliczenia_oplaty_dodatkowe
for delete
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.rozliczenia_miesieczne settlement
    join public.klienci klient on klient.id = settlement.klient_id
    where settlement.id = rozliczenia_oplaty_dodatkowe.rozliczenie_id
      and klient.opiekun_id = auth.uid()
  )
);
