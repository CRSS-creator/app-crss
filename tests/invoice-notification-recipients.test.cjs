const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadModule(relative, dependencies, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  assert.equal((code.diagnostics || []).length, 0);
  const exports = {};
  vm.runInNewContext(code.outputText, {
    exports, Error, require: name => {
      assert.ok(name in dependencies, 'Unexpected import: ' + name);
      return dependencies[name];
    }, ...globals,
  });
  return exports;
}

function invoice(overrides = {}) {
  return {
    id: 'invoice-1', klient_id: 'client-1', numer: 'FV/1', status: 'przeterminowana',
    kontrahent_nazwa: 'Client', kontrahent_email: 'old@example.com',
    kwota_brutto: 123, waluta: 'PLN', data_wystawienia: '2026-09-01',
    termin_platnosci: '2026-09-08', wfirma_pdf_path: 'invoice.pdf', wfirma_pdf_name: 'invoice.pdf',
    klienci: { email: 'one@example.com, two@example.com; one@example.com',
      telefon: '512375925, 506582082; 512375925',
      profiles: { full_name: 'Caregiver', email: 'caregiver@example.com' } },
    ...overrides,
  };
}

function setup(route, invoices, fail = () => false) {
  const calls = [], history = [], updates = [];
  let signedUrls = 0;
  const admin = {
    storage: { from: () => ({ createSignedUrl: async () => {
      signedUrls++;
      return { data: { signedUrl: 'https://example.invalid/invoice.pdf' } };
    } }) },
    from: table => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'Owner' } }) }),
        in: async () => ({ data: invoices }),
      }),
      insert: async value => { history.push(...(Array.isArray(value) ? value : [value])); return {}; },
      update: value => ({ eq: async (column, id) => { updates.push({ table, id, value }); return {}; } }),
    }),
  };
  const contactFields = loadModule('lib/contactFields.ts', {});
  const delivery = loadModule('lib/invoiceNotificationDelivery.ts', {}, {
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      const failure = fail(payload);
      if (failure === 'network') throw new Error('Network unavailable');
      return { ok: !failure, status: failure ? 503 : 200, text: async () => 'Unavailable' };
    },
  });
  const module = loadModule('app/api/faktury/' + route + '/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } },
    '@/lib/serverAuth': { getAuthorizedServerUser: async () => ({ admin, requesterId: 'owner' }) },
    '@/lib/contactFields': contactFields,
    '@/lib/invoiceNotificationDelivery': delivery,
  }, {
    process: { env: {
      N8N_INVOICE_MAIL_WEBHOOK_URL: 'https://example.invalid/invoice',
      N8N_OVERDUE_INVOICE_WEBHOOK_URL: 'https://example.invalid/reminder',
    } },
  });
  return { calls, history, updates, signedUrls: () => signedUrls,
    send: () => module.POST({ json: async () => ({ invoiceIds: invoices.map(row => row.id) }) }) };
}

function assertTargets(calls) {
  assert.deepEqual(calls.filter(p => p.channel === 'email').map(p => p.recipientEmail),
    ['one@example.com', 'two@example.com']);
  assert.deepEqual(calls.filter(p => p.channel === 'sms').map(p => p.recipientPhone),
    ['512375925', '506582082']);
  for (const payload of calls) {
    assert.deepEqual(payload.recipientEmails, payload.channel === 'email' ? [payload.recipientEmail] : []);
    assert.deepEqual(payload.recipientPhones, payload.channel === 'sms' ? [payload.recipientPhone] : []);
  }
}

test('invoice sends each unique email and phone once and records all contacts', async () => {
  const s = setup('send-mail', [invoice()]);
  const result = await s.send();
  assert.equal(result.status, 200);
  assert.equal(result.body.sent, 1);
  assertTargets(s.calls);
  assert.equal(s.signedUrls(), 1);
  for (const payload of s.calls) {
    assert.equal(payload.attachments[0].url, 'https://example.invalid/invoice.pdf');
    assert.equal(payload.replyToEmail, 'caregiver@example.com');
  }
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].recipient_email, 'one@example.com; two@example.com');
  assert.equal(s.history[0].recipient_phone, '512375925; 506582082');
  assert.equal(s.history[0].status, 'wyslane');
  assert.equal(s.updates[0].value.status, 'wyslana');
});

test('unequal lists do not duplicate contacts; invoice email still works without phone', async () => {
  const row = invoice();
  row.klienci.telefon = '512375925';
  const s = setup('send-mail', [row]);
  await s.send();
  assert.equal(s.calls.length, 3);
  assert.equal(s.calls.filter(p => p.channel === 'sms').length, 1);
  row.klienci.telefon = null;
  const emailOnly = setup('send-mail', [row]);
  assert.equal((await emailOnly.send()).status, 200);
  assert.equal(emailOnly.calls.length, 2);
  assert.equal(emailOnly.history[0].recipient_phone, null);
});

test('invoice attempts remaining contacts after HTTP/network errors and never reports complete success', async () => {
  for (const failure of [true, 'network']) {
    const s = setup('send-mail', [invoice()], p => p.recipientPhone === '512375925' && failure);
    const result = await s.send();
    assert.equal(result.status, 400);
    assert.equal(result.body.sent, 0);
    assertTargets(s.calls);
    assert.equal(s.updates.length, 0);
    assert.equal(s.history.length, 1);
    assert.equal(s.history[0].status, 'blad');
    assert.match(s.history[0].error, /512375925/);
  }
});

test('overdue invoices of one client form one summary for every contact', async () => {
  const s = setup('overdue-reminder', [invoice(), invoice({ id: 'invoice-2', numer: 'FV/2' })]);
  const result = await s.send();
  assert.equal(result.status, 200);
  assert.equal(result.body.sent, 1);
  assertTargets(s.calls);
  for (const payload of s.calls) assert.equal(payload.invoices.length, 2);
  assert.equal(s.history.length, 2);
  assert.ok(s.history.every(h => h.recipient_phone === '512375925; 506582082' && h.status === 'wyslane'));
});

test('clients sharing an email never expose invoices to each other secondary contacts', async () => {
  const second = invoice({ id: 'invoice-2', klient_id: 'client-2' });
  second.klienci.email = 'one@example.com, third@example.com';
  second.klienci.telefon = '600000001,600000002';
  const s = setup('overdue-reminder', [invoice(), second]);
  assert.equal((await s.send()).body.sent, 2);
  assert.equal(s.calls.length, 8);
  for (const payload of s.calls) {
    assert.equal(payload.invoices.length, 1);
    if (payload.recipientEmail === 'two@example.com' || payload.recipientPhone === '506582082') {
      assert.equal(payload.invoices[0].invoiceId, 'invoice-1');
    }
    if (payload.recipientEmail === 'third@example.com' || payload.recipientPhone === '600000002') {
      assert.equal(payload.invoices[0].invoiceId, 'invoice-2');
    }
  }
});

test('reminder failure identifies contact, keeps attempting others and records error once', async () => {
  const s = setup('overdue-reminder', [invoice()], p => p.recipientEmail === 'two@example.com' && 'network');
  const result = await s.send();
  assert.equal(result.status, 400);
  assertTargets(s.calls);
  assert.equal(s.history.length, 1);
  assert.equal(s.history[0].status, 'blad');
  assert.match(s.history[0].error, /two@example.com/);
});

test('paid invoice status remains paid after sending to all contacts', async () => {
  const s = setup('send-mail', [invoice({ status: 'oplacona' })]);
  assert.equal((await s.send()).status, 200);
  assert.equal(s.updates.length, 0);
});
