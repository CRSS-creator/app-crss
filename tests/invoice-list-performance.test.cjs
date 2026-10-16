const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/lib/invoiceService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function service(pages, detail, overdueError=null) {
  const calls=[];let index=0;
  const supabase={rpc:async name=>{calls.push(['rpc',name]);return {error:overdueError};},from:()=>{
    const builder={};
    for(const method of ['select','neq','order','eq']) builder[method]=(...args)=>{calls.push([method,...args]);return builder;};
    builder.range=async (...args)=>{calls.push(['range',...args]);return pages[index++];};
    builder.single=async()=>detail;
    return builder;
  }};
  const exports={};vm.runInNewContext(code,{exports,require:()=>({supabase})});return {api:exports,calls};
}
test('optimization preserves the previous list scope and ordering while only loading delivery flags',async()=>{
  const rows=Array.from({length:1000},(_,id)=>({id:String(id)}));
  const {api,calls}=service([{data:rows,error:null}]);
  const result=await api.fetchInvoices();assert.equal(result.data,rows);
  assert.deepEqual(calls.filter(x=>x[0]==='range'),[['range',0,4999]]);
  assert.equal(calls.filter(x=>x[0]==='order').length,2);
  assert.equal(calls.filter(x=>x[0]==='order')[0][1],'data_wystawienia');
  assert.equal(calls.filter(x=>x[0]==='order')[1][1],'created_at');
  const select=calls.find(x=>x[0]==='select')[1];assert.ok(!select.includes('faktury_pozycje'));
  assert.ok(select.includes('delivery_summary:faktury_email_history(status,notification_type)'));
  assert.equal(calls.filter(x=>x[0]==='rpc').length,1);
});
test('list errors are returned without partial data',async()=>{
  const error={message:'network'};
  const {api}=service([{data:null,error}]);
  const result=await api.fetchInvoices();assert.equal(result.data,null);assert.equal(result.error,error);
});
test('failure updating overdue statuses is reported',async()=>{
  const error={message:'offline'};const {api,calls}=service([],null,error);
  assert.equal((await api.fetchInvoices()).error,error);assert.equal(calls.length,1);
});
test('details fetch current positions and full history for the selected ID',async()=>{
  const detail={data:{id:'invoice',faktury_pozycje:[{nazwa:'Updated subscription'}]},error:null};
  const {api,calls}=service([],detail);
  assert.equal(await api.fetchInvoiceDetails('invoice'),detail);
  assert.deepEqual(calls.find(x=>x[0]==='eq'),['eq','id','invoice']);
  const select=calls.find(x=>x[0]==='select')[1];assert.ok(select.includes('faktury_pozycje'));assert.ok(select.includes('recipient_email'));
});
