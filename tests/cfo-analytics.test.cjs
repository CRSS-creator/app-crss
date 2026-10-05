const {test}=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,"../src/lib/cfoAnalytics.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsObject,Intl,Date});
const {clientProfitability:calc,closingCash:cash,capacityHours,workMonth}=exportsObject;
const wage=(period="2026-07-01",base=1840)=>({id:period,okres:period,osoba_id:"p",w_capacity:true,wymiar_etatu:1,podstawa:base,zus_pracodawcy:0,benefity:0,premie:0,szkolenia:0,nieobecnosci_godziny:0,nadgodziny:0});
const revenue=(id="a",period="2026-07-01",amount=1000)=>({key:id,id,name:id,period,revenue:amount,mrr:amount});
const entry=(id="a",service="2026-07-01",worked="2026-07-10T10:00:00Z",hours=10)=>({id:id+worked,osoba_id:"p",klient_id:id,czy_wewnetrzne:!id,miesiac_rozliczeniowy:service,started_at:worked,ended_at:worked,duration_seconds:hours*3600});
const cost=(start="2026-07-01",end="2026-07-31",amount=100)=>({id:start,okres_start:start,okres_end:end,kwota_netto_cfo:amount,ignoruj:false});
test("work for July performed in August uses the August historical cost",()=>{
 const r=calc("2026-07-01","2026-07-31",[revenue()],[],[wage(),wage("2026-08-01",3200)],[entry("a","2026-07-01","2026-08-10T10:00:00Z")]);
 assert.equal(r.clients[0].hours,10);assert.equal(r.clients[0].laborCost,200);assert.equal(r.clients[0].directResult,800);assert.equal(r.timingDifference,200);
});
test("internal work is never allocated to clients or overhead",()=>{
 const r=calc("2026-07-01","2026-07-31",[revenue()],[],[wage()],[entry(),entry(null,"2026-07-01","2026-07-11T10:00:00Z",5)]);
 assert.equal(r.clients[0].laborCost,100);assert.equal(r.internalCost,50);assert.equal(r.unallocatedPayroll,1690);assert.equal(r.clients[0].overhead,0);
});
test("missing historical wages do not use today's profile rate or zero cost profit",()=>{
 const e={...entry("a","2026-07-01","2026-08-10T10:00:00Z"),profiles:{client_work_hourly_rate:99}};
 const r=calc("2026-07-01","2026-07-31",[revenue()],[],[wage()],[e]);
 assert.equal(r.clients[0].laborCost,null);assert.equal(r.clients[0].fullMargin,null);assert.equal(r.clients[0].missingRateHours,10);assert.equal(r.revenueWithoutFullCost,1000);
});
test("revenue without hours has no fictional 100 percent margin",()=>{
 const r=calc("2026-07-01","2026-07-31",[revenue()],[],[wage()],[]);
 assert.equal(r.clients[0].directResult,null);assert.equal(r.clients[0].fullMargin,null);
});
test("annual overhead is allocated per month, not by annual revenue share",()=>{
 const r=calc("2026-07-01","2026-08-31",[revenue("a"),revenue("b","2026-08-01")],[cost(),cost("2026-08-01","2026-08-31",300)],[],[]);
 assert.equal(r.clients.find(x=>x.id==="a").overhead,100);assert.equal(r.clients.find(x=>x.id==="b").overhead,300);
 assert.equal(r.overheadTotal,400);
});
test("annual view uses employee rates for each actual work month",()=>{
 const r=calc("2026-07-01","2026-08-31",[revenue(),revenue("a","2026-08-01")],[],[wage(),wage("2026-08-01",3200)],[entry(),entry("a","2026-08-01","2026-08-10T10:00:00Z")]);
 assert.equal(r.clients[0].laborCost,300);assert.equal(r.clients[0].directResult,1700);
});
test("missing one revenue month's time keeps annual result incomplete",()=>{
 const r=calc("2026-07-01","2026-08-31",[revenue(),revenue("a","2026-08-01")],[],[wage(),wage("2026-08-01")],[entry()]);
 assert.equal(r.clients[0].directResult,null);
});
test("costs across months and rounding conserve the overhead pool",()=>{
 const r=calc("2026-07-01","2026-07-31",[revenue("a",undefined,1),revenue("b",undefined,1),revenue("c",undefined,1)],[cost("2026-07-01","2026-08-31",200)],[],[]);
 assert.equal(r.clients.reduce((s,c)=>s+c.overhead,0),100);
 const z=calc("2026-07-01","2026-07-31",[],[cost()],[],[]);assert.equal(z.unallocatedOverhead,100);
});
test("clients with work but no revenue remain visible",()=>{
 const r=calc("2026-07-01","2026-07-31",[],[],[wage()],[entry()]);
 assert.equal(r.clients.length,1);assert.equal(r.clients[0].directResult,-100);
});
test("small overhead pools never give a negative rounding remainder to a client",()=>{
 const rs=Array.from({length:100},(_,i)=>revenue(String(i),"2026-07-01",1));
 const r=calc("2026-07-01","2026-07-31",rs,[cost("2026-07-01","2026-07-31",0.5)],[],[]);
 assert.ok(r.clients.every(c=>c.overhead>=0));assert.ok(Math.abs(r.clients.reduce((s,c)=>s+c.overhead,0)-0.5)<0.0001);
});
test("Warsaw month boundary and monthly available hours",()=>{
 assert.equal(workMonth("2026-07-31T22:30:00Z"),"2026-08");
 assert.equal(capacityHours(wage()),184);assert.equal(capacityHours(wage("2026-08-01")),160);
});
const account=(id="a",kind="operacyjne")=>({id,numer_rachunku:"1234",waluta:"PLN",rodzaj_srodkow:kind});
const tx=(id,lp,balance,amount,date="2026-08-31",acct="a")=>({id,rachunek_id:acct,data_ksiegowania:date,lp,saldo_po:balance,kwota:amount,ignoruj:true,typ:"transfer_wewnetrzny"});
test("cash uses actual final balance in newest-first statements, including ignored transfers",()=>{
 const r=cash([account()],[tx("1",3,100,100),tx("2",2,150,50),tx("3",1,130,-20)],"2026-08-31");
 assert.equal(r.available,130);assert.equal(r.complete,true);
});
test("cash also supports oldest-first statements",()=>{
 assert.equal(cash([account()],[tx("1",1,100,100),tx("2",2,150,50),tx("3",3,130,-20)],"2026-08-31").available,130);
});
test("VAT cash stays separate and a future transaction is excluded",()=>{
 const r=cash([account(),account("v","vat")],[tx("a",1,100,100),tx("v",1,40,40,undefined,"v"),tx("future",1,999,899,"2026-09-01")],"2026-08-31");
 assert.equal(r.available,100);assert.equal(r.vat,40);
});
test("stale, missing, unclassified or ambiguous balances prevent a complete total",()=>{
 assert.equal(cash([account()],[tx("a",1,10,10,"2026-06-01")],"2026-08-31").complete,false);
 assert.equal(cash([account()],[],"2026-08-31").complete,false);
 assert.equal(cash([account("a","nieokreslone")],[tx("a",1,10,10)],"2026-08-31").complete,false);
 const r=cash([account()],[tx("1",1,100,10),tx("2",2,1000,20)],"2026-08-31");
 assert.equal(r.rows[0].balance,null);assert.equal(r.complete,false);
});

