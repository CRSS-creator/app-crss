create or replace function public.set_imported_wfirma_invoice_period()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.okres is null
    and new.zrodlo = 'wfirma'
    and coalesce(new.kategoria, 'standardowa') = 'standardowa'
    and new.data_wystawienia is not null
  then
    new.okres := (date_trunc('month', new.data_wystawienia)::date - interval '1 month')::date;
  end if;

  return new;
end;
$$;

drop trigger if exists faktury_set_imported_wfirma_period on public.faktury;
create trigger faktury_set_imported_wfirma_period
before insert or update of zrodlo, kategoria, data_wystawienia, okres
on public.faktury
for each row
execute function public.set_imported_wfirma_invoice_period();

update public.faktury
set okres = (date_trunc('month', data_wystawienia)::date - interval '1 month')::date
where okres is null
  and zrodlo = 'wfirma'
  and coalesce(kategoria, 'standardowa') = 'standardowa'
  and data_wystawienia is not null;
