const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function serviceWith(result) {
  const chain = { select() { return chain; }, eq() { return chain; }, order() { return Promise.resolve(result); } };
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/monthlySettlementsService.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const context = { exports: {}, require: () => ({ supabase: { from: () => chain } }) };
  vm.runInNewContext(compiled.outputText, context);
  return context.exports;
}

test("settlements respect inclusive calendar months and retain suspended client history", async () => {
  const row = (id, month, first, last, array = false) => {
    const client = { status_klienta: "Zawieszony", pierwszy_okres_rozliczeniowy: first, ostatni_okres_rozliczeniowy: last };
    return { id, okres: month + "-01", klienci: array ? [client] : client };
  };
  const data = [
    row("last-month", "2026-08", null, "2026-08-31"),
    row("after-last", "2026-09", null, "2026-08-01"),
    row("first-month", "2026-06", "2026-06-15", null),
    row("before-first", "2026-05", "2026-06-01", null),
    row("unbounded", "2026-09", null, null),
    row("array-last-month", "2026-08", null, "2026-08-01", true),
    row("array-after-last", "2026-09", null, "2026-08-01", true),
    { id: "inaccessible-client", okres: "2026-09-01", klienci: null },
  ];
  const result = await serviceWith({ data, error: null }).fetchMonthlySettlements("2026-09-01");
  assert.deepEqual(Array.from(result.data, row => row.id), ["last-month", "first-month", "unbounded", "array-last-month"]);
});

test("settlement query errors and null data are preserved", async () => {
  const failed = { data: null, error: { message: "unavailable" } };
  assert.equal(await serviceWith(failed).fetchMonthlySettlements("2026-09-01"), failed);
  const empty = { data: null, error: null };
  assert.equal(await serviceWith(empty).fetchMonthlySettlements("2026-09-01"), empty);
});
