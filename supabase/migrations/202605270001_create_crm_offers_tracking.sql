-- Interaktywne oferty CRM z publicznym linkiem i podstawowa analityka uwagi.

create extension if not exists pgcrypto;

create table if not exists public.crm_oferty (
  id uuid primary key default gen_random_uuid(),
  crm_id uuid not null references public.crm_szanse_sprzedazy(id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'accepted', 'expired')),
  tytul text not null default 'Oferta wspolpracy',
  przygotowana_dla text,
  osoba_kontaktowa text,
  podsumowanie_rozmowy text,
  potrzeby_klienta text,
  rekomendowany_pakiet text not null default 'Standard',
  opis_pakietu text,
  cena_standard numeric(12,2),
  cena_premium numeric(12,2),
  cena_wdrozenia numeric(12,2),
  zakres text,
  warunki text,
  cta_label text not null default 'Chce omowic oferte',
  cta_url text,
  pdf_url text,
  wazna_do date,
  published_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_oferty_crm_id_idx on public.crm_oferty(crm_id);
create index if not exists crm_oferty_public_token_idx on public.crm_oferty(public_token);
create index if not exists crm_oferty_status_idx on public.crm_oferty(status);

create table if not exists public.crm_oferta_events (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.crm_oferty(id) on delete cascade,
  event_type text not null
    check (event_type in ('open', 'section_time', 'cta_click', 'pdf_download', 'accept')),
  section_key text,
  visitor_id text,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_oferta_events_oferta_id_idx on public.crm_oferta_events(oferta_id);
create index if not exists crm_oferta_events_created_at_idx on public.crm_oferta_events(created_at);
create index if not exists crm_oferta_events_section_idx on public.crm_oferta_events(oferta_id, section_key);

create or replace function public.accept_crm_offer(public_offer_id uuid, public_visitor_id text default null)
returns public.crm_oferty
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_offer public.crm_oferty;
begin
  update public.crm_oferty
  set
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now())
  where id = public_offer_id
    and status in ('published', 'accepted')
  returning * into accepted_offer;

  if accepted_offer.id is null then
    raise exception 'Offer not found or not published';
  end if;

  insert into public.crm_oferta_events (
    oferta_id,
    event_type,
    visitor_id
  )
  values (
    accepted_offer.id,
    'accept',
    public_visitor_id
  );

  return accepted_offer;
end;
$$;

grant execute on function public.accept_crm_offer(uuid, text) to anon, authenticated;

drop trigger if exists crm_oferty_touch_updated_at on public.crm_oferty;
create trigger crm_oferty_touch_updated_at
before update on public.crm_oferty
for each row execute function public.touch_updated_at();

alter table public.crm_oferty enable row level security;
alter table public.crm_oferta_events enable row level security;

drop policy if exists crm_oferty_select_owner on public.crm_oferty;
create policy crm_oferty_select_owner
on public.crm_oferty
for select
to authenticated
using (public.current_user_role() = 'owner');

drop policy if exists crm_oferty_write_owner on public.crm_oferty;
create policy crm_oferty_write_owner
on public.crm_oferty
for all
to authenticated
using (public.current_user_role() = 'owner')
with check (public.current_user_role() = 'owner');

drop policy if exists crm_oferty_public_select on public.crm_oferty;
create policy crm_oferty_public_select
on public.crm_oferty
for select
to anon, authenticated
using (status in ('published', 'accepted'));

drop policy if exists crm_oferta_events_select_owner on public.crm_oferta_events;
create policy crm_oferta_events_select_owner
on public.crm_oferta_events
for select
to authenticated
using (public.current_user_role() = 'owner');

drop policy if exists crm_oferta_events_public_insert on public.crm_oferta_events;
create policy crm_oferta_events_public_insert
on public.crm_oferta_events
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.crm_oferty o
    where o.id = oferta_id
      and o.status in ('published', 'accepted')
  )
);
