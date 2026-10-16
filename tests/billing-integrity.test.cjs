const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = readFileSync(join(__dirname, '../supabase/migrations/20260929143601_durable_settlement_fee_billing.sql'), 'utf8');
const reconcileMigration = readFileSync(join(__dirname, '../supabase/migrations/20260929150118_reconcile_existing_invoice_drafts.sql'), 'utf8');
const mksSeptemberMigration = readFileSync(join(__dirname, '../supabase/migrations/20261001061713_mks_jedynka_september_arrears.sql'), 'utf8');
const descriptionMigration = readFileSync(join(__dirname, '../supabase/migrations/20261001063401_document_fee_description.sql'), 'utf8');
const quantityMigration = readFileSync(join(__dirname, '../supabase/migrations/20261001064419_document_fee_quantity_unit_price.sql'), 'utf8');
const schema = `
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create table klienci (id uuid primary key default gen_random_uuid(), nazwa text default 'Test', nip text,
 email text, abonament numeric default 100, model_fakturowania text default 'z_dolu',
 obsluga_kadrowa boolean default false, limit_dokumentow integer default 10,
 koszt_dodatkowego_dokumentu numeric default 20, koszt_obslugi_pracownika numeric default 0,
 koszt_obslugi_zleceniobiorcy numeric default 0);
create table rozliczenia_miesieczne (id uuid primary key default gen_random_uuid(), klient_id uuid references klienci,
 okres date, status_ksiegowosci text, liczba_dokumentow integer default 10, liczba_pracownikow integer default 0,
 liczba_zleceniobiorcow integer default 0, faktura_wystawiona boolean default false,
 data_dostarczenia_dokumentow date);
create table faktury (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
 numer text, klient_id uuid references klienci, typ text default 'sprzedaz', status text default 'szkic', zrodlo text default 'aplikacja',
 data_wystawienia date, data_sprzedazy date, termin_platnosci date, okres date, automatyczna boolean default false,
 kontrahent_nazwa text, kontrahent_nip text, kontrahent_email text, waluta text, kwota_netto numeric,
 kwota_vat numeric, kwota_brutto numeric, opis text, wfirma_sync_status text default 'nie_wyslano',
 wfirma_sync_error text, wfirma_id text, created_by uuid, kategoria text default 'standardowa');
create unique index auto_invoice on faktury(klient_id,okres)
 where automatyczna=true and klient_id is not null and okres is not null;
create table rozliczenia_oplaty_dodatkowe (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
 rozliczenie_id uuid references rozliczenia_miesieczne, oplata_id uuid,nazwa text,kwota_netto numeric,ilosc numeric default 1,
 uwagi text,created_by uuid, faktura_id uuid references faktury on delete set null,fakturowane_at timestamptz);
create table faktury_pozycje (id uuid primary key default gen_random_uuid(),faktura_id uuid references faktury on delete cascade,
 source_key text, rozliczenie_oplata_id uuid references rozliczenia_oplaty_dodatkowe on delete set null,
 nazwa text not null,ilosc numeric,jednostka text,cena_netto numeric,stawka_vat text,kwota_netto numeric,
 kwota_vat numeric,kwota_brutto numeric,sort_order integer,cfo_przychod_kategoria text);
create unique index line_source on faktury_pozycje(faktura_id,source_key) where source_key is not null;
create unique index line_fee on faktury_pozycje(rozliczenie_oplata_id) where rozliczenie_oplata_id is not null;
create function polish_month_label(date) returns text language sql as $$select to_char($1,'YYYY-MM')$$;
create function is_apc_marek_hebel_client(text,text) returns boolean language sql as $$select false$$;
create function is_cassubian_client(text,text) returns boolean language sql as $$select false$$;
create function prevent_duplicate_standard_invoice_draft() returns trigger language plpgsql as $$
begin
 if new.status='szkic' and new.zrodlo='aplikacja' and new.wfirma_id is null
   and new.kategoria='standardowa' and exists(select 1 from faktury i
     where i.klient_id=new.klient_id and i.okres=new.okres and i.id<>new.id
       and i.kategoria='standardowa' and i.status<>'anulowana') then
   raise exception 'Istnieje juz standardowa faktura lub szkic za ten okres.';
 end if;
 return new;
end $$;
create trigger prevent_duplicate_standard_invoice_draft before insert or update on faktury
for each row execute function prevent_duplicate_standard_invoice_draft();
`;

