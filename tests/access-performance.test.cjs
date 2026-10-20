const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function moduleFrom(file,deps={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,Promise,Set,Error,setTimeout,clearTimeout,require:name=>deps[name]||{},...globals});return exports;}
const {createCurrentUserAccessStore:createStore}=moduleFrom('src/lib/currentUserAccess.ts',{'./supabaseClient':{supabase:{}}});
const flush=()=>new Promise(setImmediate);
function fixture(){
 const data={user:{id:'a',app_metadata:{},user_metadata:{}},role:'owner',active:true,error:null,calls:{session:0,user:0,profile:0,signOut:0},wait:null};let listener;
 const client={auth:{async getSession(){data.calls.session++;return {data:{session:data.user?{user:data.user}:null},error:null}},async getUser(){data.calls.user++;const user=data.user;if(data.wait)await data.wait;return {data:{user},error:null}},onAuthStateChange(fn){listener=fn;return {data:{subscription:{unsubscribe(){}}}}},async signOut(){data.calls.signOut++;data.user=null;listener?.('SIGNED_OUT',null)}},from(){return {select(){return this},eq(){return this},async single(){data.calls.profile++;return {data:{role:data.role,aktywne:data.active},error:data.error}}}}};
 return {data,client,emit:(event)=>listener(event,data.user?{user:data.user}:null)};
}
test('layout and access guard share one verification and navigation reuses the fresh result',async()=>{
 const {client,data}=fixture();let now=1000;const store=createStore(client,()=>now);const off1=store.subscribe(()=>{}),off2=store.subscribe(()=>{});
 await store.refresh();assert.equal(data.calls.session,1);assert.equal(data.calls.user,1);assert.equal(data.calls.profile,1);assert.equal(store.getSnapshot().role,'owner');
 off1();off2();store.subscribe(()=>{});await store.refresh();assert.equal(data.calls.profile,1);
 now+=30001;await store.refresh();assert.equal(data.calls.profile,2);
});
test('verified user and profile are fetched in parallel after the session is known',async()=>{
 const {client,data}=fixture();let release;data.wait=new Promise(r=>release=r);const store=createStore(client);const work=store.refresh();await flush();assert.equal(data.calls.profile,1);assert.equal(store.getSnapshot().loading,true);release();await work;assert.equal(store.getSnapshot().loading,false);
});
test('sign out invalidates access immediately and a late response cannot restore it',async()=>{
 const f=fixture();let release;f.data.wait=new Promise(r=>release=r);const store=createStore(f.client);store.subscribe(()=>{});const work=store.refresh();await flush();f.data.user=null;f.emit('SIGNED_OUT');assert.equal(store.getSnapshot().role,null);release();await work;assert.equal(store.getSnapshot().userId,null);assert.equal(store.getSnapshot().loading,false);
});
test('switching users clears the previous role before loading the new profile',async()=>{
 const f=fixture(),store=createStore(f.client);store.subscribe(()=>{});await store.refresh();f.data.user={id:'b',app_metadata:{},user_metadata:{}};f.data.role='accountant';f.emit('SIGNED_IN');assert.equal(store.getSnapshot().role,null);assert.equal(store.getSnapshot().loading,true);await flush();await store.refresh();assert.equal(store.getSnapshot().userId,'b');assert.equal(store.getSnapshot().role,'accountant');
});
test('inactive accounts are signed out and failed checks do not retain previous access',async()=>{
 const f=fixture(),store=createStore(f.client);store.subscribe(()=>{});await store.refresh();f.data.error=new Error('profile unavailable');await store.refresh(true);assert.equal(store.getSnapshot().role,null);assert.match(store.getSnapshot().error,/unavailable/);
 f.data.error=null;f.data.active=false;await store.refresh(true);assert.equal(f.data.calls.signOut,1);assert.equal(store.getSnapshot().role,null);
});
test('password requirement is verified once and token refresh invalidates cached metadata',async()=>{
 const f=fixture();f.data.user.app_metadata.must_change_password=true;const store=createStore(f.client);store.subscribe(()=>{});await store.refresh();assert.equal(store.getSnapshot().mustChangePassword,true);
 f.data.user.app_metadata.must_change_password=false;f.emit('TOKEN_REFRESHED');assert.equal(store.getSnapshot().loading,true);await flush();await store.refresh();assert.equal(store.getSnapshot().mustChangePassword,false);assert.equal(f.data.calls.user,2);
});

function idleFixture(path='/dashboard',stored){
 let time=10000000,warning=false,effect,logouts=0;const storage=new Map(stored?[['crss-last-activity',String(stored)]]:[]),timers=new Map(),events={},docEvents={};let counter=0;
 const react={useCallback:fn=>fn,useEffect:fn=>effect=fn,useRef:value=>({current:value}),useState:()=>[false,value=>warning=value]};
 const timer=(fn,delay)=>{timers.set(++counter,{fn,delay});return counter},clear=id=>timers.delete(id);
 const globals={Date:{now:()=>time},setTimeout:timer,clearTimeout:clear,window:{sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},addEventListener:(name,fn)=>events[name]=fn,removeEventListener:name=>delete events[name]},document:{visibilityState:'visible',addEventListener:(name,fn)=>docEvents[name]=fn,removeEventListener:name=>delete docEvents[name]}};
 const module=moduleFrom('src/components/SessionTimeout.tsx',{'react':react,'next/navigation':{useRouter:()=>({replace(){}}),usePathname:()=>path},'@/lib/supabaseClient':{supabase:{auth:{async signOut(){logouts++}}}}},globals);
 module.default();const cleanup=effect();return {storage,timers,events,docEvents,cleanup,get logouts(){return logouts},get warning(){return warning},advance(ms){time+=ms}};
}
test('inactivity still warns after 59 minutes and logs out after 60 minutes',async()=>{
 const f=idleFixture();assert.deepEqual([...f.timers.values()].map(t=>t.delay).sort((a,b)=>a-b),[3540000,3600000]);
 [...f.timers.values()].find(t=>t.delay===3540000).fn();assert.equal(f.warning,true);[...f.timers.values()].find(t=>t.delay===3600000).fn();await flush();assert.equal(f.logouts,1);
});
test('inactivity survives reload, checks suspended tabs and never deletes auth storage',async()=>{
 const f=idleFixture('/dashboard',10000000-3590000);assert.equal(f.warning,true);assert.equal([...f.timers.values()][0].delay,10000);assert.equal(f.events.beforeunload,undefined);
 f.advance(20000);f.docEvents.visibilitychange();await flush();assert.equal(f.logouts,1);
});
test('login keeps hook order stable, clears only its activity timestamp and mounts no timers',()=>{
 const f=idleFixture('/login',10000000);assert.equal(f.timers.size,0);assert.equal(f.storage.has('crss-last-activity'),false);
});
test('activity events are throttled, extend inactivity and listeners are cleaned up',()=>{
 const f=idleFixture();const initial=[...f.timers.keys()];f.events.mousemove();assert.deepEqual([...f.timers.keys()],initial);f.advance(1100);f.events.mousemove();assert.notDeepEqual([...f.timers.keys()],initial);f.cleanup();assert.equal(f.timers.size,0);assert.equal(Object.keys(f.events).length,0);
});

test('without a session there is no user/profile request and access stays closed',async()=>{
 const f=fixture();f.data.user=null;const store=createStore(f.client);store.subscribe(()=>{});await store.refresh();assert.equal(f.data.calls.session,1);assert.equal(f.data.calls.user,0);assert.equal(f.data.calls.profile,0);assert.equal(store.getSnapshot().role,null);assert.equal(store.getSnapshot().loading,false);
});
