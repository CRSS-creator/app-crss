const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function setup({ saveError = false, uploadError = false } = {}) {
  const calls = [];
  const document = { id: "document", nazwa: "Procedura", nazwa_pliku: "test.pdf", sciezka: "owner/file.pdf", rozmiar: 20 };
  const storage = {
    upload: async (path, file, options) => { calls.push(["upload", path, options]); return { error: uploadError ? Error("upload") : null }; },
    remove: async paths => { calls.push(["remove", paths]); return { error: null }; },
    download: async path => { calls.push(["download", path]); return { data: "file-content", error: null }; },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: null }) },
    storage: { from: () => storage },
    from: () => ({
      insert: payload => { calls.push(["insert", payload]); return { select: () => ({ single: async () => ({ data: saveError ? null : document, error: saveError ? Error("save") : null }) }) }; },
    }),
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/procedureDocumentsService.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: () => ({ supabase: client }), crypto: { randomUUID: () => "uuid" }, console });
  return { service: exports, calls, document };
}
const file = { name: "test.pdf", size: 20, type: "application/pdf" };

test("upload saves metadata and uses unique owner path without replacing a file", async () => {
  const { service, calls, document } = setup();
  assert.equal(await service.uploadProcedureDocument("  Procedura  ", file), document);
  assert.equal(calls[0][1], "owner/uuid/test.pdf");
  assert.equal(calls[0][2].upsert, false);
  assert.equal(calls[1][1].nazwa, "Procedura");
  assert.equal(calls[1][1].created_by, "owner");
});
test("failed metadata save cleans the unpublished upload", async () => {
  const { service, calls } = setup({ saveError: true });
  await assert.rejects(service.uploadProcedureDocument("Procedura", file), /zapisać/);
  assert.equal(calls.at(-1)[0], "remove");
  assert.equal(calls.at(-1)[1][0], "owner/uuid/test.pdf");
});
test("invalid or failed upload never publishes metadata", async () => {
  const { service, calls } = setup({ uploadError: true });
  await assert.rejects(service.uploadProcedureDocument("", file), /nazwę/);
  await assert.rejects(service.uploadProcedureDocument("Procedura", { ...file, size: 0 }), /pusty/);
  await assert.rejects(service.uploadProcedureDocument("Procedura", { ...file, size: 26214401 }), /25 MB/);
  assert.equal(calls.length, 0);
  await assert.rejects(service.uploadProcedureDocument("Procedura", file), /przesłać/);
  assert.equal(calls.filter(call => call[0] === "insert").length, 0);
});
test("download requests stored path and returns file content", async () => {
  const { service, calls, document } = setup();
  assert.equal(await service.downloadProcedureDocument(document), "file-content");
  assert.equal(calls[0][1], document.sciezka);
});
