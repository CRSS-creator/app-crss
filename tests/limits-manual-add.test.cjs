const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// Run with: node --test tests/limits-manual-add.test.cjs
// Render the real page with controlled data, without a logged-in browser.
const sourcePath = process.env.LIMITS_PAGE_PATH || path.join(__dirname, "../src/app/limity/page.tsx");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source + "\nexport { LimitsContent };", {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function renderLimits(type) {
  let stateIndex = 0;
  const clients = [
    { id: "exempt", nazwa: "Exempt client", czynny_vat: false },
    { id: "active", nazwa: "Active VAT client", czynny_vat: true },
    { id: "unknown", nazwa: "Unset VAT client", czynny_vat: null },
    { id: "existing", nazwa: "Already registered client", czynny_vat: false },
  ];
  const state = {
    0: type, 2: clients,
    3: [{ id: "register", klient_id: "existing", typ: type, limit_roczny: 50000 }],
    7: true, 11: false,
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === "react") return {
        ...React,
        useState(initial) {
          const index = stateIndex++;
          return [index in state ? state[index] : (typeof initial === "function" ? initial() : initial), () => {}];
        },
        useEffect() {},
        useMemo(fn) { return fn(); },
      };
      if (name === "@/app/design") return { colors: {}, radius: {}, shadow: {} };
      if (name.startsWith("@/")) return {};
      return require(name);
    },
  });
  return renderToStaticMarkup(React.createElement(exports.LimitsContent));
}

for (const type of ["vat", "wnt", "kasa_fiskalna", "maly_podatnik_cit"]) {
  test(type + ": manual add button and client picker remain available", () => {
    const html = renderLimits(type);
    assert.match(html, /Dodaj klienta/);
    assert.match(html, /Wpisz nazwę klienta lub NIP/);
    assert.match(html, /Exempt client/);
    assert.match(html, /Unset VAT client/);
    // Existing clients appear once in the register, never again in the picker.
    assert.equal(html.split("Already registered client").length - 1, 1);
    if (type === "vat") assert.doesNotMatch(html, /Active VAT client/);
    else assert.match(html, /Active VAT client/);
    assert.match(html, /Wpis zbiorczy/);
    assert.match(html, /Szczegóły/);
  });
}
