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
test('payroll checkboxes persist independently for each task, client and year', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;
      create table klienci(id uuid primary key);
      create function get_current_user_role() returns text language sql stable as
        $$select current_setting('test.role',true)$$;
      insert into klienci values ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');`);
    const file = fs.readdirSync(path.join(root,'supabase/migrations')).find(n => n.endsWith('_year_closing_payroll_checklist.sql'));
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    for (const task of ['pit11_us','pit11_klient','pit4r','zus_roczna']) {
      await db.query(`insert into zamykanie_roku_kadry(klient_id,rok,zadanie,zrobione)
        values ('00000000-0000-0000-0000-000000000001',2026,$1,true)`,[task]);
    }
    await db.exec(`insert into zamykanie_roku_kadry values
      ('00000000-0000-0000-0000-000000000001',2027,'pit11_us',false),
      ('00000000-0000-0000-0000-000000000002',2026,'pit11_us',false);
      insert into zamykanie_roku_kadry values
      ('00000000-0000-0000-0000-000000000001',2026,'pit11_us',false)
      on conflict (klient_id,rok,zadanie) do update set zrobione=excluded.zrobione;`);
    assert.equal((await db.query('select count(*)::int n from zamykanie_roku_kadry')).rows[0].n,6);
    assert.equal((await db.query('select count(*)::int n from zamykanie_roku_kadry where zrobione')).rows[0].n,3);
    await assert.rejects(db.exec("update zamykanie_roku_kadry set zadanie='invalid'"), /check constraint/);
    await db.exec("select set_config('test.role','accountant',false)");
    assert.equal((await db.query('select * from zamykanie_roku_kadry')).rows.length,0);
    await assert.rejects(db.exec(`insert into zamykanie_roku_kadry values
      ('00000000-0000-0000-0000-000000000002',2027,'pit4r',true)`), /row-level security/);
  } finally { await db.close(); }
});
test('JDG checkboxes persist independently for each task, client and year', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;
      create table klienci(id uuid primary key);
      create function get_current_user_role() returns text language sql stable as
        $$select current_setting('test.role',true)$$;
      insert into klienci values ('00000000-0000-0000-0000-000000000001'),
        ('00000000-0000-0000-0000-000000000002');`);
    const file = fs.readdirSync(path.join(root,'supabase/migrations')).find(n => n.endsWith('_year_closing_jdg_checklist.sql'));
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    for (const task of ['pit_roczny','skladka_zdrowotna']) {
      await db.query(`insert into zamykanie_roku_jdg(klient_id,rok,zadanie,zrobione)
        values ('00000000-0000-0000-0000-000000000001',2026,$1,true)`,[task]);
    }
    await db.exec(`insert into zamykanie_roku_jdg values
      ('00000000-0000-0000-0000-000000000001',2027,'pit_roczny',false),
      ('00000000-0000-0000-0000-000000000002',2026,'pit_roczny',false);
      insert into zamykanie_roku_jdg values
      ('00000000-0000-0000-0000-000000000001',2026,'pit_roczny',false)
      on conflict (klient_id,rok,zadanie) do update set zrobione=excluded.zrobione;`);
    assert.equal((await db.query('select count(*)::int n from zamykanie_roku_jdg')).rows[0].n,4);
    assert.equal((await db.query('select count(*)::int n from zamykanie_roku_jdg where zrobione')).rows[0].n,1);
    await assert.rejects(db.exec("update zamykanie_roku_jdg set zadanie='invalid'"), /check constraint/);
    await db.exec("select set_config('test.role','accountant',false)");
    assert.equal((await db.query('select * from zamykanie_roku_jdg')).rows.length,0);
    await assert.rejects(db.exec(`insert into zamykanie_roku_jdg values
      ('00000000-0000-0000-0000-000000000002',2027,'skladka_zdrowotna',true)`), /row-level security/);
  } finally { await db.close(); }
});
test('IFT-2R saves all statuses independently per year and accounting tab', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create table klienci (id uuid primary key);
      create function public.get_current_user_role() returns text language sql stable as
        $$ select current_setting('test.role',true) $$;
      insert into klienci values ('00000000-0000-0000-0000-000000000001');
    `);
    const name = fs.readdirSync(path.join(root, 'supabase/migrations'))
      .find(name => name.endsWith('_year_closing_ift2r_status.sql'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    for (const tab of ['jdg','full']) {
      for (const status of ['wyslane','do_wyslania','brak_wysylki']) {
        await db.query(`insert into zamykanie_roku_ift2r values
          ('00000000-0000-0000-0000-000000000001',2026,$1,$2)
          on conflict (klient_id,rok,rodzaj) do update set status=excluded.status`, [tab,status]);
        assert.equal((await db.query('select status from zamykanie_roku_ift2r where rodzaj=$1',[tab])).rows[0].status,status);
      }
    }
    await db.exec(`insert into zamykanie_roku_ift2r values
      ('00000000-0000-0000-0000-000000000001',2027,'jdg','do_wyslania')`);
    assert.equal((await db.query('select count(*)::int as n from zamykanie_roku_ift2r')).rows[0].n,3);
    await assert.rejects(db.exec("update zamykanie_roku_ift2r set status='invalid'"), /check constraint/);
    await db.exec("select set_config('test.role','accountant',false)");
    assert.equal((await db.query('select * from zamykanie_roku_ift2r')).rows.length,0);
    await assert.rejects(db.exec(`insert into zamykanie_roku_ift2r values
      ('00000000-0000-0000-0000-000000000001',2028,'full','wyslane')`), /row-level security/);
  } finally { await db.close(); }
});
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

