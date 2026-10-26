const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const design = { colors: { navy: "#173B73", red: "#ff1f4b", white: "#fff", border: "#ccc", text: "#222", card: "#fff", danger: "#d00" }, radius: { input: "15px" }, shadow: {} };
function harness() {
  let cursor = 0;
  const states = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], next => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useEffect() {},
    useMemo(fn) { return fn(); },
  };
  const exports = {};
  const source = fs.readFileSync("src/components/AppDateInputs.tsx", "utf8") + "\nexport { EditablePickerField, typedValue, YearInput };";
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, document: { body: {} }, require: name => name === "react" ? hooks : name === "react-dom" ? { createPortal: node => node } : name === "@/app/design" ? design : require(name),
  });
  return { exports, states, render(component, props) { cursor = 0; return component(props); } };
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function input(tree) { return nodes(tree, node => node.type === "input")[0]; }
function typing(field, text) { field.props.onChange({ target: { value: text, setCustomValidity() {} } }); }
test("typed dates validate leap days and support Polish and ISO formats", () => {
  const { typedValue } = harness().exports;
  assert.equal(typedValue("29.02.2028", "date"), "2028-02-29");
  assert.equal(typedValue("29.02.2027", "date"), null);
  assert.equal(typedValue("31.04.2026", "date"), null);
  assert.equal(typedValue("2026-10-26", "date"), "2026-10-26");
  assert.equal(typedValue("11.2027", "month"), "2027-11");
  assert.equal(typedValue("2027-13", "month"), null);
});
test("keyboard edits commit once on blur, and incomplete edits do not reach autosave", () => {
  const h = harness(), calls = [];
  const props = { mode: "date", value: "2026-09-01", onChange: value => calls.push(value), anchorRef: { current: null } };
  typing(input(h.render(h.exports.EditablePickerField, props)), "2");
  assert.deepEqual(calls, []);
  input(h.render(h.exports.EditablePickerField, props)).props.onBlur();
  assert.deepEqual(calls, []);
  typing(input(h.render(h.exports.EditablePickerField, props)), "26.10.2026");
  input(h.render(h.exports.EditablePickerField, props)).props.onBlur();
  assert.deepEqual(calls, ["2026-10-26"]);
});
test("minimum, maximum, required, disabled and readonly prevent invalid writes", () => {
  for (const options of [{ max: "2026-10-25" }, { min: "2026-10-27" }, { disabled: true }, { readOnly: true }]) {
    const h = harness(), calls = [], props = { mode: "date", value: "", onChange: value => calls.push(value), ...options };
    typing(input(h.render(h.exports.EditablePickerField, props)), "26.10.2026");
    input(h.render(h.exports.EditablePickerField, props)).props.onBlur();
    assert.deepEqual(calls, []);
  }
  const h = harness(), calls = [], props = { mode: "date", value: "2026-09-01", required: true, onChange: value => calls.push(value) };
  typing(input(h.render(h.exports.EditablePickerField, props)), "");
  input(h.render(h.exports.EditablePickerField, props)).props.onBlur();
  assert.deepEqual(calls, []);
});
test("Enter commits and Escape cancels a keyboard edit", () => {
  const h = harness(), calls = [], props = { mode: "month", value: "2026-09", onChange: value => calls.push(value) };
  typing(input(h.render(h.exports.EditablePickerField, props)), "11.2027");
  input(h.render(h.exports.EditablePickerField, props)).props.onKeyDown({ key: "Enter", preventDefault() {} });
  assert.deepEqual(calls, ["2027-11"]);
  typing(input(h.render(h.exports.EditablePickerField, props)), "12.2030");
  input(h.render(h.exports.EditablePickerField, props)).props.onKeyDown({ key: "Escape", currentTarget: { setCustomValidity() {} } });
  assert.equal(input(h.render(h.exports.EditablePickerField, props)).props.value, "09.2026");
  assert.deepEqual(calls, ["2027-11"]);
});
test("calendar highlights today independently of selection and jumps directly between months and years", () => {
  const h = harness(), now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const props = { value: today, onChange() {} };
  h.render(h.exports.AppDateInput, props);
  h.states[0] = true;
  h.states[1] = { top: 0, left: 0, width: 292 };
  let tree = h.render(h.exports.AppDateInput, props);
  const current = nodes(tree, node => node.props?.["aria-current"] === "date");
  assert.equal(current.length, 1);
  assert.equal(current[0].props.style.background, design.colors.navy);
  assert.equal(current[0].props["aria-pressed"], true);
  nodes(tree, node => node.type === h.exports.YearInput)[0].props.onChange(1990);
  tree = h.render(h.exports.AppDateInput, props);
  assert.equal(nodes(tree, node => node.type === h.exports.YearInput)[0].props.year, 1990);
  nodes(tree, node => node.type === "select")[0].props.onChange({ target: { value: "1" } });
  tree = h.render(h.exports.AppDateInput, props);
  assert.equal(nodes(tree, node => node.type === "select")[0].props.value, 1);
});

test("reopening the calendar discards an invalid draft even when the selected date is unchanged", () => {
  const h = harness(), props = { mode: "date", value: "2026-09-01", onChange() {}, open: false };
  typing(input(h.render(h.exports.EditablePickerField, props)), "31.02.2026");
  input(h.render(h.exports.EditablePickerField, props)).props.onBlur();
  assert.equal(nodes(h.render(h.exports.EditablePickerField, props), node => node.props?.role === "alert").length, 1);
  h.render(h.exports.EditablePickerField, { ...props, open: true });
  const reopened = h.render(h.exports.EditablePickerField, { ...props, open: true });
  assert.equal(input(reopened).props.value, "01.09.2026");
  assert.equal(nodes(reopened, node => node.props?.role === "alert").length, 0);
});
test("year entry accepts a distant year with Enter and rejects invalid years", () => {
  const h = harness(), calls = [], tree = h.render(h.exports.YearInput, { year: 2026, onChange: year => calls.push(year) });
  tree.props.onKeyDown({ key: "Enter", preventDefault() {}, currentTarget: { value: "1990" } });
  assert.deepEqual(calls, [1990]);
  const invalid = { value: "0" };
  tree.props.onBlur({ currentTarget: invalid });
  assert.equal(invalid.value, "2026");
  assert.deepEqual(calls, [1990]);
});
