const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = process.env.CSO_TEST_ROOT || path.join(__dirname, "..");
const linkedin = JSON.parse(fs.readFileSync(path.join(root, "src/lib/csoLinkedinTopics.json"), "utf8"));
const source = fs.readFileSync(path.join(root, "src/app/cso/page.tsx"), "utf8");
const code = ts.transpileModule(source + "\nexport { createInitialTopics, mergeSavedTopics, readSavedPlan, persistTopic, CsoContent };", { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
function load() {
  const writes = [], filters = [], effects = [], states = [];
  let index = 0;
  const remoteRow = { id: "topic-1", category: "Ceny i koszty", title: "Saved topic", status: "opublikowane", note: "Keep my note", facebook_published: true, blog_published: true };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "test-user" } } }) },
    from: () => ({
      upsert: async row => { writes.push(row); return { error: null }; },
      select: () => ({ eq: (column, platform) => {
        filters.push([column, platform]);
        return { order: async () => ({ data: platform === "facebook" ? [remoteRow] : [], error: null }) };
      } }),
    }),
  };
  const exports = {};
  const storage = new Map([["crss-cso-content-plan", JSON.stringify({ topics: [remoteRow], facebookTopics: { "topic-1": true }, blogTopics: { "topic-1": true } })]]);
  const fakeReact = { ...React,
    useEffect: fn => { effects.push(fn); },
    useMemo: fn => fn(),
    useState: initial => { const key = index++; states[key] = typeof initial === "function" ? initial() : initial; return [states[key], value => { states[key] = typeof value === "function" ? value(states[key]) : value; }]; },
  };
  vm.compileFunction(code, ["exports", "require", "window"], {})(exports, name => {
    if (name === "react") return fakeReact;
    if (name === "@/lib/csoLinkedinTopics.json") return linkedin;
    if (name === "@/lib/supabaseClient") return { supabase };
    if (name === "@/app/design") return { colors: {}, radius: {}, shadow: {} };
    if (name === "@/components/AppSelect") return () => null;
    if (name.startsWith("@/")) return ({ children }) => children;
    return require(name);
  }, { localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
  return { exports, writes, filters, effects, states, remoteRow };
}
test("Facebook retains 120 stable IDs; LinkedIn has 180 unique topics in six groups", () => {
  const { exports: mod } = load();
  const fb = mod.createInitialTopics("facebook"), li = mod.createInitialTopics("linkedin");
  assert.equal(fb.length, 120); assert.equal(li.length, 180);
  assert.equal(fb[0].id, "topic-1"); assert.equal(fb[119].id, "topic-120");
  assert.equal(new Set(li.map(t => t.title)).size, 180);
  assert.ok(li.every(t => !fb.some(f => f.id === t.id)));
  const counts = {}; for (const t of li) counts[t.category] = (counts[t.category] || 0) + 1;
  assert.equal(Object.keys(counts).length, 6); assert.ok(Object.values(counts).every(n => n === 30));
});
test("legacy Facebook local data is not read by LinkedIn", () => {
  const { exports: mod } = load();
  assert.ok(mod.readSavedPlan("facebook").facebookTopics["topic-1"]);
  assert.equal(mod.readSavedPlan("linkedin"), null);
});
test("writes use separate platform and publication fields", async () => {
  const { exports: mod, writes } = load();
  await mod.persistTopic(mod.createInitialTopics("facebook")[0], true, true, "facebook");
  await mod.persistTopic(mod.createInitialTopics("linkedin")[0], true, false, "linkedin");
  assert.equal(writes[0].platform, "facebook"); assert.equal(writes[0].facebook_published, true);
  assert.equal(writes[1].platform, "linkedin"); assert.equal(writes[1].linkedin_published, true);
  assert.ok(!("facebook_published" in writes[1]));
  assert.ok(!("linkedin_published" in writes[0]));
});
test("Facebook database notes, statuses and flags survive hydration without writes", async () => {
  const ctx = load();
  ctx.exports.CsoContent({ platform: "facebook" });
  ctx.effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ctx.filters, [["platform", "facebook"]]);
  const topic = ctx.states[2].find(t => t.id === "topic-1");
  assert.equal(topic.note, "Keep my note"); assert.equal(topic.status, "opublikowane");
  assert.equal(ctx.states[3]["topic-1"], true); assert.equal(ctx.states[4]["topic-1"], true);
  assert.equal(ctx.writes.length, 0);
});
test("LinkedIn loads independently without channel checkboxes", async () => {
  const ctx = load();
  const tree = ctx.exports.CsoContent({ platform: "linkedin" });
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes("LinkedIn")); assert.ok(!html.includes("Blog"));
  assert.ok(!html.includes('type="checkbox"'));
  assert.ok(!html.includes(">FB<"));
  assert.ok(html.includes("Dodaj temat")); assert.ok(html.includes("Notatka"));
  ctx.effects[0](); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ctx.filters, [["platform", "linkedin"]]);
  assert.equal(ctx.states[2].length, 180); assert.equal(ctx.writes.length, 0);
});
test("two tabs remount independent plans", () => {
  const ctx = load();
  const tree = ctx.exports.default();
  const html = renderToStaticMarkup(tree);
  assert.ok(html.includes("Facebook")); assert.ok(html.includes("LinkedIn"));
  assert.ok(html.includes('aria-pressed="true"'));
});

