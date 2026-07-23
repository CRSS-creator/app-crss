alter table public.crm_szanse_sprzedazy
  add column if not exists przegrana_do_ponownego_kontaktu boolean not null default false,
  add column if not exists przegrana_ponowny_kontakt_at timestamp with time zone;

create index if not exists crm_szanse_przegrana_ponowny_kontakt_idx
on public.crm_szanse_sprzedazy(przegrana_ponowny_kontakt_at)
where przegrana_do_ponownego_kontaktu = true and status = 'przegrana';

create or replace function public.create_due_crm_follow_up_notifications(public_due_date date default ((now() at time zone 'Europe/Warsaw'))::date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  inserted_follow_up_count integer := 0;
  inserted_lost_recontact_count integer := 0;
begin
  delete from public.powiadomienia notification
  where notification.type = 'crm_lost_recontact_due'
    and notification.related_table = 'crm_szanse_sprzedazy'
    and notification.status = 'unread'
    and not exists (
      select 1
      from public.crm_szanse_sprzedazy lead
      where lead.id = notification.related_id
        and lead.status = 'przegrana'
        and coalesce(lead.przegrana_do_ponownego_kontaktu, false) = true
        and lead.przegrana_ponowny_kontakt_at is not null
        and (lead.przegrana_ponowny_kontakt_at at time zone 'Europe/Warsaw')::date::text = notification.metadata->>'due_date'
    );

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
  select
    'crm_follow_up_due',
    'Follow-up CRM',
    'W szansie "' || coalesce(lead.nazwa, 'Bez nazwy') || '" zaplanowano follow-up na dziś.' ||
      case
        when lead.osoba_kontaktowa is not null or lead.telefon is not null or lead.email is not null then
          ' Kontakt: ' || concat_ws(', ', nullif(lead.osoba_kontaktowa, ''), nullif(lead.telefon, ''), nullif(lead.email, '')) || '.'
        else ''
      end,
    'high',
    'crm_szanse_sprzedazy',
    lead.id,
    profile.id,
    jsonb_build_object(
      'crm_id', lead.id,
      'lead_name', lead.nazwa,
      'contact_name', lead.osoba_kontaktowa,
      'phone', lead.telefon,
      'email', lead.email,
      'stage', lead.etap,
      'due_date', public_due_date,
      'notification_kind', 'crm_follow_up_due'
    )
  from public.crm_szanse_sprzedazy lead
  cross join public.profiles profile
  where lead.data_follow_up is not null
    and (lead.data_follow_up at time zone 'Europe/Warsaw')::date = public_due_date
    and lead.status = 'otwarta'
    and profile.role in ('owner', 'admin')
    and coalesce(profile.aktywne, true) = true
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'crm_follow_up_due'
        and notification.related_table = 'crm_szanse_sprzedazy'
        and notification.related_id = lead.id
        and notification.recipient_id = profile.id
        and notification.metadata->>'due_date' = public_due_date::text
    );

  get diagnostics inserted_follow_up_count = row_count;

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
  select
    'crm_lost_recontact_due',
    'Ponowny kontakt z przegraną szansą',
    'Szansa "' || coalesce(lead.nazwa, 'Bez nazwy') || '" była oznaczona jako przegrana, ale zaplanowano ponowny kontakt na dziś.' ||
      case
        when lead.osoba_kontaktowa is not null or lead.telefon is not null or lead.email is not null then
          ' Kontakt: ' || concat_ws(', ', nullif(lead.osoba_kontaktowa, ''), nullif(lead.telefon, ''), nullif(lead.email, '')) || '.'
        else ''
      end,
    'high',
    'crm_szanse_sprzedazy',
    lead.id,
    profile.id,
    jsonb_build_object(
      'crm_id', lead.id,
      'lead_name', lead.nazwa,
      'contact_name', lead.osoba_kontaktowa,
      'phone', lead.telefon,
      'email', lead.email,
      'stage', lead.etap,
      'status', lead.status,
      'due_date', public_due_date,
      'notification_kind', 'crm_lost_recontact_due'
    )
  from public.crm_szanse_sprzedazy lead
  cross join public.profiles profile
  where lead.przegrana_ponowny_kontakt_at is not null
    and (lead.przegrana_ponowny_kontakt_at at time zone 'Europe/Warsaw')::date = public_due_date
    and lead.status = 'przegrana'
    and coalesce(lead.przegrana_do_ponownego_kontaktu, false) = true
    and profile.role in ('owner', 'admin')
    and coalesce(profile.aktywne, true) = true
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'crm_lost_recontact_due'
        and notification.related_table = 'crm_szanse_sprzedazy'
        and notification.related_id = lead.id
        and notification.recipient_id = profile.id
        and notification.metadata->>'due_date' = public_due_date::text
    );

  get diagnostics inserted_lost_recontact_count = row_count;

  return inserted_follow_up_count + inserted_lost_recontact_count;
end;
$$;

revoke all on function public.create_due_crm_follow_up_notifications(date) from public;
grant execute on function public.create_due_crm_follow_up_notifications(date) to authenticated;

do $$
declare
  existing_job_id bigint;
begin
  begin
    create extension if not exists pg_cron with schema extensions;
  exception when others then
    raise notice 'Nie udało się włączyć pg_cron: %', sqlerrm;
  end;

  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select jobid
    into existing_job_id
    from cron.job
    where jobname = 'create_crm_follow_up_notifications_daily'
    limit 1;

    if existing_job_id is not null then
      perform cron.unschedule(existing_job_id);
    end if;

    perform cron.schedule(
      'create_crm_follow_up_notifications_daily',
      '5 6 * * *',
      $job$select public.create_due_crm_follow_up_notifications();$job$
    );
  end if;
exception when others then
  raise notice 'Nie udało się zaplanować powiadomień CRM: %', sqlerrm;
end $$;

comment on function public.create_due_crm_follow_up_notifications(date) is
  'Tworzy powiadomienia CRM dla otwartych follow-upow oraz przegranych szans zaplanowanych do ponownego kontaktu.';
