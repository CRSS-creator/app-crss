-- Keep the description tied to the document settlement, not the invoice period.
do $$
declare definition text; old_note text; new_note text;
begin
  definition:=pg_get_functiondef('public.sync_document_overage_fee(uuid)'::regprocedure);
  old_note:=$text$format('Dokumenty: %s; limit: %s; stawka: %s zł netto.',s.liczba_dokumentow,c.limit_dokumentow,c.koszt_dodatkowego_dokumentu)$text$;
  new_note:=$text$format('Limit dokumentów zgodnie z umową: %s, faktycznie dostarczone w okresie %s: %s.',c.limit_dokumentow,to_char(s.okres,'MM/YYYY'),s.liczba_dokumentow)$text$;
  if position(old_note in definition)=0 or position('set kwota_netto=remaining, ilosc=1' in definition)=0 then
    raise exception 'Document fee generator changed; review description patch.';
  end if;
  definition:=replace(definition,old_note,new_note);
  definition:=replace(definition,'set kwota_netto=remaining, ilosc=1',
    'set kwota_netto=remaining, ilosc=1, uwagi='||new_note);
  execute definition;
end $$;

-- Update pending fees and local draft descriptions without recalculating amounts.
do $$
declare item record; previous_refresh text:=current_setting('crss.fee_refresh',true);
begin
  perform set_config('crss.fee_refresh','on',true);
  for item in
    select f.id,f.faktura_id,f.uwagi old_note,
      format('Limit dokumentów zgodnie z umową: %s, faktycznie dostarczone w okresie %s: %s.',
        c.limit_dokumentow,to_char(s.okres,'MM/YYYY'),s.liczba_dokumentow) new_note
    from public.rozliczenia_oplaty_dodatkowe f
    join public.rozliczenia_miesieczne s on s.id=f.rozliczenie_id
    join public.klienci c on c.id=s.klient_id
    left join public.faktury i on i.id=f.faktura_id
    where f.billing_origin='documents' and (f.faktura_id is null or
      (i.wfirma_id is null and i.status='szkic' and i.wfirma_sync_status in ('nie_wyslano','blad')))
  loop
    update public.rozliczenia_oplaty_dodatkowe set uwagi=item.new_note where id=item.id;
    if item.faktura_id is not null and nullif(item.old_note,'') is not null then
      update public.faktury set opis=replace(opis,item.old_note,item.new_note)
      where id=item.faktura_id and wfirma_id is null and status='szkic'
        and wfirma_sync_status in ('nie_wyslano','blad');
    end if;
  end loop;
  perform set_config('crss.fee_refresh',coalesce(previous_refresh,''),true);
end $$;
