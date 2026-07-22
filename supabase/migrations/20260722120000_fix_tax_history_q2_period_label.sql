update public.zobowiazania_wysylki_historia
set
  period_label = regexp_replace(period_label, '(^|\s)ii(\s+kwartał\s+2026)', '\1II\2', 'gi'),
  subject = case
    when subject is null then null
    else regexp_replace(subject, '(^|\s)ii(\s+kwartał\s+2026)', '\1II\2', 'gi')
  end
where period_label ~* '(^|\s)ii\s+kwartał\s+2026'
   or subject ~* '(^|\s)ii\s+kwartał\s+2026';
