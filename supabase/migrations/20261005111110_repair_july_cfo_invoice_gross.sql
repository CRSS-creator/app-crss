-- Repair only the historical net-as-gross import error affecting July CFO.
-- Use the VAT rate stored on each invoice line, not bank payment amounts.
-- Keep invoice IDs, net revenue, fee links and cash-flow assignments intact.
do $$
declare
  invoice record;
  previous_snapshot text := current_setting('crss.invoice_snapshot', true);
begin
  for invoice in
    select f.id
    from public.faktury f
    join public.faktury_pozycje p on p.faktura_id = f.id
    where f.wfirma_id is not null
      and f.typ = 'sprzedaz'
      and f.status <> 'anulowana'
      and f.kategoria <> 'korekta'
      and f.kwota_netto > 0
      and f.kwota_vat = 0
      and f.kwota_brutto = f.kwota_netto
      and (
        f.data_wystawienia between date '2026-07-01' and date '2026-07-31'
        or exists (
          select 1 from public.cfo_transakcje_bankowe t
          where t.faktura_id = f.id and not t.ignoruj
            and t.data_ksiegowania between date '2026-07-01' and date '2026-07-31'
        )
      )
    group by f.id
    having sum(p.kwota_netto) = f.kwota_netto
      and bool_and(p.stawka_vat in ('23', '23%')
        and p.kwota_vat = 0 and p.kwota_brutto = p.kwota_netto
        and p.kwota_netto > 0)
  loop
    perform 1 from public.faktury where id = invoice.id for update;
    -- Existing snapshot mechanism permits a monetary repair of a linked fee
    -- without detaching, deleting or regenerating its invoice line.
    perform set_config('crss.invoice_snapshot', invoice.id::text, true);
    update public.faktury_pozycje
    set kwota_vat = round(kwota_netto * 0.23, 2),
        kwota_brutto = kwota_netto + round(kwota_netto * 0.23, 2)
    where faktura_id = invoice.id;

    update public.faktury f
    set kwota_vat = totals.vat,
        kwota_brutto = totals.gross
    from (
      select sum(kwota_vat) vat, sum(kwota_brutto) gross
      from public.faktury_pozycje where faktura_id = invoice.id
    ) totals
    where f.id = invoice.id;
  end loop;
  perform set_config('crss.invoice_snapshot', coalesce(previous_snapshot, ''), true);
end;
$$;