async function setup(model='z_dolu', beforeMigration='') {
 const db = new PGlite();
 await db.exec(schema);
 if (beforeMigration) await db.exec(beforeMigration);
 await db.exec(migration);
 await db.exec(reconcileMigration);
 await db.exec(descriptionMigration);
 await db.exec(quantityMigration);
 await db.exec(readFileSync(join(__dirname, "../supabase/migrations", readdirSync(join(__dirname,"../supabase/migrations")).find(name=>name.endsWith("_reconcile_wfirma_fee_vat_by_identity.sql"))),"utf8"));
 const client=(await db.query('insert into klienci(model_fakturowania) values ($1) returning id',[model])).rows[0].id;
 async function settlement(period,docs=10) {
  return (await db.query('insert into rozliczenia_miesieczne(klient_id,okres,liczba_dokumentow) values ($1,$2,$3) returning id',[client,period,docs])).rows[0].id;
 }
 async function invoice(id) {
  return (await db.query('select ensure_invoice_for_settlement($1) id',[id])).rows[0].id;
 }
 return {db,client,settlement,invoice};
}

test('upfront document fees appear in next period exactly once', async()=>{
 const {db,settlement,invoice}=await setup('z_gory');
 try {
  const sep=await settlement('2026-09-01',23);
  const inv=await invoice(sep);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),100);
  const oct=await settlement('2026-10-01');
  const next=await invoice(oct);
  await invoice(oct);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[next])).rows[0].kwota_netto),360);
  const documentLines=(await db.query('select * from faktury_pozycje where rozliczenie_oplata_id is not null')).rows;
  assert.equal(documentLines.length,1);
  assert.equal(Number(documentLines[0].ilosc),13);
  assert.equal(Number(documentLines[0].cena_netto),20);
 } finally {await db.close();}
});

test('documents and manual fees added after issue survive to next invoice', async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const sep=await settlement('2026-09-01',12);
  const inv=await invoice(sep);
  await db.query("update faktury set wfirma_id='remote',status='wystawiona' where id=$1",[inv]);
  await db.query('update rozliczenia_miesieczne set liczba_dokumentow=15 where id=$1',[sep]);
  await db.query("insert into rozliczenia_oplaty_dodatkowe(rozliczenie_id,nazwa,kwota_netto) values ($1,'Korekta',200)",[sep]);
  await invoice(sep); // must not mutate issued invoice
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),140);
  const next=await invoice(await settlement('2026-10-01'));
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[next])).rows[0].kwota_netto),360);
 } finally {await db.close();}
});

test('send reconciles draft before claiming, and a queued fee cannot be deleted', async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const sep=await settlement('2026-09-01');
  const inv=await invoice(sep);
  await db.query('update rozliczenia_miesieczne set liczba_dokumentow=15 where id=$1',[sep]);
  const claimed=(await db.query('select claim_invoice_for_billing($1) value',[inv])).rows[0].value;
  assert.equal(Number(claimed.kwota_netto),200);
  assert.equal((await db.query('select claim_invoice_for_billing($1) value',[inv])).rows[0].value,null);
  await assert.rejects(db.query('delete from rozliczenia_oplaty_dodatkowe where faktura_id=$1',[inv]),/wysyłanej/);
 } finally {await db.close();}
});

