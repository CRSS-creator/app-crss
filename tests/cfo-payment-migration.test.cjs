const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('payment migration preserves verified dates, rejects future payments and enforces owner-only obligations', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create function public.current_user_role() returns text language sql as $$select current_setting('test.user_role',true)$$;
      create table public.profiles(id uuid primary key);
      create table public.faktury(id uuid primary key, status text, kwota_brutto numeric);
      create table public.cfo_koszty(id uuid primary key, kwota_brutto numeric, kwota_netto_cfo numeric);
      create table public.cfo_transakcje_bankowe(id uuid primary key, koszt_id uuid, faktura_id uuid, kwota numeric, data_ksiegowania date, ignoruj boolean, rozbita boolean, typ text);
      create table public.cfo_rozbicia_platnosci(transakcja_id uuid, koszt_id uuid, faktura_id uuid, kwota numeric, poza_kosztem_cfo boolean, typ text);
      insert into public.cfo_koszty values ('00000000-0000-0000-0000-000000000001',123,100),('00000000-0000-0000-0000-000000000002',123,100);
      insert into public.faktury values ('00000000-0000-0000-0000-000000000003','oplacona',123),('00000000-0000-0000-0000-000000000004','oplacona',123);
      insert into public.cfo_transakcje_bankowe values
        ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001',null,-123,'2026-01-15',false,false,'koszt'),
        ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002',null,-20,'2026-01-16',false,false,'koszt'),
        ('00000000-0000-0000-0000-000000000013',null,'00000000-0000-0000-0000-000000000003',123,'2026-01-17',false,false,'faktura_sprzedazowa');
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20261019113712_cfo_document_payment_dates.sql', 'utf8'));
    const costs = (await db.query('select data_zaplaty::text date from cfo_koszty order by id')).rows;
    assert.equal(costs[0].date, '2026-01-15'); assert.equal(costs[1].date, null);
    const invoices = (await db.query('select data_zaplaty::text date from faktury order by id')).rows;
    assert.equal(invoices[0].date, '2026-01-17'); assert.equal(invoices[1].date, null);
    assert.equal((await db.query('select count(*)::int n from cfo_transakcje_bankowe')).rows[0].n, 3);
    await assert.rejects(db.exec("update cfo_koszty set data_zaplaty='2999-01-01'"), /check constraint/);
    await db.exec("set test.user_role='owner'; set role authenticated;");
    await db.exec("insert into cfo_zobowiazania(okres,typ,kwota,termin_platnosci) values ('2026-01-01','vat',100,'2026-02-25')");
    await db.exec("insert into cfo_zobowiazania(okres,typ,kwota,termin_platnosci) values ('2026-01-01','vat',200,'2026-02-25') on conflict(okres,typ) do update set kwota=excluded.kwota");
    assert.equal((await db.query('select kwota::float8 amount from cfo_zobowiazania')).rows[0].amount, 200);
    await assert.rejects(db.exec("insert into cfo_zobowiazania(okres,typ,kwota) values ('2026-02-01','vat',-1)"), /check constraint/);
    await db.exec("set test.user_role='accountant'");
    assert.equal((await db.query('select * from cfo_zobowiazania')).rows.length, 0);
    await assert.rejects(db.exec("insert into cfo_zobowiazania(okres,typ,kwota) values ('2026-02-01','vat',100)"), /row-level security/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from cfo_zobowiazania'), /permission denied/);
  } finally { await db.close(); }
});
