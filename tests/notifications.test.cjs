const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/notificationService.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadService(supabase) {
  const exports = {};
  const events = [];
  vm.runInNewContext(compiled, {
    exports, require: () => ({ supabase }), Event,
    window: { dispatchEvent: (event) => events.push(event.type) },
  });
  return { service: exports, events };
}

function notificationQuery(resultForRange) {
  const ranges = [];
  const orders = [];
  const query = {
    select() { return this; },
    order(...args) { orders.push(args); return this; },
    range(from, to) { ranges.push([from, to]); return Promise.resolve(resultForRange(from, to)); },
  };
  return { from: () => query, ranges, orders };
}

test('all 214 notifications are fetched, including unread rows beyond the old 100-row limit', async () => {
  const rows = Array.from({ length: 214 }, (_, id) => ({ id: String(id), status: id > 199 ? 'unread' : 'read' }));
  const db = notificationQuery((from, to) => ({ data: rows.slice(from, to + 1), error: null }));
  const { service } = loadService(db);
  const result = await service.fetchNotifications();
  assert.equal(result.data.length, 214);
  assert.equal(result.data.filter(row => row.status === 'unread').length, 14);
  assert.deepEqual(db.ranges, [[0, 99], [100, 199], [200, 299]]);
  assert.equal(db.orders.filter(([column]) => column === 'id').length, 3);
});

test('a failed later page does not masquerade as a complete notification list', async () => {
  const error = { message: 'offline' };
  const db = notificationQuery(from => from === 0
    ? { data: Array(100).fill({ id: 'x' }), error: null }
    : { data: null, error });
  const { service } = loadService(db);
  const result = await service.fetchNotifications();
  assert.equal(result.error, error);
  assert.equal(result.data, null);
});

test('an exact page boundary and an empty inbox terminate correctly', async () => {
  for (const size of [0, 100]) {
    const rows = Array(size).fill({ id: 'x' });
    const db = notificationQuery((from, to) => ({ data: rows.slice(from, to + 1), error: null }));
    assert.equal((await loadService(db).service.fetchNotifications()).data.length, size);
    assert.equal(db.ranges.length, size === 0 ? 1 : 2);
  }
});

test('simultaneous layout/page/focus requests share one generation and allow the next refresh', async () => {
  let calls = 0;
  const { service } = loadService({ rpc: async () => { calls++; return { data: 0, error: null }; } });
  const first = service.createDueNotifications();
  assert.equal(service.createDueNotifications(), first);
  assert.equal(service.createDueNotifications(), first);
  await first;
  assert.equal(calls, 12);
  await service.createDueNotifications();
  assert.equal(calls, 24);
});

test('a rejected generation does not block future attempts', async () => {
  let fail = true;
  const { service } = loadService({ rpc: async () => {
    if (fail) throw new Error('offline');
    return { data: 0, error: null };
  } });
  await assert.rejects(service.createDueNotifications(), /offline/);
  fail = false;
  assert.equal((await service.createDueNotifications()).error, null);
});

test('read actions notify the badge only after successful persistence', async () => {
  for (const error of [null, { message: 'denied' }]) {
    const { service, events } = loadService({ from: () => ({
      update: () => ({ eq: async () => ({ data: null, error }) }),
    }) });
    assert.equal((await service.markNotificationRead('test')).error, error);
    assert.equal((await service.markAllNotificationsRead()).error, error);
    assert.equal(events.length, error ? 0 : 2);
    assert.ok(events.every(name => name === 'notifications-changed'));
  }
});
