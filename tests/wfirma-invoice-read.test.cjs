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

test('documented netto/brutto amounts preserve fee VAT including multiple documents', () => {
  const exports = {};
  vm.runInNewContext(code, { exports });
  for (const [net, gross, tax] of [[250, 307.5, 57.5], [200, 246, 46], [260, 319.8, 59.8], [100, 100, 0]]) {
    const result = exports.wfirmaLineAmounts({ netto: String(net), brutto: String(gross), count: '13', price: '20' });
    assert.equal(result.net, net);
    assert.equal(result.gross, gross);
    assert.equal(result.tax, tax);
  }
  assert.throws(() => exports.wfirmaLineAmounts({ netto: '250', price: '250' }), /pełnych kwot/);
  assert.throws(() => exports.wfirmaLineAmounts({ netto: 'invalid', brutto: '307.50' }), /pełnych kwot/);
  assert.equal(exports.wfirmaLineAmounts({ netto: '250', tax: '57.50' }).gross, 307.5);
});

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

test('invoice gross falls back to documented line gross instead of net when header VAT is missing', () => {
  const exports = {};
  vm.runInNewContext(code, { exports });
  const result = exports.wfirmaInvoiceAmounts({
    netto: '250.00',
    invoicecontents: { invoicecontent: [{ netto: '250.00', brutto: '307.50' }] },
  });
  assert.equal(result.net, 250);
  assert.equal(result.tax, 57.5);
  assert.equal(result.gross, 307.5);
  assert.throws(() => exports.wfirmaInvoiceAmounts({ netto: '250.00' }), /pełnych kwot faktury/);
});

test('invoice totals preserve explicit zero VAT and corrected gross, and reject incomplete amounts', () => {
  const exports = {};
  vm.runInNewContext(code, { exports });
  for (const [invoice, expectedGross, expectedTax] of [
    [{ netto: '250', tax: '57,50' }, 307.5, 57.5],
    [{ netto: '250', total: '307.50' }, 307.5, 57.5],
    [{ netto: '250', tax: '0' }, 250, 0],
    [{ netto: '250', tax: '57.50', total: '307.50', total_composed: '0' }, 0, 57.5],
    [{ netto: '250', tax: '57.50', total: '307.50', total_composed: '' }, 307.5, 57.5],
    [{ invoicecontents: { invoicecontent: [
      { netto: '250', brutto: '307.50' }, { netto: '75', brutto: '92.25' },
    ] } }, 399.75, 74.75],
  ]) {
    const result = exports.wfirmaInvoiceAmounts(invoice);
    assert.equal(result.gross, expectedGross);
    assert.equal(result.tax, expectedTax);
  }
  assert.throws(() => exports.wfirmaInvoiceAmounts({ netto: 'invalid', total: '307.50' }), /pełnych kwot faktury/);
  assert.throws(() => exports.wfirmaInvoiceAmounts({ netto: '250', invoicecontents: {
    invoicecontent: [{ netto: '250', price: '250' }],
  } }), /pełnych kwot pozycji/);
});

test('partial invoice lines cannot replace the complete invoice gross', () => {
  const exports = {};
  vm.runInNewContext(code, { exports });
  assert.throws(() => exports.wfirmaInvoiceAmounts({ netto: '500', invoicecontents: {
    invoicecontent: [{ netto: '250', brutto: '307.50' }],
  } }), /nie zgadzają się/);
});
