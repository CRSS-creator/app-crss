create or replace function public.sync_wfirma_invoice_snapshot(public_invoice_id uuid, public_header jsonb, public_lines jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  if jsonb_typeof(public_header) is distinct from 'object' or jsonb_typeof(public_lines) is distinct from 'array' then
    raise exception 'Nieprawidłowe dane faktury z wFirmy.';
  end if;
  perform 1 from public.faktury where id=public_invoice_id for update;
  if not found then raise exception 'Nie znaleziono faktury.'; end if;
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
  if jsonb_array_length(public_lines)>0 then
    perform public.replace_wfirma_invoice_lines(public_invoice_id,public_lines);
  end if;
end $$;
revoke all on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_wfirma_invoice_snapshot(uuid,jsonb,jsonb) to service_role;
