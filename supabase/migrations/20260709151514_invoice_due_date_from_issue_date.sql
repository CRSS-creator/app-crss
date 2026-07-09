create or replace function public.set_invoice_due_date_from_issue_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_wystawienia is not null then
    new.termin_platnosci := new.data_wystawienia + 7;
  end if;

  return new;
end;
$$;

drop trigger if exists zz_set_invoice_due_date_from_issue_date_trigger on public.faktury;

create trigger zz_set_invoice_due_date_from_issue_date_trigger
before insert or update of data_wystawienia, termin_platnosci
on public.faktury
for each row
execute function public.set_invoice_due_date_from_issue_date();

update public.faktury
   set termin_platnosci = data_wystawienia + 7
 where data_wystawienia is not null
   and termin_platnosci is distinct from data_wystawienia + 7;
