const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const schema = "\ncreate role anon; create role authenticated; create role service_role;\ncreate schema auth;\ncreate function auth.uid() returns uuid language sql as $$select null::uuid$$;\ncreate table klienci (id uuid primary key default gen_random_uuid(), nazwa text default 'Test', nip text,\n email text, abonament numeric default 100, model_fakturowania text default 'z_dolu',\n obsluga_kadrowa boolean default false, limit_dokumentow integer default 10,\n koszt_dodatkowego_dokumentu numeric default 20, koszt_obslugi_pracownika numeric default 0,\n koszt_obslugi_zleceniobiorcy numeric default 0);\ncreate table rozliczenia_miesieczne (id uuid primary key default gen_random_uuid(), klient_id uuid references klienci,\n okres date, status_ksiegowosci text, liczba_dokumentow integer default 10, liczba_pracownikow integer default 0,\n liczba_zleceniobiorcow integer default 0, faktura_wystawiona boolean default false,\n data_dostarczenia_dokumentow date);\ncreate table faktury (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),\n numer text, klient_id uuid references klienci, typ text default 'sprzedaz', status text default 'szkic', zrodlo text default 'aplikacja',\n data_wystawienia date, data_sprzedazy date, termin_platnosci date, okres date, automatyczna boolean default false,\n kontrahent_nazwa text, kontrahent_nip text, kontrahent_email text, waluta text, kwota_netto numeric,\n kwota_vat numeric, kwota_brutto numeric, opis text, wfirma_sync_status text default 'nie_wyslano',\n wfirma_sync_error text, wfirma_id text, created_by uuid, kategoria text default 'standardowa');\ncreate unique index auto_invoice on faktury(klient_id,okres)\n where automatyczna=true and klient_id is not null and okres is not null;\ncreate table rozliczenia_oplaty_dodatkowe (id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),\n rozliczenie_id uuid references rozliczenia_miesieczne, oplata_id uuid,nazwa text,kwota_netto numeric,ilosc numeric default 1,\n uwagi text,created_by uuid, faktura_id uuid references faktury on delete set null,fakturowane_at timestamptz);\ncreate table faktury_pozycje (id uuid primary key default gen_random_uuid(),faktura_id uuid references faktury on delete cascade,\n source_key text, rozliczenie_oplata_id uuid references rozliczenia_oplaty_dodatkowe on delete set null,\n nazwa text not null,ilosc numeric,jednostka text,cena_netto numeric,stawka_vat text,kwota_netto numeric,\n kwota_vat numeric,kwota_brutto numeric,sort_order integer,cfo_przychod_kategoria text);\ncreate unique index line_source on faktury_pozycje(faktura_id,source_key) where source_key is not null;\ncreate unique index line_fee on faktury_pozycje(rozliczenie_oplata_id) where rozliczenie_oplata_id is not null;\ncreate function polish_month_label(date) returns text language sql as $$select to_char($1,'YYYY-MM')$$;\ncreate function is_apc_marek_hebel_client(text,text) returns boolean language sql as $$select false$$;\ncreate function is_cassubian_client(text,text) returns boolean language sql as $$select false$$;\ncreate function prevent_duplicate_standard_invoice_draft() returns trigger language plpgsql as $$\nbegin\n if new.status='szkic' and new.zrodlo='aplikacja' and new.wfirma_id is null\n   and new.kategoria='standardowa' and exists(select 1 from faktury i\n     where i.klient_id=new.klient_id and i.okres=new.okres and i.id<>new.id\n       and i.kategoria='standardowa' and i.status<>'anulowana') then\n   raise exception 'Istnieje juz standardowa faktura lub szkic za ten okres.';\n end if;\n return new;\nend $$;\ncreate trigger prevent_duplicate_standard_invoice_draft before insert or update on faktury\nfor each row execute function prevent_duplicate_standard_invoice_draft();\n";
const read = name => readFileSync(join(__dirname, '../supabase/migrations', name), 'utf8');
async function setup(model = 'z_dolu', enabled = true) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(read('20260929143601_durable_settlement_fee_billing.sql'));
  await db.exec("alter table faktury add column opis_reczny boolean not null default false; alter table faktury_pozycje add column reczna_edycja boolean not null default false;");
  await db.exec(read('20261105100000_client_subscription_tiers.sql'));
  const client = (await db.query(`insert into klienci(model_fakturowania, abonament, limit_dokumentow, koszt_dodatkowego_dokumentu, kilka_abonamentow, abonamenty_progi, abonamenty_od)
    values ($1,300,10,15,$2,$3::jsonb,$4) returning id`, [model,enabled, enabled ? '[{"abonament":300,"limit_dokumentow":10},{"abonament":500,"limit_dokumentow":30}]' : '[]', enabled ? '2026-11-01' : null])).rows[0].id;
  async function settlement(period, docs) {
    return (await db.query('insert into rozliczenia_miesieczne(klient_id,okres,liczba_dokumentow) values ($1,$2,$3) returning id', [client,period,docs])).rows[0].id;
  }
  async function invoice(id) { return (await db.query('select ensure_invoice_for_settlement($1) id', [id])).rows[0].id; }
  async function amount(id) { return Number((await db.query('select kwota_netto from faktury where id=$1',[id])).rows[0].kwota_netto); }
  return { db, client, settlement, invoice, amount };
}
test('arrears use inclusive tiers and charge overage only above the highest limit', async () => {
  const { db, settlement, invoice, amount } = await setup();
  try {
    for (const [month,docs,expected] of [[11,10,300],[12,11,500],[1,30,500],[2,35,575]]) {
      const period = month < 3 ? `2027-0${month}-01` : `2026-${month}-01`;
      const id = await invoice(await settlement(period,docs));
      assert.equal(await amount(id), expected);
      await invoice((await db.query('select id from rozliczenia_miesieczne where okres=$1',[period])).rows[0].id);
      assert.equal(await amount(id), expected);
    }
  } finally { await db.close(); }
});
test('upfront bills the base and carries the tier difference exactly once', async () => {
  const { db, settlement, invoice, amount } = await setup('z_gory');
  try {
    const first = await invoice(await settlement('2026-11-01',35));
    assert.equal(await amount(first),300);
    const december = await settlement('2026-12-01',5);
    const next = await invoice(december);
    assert.equal(await amount(next),575);
    await invoice(december);
    assert.equal(await amount(next),575);
    assert.equal(Number((await db.query("select count(*) from faktury_pozycje where faktura_id=$1 and source_key like 'oplata:%'",[next])).rows[0].count),1);
  } finally { await db.close(); }
});
test('issued invoices are immutable and only the late tier difference is billed', async () => {
  const { db, settlement, invoice, amount } = await setup();
  try {
    const november = await settlement('2026-11-01',5);
    const first = await invoice(november);
    await db.query("update faktury set wfirma_id='issued',status='wystawiona' where id=$1",[first]);
    await db.query('update rozliczenia_miesieczne set liczba_dokumentow=20 where id=$1',[november]);
    await invoice(november);
    assert.equal(await amount(first),300);
    const next = await invoice(await settlement('2026-12-01',5));
    assert.equal(await amount(next),500);
  } finally { await db.close(); }
});
test('legacy pricing and periods before tier activation retain their original calculation', async () => {
  for (const enabled of [true,false]) {
    const { db,settlement,invoice,amount } = await setup('z_dolu',enabled);
    try { assert.equal(await amount(await invoice(await settlement(enabled ? '2026-10-01' : '2026-11-01',20))),450); }
    finally { await db.close(); }
  }
});
test('database rejects invalid or inconsistent tier settings', async () => {
  const { db,client } = await setup();
  try {
    for (const tiers of [
      '[{"abonament":300,"limit_dokumentow":10}]',
      '[{"abonament":300,"limit_dokumentow":10},{"abonament":500,"limit_dokumentow":10}]',
      '[{"abonament":300,"limit_dokumentow":10},{"abonament":200,"limit_dokumentow":30}]',
      '[{"abonament":300,"limit_dokumentow":10},{"abonament":500,"limit_dokumentow":30.5}]',
      '[{"abonament":300,"limit_dokumentow":10},{"abonament":500.555,"limit_dokumentow":30}]',
    ]) await assert.rejects(db.query('update klienci set abonamenty_progi=$1::jsonb where id=$2',[tiers,client]),/klienci_valid_subscription_tiers/);
    await assert.rejects(db.query('update klienci set abonament=400 where id=$1',[client]),/klienci_valid_subscription_tiers/);
  } finally { await db.close(); }
});

test('accountants cannot change pricing tiers while operational updates stay available', async () => {
  const { db,client } = await setup();
  try {
    await db.exec(`alter table klienci add column forma_prawna text, add column forma_opodatkowania text,
      add column status_klienta text, add column aktywny boolean, add column opiekun_id uuid, add column telefon text;
      create function get_current_user_role() returns text language sql as $$select 'accountant'::text$$;
      create function is_ada_own_client_editor(uuid) returns boolean language sql as $$select false$$;
      create function client_onboarding_is_complete(uuid) returns boolean language sql as $$select false$$;
      create trigger guard_client before update on klienci for each row execute function prevent_unauthorized_client_updates();`);
    await assert.rejects(db.query(`update klienci set abonamenty_progi='[{"abonament":300,"limit_dokumentow":10},{"abonament":600,"limit_dokumentow":30}]' where id=$1`,[client]),/Brak uprawnień/);
    await db.query("update klienci set telefon='123' where id=$1",[client]);
  } finally { await db.close(); }
});
