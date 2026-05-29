drop function if exists public.record_crm_offer_decision(uuid, text, text);

create or replace function public.record_crm_offer_decision(
  public_offer_id uuid,
  public_decision text,
  public_visitor_id text default null,
  public_rejection_reason text default null
)
returns public.crm_oferty
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_offer public.crm_oferty;
  new_status text;
  event_name text;
  notification_title text;
  notification_body text;
  decision_label text;
begin
  if public_decision not in ('accepted', 'discussion_requested', 'rejected') then
    raise exception 'Invalid offer decision';
  end if;

  if public_decision = 'accepted' then
    new_status := 'accepted';
    event_name := 'accept';
    decision_label := 'potwierdził rozpoczęcie współpracy';
    notification_title := 'Klient potwierdził rozpoczęcie współpracy';
  elsif public_decision = 'discussion_requested' then
    new_status := 'discussion_requested';
    event_name := 'cta_click';
    decision_label := 'poprosił o kontakt w sprawie propozycji';
    notification_title := 'Klient prosi o kontakt w sprawie propozycji';
  else
    new_status := 'rejected';
    event_name := 'reject';
    decision_label := 'zrezygnował z propozycji';
    notification_title := 'Klient zrezygnował z propozycji';
  end if;

  update public.crm_oferty
  set
    status = new_status,
    accepted_at = case when new_status = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
    updated_at = now()
  where id = public_offer_id
    and status in ('published', 'accepted', 'discussion_requested', 'rejected')
  returning * into selected_offer;

  if selected_offer.id is null then
    raise exception 'Offer not found or not published';
  end if;

  insert into public.crm_oferta_events (
    oferta_id,
    event_type,
    visitor_id,
    metadata
  )
  values (
    selected_offer.id,
    event_name,
    public_visitor_id,
    jsonb_build_object(
      'decision', public_decision,
      'rejection_reason', nullif(public_rejection_reason, '')
    )
  );

  notification_body := coalesce(selected_offer.przygotowana_dla, selected_offer.tytul, 'Klient') || ' ' || decision_label || '.';
  if public_decision = 'rejected' and nullif(public_rejection_reason, '') is not null then
    notification_body := notification_body || ' Powód: ' || public_rejection_reason || '.';
  end if;

  insert into public.powiadomienia (
    type,
    title,
    body,
    priority,
    related_table,
    related_id,
    recipient_id,
    metadata
  )
  values (
    'crm_offer_decision',
    notification_title,
    notification_body,
    case when public_decision in ('accepted', 'rejected') then 'high' else 'normal' end,
    'crm_oferty',
    selected_offer.id,
    selected_offer.created_by,
    jsonb_build_object(
      'decision', public_decision,
      'rejection_reason', nullif(public_rejection_reason, ''),
      'crm_id', selected_offer.crm_id,
      'public_token', selected_offer.public_token,
      'title', selected_offer.tytul
    )
  );

  return selected_offer;
end;
$$;

grant execute on function public.record_crm_offer_decision(uuid, text, text, text) to anon, authenticated;

create or replace function public.reset_crm_offer_after_pdf_removal(public_offer_id uuid)
returns public.crm_oferty
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_offer public.crm_oferty;
begin
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
      or public.current_user_role() in ('owner', 'admin', 'manager')
    )
  returning * into selected_offer;

  if selected_offer.id is null then
    raise exception 'Offer not found or access denied';
  end if;

  delete from public.crm_oferta_events
  where oferta_id = public_offer_id;

  delete from public.powiadomienia
  where related_table = 'crm_oferty'
    and related_id = public_offer_id
    and type = 'crm_offer_decision';

  return selected_offer;
end;
$$;

grant execute on function public.reset_crm_offer_after_pdf_removal(uuid) to authenticated;
