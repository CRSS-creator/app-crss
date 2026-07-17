create or replace function public.create_due_payroll_a1_notifications(
  public_due_date date default ((now() at time zone 'Europe/Warsaw')::date)
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
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
    'payroll_a1_due_today',
    'A1: konieczne rozliczenie',
    'U klienta ' || coalesce(client.nazwa, 'bez nazwy') || ' kończy się A1. Należy rozliczyć przychody krajowe i zagraniczne.',
    'high',
    'kadry_a1',
    a1.id,
    client.opiekun_id,
    jsonb_build_object(
      'notification_kind', 'payroll_a1_due_today',
      'a1_id', a1.id,
      'due_date', a1.data_konca_a1,
      'client_id', client.id,
      'client_name', client.nazwa,
      'client_nip', client.nip,
      'recipient_kind', 'caregiver'
    )
  from public.kadry_a1 a1
  join public.klienci client on client.id = a1.klient_id
  where a1.data_konca_a1 = public_due_date
    and coalesce(client.aktywny, true) = true
    and client.opiekun_id is not null
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'payroll_a1_due_today'
        and notification.related_table = 'kadry_a1'
        and notification.related_id = a1.id
        and notification.recipient_id = client.opiekun_id
        and notification.metadata->>'due_date' = public_due_date::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_payroll_a1_notifications(date) from public;
grant execute on function public.create_due_payroll_a1_notifications(date) to authenticated;
