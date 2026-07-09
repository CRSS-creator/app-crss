create or replace function public.clear_draft_invoice_issue_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.automatyczna, false)
    and new.numer is null
    and new.wfirma_id is null
    and coalesce(new.wfirma_sync_status, 'nie_wyslano') in ('nie_wyslano', 'w_kolejce', 'blad')
  then
    new.data_wystawienia := null;
    new.termin_platnosci := null;
  end if;

  return new;
end;
$$;

drop trigger if exists clear_draft_invoice_issue_date_trigger on public.faktury;
create trigger clear_draft_invoice_issue_date_trigger
before insert or update of automatyczna, numer, wfirma_id, wfirma_sync_status, data_wystawienia, termin_platnosci
on public.faktury
for each row
execute function public.clear_draft_invoice_issue_date();

update public.faktury
set data_wystawienia = null,
    termin_platnosci = null
where automatyczna = true
  and numer is null
  and wfirma_id is null
  and coalesce(wfirma_sync_status, 'nie_wyslano') in ('nie_wyslano', 'w_kolejce', 'blad');

update public.faktury_pozycje
set kwota_vat = round(coalesce(kwota_netto, 0) * 0.23, 2),
    kwota_brutto = round(coalesce(kwota_netto, 0) * 1.23, 2)
where stawka_vat ~ '23'
  and coalesce(kwota_netto, 0) > 0
  and coalesce(kwota_brutto, 0) <= coalesce(kwota_netto, 0);

with totals as (
  select
    faktura_id,
    round(coalesce(sum(kwota_netto), 0), 2) as total_net,
    round(coalesce(sum(kwota_vat), 0), 2) as total_vat,
    round(coalesce(sum(kwota_brutto), 0), 2) as total_gross
  from public.faktury_pozycje
  group by faktura_id
)
update public.faktury invoice
set kwota_netto = totals.total_net,
    kwota_vat = totals.total_vat,
    kwota_brutto = totals.total_gross
from totals
where invoice.id = totals.faktura_id
  and invoice.automatyczna = true
  and invoice.wfirma_id is null;
