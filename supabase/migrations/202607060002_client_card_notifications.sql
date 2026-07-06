create or replace function public.create_due_client_card_notifications()
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
    'client_card_overdue',
    'Karta klienta nie została wypełniona',
    'Klient ' || coalesce(k.nazwa, 'bez nazwy') || ' nie wypełnił karty klienta przez 7 dni od wysyłki. Skontaktuj się z klientem i poproś o uzupełnienie formularza.',
    'high',
    'klient_karty_formularze',
    f.id,
    k.opiekun_id,
    jsonb_build_object(
      'client_id', k.id,
      'client_name', k.nazwa,
      'client_nip', k.nip,
      'client_card_form_id', f.id,
      'sent_at', f.sent_at,
      'notification_kind', 'client_card_overdue'
    )
  from public.klient_karty_formularze f
  join public.klienci k on k.id = f.klient_id
  where f.status = 'active'
    and f.sent_at is not null
    and f.sent_at <= now() - interval '7 days'
    and k.opiekun_id is not null
    and not exists (
      select 1
      from public.powiadomienia p
      where p.type = 'client_card_overdue'
        and p.related_table = 'klient_karty_formularze'
        and p.related_id = f.id
        and p.recipient_id = k.opiekun_id
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_client_card_notifications() from public;
grant execute on function public.create_due_client_card_notifications() to authenticated;
