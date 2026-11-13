begin;
select set_config('request.jwt.claim.sub',(select id::text from profiles where role='owner' and aktywne is not false limit 1),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from profiles where role='owner' and aktywne is not false limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare owner_id uuid := auth.uid(); test_path text; reader record; rejected boolean; readers integer:=0;
begin
 if owner_id is null then raise exception 'Missing owner'; end if;
 test_path := owner_id::text || '/' || gen_random_uuid()::text || '/regression.txt';
 insert into storage.objects(bucket_id,name) values('procedury-wzory',test_path);
 insert into public.procedury_wzory(nazwa,nazwa_pliku,sciezka,rozmiar) values('Regression','regression.txt',test_path,10);
 for reader in select id,role from public.profiles where role in ('manager','admin','accountant','opiekun_ksiegowy','ksiegowy','handlowiec') and aktywne is not false loop
   readers:=readers+1;
   perform set_config('request.jwt.claim.sub',reader.id::text,true);
   perform set_config('request.jwt.claims',jsonb_build_object('sub',reader.id,'role','authenticated')::text,true);
   if not exists(select 1 from public.procedury_wzory where sciezka=test_path) then raise exception 'Team list failed: %',reader.role; end if;
   if not exists(select 1 from storage.objects where bucket_id='procedury-wzory' and name=test_path) then raise exception 'Team download failed: %',reader.role; end if;
   rejected := false;
   begin insert into storage.objects(bucket_id,name) values('procedury-wzory',reader.id::text||'/blocked.txt');
   exception when insufficient_privilege then rejected := true; end;
   if not rejected then raise exception 'Team upload allowed: %',reader.role; end if;
   rejected := false;
   begin insert into public.procedury_wzory(nazwa,nazwa_pliku,sciezka,rozmiar) values('Blocked','blocked.txt',reader.id::text||'/blocked.txt',10);
   exception when insufficient_privilege then rejected := true; end;
   if not rejected then raise exception 'Team metadata insert allowed'; end if;
   rejected := false;
   begin update public.procedury_wzory set nazwa='Changed' where sciezka=test_path;
   exception when insufficient_privilege then rejected := true; end;
   if not rejected then raise exception 'Team update allowed'; end if;
 end loop;
 if readers=0 then raise exception 'No team profiles tested'; end if;
end;
$test$;
set local role anon;
do $test$
begin
 begin perform 1 from public.procedury_wzory; raise exception 'Anonymous metadata read allowed';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from storage.objects where bucket_id='procedury-wzory') then raise exception 'Anonymous file read allowed'; end if;
end;
$test$;
select 'PASS: owner upload, team read/download, team write denied, anonymous denied' result;
rollback;