const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('payroll linking migration preserves costs and dates and rejects ambiguous annual settlement', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public.cfo_koszty(id int primary key, kwota_netto_cfo numeric, data_zaplaty date, harmonogram_id uuid);
      insert into cfo_koszty values(1,10000,'2026-09-10',null);`);
    await db.exec(fs.readFileSync('supabase/migrations/20261020124701_cfo_payroll_settlement.sql', 'utf8'));
    await db.exec("update cfo_koszty set rozliczenie_wynagrodzen_okres='2026-09-01' where id=1");
    const row = (await db.query('select kwota_netto_cfo::float8 amount,data_zaplaty::text date from cfo_koszty')).rows[0];
    assert.equal(row.amount, 10000); assert.equal(row.date, '2026-09-10');
    await assert.rejects(db.exec("update cfo_koszty set rozliczenie_wynagrodzen_okres='2026-09-02'"), /cfo_cost_payroll_month_check/);
    await assert.rejects(db.exec("update cfo_koszty set harmonogram_id='00000000-0000-0000-0000-000000000001'"), /cfo_cost_payroll_not_annual_check/);
    await db.exec("update cfo_koszty set rozliczenie_wynagrodzen_okres=null");
    await db.exec("update cfo_koszty set harmonogram_id='00000000-0000-0000-0000-000000000001'");
    await assert.rejects(db.exec("update cfo_koszty set rozliczenie_wynagrodzen_okres='2026-09-01'"), /cfo_cost_payroll_not_annual_check/);
  } finally { await db.close(); }
});
