create extension if not exists pgcrypto;

create table if not exists public.faktury (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  klient_id uuid references public.klienci(id) on delete set null,
  numer text,
  typ text not null default 'sprzedaz' check (typ in ('sprzedaz', 'korekta', 'proforma')),
  status text not null default 'szkic' check (status in ('szkic', 'wystawiona', 'wyslana', 'oplacona', 'anulowana')),
  zrodlo text not null default 'aplikacja' check (zrodlo in ('aplikacja', 'wfirma', 'import')),
  data_wystawienia date,
  data_sprzedazy date,
  termin_platnosci date,
  kontrahent_nazwa text not null,
  kontrahent_nip text,
  kontrahent_email text,
  waluta text not null default 'PLN',
  kwota_netto numeric(12, 2) not null default 0,
  kwota_vat numeric(12, 2) not null default 0,
  kwota_brutto numeric(12, 2) not null default 0,
  opis text,
  wfirma_id text,
  wfirma_url text,
  wfirma_synced_at timestamptz,
  wfirma_sync_status text not null default 'nie_wyslano' check (wfirma_sync_status in ('nie_wyslano', 'w_kolejce', 'wyslano', 'blad', 'zaimportowano')),
  wfirma_sync_error text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists faktury_wfirma_id_unique
on public.faktury (wfirma_id)
where wfirma_id is not null;

create index if not exists faktury_klient_id_idx on public.faktury(klient_id);
create index if not exists faktury_data_wystawienia_idx on public.faktury(data_wystawienia desc);
create index if not exists faktury_status_idx on public.faktury(status);
create index if not exists faktury_wfirma_sync_status_idx on public.faktury(wfirma_sync_status);

create table if not exists public.faktury_pozycje (
  id uuid primary key default gen_random_uuid(),
  faktura_id uuid not null references public.faktury(id) on delete cascade,
  nazwa text not null,
  ilosc numeric(12, 2) not null default 1 check (ilosc >= 0),
  jednostka text not null default 'szt.',
  cena_netto numeric(12, 2) not null default 0 check (cena_netto >= 0),
  stawka_vat text not null default '23%',
  kwota_netto numeric(12, 2) not null default 0,
  kwota_vat numeric(12, 2) not null default 0,
  kwota_brutto numeric(12, 2) not null default 0,
  pkwiu text,
  sort_order integer not null default 0
);

create index if not exists faktury_pozycje_faktura_id_idx on public.faktury_pozycje(faktura_id);

create or replace function public.touch_faktury_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists faktury_touch_updated_at on public.faktury;
create trigger faktury_touch_updated_at
before update on public.faktury
for each row
execute function public.touch_faktury_updated_at();

alter table public.faktury enable row level security;
alter table public.faktury_pozycje enable row level security;

grant select, insert, update, delete on public.faktury to authenticated;
grant select, insert, update, delete on public.faktury_pozycje to authenticated;

drop policy if exists faktury_select_management on public.faktury;
create policy faktury_select_management
on public.faktury
for select
to authenticated
using (public.current_user_role() in ('owner', 'admin'));

drop policy if exists faktury_insert_management on public.faktury;
create policy faktury_insert_management
on public.faktury
for insert
to authenticated
with check (public.current_user_role() in ('owner', 'admin'));

drop policy if exists faktury_update_management on public.faktury;
create policy faktury_update_management
on public.faktury
for update
to authenticated
using (public.current_user_role() in ('owner', 'admin'))
with check (public.current_user_role() in ('owner', 'admin'));

drop policy if exists faktury_delete_management on public.faktury;
create policy faktury_delete_management
on public.faktury
for delete
to authenticated
using (public.current_user_role() in ('owner', 'admin'));

drop policy if exists faktury_pozycje_select_management on public.faktury_pozycje;
create policy faktury_pozycje_select_management
on public.faktury_pozycje
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'admin')
  and exists (
    select 1 from public.faktury invoice where invoice.id = faktury_pozycje.faktura_id
  )
);

drop policy if exists faktury_pozycje_insert_management on public.faktury_pozycje;
create policy faktury_pozycje_insert_management
on public.faktury_pozycje
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'admin')
  and exists (
    select 1 from public.faktury invoice where invoice.id = faktura_id
  )
);

drop policy if exists faktury_pozycje_update_management on public.faktury_pozycje;
create policy faktury_pozycje_update_management
on public.faktury_pozycje
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'admin')
  and exists (
    select 1 from public.faktury invoice where invoice.id = faktury_pozycje.faktura_id
  )
)
with check (
  public.current_user_role() in ('owner', 'admin')
  and exists (
    select 1 from public.faktury invoice where invoice.id = faktura_id
  )
);

drop policy if exists faktury_pozycje_delete_management on public.faktury_pozycje;
create policy faktury_pozycje_delete_management
on public.faktury_pozycje
for delete
to authenticated
using (
  public.current_user_role() in ('owner', 'admin')
  and exists (
    select 1 from public.faktury invoice where invoice.id = faktury_pozycje.faktura_id
  )
);
