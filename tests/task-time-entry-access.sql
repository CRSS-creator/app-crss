begin;
do $test$
declare owner_id uuid; accountant_id uuid; task_id uuid; own_time uuid; other_time uuid; correction_id uuid; other_correction uuid; changed integer;
begin
 select id into owner_id from public.profiles where role='owner' and aktywne is not false limit 1;
 select id into accountant_id from public.profiles where role='accountant' and aktywne is not false limit 1;
 if owner_id is null or accountant_id is null then raise exception 'Missing test roles'; end if;
 insert into public.zadania(tytul,status,priorytet,osoba_id,klient_id,czy_wewnetrzne,created_by)
 values('Time edit regression','do_zrobienia','normalny',accountant_id,null,true,owner_id) returning id into task_id;
 insert into public.czas_pracy(zadanie_id,osoba_id,started_at,ended_at)
 values(task_id,accountant_id,'2026-11-19T09:00Z','2026-11-19T10:00Z') returning id into own_time;
 insert into public.czas_pracy(zadanie_id,osoba_id,started_at,ended_at)
 values(task_id,owner_id,'2026-11-19T09:00Z','2026-11-19T10:00Z') returning id into other_time;
 insert into public.korekty_czasu_zadan(zadanie_id,osoba_id,duration_seconds) values(task_id,accountant_id,600) returning id into correction_id;
 insert into public.korekty_czasu_zadan(zadanie_id,osoba_id,duration_seconds) values(task_id,owner_id,600) returning id into other_correction;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 update public.czas_pracy set ended_at='2026-11-19T11:00Z' where id=own_time;
 get diagnostics changed=row_count;
 if changed<>1 or (select duration_seconds from public.czas_pracy where id=own_time)<>7200 then raise exception 'Owner edit or duration recalculation failed'; end if;
 update public.korekty_czasu_zadan set duration_seconds=1200 where id=correction_id;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Owner correction edit failed'; end if;
 perform set_config('request.jwt.claim.sub',accountant_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',accountant_id,'role','authenticated')::text,true);
 update public.czas_pracy set opis='own edit' where id=own_time;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Own time edit failed'; end if;
 update public.czas_pracy set opis='forbidden' where id=other_time;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Other worker time edit allowed'; end if;
 update public.korekty_czasu_zadan set duration_seconds=1800 where id=correction_id;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'Own correction edit failed'; end if;
 update public.korekty_czasu_zadan set duration_seconds=1800 where id=other_correction;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Other worker correction edit allowed'; end if;
end;
$test$;
select 'PASS: owner team edits, own edits, denied cross-worker edits, duration recalculation' result;
rollback;