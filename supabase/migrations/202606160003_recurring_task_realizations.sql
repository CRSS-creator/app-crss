alter table public.zadania_cykliczne
  add column if not exists czestotliwosc text not null default 'miesieczne',
  add column if not exists miesiac_roczny integer;

alter table public.zadania_cykliczne
  drop constraint if exists zadania_cykliczne_czestotliwosc_check,
  add constraint zadania_cykliczne_czestotliwosc_check check (czestotliwosc in ('miesieczne', 'roczne'));

alter table public.zadania_cykliczne
  drop constraint if exists zadania_cykliczne_miesiac_roczny_check,
  add constraint zadania_cykliczne_miesiac_roczny_check check (miesiac_roczny is null or miesiac_roczny between 1 and 12);

create table if not exists public.zadania_cykliczne_realizacje (
  id uuid primary key default gen_random_uuid(),
  zadanie_cykliczne_id uuid not null references public.zadania_cykliczne(id) on delete cascade,
  klient_id uuid not null references public.klienci(id) on delete cascade,
  rozliczenie_id uuid references public.rozliczenia_miesieczne(id) on delete cascade,
  okres date not null,
  termin date,
  tytul text not null,
  opis text,
  status text not null default 'do_zrobienia',
  priorytet text not null default 'normalny',
  osoba_id uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  uwagi text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zadania_cykliczne_realizacje_status_check check (status in ('do_zrobienia', 'w_trakcie', 'zrobione')),
  constraint zadania_cykliczne_realizacje_priorytet_check check (priorytet in ('niski', 'normalny', 'wysoki', 'pilne'))
);

create unique index if not exists zadania_cykliczne_realizacje_unique_period
  on public.zadania_cykliczne_realizacje (zadanie_cykliczne_id, klient_id, okres);

alter table public.zadania_cykliczne_realizacje enable row level security;

drop policy if exists "recurring realizations readable" on public.zadania_cykliczne_realizacje;
create policy "recurring realizations readable" on public.zadania_cykliczne_realizacje
  for select using (
    public.current_user_role() in ('owner', 'manager', 'admin')
    or osoba_id = auth.uid()
    or exists (
      select 1 from public.klienci k
      where k.id = zadania_cykliczne_realizacje.klient_id
        and k.opiekun_id = auth.uid()
    )
  );

drop policy if exists "recurring realizations writable" on public.zadania_cykliczne_realizacje;
create policy "recurring realizations writable" on public.zadania_cykliczne_realizacje
  for all using (
    public.current_user_role() in ('owner', 'manager', 'admin')
    or osoba_id = auth.uid()
    or exists (
      select 1 from public.klienci k
      where k.id = zadania_cykliczne_realizacje.klient_id
        and k.opiekun_id = auth.uid()
    )
  ) with check (
    public.current_user_role() in ('owner', 'manager', 'admin')
    or osoba_id = auth.uid()
    or exists (
      select 1 from public.klienci k
      where k.id = zadania_cykliczne_realizacje.klient_id
        and k.opiekun_id = auth.uid()
    )
  );

create or replace function public.recurring_task_due_date(public_period date, task_day integer, annual_month integer default null)
returns date
language sql
stable
as $$
  select make_date(
    extract(year from public_period)::integer,
    coalesce(annual_month, extract(month from public_period)::integer),
    least(
      greatest(coalesce(task_day, 1), 1),
      extract(day from (date_trunc('month', make_date(extract(year from public_period)::integer, coalesce(annual_month, extract(month from public_period)::integer), 1)) + interval '1 month - 1 day'))::integer
    )
  );
$$;

create or replace function public.ensure_recurring_task_realizations(public_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.zadania_cykliczne_realizacje (
    zadanie_cykliczne_id,
    klient_id,
    rozliczenie_id,
    okres,
    termin,
    tytul,
    opis,
    priorytet,
    osoba_id
  )
  select
    z.id,
    k.id,
    r.id,
    public_period,
    public.recurring_task_due_date(public_period, z.dzien_miesiaca, case when z.czestotliwosc = 'roczne' then z.miesiac_roczny else null end),
    z.tytul,
    z.opis,
    z.priorytet,
    k.opiekun_id
  from public.zadania_cykliczne z
  join public.klienci k on k.aktywny = true
  left join public.rozliczenia_miesieczne r on r.klient_id = k.id and r.okres = public_period
  where z.aktywne = true
    and (z.klient_id is null or z.klient_id = k.id)
    and (z.klient_id is not null or z.formy_prawne is null or cardinality(z.formy_prawne) = 0 or k.forma_prawna = any(z.formy_prawne))
    and (z.klient_id is not null or z.formy_opodatkowania is null or cardinality(z.formy_opodatkowania) = 0 or k.forma_opodatkowania = any(z.formy_opodatkowania))
    and (z.klient_id is not null or z.wymaga_czynnego_vat is null or k.czynny_vat = z.wymaga_czynnego_vat)
    and (coalesce(z.czestotliwosc, 'miesieczne') = 'miesieczne' or z.miesiac_roczny = extract(month from public_period)::integer)
  on conflict (zadanie_cykliczne_id, klient_id, okres) do nothing;
end;
$$;

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
    and not exists (
      select 1 from public.rozliczenia_miesieczne r
      where r.klient_id = k.id and r.okres = public_period
    );

  perform public.ensure_recurring_task_realizations(public_period);
end;
$$;

create or replace function public.settlement_task_progress(public_period date)
returns table (
  rozliczenie_id uuid,
  total_tasks bigint,
  done_tasks bigint,
  progress integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id as rozliczenie_id,
    count(zcr.id) as total_tasks,
    count(zcr.id) filter (where zcr.status = 'zrobione') as done_tasks,
    case
      when count(zcr.id) = 0 then 0
      else round((count(zcr.id) filter (where zcr.status = 'zrobione')::numeric / count(zcr.id)::numeric) * 100)::integer
    end as progress
  from public.rozliczenia_miesieczne r
  left join public.zadania_cykliczne_realizacje zcr on zcr.rozliczenie_id = r.id
  where r.okres = public_period
  group by r.id;
$$;

grant execute on function public.ensure_recurring_task_realizations(date) to authenticated;
grant execute on function public.recurring_task_due_date(date, integer, integer) to authenticated;
grant execute on function public.ensure_monthly_settlements(date) to authenticated;
grant execute on function public.settlement_task_progress(date) to authenticated;
