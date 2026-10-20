const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function load(rows,fetchImpl){let calls=0;const exports={};const client={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},from:()=>({select(){return this},order:async()=>({data:rows,error:null})})};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/clientService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,Error,require:()=>({supabase:client}),fetch:async(...args)=>{calls++;if(fetchImpl)return fetchImpl(...args);throw Error('Unexpected caregivers request')}});return {api:exports,calls:()=>calls};}
test('complete joined caregiver data does not trigger an additional API request',async()=>{
 const rows=[{id:'one',opiekun_id:'a',profiles:{full_name:'A'}},{id:'two',opiekun_id:null,profiles:null}];const f=load(rows);const result=await f.api.fetchClients();assert.equal(result.data,rows);assert.equal(f.calls(),0);
});
test('client data can finish while the separate caregiver selector request remains pending',async()=>{
 const rows=[{id:'one',opiekun_id:'a',profiles:[{full_name:'A'}]}];const f=load(rows);const never=new Promise(()=>{});const result=await f.api.fetchClients(never);assert.equal(result.data,rows);assert.equal(f.calls(),0);
});
test('missing joined caregiver data reuses the supplied request instead of fetching twice',async()=>{
 const f=load([{id:'one',opiekun_id:'a',profiles:null}]);const result=await f.api.fetchClients(Promise.resolve({data:[{id:'a',full_name:'Name',email:'a@example.com',role:'accountant'}],error:null}));assert.equal(result.data[0].profiles.full_name,'Name');assert.equal(f.calls(),0);
});
test('a caregiver network error returns a result and does not discard the clients',async()=>{
 const f=load([{id:'one',opiekun_id:'a',profiles:null}],()=>{throw Error('network failed')});const result=await f.api.fetchClients();assert.equal(result.data.length,1);assert.equal(result.error,null);assert.equal(f.calls(),1);
 const caregivers=await f.api.fetchClientCaregivers();assert.match(caregivers.error.message,/network failed/);
});
