-- Charge from the ninth day, keeping the contractual due date and all other rules.
do $$
declare
  definition text;
  old_threshold text := $text$(documents_due_date + interval '3 days')::date$text$;
  new_threshold text := $text$(documents_due_date + interval '2 days')::date$text$;
begin
  definition := pg_get_functiondef('public.sync_late_documents_fee(uuid)'::regprocedure);
  if position(old_threshold in definition) = 0 then
    raise exception 'Late document fee threshold changed; review patch.';
  end if;
  execute replace(definition, old_threshold, new_threshold);
end $$;
