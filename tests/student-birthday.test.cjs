const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const sql=name=>readFileSync(join(__dirname,'../supabase/migrations',name),'utf8');
test('birthday scheduler uses business days, preserves card reminders, and excludes inactive contracts',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role authenticated;
 create table klienci(id integer primary key,nazwa text,nip text,opiekun_id integer,aktywny boolean);
 create table kadry_umowy(id integer primary key,klient_id integer,imie text,nazwisko text,typ_umowy text,numer_umowy text,
 data_poczatku date,data_konca date,umowa_na_czas_nieokreslony boolean,legitymacja_studencka_wazna_do date,
 badania_lekarskie_wazne_do date,szkolenie_bhp_wazne_do date,archived_at timestamptz);
 create table powiadomienia(type text,title text,body text,priority text,related_table text,related_id integer,recipient_id integer,metadata jsonb);
 insert into klienci values(1,'Test','123',7,true);`);
 await db.exec(sql('20260717112955_payroll_notifications_business_days.sql'));
 await db.exec(sql('20261002113637_student_26_birthday.sql'));
 await db.exec(`insert into kadry_umowy(id,klient_id,imie,nazwisko,typ_umowy,data_urodzenia) values
 (1,1,'Test','Student','student','2000-10-05'),(2,1,'Test','Archived','student','2000-10-05'),
 (3,1,'Test','Ended','student','2000-10-05'),(4,1,'Test','Unknown','student',null),
 (5,1,'Test','Other','umowa_o_prace','2000-10-05'),(6,1,'Test','Leap','student','2000-02-29');
 update kadry_umowy set archived_at=now() where id=2;
 update kadry_umowy set data_konca='2026-08-31' where id=3;
 update kadry_umowy set legitymacja_studencka_wazna_do='2026-10-05' where id=1;`);
 assert.equal((await db.query(`select data_26_urodzin::text as d from kadry_umowy where id=6`)).rows[0].d,'2026-02-28');
 assert.equal((await db.query(`select create_due_payroll_contract_notifications('2026-09-29') as n`)).rows[0].n,0);
 assert.equal((await db.query(`select create_due_payroll_contract_notifications('2026-09-30') as n`)).rows[0].n,2);
 assert.equal((await db.query(`select create_due_payroll_contract_notifications('2026-09-30') as n`)).rows[0].n,0);
 const rows=(await db.query(`select * from powiadomienia where metadata->>'date_kind'='student_26_birthday'`)).rows;
 assert.equal(rows.length,1); assert.equal(rows[0].recipient_id,7); assert.equal(rows[0].related_id,1);
 assert.match(rows[0].body,/zbliża się: ukończenie 26 lat/);
 } finally {await db.close();}
});
