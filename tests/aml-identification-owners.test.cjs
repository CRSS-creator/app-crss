const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const root = process.env.AML_TEST_ROOT || path.join(__dirname, "..");
function load(file, overrides = {}, append = "") {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const code = ts.transpileModule(source + append, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.compileFunction(code, ["exports", "require", "process", "Buffer", "console"])(exports, function(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === "@/lib/amlIdentificationStatementTypes") return types;
      if (name.startsWith("@/")) return {};
      return require(name);
    }, process, Buffer, console);
  return exports;
}
const types = load("src/lib/amlIdentificationStatementTypes.ts");
const route = load("src/app/api/public/aml-identification-statement/[token]/route.ts", {}, "\nexport { buildDefaults };");
const owners = [
  { label: "Test Beneficiary One", rola: "First control type" },
  { label: "Test Beneficiary Two", rola: "Second control type" },
  { label: "Test Beneficiary Three", rola: "Third control type" },
];
const defaults = route.buildDefaults({ id: "client", nazwa: "Test Association", nip: null }, { beneficjenci_rzeczywisci: owners }, null);
const draft = { ...types.emptyAmlIdentificationStatementData(), ...defaults };

test("API defaults preserve every beneficiary and the corresponding control type", () => {
  assert.equal(defaults.beneficialOwners.length, 3);
  defaults.beneficialOwners.forEach((owner, index) => {
    assert.equal(owner.fullName, owners[index].label);
    assert.equal(owner.controlType, owners[index].rola);
  });
});
test("validation checks the third beneficiary and rejects an empty list", () => {
  const data = { ...draft, beneficialOwners: draft.beneficialOwners.map((owner, i) => i === 2 ? { ...owner, controlType: "" } : owner) };
  assert.ok(types.validateAmlIdentificationStatementData(data).includes("Beneficjent 3: rodzaj kontroli"));
  assert.ok(types.validateAmlIdentificationStatementData({ ...draft, beneficialOwners: [] }).includes("Co najmniej jeden beneficjent rzeczywisty"));
});
test("old single-beneficiary statements remain readable", () => {
  const result = types.identificationBeneficialOwners({ beneficialOwnerName: "Legacy Owner", beneficialOwnerControlType: "Legacy Control" });
  assert.equal(result.length, 1);
  assert.equal(result[0].fullName, "Legacy Owner");
  assert.equal(result[0].controlType, "Legacy Control");
});
test("sole trader defaults and missing registry data remain editable", () => {
  const jdg = route.buildDefaults({ id: "client" }, { beneficjenci_rzeczywisci: [{ pierwszeImie: "Jan", nazwisko: "Testowy", typ: "jdg" }] }, null);
  assert.equal(jdg.beneficialOwners[0].controlType, "przedsiębiorca");
  assert.equal(jdg.beneficialOwners[0].fullName, "Jan Testowy");
  assert.equal(route.buildDefaults({ id: "client" }, null, null).beneficialOwners.length, 1);
});
test("the form renders separate editable name and control fields for all beneficiaries", () => {
  let index = 0;
  const state = { 0: false, 2: { status: "active", client: { nazwa: "Test Association" } }, 3: draft };
  const page = load("src/app/aml/oswiadczenie-weryfikacji/[token]/page.tsx", {
    react: { ...React, useEffect() {}, useState(initial) { const key = index++; return [key in state ? state[key] : typeof initial === "function" ? initial() : initial, () => {}]; } },
    "next/navigation": { useParams: () => ({ token: "test-token" }) },
    "@/app/design": { colors: {}, radius: {}, shadow: {} },
    "@/components/AppSelect": () => null,
  });
  const html = renderToStaticMarkup(React.createElement(page.default));
  owners.forEach((owner) => {
    assert.ok(html.includes('value="' + owner.label + '"'));
    assert.ok(html.includes('value="' + owner.rola + '"'));
  });
});
test("PDF generation supports multiple and legacy beneficiaries", async () => {
  const { buildAmlIdentificationStatementPdf } = load("src/lib/amlIdentificationStatementPdf.ts");
  const data = { ...draft, verificationDate: "2026-09-15", verifiedBy: "Test Reviewer", clientVerificationSources: "CRBR", beneficialOwnerSources: ["CRBR"] };
  const pdf = await buildAmlIdentificationStatementPdf({ formToken: "test-only", completedAt: new Date("2026-09-15T10:00:00Z"), data });
  assert.ok(pdf.length > 1000);
  if (process.env.AML_TEST_PDF) fs.writeFileSync(process.env.AML_TEST_PDF, pdf);
  const legacy = { ...data, beneficialOwnerName: "Legacy Owner", beneficialOwnerControlType: "Legacy Control" };
  delete legacy.beneficialOwners;
  assert.ok((await buildAmlIdentificationStatementPdf({ formToken: "test-only", completedAt: new Date(), data: legacy })).length > 1000);
});
