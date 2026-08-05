alter table public.faktury
  drop constraint if exists faktury_kategoria_check;

alter table public.faktury
  add constraint faktury_kategoria_check
  check (kategoria in ('standardowa', 'dodatkowa', 'korekta'));

create or replace function public.zero_correction_invoice_amounts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kategoria = 'korekta' then
    new.kwota_netto := 0;
    new.kwota_vat := 0;
    new.kwota_brutto := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists zero_correction_invoice_amounts_trigger on public.faktury;
create trigger zero_correction_invoice_amounts_trigger
before insert or update of kategoria, kwota_netto, kwota_vat, kwota_brutto
on public.faktury
for each row
execute function public.zero_correction_invoice_amounts();

update public.faktury
set kwota_netto = 0,
    kwota_vat = 0,
    kwota_brutto = 0
where kategoria = 'korekta'
  and (kwota_netto <> 0 or kwota_vat <> 0 or kwota_brutto <> 0);

revoke all on function public.zero_correction_invoice_amounts() from public;
revoke all on function public.zero_correction_invoice_amounts() from anon, authenticated;