test('remote snapshot preserves fee identity and rolls back if fee disappears', async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const inv=await invoice(await settlement('2026-09-01',15));
  const before=(await db.query('select * from faktury_pozycje where faktura_id=$1 order by sort_order',[inv])).rows;
  const remote=before.map((p,n)=>({...p,source_key:`wfirma:${n}`}));
  await db.query('select replace_wfirma_invoice_lines($1,$2)',[inv,JSON.stringify(remote)]);
  const fee=before.find(p=>p.rozliczenie_oplata_id).rozliczenie_oplata_id;
  assert.equal((await db.query('select faktura_id from faktury_pozycje where rozliczenie_oplata_id=$1',[fee])).rows[0].faktura_id,inv);
  await assert.rejects(db.query('select replace_wfirma_invoice_lines($1,$2)',[inv,JSON.stringify(remote.slice(0,1))]),/nie ma zgodnej pozycji/);
  assert.equal((await db.query('select * from faktury_pozycje where faktura_id=$1',[inv])).rows.length,2);
 } finally {await db.close();}
});

test('a fee added while sending is carried forward without changing the claimed invoice',async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const sep=await settlement('2026-09-01',12);
  const inv=await invoice(sep);
  await db.query('select claim_invoice_for_billing($1)',[inv]);
  await db.query('update rozliczenia_miesieczne set liczba_dokumentow=15 where id=$1',[sep]);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),140);
  const next=await invoice(await settlement('2026-10-01'));
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[next])).rows[0].kwota_netto),160);
 } finally {await db.close();}
});

test('deleting a local draft releases its fees, but deleting issued fees is rejected',async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const sep=await settlement('2026-09-01',12);
  const inv=await invoice(sep);
  await db.query('select delete_local_invoice_draft($1)',[inv]);
  assert.equal((await db.query('select faktura_id from rozliczenia_oplaty_dodatkowe')).rows[0].faktura_id,null);
  const rebuilt=await invoice(sep);
  await db.query("update faktury set wfirma_id='issued',status='wystawiona' where id=$1",[rebuilt]);
  await assert.rejects(db.query('select delete_local_invoice_draft($1)',[rebuilt]),/lokalny szkic/);
  await assert.rejects(db.query('delete from faktury_pozycje where rozliczenie_oplata_id is not null'),/powiązanej opłaty/);
 } finally {await db.close();}
});

test('deleting an unissued manual fee removes its draft line instead of billing a deleted service',async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const sep=await settlement('2026-09-01');
  const fee=(await db.query("insert into rozliczenia_oplaty_dodatkowe(rozliczenie_id,nazwa,kwota_netto) values($1,'Korekta',200) returning id",[sep])).rows[0].id;
  const inv=await invoice(sep);
  await db.query('delete from rozliczenia_oplaty_dodatkowe where id=$1',[fee]);
  const claimed=(await db.query('select claim_invoice_for_billing($1) value',[inv])).rows[0].value;
  assert.equal(Number(claimed.kwota_netto),100);
  assert.equal(claimed.faktury_pozycje.length,1);
 } finally {await db.close();}
});

test('historical waiver is preserved and only IDIL August is released for September',async()=>{
 const {db}=await setup('z_dolu',`
 insert into klienci(id,model_fakturowania) values ('00000000-0000-0000-0000-000000000001','z_gory');
 insert into rozliczenia_miesieczne(id,klient_id,okres,liczba_dokumentow) values
 ('e25591e4-5e66-47ad-8198-ff1be4b6d761','00000000-0000-0000-0000-000000000001','2026-07-01',11),
 ('80a52328-db8d-4ac5-bbe7-bcdf09fc9918','00000000-0000-0000-0000-000000000001','2026-08-01',23);`);
 try {
  const fees=(await db.query('select * from rozliczenia_oplaty_dodatkowe')).rows;
  assert.equal(fees.length,1);
  assert.equal(fees[0].rozliczenie_id,'80a52328-db8d-4ac5-bbe7-bcdf09fc9918');
  assert.equal(Number(fees[0].kwota_netto),20);
  assert.equal(Number(fees[0].ilosc),13);
  assert.equal(fees[0].billing_period.toISOString().slice(0,10),'2026-09-01');
  assert.equal(fees[0].billing_hold_reason,null);
 } finally {await db.close();}
});

test('zero subscription does not suppress additional services',async()=>{
 const {db,client,settlement,invoice}=await setup();
 try {
  await db.query('update klienci set abonament=0 where id=$1',[client]);
  const inv=await invoice(await settlement('2026-09-01',12));
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),40);
 } finally {await db.close();}
});

