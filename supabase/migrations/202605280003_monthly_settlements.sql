alter table public.rozliczenia_miesieczne
  drop constraint if exists rozliczenia_miesieczne_status_ksiegowosci_check;

alter table public.rozliczenia_miesieczne
  add constraint rozliczenia_miesieczne_status_ksiegowosci_check
  check (status_ksiegowosci in (
    'czeka_na_dokumenty',
    'dokumenty_kompletne_biuro',
    'w_trakcie_ksiegowania',
    'do_sprawdzenia',
    'sprawdzone_zatwierdzone',
    'podatki_wyslane'
  ));

alter table public.rozliczenia_miesieczne
  alter column liczba_dokumentow set default 0,
  alter column liczba_pracownikow set default 0,
  alter column liczba_zleceniobiorcow set default 0,
  alter column faktura_wystawiona set default false;

create or replace function public.ensure_monthly_settlements(public_period date default date_trunc('month', current_date)::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
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
    id,
    public_period,
    'czeka_na_dokumenty',
    0,
    0,
    0,
    false
  from public.klienci
  where aktywny = true
    and not exists (
      select 1
      from public.rozliczenia_miesieczne r
      where r.klient_id = klienci.id
        and r.okres = public_period
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

grant execute on function public.ensure_monthly_settlements(date) to authenticated;

create or replace function public.prevent_locked_settlement_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.faktura_wystawiona = true and public.current_user_role() <> 'owner' then
    raise exception 'Rozliczenie jest zablokowane po wystawieniu faktury.';
  end if;

  return new;
end;
$$;

drop trigger if exists rozliczenia_miesieczne_lock_update on public.rozliczenia_miesieczne;
create trigger rozliczenia_miesieczne_lock_update
before update on public.rozliczenia_miesieczne
for each row
execute function public.prevent_locked_settlement_update();

create or replace function public.settlement_task_progress(public_period date)
returns table (
  rozliczenie_id uuid,
  total_tasks integer,
  done_tasks integer,
  progress integer
)
language sql
security definer
set search_path = public
as $$
  select
    settlement.id as rozliczenie_id,
    count(task.id)::integer as total_tasks,
    count(task.id) filter (where task.status = 'zrobione')::integer as done_tasks,
    case
      when count(task.id) = 0 then 0
      else round((count(task.id) filter (where task.status = 'zrobione'))::numeric * 100 / count(task.id))::integer
    end as progress
  from public.rozliczenia_miesieczne settlement
  left join public.zadania task
    on task.klient_id = settlement.klient_id
    and task.termin is not null
    and date_trunc('month', task.termin)::date = settlement.okres
    and coalesce(task.czy_wewnetrzne, false) = false
  where settlement.okres = public_period
  group by settlement.id;
$$;

grant execute on function public.settlement_task_progress(date) to authenticated;

alter table public.rozliczenia_miesieczne enable row level security;

drop policy if exists rozliczenia_miesieczne_select_by_role on public.rozliczenia_miesieczne;
create policy rozliczenia_miesieczne_select_by_role
on public.rozliczenia_miesieczne
for select
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = rozliczenia_miesieczne.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists rozliczenia_miesieczne_update_by_role on public.rozliczenia_miesieczne;
create policy rozliczenia_miesieczne_update_by_role
on public.rozliczenia_miesieczne
for update
to authenticated
using (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = rozliczenia_miesieczne.klient_id
      and klient.opiekun_id = auth.uid()
  )
)
with check (
  public.current_user_role() in ('owner', 'manager', 'admin')
  or exists (
    select 1
    from public.klienci klient
    where klient.id = rozliczenia_miesieczne.klient_id
      and klient.opiekun_id = auth.uid()
  )
);

drop policy if exists rozliczenia_miesieczne_insert_owner on public.rozliczenia_miesieczne;
create policy rozliczenia_miesieczne_insert_owner
on public.rozliczenia_miesieczne
for insert
to authenticated
with check (public.current_user_role() in ('owner', 'manager', 'admin'));
