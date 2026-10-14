const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/yearClosing.ts'), 'utf8');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: exportsForTest });
const { isYearClosingClient } = exportsForTest;
const client = { status_klienta: 'Aktywny', pierwszy_okres_rozliczeniowy: null, ostatni_okres_rozliczeniowy: null };

test('only active and onboarding clients qualify', () => {
  for (const status of ['Aktywny', 'aktywny', ' Onboarding ']) {
    assert.equal(isYearClosingClient({ ...client, status_klienta: status }, 2026), true);
  }
  for (const status of ['Nieaktywny', 'Były', 'Potencjalny', '', null]) {
    assert.equal(isYearClosingClient({ ...client, status_klienta: status }, 2026), false);
  }
});

test('service must include December, including clients starting or finishing that month', () => {
  for (const [first, last, expected] of [
    ['2026-01-01', '2026-11-30', false],
    ['2026-12-01', '2026-12-01', true],
    ['2026-12-31', '2026-12-31', true],
    ['2027-01-01', null, false],
    [null, '2027-01-01', true],
    [null, null, true],
  ]) {
    for (const status of ['Aktywny', 'Onboarding']) {
      assert.equal(isYearClosingClient({ status_klienta: status,
        pierwszy_okres_rozliczeniowy: first, ostatni_okres_rozliczeniowy: last }, 2026), expected);
    }
  }
  assert.equal(isYearClosingClient({ ...client, ostatni_okres_rozliczeniowy: '2026-12-01' }, 2027), false);
});

test('balance checkbox persists both states per client and year, with existing role restrictions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create table klienci (id uuid primary key);
      create function public.get_current_user_role() returns text language sql stable as
        $$ select current_setting('test.role',true) $$;
      insert into klienci values
        ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');
    `);
    const name = fs.readdirSync(path.join(root, 'supabase/migrations'))
      .find(name => name.endsWith('_year_closing_balance_confirmations.sql'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    await db.exec(`
      insert into zamykanie_roku_salda values ('00000000-0000-0000-0000-000000000001',2026,true);
      insert into zamykanie_roku_salda values ('00000000-0000-0000-0000-000000000001',2027,false);
      insert into zamykanie_roku_salda values ('00000000-0000-0000-0000-000000000002',2026,false);
    `);
    assert.deepEqual((await db.query('select zrobione from zamykanie_roku_salda order by klient_id,rok')).rows.map(r => r.zrobione), [true,false,false]);
    await db.exec(`insert into zamykanie_roku_salda values ('00000000-0000-0000-0000-000000000001',2026,false)
      on conflict (klient_id,rok) do update set zrobione=excluded.zrobione`);
    assert.equal((await db.query('select count(*)::int as n from zamykanie_roku_salda where zrobione')).rows[0].n, 0);
    for (const role of ['owner','admin','manager']) {
      await db.query("select set_config('test.role',$1,false)", [role]);
      assert.equal((await db.query('select * from zamykanie_roku_salda')).rows.length,3);
    }
    await db.exec("select set_config('test.role','accountant',false)");
    assert.equal((await db.query('select * from zamykanie_roku_salda')).rows.length, 0);
    await assert.rejects(db.exec("insert into zamykanie_roku_salda values ('00000000-0000-0000-0000-000000000002',2027,true)"), /row-level security/);
  } finally { await db.close(); }
});
