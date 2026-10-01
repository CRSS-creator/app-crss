const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const number='14102041600000210203508322';
const source=fs.readFileSync(path.join(__dirname,'../src/lib/invoiceBankAccount.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function load(overrides={}) {
 const exports={}; const edits=[];
 const client={findWfirmaCompanyAccounts:async()=>[{id:'42',number}],
   firstWfirmaInvoice:r=>r.invoice,
   getWfirmaInvoice:async()=>({invoice:{id:'7',type:'normal_draft',company_account:{id:'42'},company_detail:{bank_account:number}}}),
   setWfirmaInvoiceBankAccount:async(...args)=>{edits.push(args);},...overrides};
 vm.runInNewContext(compiled,{exports,require:()=>client});
 return {...exports,edits};
}
const admin={rpc:async()=>({data:number,error:null})};

test('Polish account is validated and normalized without accepting an invalid checksum',()=>{
 const service=load();
 assert.equal(service.normalizePolishBankAccount('PL14 1020 4160 0000 2102 0350 8322'),number);
 assert.throws(()=>service.normalizePolishBankAccount(number.slice(0,-1)+'3'),/Nieprawidłowy/);
});
test('account ID is selected by bank number rather than default/list order',async()=>{
 const service=load({findWfirmaCompanyAccounts:async()=>[{id:'default',number:'unrelated'},{id:'42',number:'PL'+number}]});
 const account=await service.resolveInvoiceBankAccount(admin,{});
 assert.equal(account.id,'42'); assert.equal(account.number,number);
});
test('missing or ambiguous account stops the operation',async()=>{
 await assert.rejects(load({findWfirmaCompanyAccounts:async()=>[]}).resolveInvoiceBankAccount(admin,{}),/Brak rachunku/);
 await assert.rejects(load({findWfirmaCompanyAccounts:async()=>[{id:'1',number},{id:'2',number}]}).resolveInvoiceBankAccount(admin,{}),/wielokrotnie/);
});
test('configuration failures do not fall back to another account',async()=>{
 await assert.rejects(load().resolveInvoiceBankAccount({rpc:async()=>({error:{message:'offline'}})},{}),/pobrać obowiązkowego/);
});
test('correct invoice account needs no remote edit',async()=>{
 const service=load();
 await service.ensureDraftInvoiceBankAccount({},'7',{id:'42',number});
 assert.equal(service.edits.length,0);
});
test('wrong draft account is repaired and independently read back',async()=>{
 let reads=0;
 const service=load({getWfirmaInvoice:async()=>({invoice:{id:'7',type:'normal_draft',company_account:{id:++reads===1?'wrong':'42'}}})});
 await service.ensureDraftInvoiceBankAccount({},'7',{id:'42',number});
 assert.equal(reads,2); assert.equal(service.edits.length,1);
 assert.equal(service.edits[0][1],'7'); assert.equal(service.edits[0][2],'42');
});
test('an ignored account change is an error rather than a successful send',async()=>{
 const service=load({getWfirmaInvoice:async()=>({invoice:{id:'7',type:'normal_draft',company_account:{id:'wrong'}}})});
 await assert.rejects(service.ensureDraftInvoiceBankAccount({},'7',{id:'42',number}),/nie potwierdziła/);
});
test('finalized invoices are never rewritten as part of draft repair',async()=>{
 const service=load({getWfirmaInvoice:async()=>({invoice:{id:'7',type:'normal',company_account:{id:'wrong'}}})});
 await assert.rejects(service.ensureDraftInvoiceBankAccount({},'7',{id:'42',number}),/nie jest już wersją roboczą/);
 assert.equal(service.edits.length,0);
});
test('resolver caches only within a request',async()=>{
 let reads=0;const service=load({findWfirmaCompanyAccounts:async()=>{reads++;return [{id:'42',number}];}});
 const resolve=service.createInvoiceBankAccountResolver(admin,{});
 await Promise.all([resolve(),resolve()]);assert.equal(reads,1);
 await service.createInvoiceBankAccountResolver(admin,{})();assert.equal(reads,2);
});
