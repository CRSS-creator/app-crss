alter table public.crm_oferty
  drop constraint if exists crm_oferty_status_check;

alter table public.crm_oferty
  add constraint crm_oferty_status_check
  check (status in ('draft', 'published', 'accepted', 'discussion_requested', 'rejected', 'expired'));

alter table public.crm_oferta_events
  drop constraint if exists crm_oferta_events_event_type_check;

alter table public.crm_oferta_events
  add constraint crm_oferta_events_event_type_check
  check (event_type in ('open', 'section_time', 'cta_click', 'pdf_download', 'accept', 'reject'));

create table if not exists public.powiadomienia (=
  id uuid primary key default gen_random_uuid(),
  type text not null default 'system',
  title text not null,
  body text,
  status text not null default 'unread' check (status in ('unread', 'read')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  related_table text,
  related_id uuid,
  recipient_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists powiadomienia_created_at_idx on public.powiadomienia(created_at desc);
create index if not exists powiadomienia_status_idx on public.powiadomienia(status);
create index if not exists powiadomienia_recipient_idx on public.powiadomienia(recipient_id);

alter table public.powiadomienia enable row level security;

drop policy if exists powiadomienia_select_owner on public.powiadomienia;
create policy powiadomienia_select_owner
on public.powiadomienia
for select
to authenticated
using (public.current_user_role() = 'owner');

drop policy if exists powiadomienia_update_owner on public.powiadomienia;
create policy powiadomienia_update_owner
on public.powiadomienia
for update
to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

create or replace function public.record_crm_offer_decision(
  public_offer_id uuid,
  public_decision text,
  public_visitor_id text default null
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
begin
  if public_decision not in ('accepted', 'discussion_requested', 'rejected') then
    raise exception 'Invalid offer decision';
  end if;

  if public_decision = 'accepted' then
    new_status := 'accepted';
    event_name := 'accept';
    notification_title := 'Propozycja zaakceptowana';
  elsif public_decision = 'discussion_requested' then
    new_status := 'discussion_requested';
    event_name := 'cta_click';
    notification_title := 'Klient chce omowic propozycje';
  else
    new_status := 'rejected';
    event_name := 'reject';
    notification_title := 'Propozycja odrzucona';
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
    jsonb_build_object('decision', public_decision)
  );

  notification_body := coalesce(selected_offer.przygotowana_dla, selected_offer.tytul, 'Klient') || ' zmienil status propozycji.';

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
      'crm_id', selected_offer.crm_id,
      'public_token', selected_offer.public_token,
      'title', selected_offer.tytul
    )
  );

  return selected_offer;
end;
$$;

grant execute on function public.record_crm_offer_decision(uuid, text, text) to anon, authenticated;