test('a failed send and retry consolidates late document deltas without double charging',async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const sep=await settlement('2026-09-01',12);
  const inv=await invoice(sep);
  await db.query('select claim_invoice_for_billing($1)',[inv]);
  await db.query('update rozliczenia_miesieczne set liczba_dokumentow=15 where id=$1',[sep]);
  await db.query("update faktury set wfirma_sync_status='blad' where id=$1",[inv]);
  await invoice(sep);
  assert.equal(Number((await db.query('select sum(kwota_netto*ilosc) net from rozliczenia_oplaty_dodatkowe')).rows[0].net),100);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),200);
 } finally {await db.close();}
});

test('a late caretaker fee automatically refreshes an existing next-period draft',async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const sep=await settlement('2026-09-01');
  const first=await invoice(sep);
  await db.query("update faktury set wfirma_id='issued',status='wystawiona' where id=$1",[first]);
  const next=await invoice(await settlement('2026-10-01'));
  await db.query("insert into rozliczenia_oplaty_dodatkowe(rozliczenie_id,nazwa,kwota_netto) values($1,'Korekta',200)",[sep]);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[next])).rows[0].kwota_netto),300);
 } finally {await db.close();}
});

test('MKS September waits for completion and October returns to upfront billing',async()=>{
 const {db,client,settlement,invoice}=await setup('z_gory');
 try {
  await db.query("update klienci set nip='9721378590' where id=$1",[client]);
  const sep=await settlement('2026-09-01',13);
  const premature=await invoice(sep);
  assert.ok(premature);
  await db.exec(readFileSync(join(__dirname,'fixtures/create-invoice-after-taxes-sent.sql'),'utf8'));
  await db.exec(`
    create function has_existing_standard_wfirma_invoice(uuid,date) returns boolean language sql as $$
      select exists(select 1 from faktury where klient_id=$1 and okres=$2 and wfirma_id is not null)$$;
    create function invoice_issue_date_for_settlement(uuid,date) returns date language sql as $$select $2$$;
    create trigger invoice_after_taxes_sent after update of status_ksiegowosci on rozliczenia_miesieczne
      for each row execute function create_invoice_after_taxes_sent();
  `);
  await db.exec(mksSeptemberMigration);
  assert.equal((await db.query('select id from faktury where id=$1',[premature])).rows.length,0);
  assert.equal(await invoice(sep),null);
  assert.equal(Number((await db.query('select sum(kwota_netto*ilosc) net from rozliczenia_oplaty_dodatkowe where rozliczenie_id=$1',[sep])).rows[0].net),60);
  await db.query("update rozliczenia_miesieczne set status_ksiegowosci='podatki_wyslane' where id=$1",[sep]);
  const completed=(await db.query("select kwota_netto from faktury where klient_id=$1 and okres='2026-09-01'",[client])).rows;
  assert.equal(completed.length,1);
  assert.equal(Number(completed[0].kwota_netto),160);
  const oct=await settlement('2026-10-01',12);
  const upfront=await invoice(oct);
  assert.ok(upfront);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[upfront])).rows[0].kwota_netto),100);
  assert.equal((await db.query('select model_fakturowania from klienci where id=$1',[client])).rows[0].model_fakturowania,'z_gory');
 } finally {await db.close();}
});

