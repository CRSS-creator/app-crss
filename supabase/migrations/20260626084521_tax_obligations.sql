create table if not exists public.zobowiazania_podatkowe (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rozliczenie_id uuid not null references public.rozliczenia_miesieczne(id) on delete cascade,
  klient_id uuid not null references public.klienci(id) on delete cascade,
  okres date not null,
  typ text not null check (typ in ('VAT', 'VAT-UE', 'VAT-9M', 'PIT', 'CIT', 'ZUS', 'PIT-4')),
  nazwa text not null,
  kwota numeric(12, 2),
  termin_platnosci date,
  status_pobrania text not null default 'do_pobrania' check (status_pobrania in ('do_pobrania', 'pobrane', 'blad')),
  status_email text not null default 'niewyslane' check (status_email in ('niewyslane', 'wyslane', 'blad')),
  status_sms text not null default 'niewyslane' check (status_sms in ('niewyslane', 'wyslane', 'blad')),
  email_sent_at timestamptz,
  email_sent_by uuid references public.profiles(id) on delete set null,
  sms_sent_at timestamptz,
  sms_sent_by uuid references public.profiles(id) on delete set null,
  zrodlo text not null default 'wfirma' check (zrodlo in ('wfirma', 'recznie')),
  external_id text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists zobowiazania_podatkowe_rozliczenie_typ_unique
on public.zobowiazania_podatkowe (rozliczenie_id, typ);

create index if not exists zobowiazania_podatkowe_okres_idx
on public.zobowiazania_podatkowe (okres);

create index if not exists zobowiazania_podatkowe_klient_idx
on public.zobowiazania_podatkowe (klient_id);

create or replace function public.touch_zobowiazania_podatkowe_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists zobowiazania_podatkowe_touch_updated_at on public.zobowiazania_podatkowe;
create trigger zobowiazania_podatkowe_touch_updated_at
before update on public.zobowiazania_podatkowe
for each row
execute function public.touch_zobowiazania_podatkowe_updated_at();

create or replace function public.tax_obligation_due_date(public_period date, public_due_day integer)
returns date
language sql
stable
as $$
  select (date_trunc('month', public_period)::date + interval '1 month' + ((public_due_day - 1) || ' days')::interval)::date;
$$;

create or replace function public.ensure_tax_obligations(public_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.zobowiazania_podatkowe (
    rozliczenie_id,
    klient_id,
    okres,
    typ,
    nazwa,
    termin_platnosci
  )
  select
    settlement.id,
    client.id,
    public_period,
    obligation.typ,
    obligation.nazwa,
    public.tax_obligation_due_date(public_period, obligation.dzien)
  from public.rozliczenia_miesieczne settlement
  join public.klienci client on client.id = settlement.klient_id
  cross join lateral (
    values
      ('VAT'::text, 'VAT', 25, client.czynny_vat is true),
      ('VAT-UE'::text, 'VAT-UE', 25, client.vat_ue is true),
      ('VAT-9M'::text, 'VAT-9M', 25, client.vat_ue is true and coalesce(client.czynny_vat, false) is false),
      ('PIT'::text, 'PIT', 20, client.forma_opodatkowania in ('Skala podatkowa', 'Podatek liniowy', 'Ryczałt')),
      ('CIT'::text, 'CIT', 20, client.forma_opodatkowania = 'CIT'),
      ('ZUS'::text, 'ZUS', 20, client.obsluga_kadrowa is true),
      ('PIT-4'::text, 'PIT-4', 20, client.obsluga_kadrowa is true)
  ) as obligation(typ, nazwa, dzien, warunek)
  where settlement.okres = public_period
    and client.aktywny = true
    and obligation.warunek
  on conflict (rozliczenie_id, typ) do nothing;
end;
$$;

drop function if exists public.ensure_monthly_settlements(date);

create or replace function public.ensure_monthly_settlements(public_period date default date_trunc('month', current_date)::date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rozliczenia_miesieczne (
    klient_id,
    okres,
    status_ksiegowosci,
    liczba_dokumentow,
    liczba_pracownikow,
    liczba_zleceniobiorcow,
    faktura_wystawiona
  )
  select
    k.id,
    public_period,
    'czeka_na_dokumenty',
    0,
    0,
    0,
    false
  from public.klienci k
  where k.aktywny = true
    and (k.pierwszy_okres_rozliczeniowy is null or date_trunc('month', k.pierwszy_okres_rozliczeniowy)::date <= public_period)
    and (k.ostatni_okres_rozliczeniowy is null or date_trunc('month', k.ostatni_okres_rozliczeniowy)::date >= public_period)
    and not exists (
      select 1 from public.rozliczenia_miesieczne r
      where r.klient_id = k.id and r.okres = public_period
    );

  perform public.ensure_recurring_task_realizations(public_period);
  perform public.ensure_tax_obligations(public_period);
end;
$$;

alter table public.zobowiazania_podatkowe enable row level security;

grant select, insert, update, delete on public.zobowiazania_podatkowe to authenticated;
grant execute on function public.ensure_tax_obligations(date) to authenticated;
grant execute on function public.ensure_monthly_settlements(date) to authenticated;

drop policy if exists zobowiazania_podatkowe_select_by_role on public.zobowiazania_podatkowe;
create policy zobowiazania_podatkowe_select_by_role
on public.zobowiazania_podatkowe
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = zobowiazania_podatkowe.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists zobowiazania_podatkowe_insert_by_role on public.zobowiazania_podatkowe;
create policy zobowiazania_podatkowe_insert_by_role
on public.zobowiazania_podatkowe
for insert
to authenticated
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists zobowiazania_podatkowe_update_by_role on public.zobowiazania_podatkowe;
create policy zobowiazania_podatkowe_update_by_role
on public.zobowiazania_podatkowe
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = zobowiazania_podatkowe.klient_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists zobowiazania_podatkowe_delete_by_role on public.zobowiazania_podatkowe;
create policy zobowiazania_podatkowe_delete_by_role
on public.zobowiazania_podatkowe
for delete
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = zobowiazania_podatkowe.klient_id
      and klient.opiekun_id = auth.uid()
  )
);
