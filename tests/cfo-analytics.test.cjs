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


test("task corrections preserve original workers, periods and historical costs",()=>{
 const timed={...entry("a","2026-07-01","2026-08-10T10:00:00Z",65),zadanie_cykliczne_id:"task"};
 const corrections=[{id:"fix",zadanie_cykliczne_id:"task",klient_id:"a",miesiac_rozliczeniowy:"2026-07-01",osoba_id:"editor",created_at:"2026-10-01T10:00:00Z",duration_seconds:-64*3600}];
 const adjusted=exportsObject.applyCfoTimeCorrections([timed],corrections);
 const r=calc("2026-07-01","2026-07-31",[revenue()],[],[wage("2026-08-01",3200)],adjusted);
 assert.equal(r.clients[0].hours,1);assert.equal(r.clients[0].laborCost,20);
 assert.equal(adjusted[0].osoba_id,"p");assert.equal(adjusted[0].started_at,timed.started_at);
 assert.equal(timed.duration_seconds,65*3600);
});
test("positive, zero and repeated corrections are summed once and isolated by client/month",()=>{
 const base={...entry("a","2026-07-01",undefined,1),zadanie_cykliczne_id:"t"};
 const other={...base,id:"other",miesiac_rozliczeniowy:"2026-08-01"};
 const c=n=>({...base,id:String(n),created_at:base.started_at,duration_seconds:n});
 const rows=exportsObject.applyCfoTimeCorrections([base,other],[c(1800),c(-900),c(0)]);
 assert.equal(rows[0].duration_seconds,4500);assert.equal(rows[1].duration_seconds,3600);
 assert.equal(exportsObject.applyCfoTimeCorrections([base],[c(-3600)])[0].duration_seconds,0);
});
test("ordinary task corrections without a month are allocated across its original periods",()=>{
 const first={...entry("a","2026-07-01",undefined,1),zadanie_id:"t"};
 const second={...entry("a","2026-08-01","2026-08-10T10:00:00Z",3),zadanie_id:"t"};
 const correction={...first,id:"fix",miesiac_rozliczeniowy:null,created_at:"2026-10-01T00:00:00Z",duration_seconds:-7200};
 const rows=exportsObject.applyCfoTimeCorrections([first,second],[correction]);
 assert.equal(rows[0].duration_seconds,1800);assert.equal(rows[1].duration_seconds,5400);
});
test("manual-only totals and subsequent negative corrections remain visible",()=>{
 const c={id:"manual",zadanie_id:"t",klient_id:"a",osoba_id:"p",miesiac_rozliczeniowy:null,created_at:"2026-08-10T10:00:00Z",duration_seconds:3600};
 const rows=exportsObject.applyCfoTimeCorrections([], [c,{...c,id:"reduce",duration_seconds:-900}]);
 assert.equal(rows.length,1);assert.equal(rows[0].duration_seconds,2700);
});
test("August regression: 72:18:58 becomes 8:21:30 after three corrections",()=>{
 const seconds=[2400,429,5424,480,51,9065,498,4825,235417,1749];
 const rows=seconds.map((seconds,i)=>({...entry("a","2026-08-01","2026-09-11T10:00:00Z",seconds/3600),id:String(i),zadanie_cykliczne_id:String(i)}));
 const changes=[[3,720],[4,849],[8,-231817]].map(([i,seconds])=>({...rows[i],id:"fix"+i,created_at:"2026-09-14T10:00:00Z",duration_seconds:seconds}));
 const adjusted=exportsObject.applyCfoTimeCorrections(rows,changes);
 assert.equal(adjusted.reduce((sum,row)=>sum+row.duration_seconds,0),30090);
 const report=calc("2026-08-01","2026-08-31",[],[],[wage("2026-09-01",1760)],adjusted);
 assert.ok(Math.abs(report.clients[0].hours-30090/3600)<1e-9);
});
