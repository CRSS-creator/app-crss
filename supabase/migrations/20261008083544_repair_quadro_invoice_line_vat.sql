-- Reconcile the local snapshot with the owner-provided wFirma invoice:
-- FV 59/8/2026: 2900 net, 667 VAT, 3567 gross, fully paid.
do $$
declare
  invoice public.faktury;
  line_count integer;
  previous_snapshot text := current_setting('crss.invoice_snapshot', true);
begin
  select * into invoice from public.faktury
  where numer = 'FV 59/8/2026' and wfirma_id = '510585483'
    and kontrahent_nip = '8513173075'
  for update;
  if not found then return; end if;
  if invoice.kwota_netto <> 2900 or invoice.kwota_vat <> 667
    or invoice.kwota_brutto <> 3567 or invoice.status = 'anulowana' then
    raise exception 'Invoice totals or status changed; review reconciliation.';
  end if;

  perform 1 from public.faktury_pozycje where faktura_id = invoice.id for update;
  select count(*) into line_count from public.faktury_pozycje where faktura_id = invoice.id;
  if line_count <> 2 then raise exception 'Invoice lines changed; review reconciliation.'; end if;

  select count(*) into line_count from public.faktury_pozycje
  where faktura_id = invoice.id and ilosc = 1 and stawka_vat = '23%'
    and ((source_key = 'wfirma:1549783627' and nazwa = 'Korekta deklaracji'
      and kwota_netto = 200 and cena_netto = 200)
    or (source_key = 'wfirma:1549783563'
      and nazwa = 'Abonament księgowy za miesiąc lipiec 2026'
      and kwota_netto = 2700 and cena_netto = 2700))
    and ((kwota_vat = 0 and kwota_brutto = kwota_netto)
      or (kwota_vat = round(kwota_netto * 0.23, 2)
        and kwota_brutto = kwota_netto + kwota_vat));
  if line_count <> 2 then raise exception 'Invoice line amounts changed; review reconciliation.'; end if;

  perform set_config('crss.invoice_snapshot', invoice.id::text, true);
  update public.faktury_pozycje
  set kwota_vat = round(kwota_netto * 0.23, 2),
      kwota_brutto = kwota_netto + round(kwota_netto * 0.23, 2)
  where faktura_id = invoice.id and kwota_vat = 0;
  perform set_config('crss.invoice_snapshot', coalesce(previous_snapshot, ''), true);

  update public.faktury set status = 'oplacona', wfirma_sync_error = null
  where id = invoice.id;
end $$;
