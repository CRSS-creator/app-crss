alter table public.crm_szanse_sprzedazy
  add column if not exists zamknieta_at timestamptz;

update public.crm_szanse_sprzedazy
set zamknieta_at = coalesce(zamknieta_at, updated_at, created_at, now())
where status in ('wygrana', 'przegrana')
  and zamknieta_at is null;

create index if not exists crm_szanse_sprzedazy_zamknieta_at_idx
on public.crm_szanse_sprzedazy(zamknieta_at)
where status in ('wygrana', 'przegrana');

create or replace function public.set_crm_lead_closed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('wygrana', 'przegrana') then
      new.zamknieta_at := coalesce(new.zamknieta_at, now());
    end if;
    return new;
  end if;

  if new.status in ('wygrana', 'przegrana') and new.status is distinct from old.status then
    new.zamknieta_at := now();
  elsif coalesce(new.status, '') not in ('wygrana', 'przegrana') then
    new.zamknieta_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.set_crm_lead_closed_at() from public, anon, authenticated;

drop trigger if exists set_crm_lead_closed_at_trigger on public.crm_szanse_sprzedazy;
create trigger set_crm_lead_closed_at_trigger
before insert or update of status
on public.crm_szanse_sprzedazy
for each row
execute function public.set_crm_lead_closed_at();
