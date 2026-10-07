-- Run against an installed migration. All test writes are rolled back.
begin;
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where role = 'owner' and aktywne = true limit 1), true);
set local role authenticated;

do $test$
declare
  client_row public.klienci%rowtype;
  template_row public.zadania_cykliczne_realizacje%rowtype;
  outside_period date;
  retained_count bigint;
  settlement_count bigint;
  task_count bigint;
begin
  select k.* into strict client_row
  from public.klienci k
  where k.ostatni_okres_rozliczeniowy is not null
    and k.aktywny = false
    and exists (
      select 1 from public.zadania_cykliczne_realizacje z
      where z.klient_id = k.id
        and z.okres = date_trunc('month', k.ostatni_okres_rozliczeniowy)::date
    )
  order by k.id limit 1;

  select * into strict template_row
  from public.zadania_cykliczne_realizacje
  where klient_id = client_row.id
    and okres = date_trunc('month', client_row.ostatni_okres_rozliczeniowy)::date
  limit 1;
  outside_period := (date_trunc('month', client_row.ostatni_okres_rozliczeniowy) + interval '1 month')::date;
  select count(*) into retained_count from public.zadania_cykliczne_realizacje
    where klient_id = client_row.id and okres = template_row.okres;
  select count(*) into settlement_count from public.rozliczenia_miesieczne
    where klient_id = client_row.id;

  insert into public.zadania_cykliczne_realizacje
    (zadanie_cykliczne_id, klient_id, okres, termin, tytul, status)
  values
    (template_row.zadanie_cykliczne_id, client_row.id, outside_period,
     outside_period + 20, 'Settlement range regression test', 'do_zrobienia');

  -- Saving the same last month, even with a different day, must trigger cleanup.
  update public.klienci
  set ostatni_okres_rozliczeniowy = date_trunc('month', client_row.ostatni_okres_rozliczeniowy)::date + 14
  where id = client_row.id;
  if exists (select 1 from public.zadania_cykliczne_realizacje
             where klient_id = client_row.id and okres >= outside_period) then
    raise exception 'Out-of-range recurring tasks survived client save';
  end if;
  if (select count(*) from public.zadania_cykliczne_realizacje
      where klient_id = client_row.id and okres = template_row.okres) <> retained_count then
    raise exception 'The inclusive last month was changed';
  end if;
  if (select count(*) from public.rozliczenia_miesieczne
      where klient_id = client_row.id) <> settlement_count then
    raise exception 'Settlement history was deleted';
  end if;

  -- Existing generators must not bring the removed month back.
  perform public.ensure_client_recurring_task_realizations(client_row.id, outside_period);
  if exists (select 1 from public.zadania_cykliczne_realizacje
             where klient_id = client_row.id and okres = outside_period) then
    raise exception 'Generation restored an out-of-range task';
  end if;

  -- Repeat the save: reconciliation must be idempotent.
  select count(*) into task_count from public.zadania_cykliczne_realizacje where klient_id = client_row.id;
  update public.klienci set ostatni_okres_rozliczeniowy = ostatni_okres_rozliczeniowy where id = client_row.id;
  if (select count(*) from public.zadania_cykliczne_realizacje where klient_id = client_row.id) <> task_count then
    raise exception 'Repeated reconciliation is not idempotent';
  end if;

  -- A null end date remains open-ended.
  update public.klienci set ostatni_okres_rozliczeniowy = null where id = client_row.id;
  insert into public.zadania_cykliczne_realizacje
    (zadanie_cykliczne_id, klient_id, okres, termin, tytul, status)
  values
    (template_row.zadanie_cykliczne_id, client_row.id, outside_period,
     outside_period + 20, 'Open-ended range regression test', 'do_zrobienia');
  update public.klienci set ostatni_okres_rozliczeniowy = null where id = client_row.id;
  if not exists (select 1 from public.zadania_cykliczne_realizacje
                 where klient_id = client_row.id and okres = outside_period) then
    raise exception 'Open-ended range removed a valid task';
  end if;
  -- A first period in the middle of a month retains that whole month.
  update public.klienci
  set pierwszy_okres_rozliczeniowy = template_row.okres + 14
  where id = client_row.id;
  if exists (select 1 from public.zadania_cykliczne_realizacje
             where klient_id = client_row.id and okres < template_row.okres) then
    raise exception 'Tasks before the first period survived';
  end if;
  if (select count(*) from public.zadania_cykliczne_realizacje
      where klient_id = client_row.id and okres = template_row.okres) <> retained_count then
    raise exception 'The inclusive first month was changed';
  end if;
end;
$test$;
rollback;