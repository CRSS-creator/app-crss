const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = process.env.REGON_TEST_ROOT || path.join(__dirname, "..");
const code = ts.transpileModule(fs.readFileSync(path.join(root, "src/lib/server/regon.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleExports = {};
vm.compileFunction(code, ["exports", "process", "fetch", "AbortSignal"])(moduleExports, process, fetch, AbortSignal);
const { verifyRegon } = moduleExports;
const escape = value => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const soap = (method, value) => '<s:Envelope><s:Body><' + method + 'Response><' + method + 'Result>' + escape(value) + '</' + method + 'Result></' + method + 'Response></s:Body></s:Envelope>';
const entity = (nip, regon) => '<dane><Nip>' + nip + '</Nip><Regon>' + regon + '</Regon><Nazwa>Test &amp; Partner</Nazwa></dane>';
function server(xml, failSearch = false, failLogout = false) {
  const calls = [];
  return { calls, request: async (url, options) => {
    calls.push(options);
    assert.equal(new URL(url).hostname, "wyszukiwarkaregon.stat.gov.pl");
    assert.equal(options.redirect, "error");
    if (options.body.includes("<Zaloguj ")) return new Response(soap("Zaloguj", "session-test"));
    assert.equal(options.headers.sid, "session-test");
    if (options.body.includes("<Wyloguj ")) {
      if (failLogout) throw new Error("secret-session");
      return new Response(soap("Wyloguj", "true"));
    }
    if (failSearch) throw new Error("secret-key");
    return new Response('--boundary\r\nContent-Type: application/xop+xml\r\n\r\n' + soap("DaneSzukajPodmioty", xml) + '\r\n--boundary--');
  }};
}
test("SOAP login, matching NIP, entity decoding and logout", async () => {
  const mock = server(entity("9721378590", "123456789"));
  const result = await verifyRegon("9721378590", "key<&", mock.request);
  assert.equal(result.status, "ok");
  assert.equal(result.details.regon, "123456789");
  assert.equal(result.details.name, "Test & Partner");
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls[0].body.includes("key&lt;&amp;"));
  assert.ok(!JSON.stringify(result).includes("session-test"));
});
test("missing key makes no network requests", async () => {
  assert.equal((await verifyRegon("9721378590", "", () => { throw Error("unexpected"); })).status, "skipped");
});
test("wrong NIP, branch-only and ambiguous results do not assign a REGON", async () => {
  for (const xml of [entity("1111111111", "123456789"), entity("9721378590", "12345678900001"), entity("9721378590", "123456789") + entity("9721378590", "987654321"), ""]) {
    const result = await verifyRegon("9721378590", "key", server(xml).request);
    assert.equal(result.status, "warning");
    assert.equal(result.details.regon, undefined);
  }
});
test("network errors are sanitized and still close the session", async () => {
  const mock = server("", true);
  const result = await verifyRegon("9721378590", "key", mock.request);
  assert.equal(result.status, "error");
  assert.equal(mock.calls.length, 3);
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("logout failure does not discard verified data", async () => {
  assert.equal((await verifyRegon("9721378590", "key", server(entity("9721378590", "123456789"), false, true).request)).status, "ok");
});
test("SOAP faults and invalid credentials fail without exposing upstream payloads", async () => {
  const result = await verifyRegon("9721378590", "key", async () => new Response('<s:Fault><message>secret-key</message></s:Fault>'));
  assert.equal(result.status, "error");
  assert.ok(!JSON.stringify(result).includes("secret-key"));
  assert.equal((await verifyRegon("9721378590", "key", async () => new Response(soap("Zaloguj", "")))).status, "error");
});
