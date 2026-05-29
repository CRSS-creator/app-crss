create or replace function public.reset_crm_offer_after_pdf_removal(public_offer_id uuid)
returns public.crm_oferty
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_offer public.crm_oferty;
begin
  delete from public.crm_oferta_events
  where oferta_id = public_offer_id;

  delete from public.powiadomienia
  where related_table = 'crm_oferty'
    and related_id = public_offer_id
    and type = 'crm_offer_decision';

  update public.crm_oferty
  set
    pdf_url = null,
    pdf_storage_path = null,
    pdf_file_name = null,
    pdf_file_size = null,
    status = 'draft',
    published_at = null,
    accepted_at = null,
    updated_at = now()
  where id = public_offer_id
    and (
      created_by = auth.uid()
      or public.current_user_role() in ('owner', 'admin', 'manager', 'accountant')
    )
  returning * into selected_offer;

  if selected_offer.id is null then
    raise exception 'Offer not found or access denied';
  end if;

  return selected_offer;
end;
$$;

grant execute on function public.reset_crm_offer_after_pdf_removal(uuid) to authenticated;

delete from public.crm_oferta_events e
using public.crm_oferty o
where e.oferta_id = o.id
  and o.pdf_url is null;

delete from public.powiadomienia p
using public.crm_oferty o
where p.related_table = 'crm_oferty'
  and p.related_id = o.id
  and p.type = 'crm_offer_decision'
  and o.pdf_url is null;
