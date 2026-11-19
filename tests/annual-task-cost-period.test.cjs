const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), ts = require("typescript");
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/cfoAnalytics.ts", "utf8"), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, { exports: api, Intl, Date });
const entry = (extra = {}) => ({
 id:"entry", zadanie_id:"task", zadanie_cykliczne_id:null, klient_id:"client", osoba_id:"person",
 started_at:"2026-11-19T10:00:00Z", ended_at:"2026-11-19T11:00:00Z",
 duration_seconds:3600, miesiac_rozliczeniowy:"2026-11-01", czy_wewnetrzne:false,
 zadania:{czy_roczne:true}, ...extra
});
test("annual work uses the previous service month without changing its date or duration", () => {
 const original=entry(), result=api.applyAnnualTaskCostPeriod(original);
 assert.equal(result.miesiac_rozliczeniowy,"2026-10-01");
 assert.equal(result.started_at,original.started_at);
 assert.equal(result.duration_seconds,3600);
 assert.equal(original.miesiac_rozliczeniowy,"2026-11-01");
 assert.equal(api.applyAnnualTaskCostPeriod(result).miesiac_rozliczeniowy,"2026-10-01");
});
test("January and Warsaw midnight are assigned to the correct previous month", () => {
 assert.equal(api.applyAnnualTaskCostPeriod(entry({started_at:"2027-01-10T10:00:00Z"})).miesiac_rozliczeniowy,"2026-12-01");
 assert.equal(api.applyAnnualTaskCostPeriod(entry({started_at:"2026-10-31T23:30:00Z"})).miesiac_rozliczeniowy,"2026-10-01");
});
test("ordinary tasks, recurring tasks and internal time retain their current periods", () => {
 for(const row of [entry({zadania:{czy_roczne:false}}),entry({zadanie_id:null}),entry({czy_wewnetrzne:true}),entry({klient_id:null})]) {
  assert.equal(api.applyAnnualTaskCostPeriod(row),row);
 }
});
test("annual entries and corrections spanning months keep proportional allocation", () => {
 const rows=[entry(),entry({id:"december",started_at:"2026-12-10T10:00:00Z",ended_at:"2026-12-10T11:00:00Z"})];
 const correction={id:"correction",zadanie_id:"task",klient_id:"client",osoba_id:"person",created_at:"2027-01-05T10:00:00Z",duration_seconds:3600,miesiac_rozliczeniowy:null,zadania:{czy_roczne:true}};
 const result=api.applyCfoTimeCorrections(rows,[correction]);
 assert.equal(result[0].duration_seconds,5400);
 assert.equal(result[1].duration_seconds,5400);
 assert.equal(result[0].miesiac_rozliczeniowy,"2026-10-01");
 assert.equal(result[1].miesiac_rozliczeniowy,"2026-11-01");
 const manual=api.applyCfoTimeCorrections([],[correction]);
 assert.equal(manual[0].miesiac_rozliczeniowy,"2026-12-01");
});
test("October client costs use November wages and are not charged again in November", () => {
 const wage={id:"wage",okres:"2026-11-01",osoba_id:"person",w_capacity:true,wymiar_etatu:1,podstawa:16000,zus_pracodawcy:0,benefity:0,premie:0,szkolenia:0};
 const rows=api.applyCfoTimeCorrections([entry()],[]);
 const october=api.clientProfitability("2026-10-01","2026-10-01",[],[],[wage],rows);
 assert.equal(october.clients[0].hours,1);
 assert.equal(october.clients[0].knownLaborCost,16000/api.capacityHours(wage));
 assert.equal(api.clientProfitability("2026-11-01","2026-11-01",[],[],[wage],rows).clients.length,0);
});

test("October report fetch includes November annual work and the November wage period", async () => {
 const calls=[];
 const datasets={czas_pracy:[entry()],korekty_czasu_zadan:[],cfo_koszty_pracownikow:[]};
 const client={from(table){
  const query={select(value){calls.push([table,"select",value]);return this;},not(){return this;},order(){return this;},gte(key,value){calls.push([table,"gte",value]);return this;},lte(key,value){calls.push([table,"lte",value]);return this;},range(){return Promise.resolve({data:datasets[table]||[],error:null});}};
  return query;
 }};
 const service={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/cfoService.ts","utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
 }).outputText,{exports:service,require:id=>id.includes("supabaseClient")?{supabase:client}:api});
 const result=await service.fetchCfoAnalysis("2026-10-01","2026-10-01",false);
 assert.equal(result.error,null);
 assert.equal(result.data.entries.length,1);
 assert.equal(result.data.entries[0].miesiac_rozliczeniowy,"2026-10-01");
 assert.ok(calls.some(row=>row[0]==="czas_pracy" && row[1]==="select" && row[2].includes("zadania(czy_roczne)")));
 assert.ok(calls.some(row=>row[0]==="cfo_koszty_pracownikow" && row[1]==="lte" && row[2]==="2026-11-01"));
});
