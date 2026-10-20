const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, requireImpl, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: requireImpl, ...globals });
  return exports;
}

test('concurrent menu and guard share a profile read, but later checks see changed permissions', async () => {
  let calls = 0, finish;
  const client = { from: () => ({ select() { return this; }, eq() { return this; }, single() {
    calls++;
    return new Promise(resolve => { finish = resolve; });
  } }) };
  const { fetchAccessProfile } = load('src/lib/accessProfile.ts', () => ({ supabase: client }));
  const a = fetchAccessProfile('one'), b = fetchAccessProfile('one');
  assert.equal(a, b);
  assert.equal(calls, 1);
  finish({ data: { role: 'owner', aktywne: true }, error: null });
  await a;
  const later = fetchAccessProfile('one');
  assert.equal(calls, 2);
  finish({ data: { role: 'accountant', aktywne: false }, error: null });
  assert.equal((await later).data.aktywne, false);
});

test('profile reads are isolated by user and a failed request can be retried', async () => {
  let calls = 0;
  const client = { from: () => ({ select() { return this; }, eq() { return this; }, single() {
    calls++;
    return calls === 1 ? Promise.reject(Error('network')) : Promise.resolve({ data: null, error: null });
  } }) };
  const { fetchAccessProfile } = load('src/lib/accessProfile.ts', () => ({ supabase: client }));
  const a = fetchAccessProfile('one'), b = fetchAccessProfile('two');
  await assert.rejects(a, /network/);
  await b;
  await fetchAccessProfile('one');
  assert.equal(calls, 3);
});

test('login-to-module navigation keeps hook order and inactivity logout still works', async () => {
  let pathname = '/login', effect, cleanup, hookCount = 0, signedOut = 0, destination;
  const timers = new Map(), listeners = new Map();
  let nextTimer = 0;
  const state = [];
  const react = {
    useRef: () => { hookCount++; return { current: null }; },
    useState: () => { hookCount++; return [false, value => state.push(value)]; },
    useCallback: fn => { hookCount++; return fn; },
    useEffect: fn => { hookCount++; effect = fn; },
  };
  const { default: Component } = load('src/components/SessionTimeout.tsx', id => {
    if (id === 'react') return react;
    if (id === 'next/navigation') return { usePathname: () => pathname, useRouter: () => ({ push: path => { destination = path; } }) };
    if (id.includes('supabaseClient')) return { supabase: { auth: { signOut: async () => { signedOut++; } } } };
    return { jsx: () => null, jsxs: () => null };
  }, {
    window: { addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) },
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; },
    clearTimeout: key => timers.delete(key),
  });
  Component();
  const loginHooks = hookCount;
  assert.equal(effect(), undefined);
  assert.equal(timers.size, 0);
  pathname = '/klienci'; hookCount = 0;
  Component(); cleanup = effect();
  assert.equal(hookCount, loginHooks);
  assert.equal(listeners.has('beforeunload'), false);
  assert.equal(timers.size, 2);
  [...timers.values()].find(item => item.ms === 59 * 60000).fn();
  assert.equal(state.at(-1), true);
  [...timers.values()].find(item => item.ms === 60 * 60000).fn();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(signedOut, 1);
  assert.equal(destination, '/login');
  cleanup();
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
});
