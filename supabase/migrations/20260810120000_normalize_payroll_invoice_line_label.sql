create or replace function public.normalize_invoice_line_name()
returns trigger
language plpgsql
as $$
begin
  if new.nazwa ilike 'Usługa kadrowa%' then
    new.nazwa := replace(new.nazwa, 'Usługa kadrowa', 'Usługa Kadry i płace');
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_invoice_line_name_trigger on public.faktury_pozycje;

create trigger normalize_invoice_line_name_trigger
before insert or update of nazwa on public.faktury_pozycje
for each row
execute function public.normalize_invoice_line_name();

update public.faktury_pozycje
set nazwa = replace(nazwa, 'Usługa kadrowa', 'Usługa Kadry i płace')
where nazwa ilike 'Usługa kadrowa%';
