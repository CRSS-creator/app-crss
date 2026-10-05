const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const transpile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,"../src/lib",file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
test("analysis fetch loads every page and requests wages for later service work",async()=>{
 const calls=[],datasets={
 czas_pracy:Array.from({length:550},(_,i)=>({id:String(i),osoba_id:"p",started_at:"2026-09-10T10:00:00Z",ended_at:"2026-09-10T11:00:00Z",duration_seconds:3600,miesiac_rozliczeniowy:"2026-08-01",klient_id:"c"})),
 cfo_rachunki_bankowe:[{id:"a"}],cfo_transakcje_bankowe:Array.from({length:1038},(_,i)=>({id:String(i)})),cfo_koszty_pracownikow:[{id:"w"}]};
 const supabase={from(table){const q={range(a,b){calls.push([table,"range",a,b]);return Promise.resolve({data:datasets[table].slice(a,b+1),error:null});}};
 for(const method of ["select","not","or","order","lte","gte"])q[method]=(...args)=>{calls.push([table,method,...args]);return q;};return q;}};
 const ex={};vm.runInNewContext(transpile("cfoService.ts"),{exports:ex,Date,require:n=>n==="./cfoAnalytics"?{workMonth:s=>s.slice(0,7)}:{supabase}});
 const result=await ex.fetchCfoAnalysis("2026-08-01","2026-08-31");
 assert.equal(result.data.entries.length,550);assert.equal(result.data.bank.length,1038);
 assert.ok(calls.some(c=>c[0]==="cfo_koszty_pracownikow"&&c[1]==="lte"&&c[3]==="2026-09-01"));
 assert.ok(calls.some(c=>c[1]==="or"&&c[2].includes("miesiac_rozliczeniowy.gte.2026-08-01")));
});
test("failed requests return an error, not an empty successful report",async()=>{
 const supabase={from(){const q={range(){return Promise.resolve({data:null,error:{message:"offline"}});}};for(const m of ["select","not","or","order","lte","gte"])q[m]=()=>q;return q;}};
 const ex={};vm.runInNewContext(transpile("cfoService.ts"),{exports:ex,Date,require:n=>n==="./cfoAnalytics"?{workMonth:s=>s.slice(0,7)}:{supabase}});
 const result=await ex.fetchCfoAnalysis("2026-08-01","2026-08-31");assert.equal(result.data,null);assert.equal(result.error.message,"offline");
});

