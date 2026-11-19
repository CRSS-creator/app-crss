begin;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='owner' and aktywne is not false limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where role='owner' and aktywne is not false limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare task_id uuid; client_id uuid;
begin
 select id into client_id from public.klienci limit 1;
 insert into public.zadania(tytul,status,priorytet,osoba_id,klient_id,czy_wewnetrzne,czy_roczne,created_by)
 values('Annual task regression','do_zrobienia','normalny',auth.uid(),client_id,false,true,auth.uid()) returning id into task_id;
 if not exists(select 1 from public.zadania where id=task_id and czy_roczne) then raise exception 'Annual flag save failed'; end if;
 update public.zadania set czy_roczne=false where id=task_id;
 if not exists(select 1 from public.zadania where id=task_id and not czy_roczne) then raise exception 'Annual flag toggle failed'; end if;
end;
$test$;
select 'PASS: authenticated create/read/update annual task flag' result;
rollback;
