create or replace function public.fill_wfirma_issue_date_from_final_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  final_month integer;
  final_year integer;
begin
  if new.data_wystawienia is null
    and coalesce(new.numer, '') ~ '^FV [0-9]+/[0-9]{1,2}/[0-9]{4}$'
  then
    final_month := substring(new.numer from '^FV [0-9]+/([0-9]{1,2})/[0-9]{4}$')::integer;
    final_year := substring(new.numer from '^FV [0-9]+/[0-9]{1,2}/([0-9]{4})$')::integer;

    if final_month between 1 and 12 then
      new.data_wystawienia := make_date(final_year, final_month, 1);
      new.termin_platnosci := coalesce(new.termin_platnosci, new.data_wystawienia + 7);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fill_wfirma_issue_date_from_final_number_trigger on public.faktury;
create trigger fill_wfirma_issue_date_from_final_number_trigger
before insert or update of numer, data_wystawienia, termin_platnosci
on public.faktury
for each row
execute function public.fill_wfirma_issue_date_from_final_number();

update public.faktury
set data_wystawienia = make_date(
      substring(numer from '^FV [0-9]+/[0-9]{1,2}/([0-9]{4})$')::integer,
      substring(numer from '^FV [0-9]+/([0-9]{1,2})/[0-9]{4}$')::integer,
      1
    ),
    termin_platnosci = coalesce(
      termin_platnosci,
      make_date(
        substring(numer from '^FV [0-9]+/[0-9]{1,2}/([0-9]{4})$')::integer,
        substring(numer from '^FV [0-9]+/([0-9]{1,2})/[0-9]{4}$')::integer,
        1
      ) + 7
    )
where data_wystawienia is null
  and coalesce(numer, '') ~ '^FV [0-9]+/[0-9]{1,2}/[0-9]{4}$'
  and substring(numer from '^FV [0-9]+/([0-9]{1,2})/[0-9]{4}$')::integer between 1 and 12;

revoke all on function public.fill_wfirma_issue_date_from_final_number() from public;
revoke all on function public.fill_wfirma_issue_date_from_final_number() from anon, authenticated;
