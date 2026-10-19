const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/app/api/faktury/wfirma/sync-payments/route.ts'),'utf8')+'\nexport {loadSelectedWfirmaInvoices,findMatchingFinalWfirmaInvoice,loadWfirmaInvoicesByMonth,syncWfirmaInvoiceSnapshot,retryWfirmaRead,isRecoveryCandidate,loadConfirmedReplacement};';
function load(overrides={}) {
 const exports={};
 const wfirma={extractWfirmaInvoices:x=>x,firstWfirmaInvoice:x=>x,...overrides};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
  exports,console,process,Error,setTimeout,require(name){if(name==='@/lib/wfirmaClient')return wfirma;if(name==='@/lib/invoiceBankAccount')return {isWfirmaDraft:()=>false};return {};}
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

test('confirmed final number resolves a disappeared draft despite edited subscription amount',async()=>{
 const renamed={...local,numer:final.fullnumber};
 const changed={...final,total:'999'};
 const {findMatchingFinalWfirmaInvoice:match,loadWfirmaInvoicesByMonth:loadInvoices}=load({findWfirmaInvoices:async()=>[changed],getWfirmaInvoice:async()=>null});
 assert.equal(match(renamed,[changed],new Set()).id,'final');
 assert.equal(match(renamed,[{...changed,contractor_nip:'9999999999'}],new Set()),null);
 const query={select(){return this},eq(){return this},neq(){return this},async maybeSingle(){return {data:null,error:null}}};
 const data=await loadInvoices({from:()=>query},{},[renamed],null);
 assert.equal(data.get('draft').id,'final');
 assert.equal(data.get('draft').total,'999');
});
test('lookup preserves API errors instead of reporting that a document is missing',async()=>{
 const errors=new Map();
 const {loadWfirmaInvoicesByMonth:loadInvoices}=load({findWfirmaInvoices:async()=>{throw Error('wFirma AUTH: unavailable')},getWfirmaInvoice:async()=>{throw Error('wFirma ERROR: unavailable')}});
 const data=await loadInvoices({}, {}, [local],null,errors);
 assert.equal(data.has('draft'),false);
 assert.match(errors.get('draft'),/wFirma AUTH: unavailable/);
});

test('transient reads retry twice, permanent errors do not retry',async()=>{
 const {retryWfirmaRead:retry}=load();let calls=0;const delays=[];
 assert.equal(await retry(async()=>{if(++calls<3)throw Error('fetch failed');return 'ok'},async ms=>delays.push(ms)),'ok');
 assert.deepEqual(delays,[400,1200]);assert.equal(calls,3);
 calls=0;await assert.rejects(retry(async()=>{calls++;throw Error('wFirma 401: denied')},async()=>{}));assert.equal(calls,1);
 calls=0;await assert.rejects(retry(async()=>{calls++;throw Object.assign(Error('temporary'),{httpStatus:503})},async()=>{}));assert.equal(calls,3);
});
test('confirmed replacement validates identity, period, occupied ID and stale selection',async()=>{
 const candidate={...final,id:'123',total:999};
 const {loadConfirmedReplacement:confirm}=load({getWfirmaInvoice:async()=>candidate});
 const query={select(){return this},eq(){return this},neq(){return this},async maybeSingle(){return {data:null,error:null}}};
 const admin={from:()=>query};const selection={invoiceId:local.id,previousWfirmaId:'draft',wfirmaId:'123'};
 assert.equal((await confirm(admin,{},local,selection)).id,'123');
 await assert.rejects(confirm(admin,{},local,{...selection,previousWfirmaId:'old'}),/zmieniło/);
 await assert.rejects(confirm(admin,{}, {...local,kontrahent_nip:'999'},selection),/nie pasuje/);
 await assert.rejects(confirm(admin,{}, {...local,data_wystawienia:'2025-01-01'},selection),/nie pasuje/);
 query.maybeSingle=async()=>({data:{id:'occupied'},error:null});
 await assert.rejects(confirm(admin,{},local,selection),/już powiązana/);
});
test('missing edited draft offers unoccupied same-client candidates without auto-linking',async()=>{
 const {loadWfirmaInvoicesByMonth:loadInvoices}=load({findWfirmaInvoices:async()=>[{...final,id:'123',total:999}],getWfirmaInvoice:async()=>null});
 const query={select(){return this},in(){return this},async neq(){return {data:[],error:null}}};
 const choices=new Map();const result=await loadInvoices({from:()=>query},{},[local],null,new Map(),choices);
 assert.equal(result.has('draft'),false);assert.equal(choices.get('draft')[0].wfirmaId,'123');
});


test('selected refresh reads only selected IDs, without monthly listings or duplicate detail reads',async()=>{
 const reads=[];let listings=0;const snapshots=new Set();
 const api=load({getWfirmaInvoice:async(_,id)=>{reads.push(id);return {...final,id}},findWfirmaInvoices:async()=>{listings++;throw Error('unexpected listing')}});
 const result=await api.loadSelectedWfirmaInvoices({}, {}, [{...local,wfirma_id:'selected-1'},{...local,wfirma_id:'selected-2'}],new Map(),new Map(),snapshots);
 assert.deepEqual(reads,['selected-1','selected-2']);assert.equal(listings,0);
 assert.equal(result.size,2);assert.equal(snapshots.has(result.get('selected-1')),true);
});
test('selected refresh connection failure does not scan unrelated months',async()=>{
 let listings=0;const errors=new Map();const api=load({getWfirmaInvoice:async()=>{throw Error('AUTH unavailable')},findWfirmaInvoices:async()=>{listings++;return []}});
 const result=await api.loadSelectedWfirmaInvoices({}, {}, [local],errors,new Map(),new Set());
 assert.equal(result.size,0);assert.equal(listings,0);assert.match(errors.get('draft'),/AUTH unavailable/);
});
test('selected refresh still resolves a disappeared draft through guarded recovery',async()=>{
 let listings=0;const api=load({getWfirmaInvoice:async()=>null,findWfirmaInvoices:async()=>{listings++;return [final]}});
 const query={select(){return this},eq(){return this},neq(){return this},async maybeSingle(){return {data:null,error:null}}};
 const result=await api.loadSelectedWfirmaInvoices({from:()=>query},{},[local],new Map(),new Map(),new Set());
 assert.equal(result.get('draft').id,'final');assert.ok(listings>0);
});

test('real API NOT FOUND exception enters selected draft recovery and isolates successful selected reads',async()=>{
 const reads=[],snapshots=new Set(),errors=new Map();
 const api=load({getWfirmaInvoice:async(_,id)=>{reads.push(id);if(id==='draft')throw Error('wFirma NOT FOUND: {"status":{"code":"NOT FOUND"}}');return {...final,id};},findWfirmaInvoices:async()=>[final]});
 const query={select(){return this},eq(){return this},neq(){return this},async maybeSingle(){return {data:null,error:null}}};
 const result=await api.loadSelectedWfirmaInvoices({from:()=>query},{},[local,{...local,id:'other',wfirma_id:'existing'}],errors,new Map(),snapshots);
 assert.equal(result.get('draft').id,'final');assert.equal(result.get('existing').id,'existing');
 assert.equal(reads.filter(id=>id==='existing').length,1);assert.equal(snapshots.has(result.get('existing')),true);
});

test('NOT FOUND recovery offers changed-amount candidates instead of auto-linking them',async()=>{
 const choices=new Map();const api=load({getWfirmaInvoice:async()=>{throw Error('wFirma NOT FOUND: missing')},findWfirmaInvoices:async()=>[{...final,id:'123',total:999}]});
 const query={select(){return this},in(){return this},async neq(){return {data:[],error:null}}};
 const result=await api.loadSelectedWfirmaInvoices({from:()=>query},{},[local],new Map(),choices,new Set());
 assert.equal(result.has('draft'),false);assert.equal(choices.get('draft')[0].wfirmaId,'123');
});

test('empty monthly results do not replace the helpful missing-document message with raw API JSON',async()=>{
 const errors=new Map();const api=load({getWfirmaInvoice:async()=>{throw Error('wFirma NOT FOUND: missing')},findWfirmaInvoices:async()=>{throw Error('wFirma NOT FOUND: empty month')}});
 const result=await api.loadSelectedWfirmaInvoices({},{},[local],errors,new Map(),new Set());
 assert.equal(result.size,0);assert.match(errors.get('draft'),/Nie znaleziono dokumentu/);assert.doesNotMatch(errors.get('draft'),/wFirma NOT FOUND/);
});

test('an existing selected draft is refreshed directly without any recovery listings',async()=>{
 let reads=0;const snapshots=new Set();
 const draft={id:'draft',fullnumber:'WRF 173',type:'draft'};
 const api=load({getWfirmaInvoice:async()=>{reads++;return draft;},findWfirmaInvoices:async()=>{throw Error('must not list any invoices')}});
 const result=await api.loadSelectedWfirmaInvoices({},{},[local],new Map(),new Map(),snapshots);
 assert.equal(result.get('draft'),draft);assert.equal(reads,1);assert.equal(snapshots.has(draft),true);
});

test('missing selected draft searches only its issue day and never rereads the missing ID',async()=>{
 let reads=0;const searches=[];
 const api=load({getWfirmaInvoice:async()=>{reads++;throw Error('wFirma NOT FOUND: missing')},findWfirmaInvoices:async args=>{searches.push(args);return [final]}});
 const query={select(){return this},eq(){return this},neq(){return this},async maybeSingle(){return {data:null,error:null}}};
 const result=await api.loadSelectedWfirmaInvoices({from:()=>query},{},[local],new Map(),new Map(),new Set());
 assert.equal(result.get('draft').id,'final');assert.equal(reads,1);assert.equal(searches.length,1);
 assert.equal(searches[0].dateFrom,'2026-10-16');assert.equal(searches[0].dateTo,'2026-10-16');
});
