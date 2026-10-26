CREATE OR REPLACE FUNCTION public.protect_additional_fee_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f public.rozliczenia_oplaty_dodatkowe; i public.faktury;
  previous_refresh text := current_setting('crss.fee_refresh',true);
begin
  if old.rozliczenie_oplata_id is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if current_setting('crss.invoice_snapshot',true)=old.faktura_id::text then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  select * into i from public.faktury where id=old.faktura_id;
  if i.wfirma_id is not null or i.status<>'szkic' or i.wfirma_sync_status='w_kolejce' then
    raise exception 'Nie można usunąć ani zmienić powiązanej opłaty na wystawionej lub wysyłanej fakturze.';
  end if;
  if tg_op='DELETE' then
    -- Manual removal is a waiver, not a release for later regeneration.
    -- Generator cleanup and cascading source-fee deletion must not waive fees.
    if pg_trigger_depth()=1 and previous_refresh is distinct from 'on' then
      perform set_config('crss.fee_refresh','on',true);
      update public.rozliczenia_oplaty_dodatkowe
      set faktura_id=null, fakturowane_at=null,
          billing_hold_reason=coalesce(nullif(trim(billing_hold_reason),''),
            'Ręcznie usunięto opłatę ze szkicu faktury. Nie naliczać ponownie.')
      where id=old.rozliczenie_oplata_id and faktura_id=old.faktura_id;
      perform set_config('crss.fee_refresh',coalesce(previous_refresh,''),true);
    end if;
    return old;
  end if;
  select * into f from public.rozliczenia_oplaty_dodatkowe where id=old.rozliczenie_oplata_id;
  if new.rozliczenie_oplata_id is distinct from old.rozliczenie_oplata_id
    or new.faktura_id is distinct from old.faktura_id
    or new.kwota_netto is distinct from round(f.kwota_netto*f.ilosc,2)
    or new.ilosc is distinct from f.ilosc or new.cena_netto is distinct from f.kwota_netto then
    raise exception 'Zmień opłatę w rozliczeniu klienta, aby zachować zgodność z fakturą.';
  end if;
  return new;
end;
$function$
