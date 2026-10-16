const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations',fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(x=>x.endsWith('_optimize_settlement_generation_and_notifications.sql'))),'utf8');
const names=['task','crm_follow_up','recurring_task','client_card','rodo_review','onboarding_completion','payroll_contract','payroll_a1','zus_preferential_rate','zus_preference_expiry','zus_small_plus_check','aml_next_verification'];
async function setup(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;create schema cron;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table cron.job(jobid bigint,jobname text);create function cron.unschedule(bigint) returns boolean language sql as $$select true$$;
 create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
 create table profiles(id uuid primary key,akty wne boolean);
 `.replace('akty wne','aktywne'));
 await db.exec(`create table klienci(id uuid primary key,aktywny boolean,status_klienta text,pierwszy_okres_rozliczeniowy date,ostatni_okres_rozliczeniowy date,forma_prawna text,forma_opodatkowania text,czynny_vat boolean,vat_ue boolean,obsluga_kadrowa boolean,opiekun_id uuid,vat_okres_rozliczeniowy text);
 create table rozliczenia_miesieczne(id uuid primary key,klient_id uuid,okres date);
 create table zadania_cykliczne(id uuid primary key,aktywne boolean,klient_id uuid,dzien_miesiaca integer,czestotliwosc text,miesiac_roczny integer,tytul text,opis text,priorytet text,osoba_id uuid,formy_prawne text[],formy_opodatkowania text[],wymaga_czynnego_vat boolean,wymaga_vat_ue boolean,wymaga_obslugi_kadrowej boolean,wymaga_a1 boolean);
 create table zadania_cykliczne_realizacje(id uuid primary key default gen_random_uuid(),zadanie_cykliczne_id uuid,klient_id uuid,rozliczenie_id uuid,okres date,termin date,tytul text,opis text,priorytet text,osoba_id uuid,status text default 'do_zrobienia',unique(zadanie_cykliczne_id,klient_id,okres));
 create table zobowiazania_podatkowe(id uuid primary key default gen_random_uuid(),rozliczenie_id uuid,klient_id uuid,okres date,typ text,nazwa text,termin_platnosci date,updated_at timestamptz default now(),status_pobrania text default 'do_pobrania',status_email text default 'niewyslane',status_sms text default 'niewyslane',kwota numeric,unique(rozliczenie_id,typ));
 create table kadry_a1(id uuid primary key,klient_id uuid);
 create function public.recurring_task_due_date_for_template(date,integer,integer,text) returns date language sql as $$select $1+$2-1$$;
 create function public.tax_obligation_due_date(date,integer) returns date language sql as $$select $1+$2-1$$;
 create function public.client_in_active_period_scope(boolean,text) returns boolean language sql as $$select $1 or $2='onboarding'$$;
 create table calls(name text);`);
 for(const t of ['zadania','klient_karty_formularze','kadry_umowy','zus_przedsiebiorcy_skladki','aml_rejestr_klientow','crm_szanse_sprzedazy','powiadomienia'])await db.exec(`create table ${t}(id uuid primary key default gen_random_uuid(),value text)`);
 for(const n of names)await db.exec(`create function public.create_due_${n}_notifications() returns integer language plpgsql as $$begin insert into public.calls values('${n}');return 1;end$$;`);
 await db.exec(migration);await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',fs.readdirSync(path.join(__dirname,'../supabase/migrations')).find(x=>x.endsWith('_shared_due_notification_generation.sql'))),'utf8'));return db;
}
const user='00000000-0000-0000-0000-000000000001',client='00000000-0000-0000-0000-000000000002',template='00000000-0000-0000-0000-000000000003',settlement='00000000-0000-0000-0000-000000000004';
test('shared notification cache preserves input changes, TTL, scopes, failures and authorization',async()=>{
 const db=await setup();try{
 const run=async()=> (await db.query('select private.refresh_due_notifications_cached() result')).rows[0].result;
 assert.equal((await run()).generated,12);assert.equal((await run()).cached,true);
 await db.exec("insert into zadania(value) values('new task')");assert.equal((await run()).generated,12);
 await db.exec("update zadania set value='changed deadline'");assert.equal((await run()).generated,12);
 await db.exec("delete from zadania");assert.equal((await run()).generated,12);
 await db.exec("update private.due_notification_runs set completed_at=now()-interval '6 minutes'");assert.equal((await run()).generated,12);
 await db.exec(`insert into profiles values('${user}',true);select set_config('test.uid','${user}',false);`);
 assert.equal((await run()).generated,12);assert.equal((await run()).cached,true);
 await db.exec("insert into kadry_umowy(value) values('new contract');create or replace function public.create_due_task_notifications() returns integer language plpgsql as $$begin raise exception 'test failure';end$$;");
 const failed=await run();assert.match(failed.error,/test failure/);assert.equal(failed.generated,11);assert.equal((await run()).cached,false,'failure must be retried');
 await db.exec("select set_config('test.uid','',false)");await assert.rejects(db.query('select public.refresh_due_notifications()'),/Authentication/);
 await db.exec(`select set_config('test.uid','${user}',false);update profiles set aktywne=false`);await assert.rejects(db.query('select public.refresh_due_notifications()'),/Authentication/);
 assert.equal((await db.query("select has_function_privilege('anon','public.refresh_due_notifications()','execute') ok")).rows[0].ok,false);
 }finally{await db.close();}
});
test('settlement preparation skips unchanged writes but updates open tasks, adds clients and preserves completed tasks',async()=>{
 const db=await setup();try{
 await db.exec(`insert into klienci(id,aktywny,opiekun_id,forma_opodatkowania) values('${client}',true,'${user}','Skala podatkowa');
 insert into rozliczenia_miesieczne values('${settlement}','${client}','2026-09-01');
 insert into zadania_cykliczne(id,aktywne,dzien_miesiaca,tytul) values('${template}',true,13,'Deklaracja ZUS DRA');
 create function record_update() returns trigger language plpgsql as $$begin insert into public.calls values(TG_TABLE_NAME);return new;end$$;
 create trigger count_task_updates after update on zadania_cykliczne_realizacje for each row execute function record_update();
 create trigger count_tax_updates after update on zobowiazania_podatkowe for each row execute function record_update();`);
 const run=()=>db.exec("select ensure_recurring_task_realizations('2026-09-01');select ensure_tax_obligations('2026-09-01');");
 await run();await run();assert.equal((await db.query('select * from calls')).rows.length,0);
 await db.exec('update zadania_cykliczne set dzien_miesiaca=18');await run();assert.equal((await db.query('select * from calls')).rows.length,2);
 assert.equal((await db.query('select termin from zadania_cykliczne_realizacje')).rows[0].termin.toISOString().slice(0,10),'2026-09-18');
 assert.equal((await db.query("select termin_platnosci from zobowiazania_podatkowe where typ='ZUS'")).rows[0].termin_platnosci.toISOString().slice(0,10),'2026-09-20');
 await db.exec("update zadania_cykliczne_realizacje set status='zrobione';update zadania_cykliczne set dzien_miesiaca=20;delete from calls");await run();assert.equal((await db.query('select * from calls')).rows.length,0);
 assert.equal((await db.query('select termin from zadania_cykliczne_realizacje')).rows[0].termin.toISOString().slice(0,10),'2026-09-18');
 await db.exec("insert into klienci(id,aktywny,status_klienta) values(gen_random_uuid(),false,'onboarding')");await run();assert.equal((await db.query('select * from zadania_cykliczne_realizacje')).rows.length,2);
 await db.exec("select ensure_recurring_task_realizations('2026-10-01')");assert.equal((await db.query('select * from zadania_cykliczne_realizacje')).rows.length,4);
 }finally{await db.close();}
});
