const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/wfirmaClient.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const config = { accessKey: 'test', secretKey: 'test', appKey: 'test', companyId: '42' };

test('invoice read addresses the invoice ID with GET and no request body', async () => {
  const exports = {};
  vm.runInNewContext(code, { exports, URL, fetch: async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/invoices/get/521542539');
    assert.equal(parsed.searchParams.get('company_id'), '42');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return { ok: true, text: async () => JSON.stringify({ status: { code: 'OK' }, invoices: { invoice: { id: '521542539' } } }) };
  }});
  assert.equal(exports.firstWfirmaInvoice(await exports.getWfirmaInvoice(config, '521542539')).id, '521542539');
});

test('a missing invoice remains an error, not a successful verification', async () => {
  const exports = {};
  vm.runInNewContext(code, { exports, URL, fetch: async () => ({ ok: true,
    text: async () => JSON.stringify({ status: { code: 'NOT FOUND' }, invoices: { parameters: { total: '0' } } }),
  }) });
  await assert.rejects(exports.getWfirmaInvoice(config, 'missing'), /NOT FOUND/);
});
