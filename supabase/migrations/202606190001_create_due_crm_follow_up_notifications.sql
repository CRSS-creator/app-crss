create or replace function public.create_due_crm_follow_up_notifications(public_due_date date default ((now() at time zone 'Europe/Warsaw'))::date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  inserted_count integer;
begin
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
    null,
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
  where lead.data_follow_up is not null
    and (lead.data_follow_up at time zone 'Europe/Warsaw')::date = public_due_date
    and lead.status = 'otwarta'
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'crm_follow_up_due'
        and notification.related_table = 'crm_szanse_sprzedazy'
        and notification.related_id = lead.id
        and notification.metadata->>'due_date' = public_due_date::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
