const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = readFileSync(join(__dirname, '../supabase/migrations/20260929143601_durable_settlement_fee_billing.sql'), 'utf8');
const reconcileMigration = readFileSync(join(__dirname, '../supabase/migrations/20260929150118_reconcile_existing_invoice_drafts.sql'), 'utf8');
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
 klient_id uuid references klienci, typ text default 'sprzedaz', status text default 'szkic', zrodlo text default 'aplikacja',
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
  assert.equal((await db.query('select * from faktury_pozycje where rozliczenie_oplata_id is not null')).rows.length,1);
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
  assert.equal(Number(fees[0].kwota_netto),260);
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
