const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('annual schedules match imports conservatively, normalize periods and obey owner RLS', async () => {
  const db = new PGlite();
  const row = { nazwa: 'Licencja', kontrahent: 'Vendor', kategoria: 'systemy_technologia', podkategoria: null,
    kwota_netto: 12000, kwota_brutto: 14760, pierwszy_okres: '2027-01-01', data_faktury: '2027-01-15', termin_platnosci: '2027-01-25', aktywny: true };
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
      create function public.current_user_role() returns text language sql as $$select current_setting('test.user_role',true)$$;
      create table public.profiles(id uuid primary key);
      create table public.cfo_koszty(id uuid primary key default gen_random_uuid(),kontrahent text,kategoria text,podkategoria text,
        kwota_netto_cfo numeric,kwota_brutto numeric,data_dokumentu date,okres_start date,okres_end date,ujecie_zarzadcze text,
        ignoruj boolean default false,termin_platnosci date,czestotliwosc text);
      alter table cfo_koszty enable row level security;
      grant select,insert,update,delete on cfo_koszty to authenticated;
      create policy costs_owner on cfo_koszty for all to authenticated using(current_user_role()='owner') with check(current_user_role()='owner');
      insert into cfo_koszty(id,kontrahent,kategoria,kwota_netto_cfo,kwota_brutto,data_dokumentu,okres_start,okres_end)
      values('00000000-0000-0000-0000-000000000001','Vendor','systemy_technologia',12000,14760,'2026-01-15','2026-01-01','2026-01-31');
    `);
    const file = fs.readdirSync('supabase/migrations').find(name => name.endsWith('_cfo_annual_cost_schedules.sql'));
    await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
    await db.exec("set test.user_role='owner'; set role authenticated");
    const saved = (await db.query("select (public.save_cfo_annual_schedule($1::jsonb,'00000000-0000-0000-0000-000000000001')).id as id", [JSON.stringify(row)])).rows[0].id;
    let source = (await db.query('select harmonogram_id,okres_start::text start,okres_end::text finish from cfo_koszty')).rows[0];
    assert.equal(source.harmonogram_id, saved); assert.equal(source.start, '2026-01-01'); assert.equal(source.finish, '2026-12-31');
    async function insert(date, gross = 14760, category = 'systemy_technologia') {
      return (await db.query(`insert into cfo_koszty(kontrahent,kategoria,kwota_netto_cfo,kwota_brutto,data_dokumentu,okres_start,okres_end)
        values(' VENDOR ',$1,12000,$2,$3::date,date_trunc('month',$3::date)::date,($3::date+interval '1 month')::date)
        returning id,harmonogram_id,okres_start::text start,okres_end::text finish,termin_platnosci::text due`, [category, gross, date])).rows[0];
    }
    const imported = await insert('2027-01-18');
    assert.equal(imported.harmonogram_id, saved); assert.equal(imported.start, '2027-01-01'); assert.equal(imported.finish, '2027-12-31'); assert.equal(imported.due, '2027-01-25');
    const changed = await insert('2028-01-18', 18450);
    assert.equal(changed.harmonogram_id, null);
    await db.query('update cfo_koszty set harmonogram_id=$1 where id=$2', [saved, changed.id]);
    assert.equal((await db.query('select okres_end::text finish from cfo_koszty where id=$1', [changed.id])).rows[0].finish, '2028-12-31');
    assert.equal((await insert('2028-07-01')).harmonogram_id, null);
    assert.equal((await insert('2028-01-18', 14760, 'administracja_ogolne')).harmonogram_id, null);
    await db.query('select public.save_cfo_annual_schedule($1::jsonb)', [JSON.stringify({ ...row, nazwa: 'Druga licencja' })]);
    assert.equal((await insert('2029-01-18')).harmonogram_id, null, 'ambiguous imports require explicit linkage');
    const count = (await db.query('select count(*)::int n from cfo_harmonogramy_roczne')).rows[0].n;
    await assert.rejects(db.query("select public.save_cfo_annual_schedule($1::jsonb,'00000000-0000-0000-0000-000000000099')", [JSON.stringify({ ...row, nazwa: 'Rollback' })]), /kosztu źródłowego/);
    assert.equal((await db.query('select count(*)::int n from cfo_harmonogramy_roczne')).rows[0].n, count);
    await db.exec("set test.user_role='accountant'");
    assert.equal((await db.query('select * from cfo_harmonogramy_roczne')).rows.length, 0);
    await assert.rejects(db.query('select public.save_cfo_annual_schedule($1::jsonb)', [JSON.stringify(row)]), /row-level security/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select * from cfo_harmonogramy_roczne'), /permission denied/);
    await assert.rejects(db.query('select public.save_cfo_annual_schedule($1::jsonb)', [JSON.stringify(row)]), /permission denied/);
  } finally { await db.close(); }
});
