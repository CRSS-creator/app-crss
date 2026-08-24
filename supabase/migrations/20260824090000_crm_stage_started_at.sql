alter table public.crm_szanse_sprzedazy
  add column if not exists etap_started_at timestamptz;

update public.crm_szanse_sprzedazy
set etap_started_at = case
  when etap in ('nowy_lead', 'kontakt_proba_kontaktu') then created_at
  when etap = 'rozmowa_online' then greatest(
    created_at,
    coalesce(
      case when data_spotkania_online <= now() then data_spotkania_online end,
      case when data_telefonu <= now() then data_telefonu end,
      updated_at,
      created_at
    )
  )
  when etap = 'propozycja_wspolpracy_wyslana' then greatest(
    created_at,
    coalesce(
      case when data_wyslania_oferty <= now() then data_wyslania_oferty end,
      updated_at,
      created_at
    )
  )
  else greatest(created_at, coalesce(updated_at, created_at))
end
where etap_started_at is null;

alter table public.crm_szanse_sprzedazy
  alter column etap_started_at set default now(),
  alter column etap_started_at set not null;

create or replace function public.set_crm_lead_stage_started_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.etap_started_at := coalesce(new.etap_started_at, new.created_at, now());
  elsif new.etap is distinct from old.etap then
    new.etap_started_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists set_crm_lead_stage_started_at_trigger on public.crm_szanse_sprzedazy;

create trigger set_crm_lead_stage_started_at_trigger
before insert or update of etap
on public.crm_szanse_sprzedazy
for each row
execute function public.set_crm_lead_stage_started_at();
