-- Represent document overages as document count x contractual unit price.
-- Keep monetary remainders intact if a prior adjustment/rate change means they
-- cannot be expressed as a whole number of documents at the current rate.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.sync_document_overage_fee(uuid)'::regprocedure);
  if position('set kwota_netto=remaining, ilosc=1' in definition)=0
    or position('remaining,1,''documents''' in definition)=0 then
    raise exception 'Document fee generator changed; review quantity patch.';
  end if;
  definition:=replace(definition,'  remaining numeric;',
    E'  remaining numeric;\n  document_quantity numeric;\n  document_unit_price numeric;');
  definition:=replace(definition,'  if mutable_id is not null then',
    $patch$  document_quantity := 1;
  document_unit_price := remaining;
  if coalesce(c.koszt_dodatkowego_dokumentu,0)>0
    and mod(remaining,c.koszt_dodatkowego_dokumentu)=0 then
    document_unit_price := c.koszt_dodatkowego_dokumentu;
    document_quantity := remaining/document_unit_price;
  end if;
  if mutable_id is not null then$patch$);
  definition:=replace(definition,'set kwota_netto=remaining, ilosc=1',
    'set kwota_netto=document_unit_price, ilosc=document_quantity');
  definition:=replace(definition,'remaining,1,''documents''',
    'document_unit_price,document_quantity,''documents''');
  execute definition;
end $$;

-- Change only the representation of existing pending fees/local draft lines.
-- Do not recalculate totals or touch issued/queued invoices or payroll lines.
do $$
declare item record; previous_refresh text:=current_setting('crss.fee_refresh',true);
begin
  perform set_config('crss.fee_refresh','on',true);
  for item in
    select f.id,f.faktura_id,c.koszt_dodatkowego_dokumentu unit_price,
      (f.kwota_netto*f.ilosc)/c.koszt_dodatkowego_dokumentu quantity
    from public.rozliczenia_oplaty_dodatkowe f
    join public.rozliczenia_miesieczne s on s.id=f.rozliczenie_id
    join public.klienci c on c.id=s.klient_id
    left join public.faktury i on i.id=f.faktura_id
    where f.billing_origin='documents' and c.koszt_dodatkowego_dokumentu>0
      and mod(f.kwota_netto*f.ilosc,nullif(c.koszt_dodatkowego_dokumentu,0))=0
      and (f.faktura_id is null or (i.wfirma_id is null and i.status='szkic'
        and i.wfirma_sync_status in ('nie_wyslano','blad')))
  loop
    update public.rozliczenia_oplaty_dodatkowe
    set kwota_netto=item.unit_price,ilosc=item.quantity where id=item.id;
    update public.faktury_pozycje
    set cena_netto=item.unit_price,ilosc=item.quantity
    where rozliczenie_oplata_id=item.id and faktura_id=item.faktura_id;
  end loop;
  perform set_config('crss.fee_refresh',coalesce(previous_refresh,''),true);
end $$;
