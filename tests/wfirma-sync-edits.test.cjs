const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/app/api/faktury/wfirma/sync-payments/route.ts'),'utf8')+'\nexport {findMatchingFinalWfirmaInvoice,loadWfirmaInvoicesByMonth,syncWfirmaInvoiceSnapshot};';
function load(overrides={}) {
 const exports={};
 const wfirma={extractWfirmaInvoices:x=>x,firstWfirmaInvoice:x=>x,...overrides};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports,console,process,require(name){if(name==='@/lib/wfirmaClient')return wfirma;if(name==='@/lib/invoiceBankAccount')return {isWfirmaDraft:()=>false};return {};}
 });
 return exports;
}
const local={id:'local',numer:'WRF 173',wfirma_id:'draft',kontrahent_nip:'1234567890',data_wystawienia:'2026-10-16',okres:'2026-09-01',kwota_brutto:246};
const final={id:'final',fullnumber:'FV 46/10/2026',contractor_nip:'1234567890',date:'2026-10-16',total:'246'};
test('draft matching excludes prior invoices, occupied IDs and ambiguous candidates',()=>{
 const {findMatchingFinalWfirmaInvoice:match}=load();
 assert.equal(match(local,[{...final,date:'2026-10-05'}],new Set()),null);
 assert.equal(match(local,[final],new Set(['final'])),null);
 assert.equal(match(local,[final,{...final,id:'another'}],new Set()),null);
 assert.equal(match(local,[{...final,total:'999'}],new Set()),null);
 assert.equal(match(local,[final],new Set()).id,'final');
 assert.equal(match({...local,numer:'FV 23/10/2026'},[final],new Set()),null);
});
test('exact remote ID is fetched before replacement, including changed subscription amount',async()=>{
 let reads=0;
 const {loadWfirmaInvoicesByMonth:loadInvoices}=load({findWfirmaInvoices:async()=>[{id:'draft',fullnumber:'WRF 173'},final],getWfirmaInvoice:async(_,id)=>{reads++;assert.equal(id,'draft');return {...final,id:'draft',total:500};}});
 const data=await loadInvoices({from(){throw Error('must not look up replacement')}},{},[local],'2026-10');
 assert.equal(data.get('draft').fullnumber,'FV 46/10/2026');
 assert.equal(data.get('draft').total,500);
 assert.equal(reads,1);
});
test('replacement cannot claim an ID already stored outside the selected invoices',async()=>{
 const {loadWfirmaInvoicesByMonth:loadInvoices}=load({findWfirmaInvoices:async()=>[{id:'draft',fullnumber:'WRF 173'},final],getWfirmaInvoice:async()=>({id:'draft',fullnumber:'WRF 173'})});
 const query={select(){return this},eq(){return this},neq(){return this},async maybeSingle(){return {data:{id:'other-local'},error:null}}};
 const data=await loadInvoices({from:()=>query},{},[local],'2026-10');
 assert.equal(data.get('draft').fullnumber,'WRF 173');
});
test('refresh replaces unchanged-name PDF and sends zero amounts plus lines in one RPC',async()=>{
 let downloads=0,call;
 const {syncWfirmaInvoiceSnapshot:sync}=load({getWfirmaInvoice:async()=>({...final,description:"Aktualny opis z wFirmy"}),downloadWfirmaInvoicePdf:async()=>{downloads++;return new Uint8Array([1]);},wfirmaInvoiceAmounts:()=>({net:0,tax:0,gross:0}),extractWfirmaInvoiceLines:()=>[{id:1,name:'Changed',netto:0,brutto:0}],wfirmaLineAmounts:()=>({net:0,tax:0,gross:0})});
 const admin={storage:{from:()=>({upload:async()=>({error:null})})},async rpc(name,args){call={name,args};return {error:null}}};
 await sync(admin,{}, {...local,wfirma_id:'final',numer:final.fullnumber,wfirma_pdf_path:'old/path',wfirma_pdf_name:'old.pdf'},final,()=>{throw Error('not a draft')});
 assert.equal(downloads,1);
 assert.equal(call.name,'sync_wfirma_invoice_snapshot');
 assert.equal(call.args.public_header.kwota_netto,0);
 assert.equal(call.args.public_header.kwota_vat,0);
 assert.equal(call.args.public_header.kwota_brutto,0);
 assert.equal(call.args.public_lines.length,1);
 assert.equal(call.args.public_header.opis,'Aktualny opis z wFirmy');
 assert.notEqual(call.args.public_header.wfirma_pdf_path,'old/path');
});

test('empty remote description clears the old one and incomplete detail never reaches the write RPC',async()=>{
 let calls=0,description;
 const overrides={getWfirmaInvoice:async()=>({...final,description:''}),downloadWfirmaInvoicePdf:async()=>new Uint8Array([1]),wfirmaInvoiceAmounts:()=>({net:100,tax:23,gross:123}),extractWfirmaInvoiceLines:()=>[{id:1}],wfirmaLineAmounts:()=>({net:100,tax:23,gross:123})};
 const admin={storage:{from:()=>({upload:async()=>({error:null})})},async rpc(_,args){calls++;description=args.public_header.opis;return {error:null}}};
 await load(overrides).syncWfirmaInvoiceSnapshot(admin,{},local,final,()=>{});
 assert.equal(description,null);
 assert.equal(calls,1);
 await assert.rejects(load({...overrides,extractWfirmaInvoiceLines:()=>[]}).syncWfirmaInvoiceSnapshot(admin,{},local,final,()=>{}),/nie zwróciła pozycji/);
 assert.equal(calls,1);
 await assert.rejects(load({...overrides,getWfirmaInvoice:async()=>({...final,id:'wrong'})}).syncWfirmaInvoiceSnapshot(admin,{},local,final,()=>{}),/nie zwróciła szczegółów/);
 assert.equal(calls,1);
});

test('inconsistent totals and a failed PDF download do not write a partial snapshot',async()=>{
 let calls=0,downloads=0;
 const overrides={getWfirmaInvoice:async()=>final,downloadWfirmaInvoicePdf:async()=>{downloads++;throw Error('Unavailable')},wfirmaInvoiceAmounts:()=>({net:100,tax:23,gross:123}),extractWfirmaInvoiceLines:()=>[{id:1}],wfirmaLineAmounts:()=>({net:50,tax:11.5,gross:61.5})};
 const admin={async rpc(){calls++;return {error:null}}};
 await assert.rejects(load(overrides).syncWfirmaInvoiceSnapshot(admin,{},local,final,()=>{}),/niespójne/);
 assert.equal(downloads,0);
 await assert.rejects(load({...overrides,wfirmaLineAmounts:()=>({net:100,tax:23,gross:123})}).syncWfirmaInvoiceSnapshot(admin,{},local,final,()=>{}),/aktualnego PDF/);
 assert.equal(calls,0);
});
