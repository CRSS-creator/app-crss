const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('settling A1 allows a new record while preserving revenues and notification history',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create table kadry_a1(id integer primary key,klient_id integer, constraint kadry_a1_client_unique unique(klient_id));
 create table revenues(a1_id integer references kadry_a1(id),amount numeric);
 create table history(a1_id integer references kadry_a1(id),message text);
 insert into kadry_a1 values(1,10); insert into revenues values(1,123); insert into history values(1,'sent');`);
 await db.exec(readFileSync(join(__dirname,'../supabase/migrations/20261002114536_a1_settled_history.sql'),'utf8'));
 await assert.rejects(db.exec(`insert into kadry_a1(id,klient_id) values(2,10)`),/unique/);
 await db.exec(`update kadry_a1 set rozliczona_at=now() where id=1; insert into kadry_a1(id,klient_id) values(2,10)`);
 assert.equal((await db.query('select count(*)::int n from kadry_a1')).rows[0].n,2);
 assert.equal((await db.query('select amount from revenues where a1_id=1')).rows[0].amount,'123');
 assert.equal((await db.query('select message from history where a1_id=1')).rows[0].message,'sent');
 await assert.rejects(db.exec(`insert into kadry_a1(id,klient_id) values(3,10)`),/unique/);
 } finally {await db.close();}
});