test('refresh repairs stale fee VAT only for a unique unchanged wFirma line identity', async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const inv=await invoice(await settlement('2026-09-01',15));
  await db.query("update faktury_pozycje set source_key='wfirma:1565336139',kwota_vat=0,kwota_brutto=kwota_netto,cfo_przychod_kategoria='abonamenty' where faktura_id=$1 and rozliczenie_oplata_id is not null",[inv]);
  const before=(await db.query('select * from faktury_pozycje where faktura_id=$1 order by sort_order',[inv])).rows;
  const feeIndex=before.findIndex(p=>p.rozliczenie_oplata_id);
  const feeId=before[feeIndex].rozliczenie_oplata_id;
  const remote=before.map(p=>({...p}));
  remote[feeIndex].kwota_vat=Number(remote[feeIndex].kwota_netto)*0.23;
  remote[feeIndex].kwota_brutto=Number(remote[feeIndex].kwota_netto)+remote[feeIndex].kwota_vat;
  for(const patch of [{source_key:'wfirma:9999'},{nazwa:'Different fee'},{ilosc:2},{kwota_netto:999},{kwota_brutto:999}]) {
   const changed=remote.map((p,i)=>i===feeIndex?{...p,...patch}:p);
   await assert.rejects(db.query('select replace_wfirma_invoice_lines($1,$2)',[inv,JSON.stringify(changed)]),/nie ma zgodnej pozycji/);
  }
  await assert.rejects(db.query('select replace_wfirma_invoice_lines($1,$2)',[inv,JSON.stringify([...remote,remote[feeIndex]])]),/nie ma zgodnej pozycji/);
  assert.equal(Number((await db.query('select kwota_vat from faktury_pozycje where rozliczenie_oplata_id=$1',[feeId])).rows[0].kwota_vat),0);
  await db.query('select replace_wfirma_invoice_lines($1,$2)',[inv,JSON.stringify(remote)]);
  await db.query('select replace_wfirma_invoice_lines($1,$2)',[inv,JSON.stringify(remote)]);
  const saved=(await db.query('select * from faktury_pozycje where rozliczenie_oplata_id=$1',[feeId])).rows;
  assert.equal(saved.length,1);
  assert.equal(Number(saved[0].kwota_vat),remote[feeIndex].kwota_vat);
  assert.equal(saved[0].cfo_przychod_kategoria,'abonamenty');
  assert.equal((await db.query('select faktura_id from rozliczenia_oplaty_dodatkowe where id=$1',[feeId])).rows[0].faktura_id,inv);
 } finally {await db.close();}
});

