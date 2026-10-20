const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const source=fs.readFileSync('src/app/cfo/page.tsx','utf8')+'\nexport {buildCfoView,firstCfoSummaryMonth,buildYearSummaryRows,cfoPeriodRange};';const api={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:api,Date,Intl,console,require:name=>name==='@/app/design'?{colors:new Proxy({},{get:()=> '#000'}),radius:{},shadow:{}}:name==='@/components/cfoStyles'?{}:{}});
const revenue=(month,amount=1000)=>({id:month,kwota_netto:amount,cfo_przychod_kategoria:'abonamenty',faktury:{id:month,okres:month+'-01',kontrahent_nazwa:'Client'}});
const cost=(month,amount=100)=>({id:month,data_dokumentu:month+'-01',okres_start:month+'-01',okres_end:month+'-28',kwota_netto_cfo:amount,kategoria:'systemy_technologia',podkategoria:'License',ujecie_zarzadcze:'jednorazowo',ignoruj:false});
const employee=(month,amount=200)=>({okres:month+'-01',podstawa:amount,zespol:'ksiegowy'});
test('year summary includes the selected month, including January',()=>{
 assert.equal(api.cfoPeriodRange('2026-09','year').to,'2026-09-30');assert.equal(api.cfoPeriodRange('2026-01','year').to,'2026-01-31');
});
test('start uses available operating data rather than an older prepaid annual invoice',()=>{
 const annual={...cost('2026-01'),ujecie_zarzadcze:'rozliczenie_w_czasie',okres_end:'2026-12-31'};
 assert.equal(api.firstCfoSummaryMonth('2026-10',[revenue('2026-09')],[annual,cost('2026-09')],[employee('2026-09')]),'2026-09');
 assert.equal(api.firstCfoSummaryMonth('2026-10',[],[],[]),'2026-10');
});
test('chosen start excludes earlier wages and cash and prorates annual costs',()=>{
 const annual={...cost('2026-01',1200),ujecie_zarzadcze:'rozliczenie_w_czasie',okres_end:'2026-12-31'};
 const bank=[{data_ksiegowania:'2026-01-15',kwota:999,typ:'przychod'},{data_ksiegowania:'2026-09-15',kwota:123,typ:'przychod'}];
 const result=api.buildCfoView('2026-10','year',[revenue('2026-01',9999),revenue('2026-09'),revenue('2026-10')],[annual],[employee('2026-01',9999),employee('2026-09'),employee('2026-10')],bank,'2026-09');
 assert.equal(result.revenue,2000);assert.equal(result.operatingCosts,600);assert.equal(result.cashFlow,123);assert.equal(result.range.from,'2026-09-01');
});
test('monthly rows reconcile with range totals and flag gaps without inventing activity',()=>{
 const revenues=[revenue('2026-09'),revenue('2026-10')],costs=[cost('2026-09'),cost('2026-10')],employees=[employee('2026-09'),employee('2026-10')];
 const rows=api.buildYearSummaryRows('2026-09','2026-11',revenues,costs,employees,[]);
 assert.equal(rows.length,3);assert.equal(rows[0].missing.length,0);assert.equal(rows[2].missing.length,3);assert.equal(rows[2].hasCash,false);
 const year=api.buildCfoView('2026-11','year',revenues,costs,employees,[],'2026-09');assert.equal(rows.reduce((n,r)=>n+r.result.operatingResult,0),year.operatingResult);
});

test('manual revenue is included once in monthly and yearly CFO results, not in MRR',()=>{
 const manual={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/cfoManualRevenue.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:manual,require:()=>({})});
 const lines=manual.manualRevenueLines([{id:'grant',opis:'Grant',zrodlo:'Institution',rodzaj:'dotacja',okres:'2026-09-01',data_dokumentu:'2026-08-01',kwota_netto:5000,kwota_brutto:5000,data_wplywu:null,termin_wplywu:null,numer_dokumentu:null}]);
 const month=api.buildCfoView('2026-09','month',lines,[],[],[]);assert.equal(month.revenue,5000);assert.equal(month.mrr,0);
 const year=api.buildCfoView('2026-10','year',lines,[],[],[],'2026-09');assert.equal(year.revenue,5000);assert.equal(year.mrr,0);
 const rows=api.buildYearSummaryRows('2026-09','2026-10',lines,[],[],[]);assert.equal(rows[0].result.revenue,5000);assert.equal(rows[1].result.revenue,0);
});
