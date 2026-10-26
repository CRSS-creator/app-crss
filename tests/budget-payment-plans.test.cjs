const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path"),ts=require("typescript");
const cache=new Map();
function load(file) {
  const full=path.resolve(file); if(cache.has(full))return cache.get(full);
  const exports={};cache.set(full,exports);
  const source=fs.readFileSync(full,"utf8");
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
    exports,console,Intl,Date,Map,Set,require:name=>{
      if(name.startsWith("."))return load(path.resolve(path.dirname(full),name)+".ts");
      if(name.startsWith("@/lib/") && !/Service$/.test(name))return load("src/lib/"+name.slice(6)+".ts");
      if(name==="@/app/design")return load("src/app/design.ts");
      if(name.startsWith("@/")||name==="lucide-react")return {};
      return require(name);
    }
  });
  return exports;
}
const lib=load("src/lib/budgetPaymentPlan.ts"),cash=load("src/lib/cfoCashflow.ts");
const cats=[{value:"systemy_technologia",label:"Systemy"},{value:"administracja_ogolne",label:"Administracja"},{value:"koszty_zespolu",label:"Zespół"}];
const plan=(extra={})=>({id:"p",nazwa:"Telefon",rodzaj:"monthly",kategoria:"systemy_technologia",podkategoria:"T-Mobile",kwota_brutto:233.70,kwota_netto:190,pierwszy_miesiac:"2026-11-01",ostatni_miesiac:null,liczba_rat:null,koszt_id:null,aktywny:true,...extra});
const cost=(extra={})=>({id:"c",kontrahent:"T-Mobile Polska S.A.",opis:"Usługi telekomunikacyjne",kategoria:"systemy_technologia",podkategoria:"T-Mobile",kwota_brutto:233.70,kwota_netto_cfo:190,okres_start:"2026-11-01",okres_end:"2026-11-30",data_dokumentu:"2026-11-01",data_zaplaty:null,termin_platnosci:null,ignoruj:false,harmonogram_id:null,rozliczenie_wynagrodzen_okres:null,czestotliwosc:"miesieczna",...extra});
function month(plans=[],costs=[],extras={},period="2026-11") {return lib.explicitPaymentMonth(period,"2026-11",{...cash.emptyCashflow(),costs,...extras},plans,cats);}
test("absolute target replaces estimates, supports zero and repeat saves without accumulation",()=>{
  const target=plan({id:"target",rodzaj:"target",kwota_brutto:260,kwota_netto:null});
  assert.equal(month([plan(),target]).total,260);
  target.kwota_brutto=280;assert.equal(month([plan(),target]).total,280);
  target.kwota_brutto=0;assert.equal(month([plan(),target]).total,0);
});
test("overdue purchase never appears as a full first-month payment and remains visible for review",()=>{
  const purchase=cost({id:"device",kwota_brutto:6548.20,kwota_netto_cfo:5323.74,okres_start:"2026-05-01",opis:"Zakup środków trwałych"});
  const snapshot={...cash.emptyCashflow(),costs:[purchase]};
  assert.equal(month([],snapshot.costs).total,0);
  assert.equal(lib.unresolvedBudgetCosts(snapshot,"2026-11",[]).length,1);
});
test("instalments start in October, end after N payments, and do not repeat the purchase",()=>{
  const p=plan({rodzaj:"installments",pierwszy_miesiac:"2026-10-01",liczba_rat:3,kwota_brutto:100,kwota_netto:null,koszt_id:"device"});
  const purchase=cost({id:"device",kwota_brutto:6548.20,okres_start:"2026-05-01"});
  assert.equal(lib.planApplies(p,"2026-09"),false);
  assert.equal(lib.planApplies(p,"2026-10"),true);
  assert.equal(month([p],[purchase],{},"2026-11").total,100);
  assert.equal(month([p],[purchase],{},"2026-12").total,100);
  assert.equal(month([p],[purchase],{},"2027-01").total,0);
  assert.equal(lib.plannedNetAmounts("2026-11",[p]).length,0);
  assert.equal(lib.unresolvedBudgetCosts({...cash.emptyCashflow(),costs:[purchase]},"2026-11",[p]).length,0);
});
test("invoice for the combined monthly bill replaces subscription and installment estimate",()=>{
  const installment=plan({id:"rate",rodzaj:"installments",pierwszy_miesiac:"2026-10-01",liczba_rat:24,kwota_brutto:100,kwota_netto:null});
  const bill=cost({kwota_brutto:333.70,termin_platnosci:"2026-11-15"});
  assert.equal(month([plan(),installment],[bill]).total,333.70);
});
test("actual payments are preserved when a goal is lower, and the overrun remains visible",()=>{
  const target=plan({rodzaj:"target",kwota_brutto:100,kwota_netto:null});
  const result=month([target],[cost({kwota_brutto:200,data_zaplaty:"2026-11-12"})]);
  assert.equal(result.total,200);
  assert.equal(result.groups[0].children[0].planned,100);
  assert.equal(result.groups[0].children[0].diff,-100);
});
test("one-off expenses occur only once, monthly plans stop at the end month",()=>{
  assert.equal(month([plan({rodzaj:"once"})],[],{},"2026-12").total,0);
  assert.equal(month([plan({ostatni_miesiac:"2026-12-01"})],[],{},"2027-01").total,0);
});
test("known payroll obligations are included once and overdue obligations are not rolled forward",()=>{
  const obligations=[{id:"o",typ:"zus",kwota:1000,okres:"2026-09-01",termin_platnosci:"2026-11-16",data_zaplaty:null}];
  const p=plan({kategoria:"koszty_zespolu",podkategoria:"ZUS",kwota_brutto:1000,kwota_netto:null});
  assert.equal(month([p],[],{obligations}).total,1000);
  obligations[0].termin_platnosci="2026-10-15";assert.equal(month([],[],{obligations}).total,0);
});
test("annual payments happen in the due month without collecting old unpaid renewals",()=>{
  const annual={id:"a",nazwa:"OC",kategoria:"administracja_ogolne",podkategoria:"OC",kwota_brutto:1200,kwota_netto:1000,pierwszy_okres:"2026-09-01",termin_platnosci:"2026-09-15",data_faktury:"2026-09-01",aktywny:true};
  assert.equal(month([],[],{annualSchedules:[annual]}).total,0);
  assert.equal(month([],[],{annualSchedules:[annual]}, "2027-09").total,1200);
});
test("history is a suggestion, excludes equipment and is never automatically approved",()=>{
  const costs=[cost({okres_start:"2026-08-01"}),cost({okres_start:"2026-09-01"}),cost({id:"device",okres_start:"2026-09-01",opis:"Zakup środków trwałych",kwota_brutto:6548.20,kwota_netto_cfo:5323.74})];
  const suggestions=lib.historyPaymentSuggestions(costs,"2026-11");
  assert.equal(suggestions.length,1);assert.equal(suggestions[0].gross,233.70);
  assert.equal(month([],costs).total,0);
});
test("latest payroll suggestions keep expense-net separate from employee cash transfers",()=>{
  const s=lib.payrollPlanSuggestions({...cash.emptyCashflow(),employeeCosts:[{okres:"2026-09-01",zespol:"ksiegowy",podstawa:1000,zus_pracodawcy:200}],obligations:[{okres:"2026-09-01",typ:"wynagrodzenia_netto",kwota:750}]},"2026-11");
  assert.equal(s.find(r=>r.subcategory==="Wynagrodzenia netto").gross,750);
  assert.equal(s.find(r=>r.subcategory==="Wynagrodzenie podstawowe").gross,0);
  assert.equal(s.find(r=>r.subcategory==="Wynagrodzenie podstawowe").net,1000);
});
test("negative legacy adjustments cannot produce a negative expense forecast",()=>{
  const source=fs.readFileSync("src/app/budzet/page.tsx","utf8");
  const exports={};
  const compiled=ts.transpileModule(source+"\nexport { buildBudgetMonths };",{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(compiled,{exports,console,Intl,Date,Map,Set,require:name=>{
    if(name==="@/app/design")return load("src/app/design.ts");
    if(["@/lib/cfoCashflow","@/lib/cfoAnnualCosts","@/lib/cfoManualCashflow","@/lib/cfoManualRevenue","@/lib/budgetPaymentPlan"].includes(name))return load("src/lib/"+name.slice(6)+".ts");
    if(name.startsWith("@/")||name==="lucide-react")return {};
    return require(name);
  }});
  const old=[{id:"old",typ:"koszt",okres:"2026-11-01",powtarzanie:"od_miesiaca",kategoria:"administracja_ogolne",podkategoria:"OC",kwota_plan:-195.83,kwota_cashflow:-195.83,aktywne:true}];
  const result=exports.buildBudgetMonths("2026-11",2,[],[],[],[],old,[],[],0,cash.emptyCashflow(),[]);
  assert.equal(result[0].plannedOutflows,0);assert.equal(result[0].plannedCosts,0);
  assert.ok(result.every(r=>r.costSubcategories.every(g=>g.children.every(c=>c.planned>=0))));
});
