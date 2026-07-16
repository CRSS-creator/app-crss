create or replace function public.create_due_rodo_review_notifications(
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
  if extract(month from public_due_date)::integer <> 7
     or extract(day from public_due_date)::integer <> 1 then
    return 0;
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
  select
    'rodo_annual_review',
    'Przegląd procedury RODO',
    'Dzisiaj przypada coroczny przegląd procedury RODO. Zweryfikuj aktualność procedur, rejestrów i upoważnień.',
    'high',
    'rodo',
    null,
    profile.id,
    jsonb_build_object(
      'due_date', public_due_date,
      'review_year', extract(year from public_due_date)::integer,
      'notification_kind', 'rodo_annual_review'
    )
  from public.profiles profile
  where profile.role = 'owner'
    and coalesce(profile.aktywne, true) = true
    and not exists (
      select 1
      from public.powiadomienia notification
      where notification.type = 'rodo_annual_review'
        and notification.recipient_id = profile.id
        and notification.metadata->>'review_year' = extract(year from public_due_date)::integer::text
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.create_due_rodo_review_notifications(date) from public;
grant execute on function public.create_due_rodo_review_notifications(date) to authenticated;
