const { test }=require("node:test"), assert=require("node:assert/strict"),fs=require("fs"),vm=require("vm"),ts=require("typescript");
function setup(data={id:"entry"},error=null){
 const calls=[];const query={update(payload){calls.push(["update",payload]);return this;},eq(key,value){calls.push(["eq",key,value]);return this;},select(){return this;},maybeSingle(){return Promise.resolve({data,error});}};
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/taskTimeEntryService.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {exports,Date,Intl,require:id=>id.includes("supabaseClient")?{supabase:{from:table=>{calls.push(["table",table]);return query;}}}:{correctionAsTimeEntry:row=>({...row,is_time_correction:true})}});
 return {api:exports,calls};
}
const row={id:"entry",zadanie_id:"task",started_at:"2026-11-19T09:00:00Z",ended_at:"2026-11-19T10:00:00Z",updated_at:"2026-11-19T10:00:00Z",duration_seconds:3600};
test("saves individual dates, note and Warsaw accounting month with optimistic locking",async()=>{
 const {api,calls}=setup();
 await api.updateIndividualTaskTime(row,{startedAt:"2026-10-31T23:30:00Z",endedAt:"2026-11-01T01:00:00Z",description:" Work "});
 const payload=calls.find(c=>c[0]==="update")[1];
 assert.equal(payload.miesiac_rozliczeniowy,"2026-11-01");assert.equal(payload.opis,"Work");
 assert.ok(calls.some(c=>c[0]==="eq"&&c[1]==="updated_at"&&c[2]===row.updated_at));
});
test("invalid chronology and active timers do not make an update",async()=>{
 const {api,calls}=setup();
 await assert.rejects(api.updateIndividualTaskTime(row,{startedAt:"2026-11-19T11:00:00Z",endedAt:"2026-11-19T10:00:00Z",description:""}),/Koniec/);
 await assert.rejects(api.updateIndividualTaskTime({...row,ended_at:null},{startedAt:row.started_at,endedAt:row.ended_at,description:""}),/zatrzymaj/);
 assert.equal(calls.length,0);
});
test("edits signed correction separately and checks its old duration",async()=>{
 const {api,calls}=setup({id:"correction",duration_seconds:-600});
 const result=await api.updateIndividualTaskTime({...row,is_time_correction:true},{correctionSeconds:-600});
 assert.equal(result.is_time_correction,true);
 assert.equal(calls[0][1],"korekty_czasu_zadan");
 assert.equal(calls.find(c=>c[0]==="update")[1].duration_seconds,-600);
 assert.ok(calls.some(c=>c[0]==="eq"&&c[1]==="duration_seconds"&&c[2]===3600));
});
test("concurrent or unauthorized edit is reported instead of claiming success",async()=>{
 const {api}=setup(null);
 await assert.rejects(api.updateIndividualTaskTime(row,{startedAt:row.started_at,endedAt:row.ended_at,description:""}),/Odśwież/);
});
