const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const source = readFileSync(join(__dirname, "../src/lib/server/onboardingAmlStatus.ts"), "utf8");
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, Date, Set });
const { completeOnboardingAmlIfReady } = exportsObject;

function mockAdmin(options = {}) {
  const history = [];
  const updates = [];
  const rows = {
    aml_rejestr_klientow: { poziom_ryzyka: "standardowe" },
    aml_weryfikacje: [{ id: "v" }],
    aml_formularze_wstepne: [{ id: "f", completed_at: "2026-11-05" }],
    aml_oswiadczenia_weryfikacji: [{ id: "s", completed_at: "2026-11-05" }],
    aml_oceny_ryzyka: options.incomplete ? [] : [{ id: "a", risk_level: "standardowe" }],
    onboarding_etapy: { id: "stage", klient_id: "client", etap: "aml", status: "w_toku" },
  };
  return {
    history, updates,
    from(table) {
      let operation = "read";
      const chain = {
        select() { return chain; }, eq() { return chain; }, or() { return chain; },
        limit() { return chain; }, maybeSingle() { return chain; },
        update(payload) { operation = "update"; updates.push(payload); return chain; },
        insert(payload) { history.push(payload); return Promise.resolve({ error: null }); },
        then(resolve, reject) {
          const error = operation === "update" ? options.updateError : options.readError;
          const data = operation === "update" ? (options.noUpdate ? null : { id: "stage" }) : rows[table];
          return Promise.resolve({ data, error: error || null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}
test("complete AML sets ready and records the successful change once", async () => {
  const admin = mockAdmin();
  await completeOnboardingAmlIfReady(admin, "client");
  assert.equal(admin.updates.length, 1);
  assert.equal(admin.updates[0].status, "gotowe");
  assert.equal(admin.history.length, 1);
});
test("incomplete AML does not complete the stage", async () => {
  const admin = mockAdmin({ incomplete: true });
  await completeOnboardingAmlIfReady(admin, "client");
  assert.equal(admin.updates.length, 0);
  assert.equal(admin.history.length, 0);
});
test("failed status update is reported without a false success history", async () => {
  const error = new Error("database rejected activation");
  const admin = mockAdmin({ updateError: error });
  await assert.rejects(completeOnboardingAmlIfReady(admin, "client"), error);
  assert.equal(admin.history.length, 0);
});
test("concurrent status change does not create a duplicate history", async () => {
  const admin = mockAdmin({ noUpdate: true });
  await completeOnboardingAmlIfReady(admin, "client");
  assert.equal(admin.history.length, 0);
});
test("read errors are reported instead of being treated as incomplete AML", async () => {
  const error = new Error("read failed");
  const admin = mockAdmin({ readError: error });
  await assert.rejects(completeOnboardingAmlIfReady(admin, "client"), error);
  assert.equal(admin.updates.length, 0);
});