test('confirmed remote removals preserve billing history and snapshot errors roll back header and lines', async()=>{
 const {db,settlement,invoice}=await setup();
 try {
  const period=await settlement('2026-09-01');
  for(const [name,net] of [['Korekta deklaracji',200],['Opłata za nieterminowe dostarczenie dokumentów',150],['Other fee',300]])
   await db.query('insert into rozliczenia_oplaty_dodatkowe(rozliczenie_id,nazwa,kwota_netto) values ($1,$2,$3)',[period,name,net]);
  const inv=await invoice(period);
  await db.query("update faktury set numer='FV 45/10/2026',kontrahent_nazwa='Stowarzyszenie Pomerania Sports',wfirma_id='test-remote',status='wystawiona' where id=$1",[inv]);
  await db.exec('alter table faktury add column wfirma_url text,add column wfirma_synced_at timestamptz,add column wfirma_pdf_path text,add column wfirma_pdf_name text,add column wfirma_pdf_synced_at timestamptz');
  const file=readdirSync(join(__dirname,'../supabase/migrations')).find(n=>n.endsWith('_reconcile_confirmed_wfirma_fee_removals.sql'));
  await db.exec(readFileSync(join(__dirname,'../supabase/migrations',file),'utf8'));
  const descriptionFile=readdirSync(join(__dirname,'../supabase/migrations')).find(n=>n.endsWith('_sync_wfirma_invoice_description.sql'));
  await db.exec(readFileSync(join(__dirname,'../supabase/migrations',descriptionFile),'utf8'));
  const before=(await db.query('select * from faktury_pozycje where faktura_id=$1 order by sort_order',[inv])).rows;
  const remote=before.filter(p=>!['Korekta deklaracji','Opłata za nieterminowe dostarczenie dokumentów'].includes(p.nazwa));
  await assert.rejects(db.query('select sync_wfirma_invoice_snapshot($1,$2,$3)',[inv,JSON.stringify({kwota_netto:100,kwota_brutto:100,kwota_vat:0}),JSON.stringify(remote.filter(p=>p.nazwa!=='Other fee'))]),/nie ma zgodnej pozycji/);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),750);
  assert.equal((await db.query('select * from faktury_pozycje where faktura_id=$1',[inv])).rows.length,4);
  for(let n=0;n<2;n++) await db.query('select sync_wfirma_invoice_snapshot($1,$2,$3)',[inv,JSON.stringify({kwota_netto:400,kwota_brutto:492,kwota_vat:92,opis:"Opis bez usuniętych opłat"}),JSON.stringify(remote)]);
  assert.equal((await db.query('select * from faktury_pozycje where faktura_id=$1',[inv])).rows.length,2);
  assert.equal((await db.query('select * from rozliczenia_oplaty_dodatkowe where faktura_id=$1 and wfirma_removal_confirmed',[inv])).rows.length,2);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),400);
  assert.equal((await db.query('select opis from faktury where id=$1',[inv])).rows[0].opis,'Opis bez usuniętych opłat');
  await db.query('select sync_wfirma_invoice_snapshot($1,$2,$3)',[inv,JSON.stringify({opis:null}),JSON.stringify(remote)]);
  assert.equal((await db.query('select opis from faktury where id=$1',[inv])).rows[0].opis,null);
  const safeFile=readdirSync(join(__dirname,'../supabase/migrations')).find(n=>n.endsWith('_safe_external_invoice_edits.sql'));
  await db.exec(readFileSync(join(__dirname,'../supabase/migrations',safeFile),'utf8'));
  const rpc=(header,lines)=>db.query('select sync_wfirma_invoice_snapshot($1,$2,$3)',[inv,JSON.stringify(header),JSON.stringify(lines)]);
  const header={kwota_netto:400,kwota_vat:92,kwota_brutto:492,opis:'Aktualny opis'};
  const stable=remote.map((p,i)=>({...p,source_key:'wfirma:'+ (100+i)}));
  await rpc(header,stable);
  const fee=stable.find(p=>p.nazwa==='Other fee');
  const changed=stable.map(p=>p===fee?{...p,nazwa:'Zmieniony opis opłaty',kwota_netto:250,cena_netto:250,kwota_vat:57.5,kwota_brutto:307.5}:p);
  const changedHeader={...header,kwota_netto:350,kwota_vat:80.5,kwota_brutto:430.5};
  await rpc(changedHeader,changed);
  assert.equal((await db.query('select nazwa from faktury_pozycje where rozliczenie_oplata_id=$1',[fee.rozliczenie_oplata_id])).rows[0].nazwa,'Zmieniony opis opłaty');
  const historyCount=async()=>Number((await db.query('select count(*) n from wfirma_invoice_sync_history')).rows[0].n);
  const auditCount=await historyCount();
  await rpc(changedHeader,changed);
  assert.equal(await historyCount(),auditCount,'unchanged refresh is idempotent');
  await assert.rejects(rpc({...changedHeader,kwota_netto:999},changed),/niespójne/);
  assert.equal(await historyCount(),auditCount);
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[inv])).rows[0].kwota_netto),350);
  const remaining=changed.filter(p=>p.rozliczenie_oplata_id!==fee.rozliczenie_oplata_id);
  await rpc({...header,kwota_netto:100,kwota_vat:23,kwota_brutto:123},remaining);
  const held=(await db.query('select * from rozliczenia_oplaty_dodatkowe where id=$1',[fee.rozliczenie_oplata_id])).rows[0];
  assert.equal(held.faktura_id,inv);
  assert.equal(held.wfirma_removal_confirmed,true);
  assert.ok(held.billing_hold_reason);
  assert.equal((await db.query('select * from faktury_pozycje where faktura_id=$1',[inv])).rows.length,1);
  assert.equal(await historyCount(),auditCount+1);
  await rpc({kwota_netto:0,kwota_vat:0,kwota_brutto:0,opis:null},[]);
  assert.equal((await db.query('select * from faktury_pozycje where faktura_id=$1',[inv])).rows.length,0);
  const next=await invoice(await settlement('2026-10-01'));
  assert.equal(Number((await db.query('select kwota_netto from faktury where id=$1',[next])).rows[0].kwota_netto),100);
 } finally {await db.close();}
});
