alter table public.kadry_umowy
  add column if not exists archived_at timestamptz,
  add column if not exists archived_reason text;

create index if not exists kadry_umowy_archived_at_idx
  on public.kadry_umowy(archived_at);

create or replace function public.set_payroll_contract_archive_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_konca is not null
    and new.data_konca < current_date
    and coalesce(new.umowa_na_czas_nieokreslony, false) = false
  then
    new.archived_at := coalesce(new.archived_at, now());
    new.archived_reason := coalesce(new.archived_reason, 'ended');
  elsif new.archived_reason = 'ended' then
    new.archived_at := null;
    new.archived_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_payroll_contract_archive_status_trigger on public.kadry_umowy;

create trigger set_payroll_contract_archive_status_trigger
  before insert or update of data_konca, umowa_na_czas_nieokreslony, archived_at, archived_reason
  on public.kadry_umowy
  for each row
  execute function public.set_payroll_contract_archive_status();

update public.kadry_umowy
set
  archived_at = coalesce(archived_at, now()),
  archived_reason = coalesce(archived_reason, 'ended')
where data_konca is not null
  and data_konca < current_date
  and coalesce(umowa_na_czas_nieokreslony, false) = false
  and archived_at is null;

revoke all on function public.set_payroll_contract_archive_status() from public;

comment on column public.kadry_umowy.archived_at is
  'Data przeniesienia umowy kadrowej do archiwum.';

comment on column public.kadry_umowy.archived_reason is
  'Powod archiwizacji umowy kadrowej, np. ended albo manual.';
