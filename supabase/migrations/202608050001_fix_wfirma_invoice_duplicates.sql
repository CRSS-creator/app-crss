create or replace function public.prevent_local_lines_on_wfirma_invoice()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT'
    and coalesce(new.source_key, '') not like 'wfirma:%'
    and exists (
      select 1
      from public.faktury invoice
      where invoice.id = new.faktura_id
        and invoice.wfirma_id is not null
    )
    and exists (
      select 1
      from public.faktury_pozycje wfirma_line
      where wfirma_line.faktura_id = new.faktura_id
        and wfirma_line.source_key like 'wfirma:%'
    )
  then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_local_lines_on_wfirma_invoice_trigger on public.faktury_pozycje;
create trigger prevent_local_lines_on_wfirma_invoice_trigger
before insert on public.faktury_pozycje
for each row
execute function public.prevent_local_lines_on_wfirma_invoice();

delete from public.faktury_pozycje local_line
using public.faktury invoice
where local_line.faktura_id = invoice.id
  and invoice.wfirma_id is not null
  and coalesce(local_line.source_key, '') not like 'wfirma:%'
  and exists (
    select 1
    from public.faktury_pozycje wfirma_line
    where wfirma_line.faktura_id = invoice.id
      and wfirma_line.source_key like 'wfirma:%'
  );

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
  and invoice.wfirma_id is not null;