test('declaration stages save independently and preserve existing checklists and permissions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;
      create table klienci(id uuid primary key);
      create function get_current_user_role() returns text language sql stable as
        $$select current_setting('test.role',true)$$;
      insert into klienci values ('00000000-0000-0000-0000-000000000001');`);
    for (const suffix of ['jdg_checklist','ift2r_status','declaration_stages']) {
      const file = fs.readdirSync(path.join(root,'supabase/migrations')).find(n => n.endsWith('_year_closing_' + suffix + '.sql'));
      await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
    }
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    for (const task of ['pit_roczny','pit_us','pit_klient','skladka_zdrowotna']) {
      await db.query(`insert into zamykanie_roku_jdg values ('00000000-0000-0000-0000-000000000001',2026,$1,true)`,[task]);
    }
    await db.exec("update zamykanie_roku_jdg set zrobione=false where zadanie='pit_us'");
    assert.equal((await db.query('select count(*)::int n from zamykanie_roku_jdg where zrobione')).rows[0].n,3);
    for (const [year,tab] of [[2026,'jdg'],[2027,'jdg'],[2026,'full']]) {
      await db.query(`insert into zamykanie_roku_ift2r (klient_id,rok,rodzaj,status) values ('00000000-0000-0000-0000-000000000001',$1,$2,'do_wyslania')`,[year,tab]);
    }
    await db.exec("update zamykanie_roku_ift2r set sporzadzony=true,wyslany_us=true where rok=2026 and rodzaj='jdg'");
    await db.exec("update zamykanie_roku_ift2r set status='brak_wysylki' where rok=2026 and rodzaj='jdg'");
    const rows=(await db.query('select sporzadzony,wyslany_us,wyslany_klient from zamykanie_roku_ift2r order by rok,rodzaj')).rows;
    assert.deepEqual(rows,[{sporzadzony:false,wyslany_us:false,wyslany_klient:false},{sporzadzony:true,wyslany_us:true,wyslany_klient:false},{sporzadzony:false,wyslany_us:false,wyslany_klient:false}]);
    await db.exec("select set_config('test.role','accountant',false)");
    assert.equal((await db.query('select * from zamykanie_roku_ift2r')).rows.length,0);
    assert.equal((await db.query('select * from zamykanie_roku_jdg')).rows.length,0);
    await assert.rejects(db.exec("insert into zamykanie_roku_jdg values ('00000000-0000-0000-0000-000000000001',2027,'pit_us',true)"),/row-level security/);
  } finally { await db.close(); }
});

test('full accounting and expanded payroll tasks persist separately with role restrictions', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated;
      create table klienci(id uuid primary key);
      create function get_current_user_role() returns text language sql stable as $$select current_setting('test.role',true)$$;
      insert into klienci values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');`);
    for (const suffix of ['payroll_checklist','full_and_payroll_stages']) {
      const file=fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_year_closing_'+suffix+'.sql'));
      await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
    }
    await db.exec("set role authenticated; select set_config('test.role','manager',false)");
    for (const [table,tasks] of [
      ['zamykanie_roku_full',['cit_sporzadzony','cit_us','cit_klient','sf_sporzadzone','sf_wyslane','sf_uchwala','przeksiegowania_wf','przeniesienie_bo']],
      ['zamykanie_roku_kadry',['pit11_sporzadzone','pit11_us','pit11_klient','pit4r','pit4r_klient','zus_roczna','zus_roczna_klient']]
    ]) {
      for (const task of tasks) await db.query(`insert into ${table} values ('00000000-0000-0000-0000-000000000001',2026,$1,true)`,[task]);
      await db.query(`insert into ${table} values ('00000000-0000-0000-0000-000000000001',2027,$1,false), ('00000000-0000-0000-0000-000000000002',2026,$1,false)`,[tasks[0]]);
      await db.query(`update ${table} set zrobione=false where zadanie=$1 and rok=2026`,[tasks[0]]);
      assert.equal((await db.query(`select count(*)::int n from ${table} where zrobione`)).rows[0].n,tasks.length-1);
      await assert.rejects(db.exec(`update ${table} set zadanie='invalid'`), /check constraint/);
      await db.exec("select set_config('test.role','accountant',false)");
      assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
      await assert.rejects(db.query(`insert into ${table} values ('00000000-0000-0000-0000-000000000002',2027,$1,true)`,[tasks[0]]),/row-level security/);
      await db.exec("select set_config('test.role','manager',false)");
    }
  } finally { await db.close(); }
});
