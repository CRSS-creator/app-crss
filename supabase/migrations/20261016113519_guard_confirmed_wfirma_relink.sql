create or replace function public.sync_wfirma_invoice_snapshot(public_invoice_id uuid, public_header jsonb, public_lines jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare
  previous_header jsonb;
  previous_lines jsonb;
  next_header jsonb;
  next_lines jsonb;
  previous_mode text := current_setting('crss.wfirma_accept_remote_edits',true);
  net numeric; tax numeric; gross numeric;
begin
  if jsonb_typeof(public_header) is distinct from 'object' or jsonb_typeof(public_lines) is distinct from 'array' then
    raise exception 'Nieprawidłowe dane faktury z wFirmy.';
  end if;
  perform 1 from public.faktury where id=public_invoice_id for update;
  if not found then raise exception 'Nie znaleziono faktury.'; end if;
  if public_header ? 'expected_wfirma_id' and exists (
    select 1 from public.faktury where id=public_invoice_id
      and wfirma_id is distinct from public_header->>'expected_wfirma_id'
  ) then
    raise exception 'Powiązanie faktury zmieniło się. Odśwież listę i wybierz ponownie.';
  end if;
  select to_jsonb(i) into previous_header from public.faktury i where id=public_invoice_id;
  select coalesce(jsonb_agg(to_jsonb(p)-array['id','created_at','updated_at'] order by p.sort_order,p.source_key),'[]'::jsonb)
    into previous_lines from public.faktury_pozycje p where p.faktura_id=public_invoice_id;
  if not (public_header ?& array['kwota_netto','kwota_vat','kwota_brutto']) then
    raise exception 'Brak kompletnych kwot faktury z wFirmy.';
  end if;
  select coalesce(sum((e->>'kwota_netto')::numeric),0),coalesce(sum((e->>'kwota_vat')::numeric),0),
    coalesce(sum((e->>'kwota_brutto')::numeric),0) into net,tax,gross from jsonb_array_elements(public_lines) e;
  if exists(select 1 from jsonb_array_elements(public_lines) e
    where nullif(e->>'source_key','') is null or nullif(e->>'nazwa','') is null
      or (e->>'kwota_netto') is null or (e->>'kwota_vat') is null or (e->>'kwota_brutto') is null
      or abs((e->>'kwota_netto')::numeric+(e->>'kwota_vat')::numeric-(e->>'kwota_brutto')::numeric)>0.02)
    or (public_header->>'kwota_netto') is null or (public_header->>'kwota_vat') is null or (public_header->>'kwota_brutto') is null
    or abs(net-(public_header->>'kwota_netto')::numeric)>0.02
    or abs(tax-(public_header->>'kwota_vat')::numeric)>0.02
    or abs(gross-(public_header->>'kwota_brutto')::numeric)>0.02 then
    raise exception 'Kwoty i pozycje z wFirmy są niespójne. Zachowano dotychczasową fakturę.';
  end if;
  perform set_config('crss.wfirma_accept_remote_edits',public_invoice_id::text,true);
  update public.faktury set
    opis=case when public_header ? 'opis' then public_header->>'opis' else opis end,
    numer=case when public_header ? 'numer' then (public_header->>'numer')::text else numer end,
    wfirma_id=case when public_header ? 'wfirma_id' then (public_header->>'wfirma_id')::text else wfirma_id end,
    wfirma_url=case when public_header ? 'wfirma_url' then (public_header->>'wfirma_url')::text else wfirma_url end,
    data_wystawienia=case when public_header ? 'data_wystawienia' then (public_header->>'data_wystawienia')::date else data_wystawienia end,
    data_sprzedazy=case when public_header ? 'data_sprzedazy' then (public_header->>'data_sprzedazy')::date else data_sprzedazy end,
    termin_platnosci=case when public_header ? 'termin_platnosci' then (public_header->>'termin_platnosci')::date else termin_platnosci end,
    kwota_netto=case when public_header ? 'kwota_netto' then (public_header->>'kwota_netto')::numeric else kwota_netto end,
    kwota_vat=case when public_header ? 'kwota_vat' then (public_header->>'kwota_vat')::numeric else kwota_vat end,
    kwota_brutto=case when public_header ? 'kwota_brutto' then (public_header->>'kwota_brutto')::numeric else kwota_brutto end,
    wfirma_synced_at=case when public_header ? 'wfirma_synced_at' then (public_header->>'wfirma_synced_at')::timestamptz else wfirma_synced_at end,
    wfirma_pdf_path=case when public_header ? 'wfirma_pdf_path' then (public_header->>'wfirma_pdf_path')::text else wfirma_pdf_path end,
    wfirma_pdf_name=case when public_header ? 'wfirma_pdf_name' then (public_header->>'wfirma_pdf_name')::text else wfirma_pdf_name end,
    wfirma_pdf_synced_at=case when public_header ? 'wfirma_pdf_synced_at' then (public_header->>'wfirma_pdf_synced_at')::timestamptz else wfirma_pdf_synced_at end,
    wfirma_sync_error=case when public_header ? 'wfirma_sync_error' then (public_header->>'wfirma_sync_error')::text else wfirma_sync_error end
  where id=public_invoice_id;
  perform public.replace_wfirma_invoice_lines(public_invoice_id,public_lines);
  perform set_config('crss.wfirma_accept_remote_edits',coalesce(previous_mode,''),true);
  select to_jsonb(i) into next_header from public.faktury i where id=public_invoice_id;
  select coalesce(jsonb_agg(to_jsonb(p)-array['id','created_at','updated_at'] order by p.sort_order,p.source_key),'[]'::jsonb)
    into next_lines from public.faktury_pozycje p where p.faktura_id=public_invoice_id;
  if (previous_header-array['wfirma_synced_at','wfirma_pdf_path','wfirma_pdf_name','wfirma_pdf_synced_at','wfirma_sync_error','updated_at'])
     is distinct from (next_header-array['wfirma_synced_at','wfirma_pdf_path','wfirma_pdf_name','wfirma_pdf_synced_at','wfirma_sync_error','updated_at'])
     or previous_lines is distinct from next_lines then
    insert into public.wfirma_invoice_sync_history(faktura_id,before_header,before_lines,after_header,after_lines)
      values(public_invoice_id,previous_header,previous_lines,next_header,next_lines);
  end if;
end $$;
revoke all on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) to service_role;
