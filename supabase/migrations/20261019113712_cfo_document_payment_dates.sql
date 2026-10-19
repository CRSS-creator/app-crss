-- Actual settlement dates are never inferred from due dates or sync timestamps.
alter table public.faktury add column data_zaplaty date;
alter table public.cfo_koszty add column termin_platnosci date;
alter table public.cfo_koszty add column data_zaplaty date;
alter table public.faktury add constraint faktury_actual_payment_not_future
  check (data_zaplaty is null or data_zaplaty <= (now() at time zone 'Europe/Warsaw')::date);
alter table public.cfo_koszty add constraint cfo_cost_actual_payment_not_future
  check (data_zaplaty is null or data_zaplaty <= (now() at time zone 'Europe/Warsaw')::date);

create table public.cfo_zobowiazania (
  id uuid primary key default gen_random_uuid(),
  okres date not null check (okres = date_trunc('month', okres)::date),
  typ text not null check (typ in ('wynagrodzenia_netto','zus','pit4','vat','cit')),
  kwota numeric(14,2) not null default 0 check (kwota >= 0),
  termin_platnosci date,
  data_zaplaty date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  unique (okres, typ),
  check (data_zaplaty is null or data_zaplaty <= (now() at time zone 'Europe/Warsaw')::date)
);
alter table public.cfo_zobowiazania enable row level security;
revoke all on public.cfo_zobowiazania from anon;
grant select, insert, update, delete on public.cfo_zobowiazania to authenticated;
create policy cfo_zobowiazania_owner_all on public.cfo_zobowiazania
  for all to authenticated
  using (public.current_user_role() = 'owner')
  with check (public.current_user_role() = 'owner');

-- Preserve verifiable full settlements from previously imported bank records.
-- Keep the source history intact, including partial settlements.
with payments as (
  select b.koszt_id id, abs(b.kwota) amount, b.data_ksiegowania paid_date
  from public.cfo_transakcje_bankowe b
  where b.koszt_id is not null and not b.ignoruj and not b.rozbita and b.typ='koszt' and b.kwota < 0
  union all
  select s.koszt_id, s.kwota, b.data_ksiegowania
  from public.cfo_rozbicia_platnosci s join public.cfo_transakcje_bankowe b on b.id=s.transakcja_id
  where s.koszt_id is not null and not b.ignoruj and b.rozbita and not s.poza_kosztem_cfo and s.typ='koszt'
), settled as (
  select id, sum(amount) amount, max(paid_date) paid_date from payments group by id
)
update public.cfo_koszty c set data_zaplaty=s.paid_date
from settled s where c.id=s.id and coalesce(c.kwota_brutto,c.kwota_netto_cfo)>0
  and abs(s.amount-coalesce(c.kwota_brutto,c.kwota_netto_cfo))<=0.01;

with payments as (
  select b.faktura_id id, b.kwota amount, b.data_ksiegowania paid_date
  from public.cfo_transakcje_bankowe b
  where b.faktura_id is not null and not b.ignoruj and not b.rozbita and b.typ='faktura_sprzedazowa' and b.kwota>0
  union all
  select s.faktura_id, s.kwota, b.data_ksiegowania
  from public.cfo_rozbicia_platnosci s join public.cfo_transakcje_bankowe b on b.id=s.transakcja_id
  where s.faktura_id is not null and not b.ignoruj and b.rozbita and not s.poza_kosztem_cfo and s.typ='faktura_sprzedazowa'
), settled as (
  select id, sum(amount) amount, max(paid_date) paid_date from payments group by id
)
update public.faktury f set data_zaplaty=s.paid_date
from settled s where f.id=s.id and f.status='oplacona' and f.kwota_brutto>0
  and abs(s.amount-f.kwota_brutto)<=0.01;

create index cfo_zobowiazania_due_idx on public.cfo_zobowiazania(termin_platnosci);
comment on column public.faktury.data_zaplaty is 'Faktyczna data pełnej zapłaty; NULL oznacza brak potwierdzonej daty, także przy statusie opłacona.';
