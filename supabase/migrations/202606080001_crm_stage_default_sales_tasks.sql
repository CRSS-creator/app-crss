drop trigger if exists crm_update_default_sales_tasks_trigger on public.crm_szanse_sprzedazy;

create trigger crm_update_default_sales_tasks_trigger
after update of etap on public.crm_szanse_sprzedazy
for each row
when (old.etap is distinct from new.etap)
execute function public.crm_insert_default_sales_tasks();

insert into public.crm_zadania (crm_id, etap, tytul, status)
select lead.id, defaults.etap, defaults.tytul, 'do_zrobienia'
from public.crm_szanse_sprzedazy lead
join public.crm_default_sales_tasks_for_stage(coalesce(lead.etap, 'nowy_lead')) as defaults
  on defaults.etap = coalesce(lead.etap, 'nowy_lead')
where coalesce(lead.status, 'otwarta') = 'otwarta'
  and not exists (
    select 1
    from public.crm_zadania existing
    where existing.crm_id = lead.id
      and existing.etap = defaults.etap
      and existing.tytul = defaults.tytul
  );
