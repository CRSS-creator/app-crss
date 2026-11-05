const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = readFileSync(join(__dirname, "../src/lib/contributionHolidayEligibility.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ["2026-11-05T12:00:00Z"])); }
}
vm.runInNewContext(code, { exports: exportsObject, Date: FixedDate, Intl });
const eligible = exportsObject.isContributionHolidayClient;
const client = { forma_prawna: "JDG", schemat_zus: "Duży ZUS", status_klienta: "Aktywny" };

test("active clients and onboarding within the service period remain visible", () => {
  assert.equal(eligible(client), true);
  assert.equal(eligible({ ...client, status_klienta: "aktywny" }), true);
  assert.equal(eligible({ ...client, status_klienta: "Onboarding", pierwszy_okres_rozliczeniowy: "2026-11-01" }), true);
  assert.equal(eligible({ ...client, ostatni_okres_rozliczeniowy: "2026-11-01" }), true);
  assert.equal(eligible({ ...client, ostatni_okres_rozliczeniowy: "2026-12-01" }), true);
});

test("former clients are excluded even if their status is still active", () => {
  assert.equal(eligible({ ...client, status_klienta: "Do zamknięcia", ostatni_okres_rozliczeniowy: "2026-08-01" }), false);
  assert.equal(eligible({ ...client, ostatni_okres_rozliczeniowy: "2026-09-01" }), false);
  for (const status_klienta of ["Do zamknięcia", "Archiwalny", "Zawieszony", null]) {
    assert.equal(eligible({ ...client, status_klienta }), false);
  }
  assert.equal(eligible({ ...client, pierwszy_okres_rozliczeniowy: "2026-12-01" }), false);
});

test("legal form and ZUS exclusions are preserved", () => {
  assert.equal(eligible({ ...client, forma_prawna: "Sp. z o.o." }), false);
  for (const schemat_zus of ["Ulga na start", "Brak ZUS", "  ULGA   NA START  "]) {
    assert.equal(eligible({ ...client, schemat_zus }), false);
  }
});

test("Warsaw month boundary includes the final month until its end", () => {
  class BoundaryDate extends Date {
    constructor() { super("2026-10-31T23:30:00Z"); }
  }
  const boundaryExports = {};
  vm.runInNewContext(code, { exports: boundaryExports, Date: BoundaryDate, Intl });
  assert.equal(boundaryExports.isContributionHolidayClient({ ...client, ostatni_okres_rozliczeniowy: "2026-10-01" }), false);
  assert.equal(boundaryExports.isContributionHolidayClient({ ...client, ostatni_okres_rozliczeniowy: "2026-11-01" }), true);
});
