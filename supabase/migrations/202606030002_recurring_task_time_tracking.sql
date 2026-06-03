create or replace function public.prepare_time_entry()
returns trigger
language plpgsql
as $function$
begin
  if new.ended_at is not null then
    new.duration_seconds := greatest(0, floor(extract(epoch from (new.ended_at - new.started_at)))::integer);
  else
    new.duration_seconds := null;
  end if;

  if new.miesiac_rozliczeniowy is null then
    new.miesiac_rozliczeniowy := date_trunc('month', new.started_at)::date;
  end if;

  if new.zadanie_id is not null then
    select z.klient_id, z.czy_wewnetrzne
    into new.klient_id, new.czy_wewnetrzne
    from public.zadania z
    where z.id = new.zadanie_id;
  elsif new.zadanie_cykliczne_id is not null then
    if new.klient_id is null then
      select zc.klient_id
      into new.klient_id
      from public.zadania_cykliczne zc
      where zc.id = new.zadanie_cykliczne_id;
    end if;

    new.czy_wewnetrzne := new.klient_id is null;
  end if;

  return new;
end;
$function$;
