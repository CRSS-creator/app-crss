import type { CashflowSnapshot } from "./cfoCashflow";
import { shiftDateMonth } from "./cfoCashflow";
import type { CfoCostCategory } from "./cfoService";
import { planKey, planApplies, type BudgetPaymentPlan } from "./budgetPaymentPlan";

const amount = (v: unknown) => Number.isFinite(Number(v)) ? Math.max(0,Number(v)) : 0;
const monthOffset = (from: string, to: string) => (Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5,7))-Number(from.slice(5,7));
function virtual(month: string, category: CfoCostCategory, subcategory: string, gross: number, net: number | null, source: string, key: string): BudgetPaymentPlan {
  return { id:"auto:"+key,nazwa:source,rodzaj:"monthly",kategoria:category,podkategoria:subcategory,
    kwota_brutto:gross,kwota_netto:net,pierwszy_miesiac:month+"-01",ostatni_miesiac:month+"-01",
    liczba_rat:null,koszt_id:null,aktywny:true };
}
// A real recurring agreement supersedes the estimate, including after its explicit end.
// It must not be resurrected from historical invoices after termination.
function hasRecurringDecision(plans: BudgetPaymentPlan[], category: CfoCostCategory, subcategory: string, month: string, dimension: "cash"|"net" = "cash") {
  return plans.some(p=>p.aktywny && p.rodzaj==="monthly" && p.pierwszy_miesiac.slice(0,7)<=month
    && planKey(p.kategoria,p.podkategoria)===planKey(category,subcategory)
    && (dimension==="cash" || p.kwota_netto!==null || Boolean(p.ostatni_miesiac && p.ostatni_miesiac.slice(0,7)<month)));
}
export function automaticExpensePlans(snapshot: CashflowSnapshot, forecastStart: string, month: string, plans: BudgetPaymentPlan[], asOf: string) {
  const cutoff = forecastStart < asOf.slice(0,7) ? forecastStart : asOf.slice(0,7);
  const historyMonths = [3,2,1].map(n=>shiftDateMonth(cutoff+"-01",-n).slice(0,7));
  const explicit = plans.filter(p=>p.aktywny);
  const annualGroups = new Set((snapshot.annualSchedules||[]).map(s=>planKey(s.kategoria,s.podkategoria)));
  const linkedCosts = new Set(explicit.map(p=>p.koszt_id).filter(Boolean));
  const vendors = new Map<string,{category:CfoCostCategory;subcategory:string;variable:boolean;months:Map<string,{net:number;gross:number}>}>();
  const availableMonths = new Set(snapshot.costs.filter(c=>!c.ignoruj && historyMonths.includes(c.okres_start.slice(0,7))).map(c=>c.okres_start.slice(0,7)));
  for (const c of snapshot.costs) {
    const serviceMonth=c.okres_start.slice(0,7), sub=c.podkategoria||"Bez podkategorii";
    const variable=/zmien/i.test(c.charakter||"");
    if(c.ignoruj || c.kategoria==="jednorazowe_nadzwyczajne" || c.harmonogram_id || c.rozliczenie_wynagrodzen_okres || linkedCosts.has(c.id)
      || !historyMonths.includes(serviceMonth) || annualGroups.has(planKey(c.kategoria,sub))
      || /jednoraz|nadzwyczaj/i.test(c.charakter||"") || /jednoraz|roczn|kwartal/i.test(c.czestotliwosc||"")
      || /zakup.*(środków trwałych|srodkow trwalych|sprzętu|sprzetu|telefonu|laptopa)|inwestycj/i.test(c.opis||"")
      || c.okres_end.slice(0,7)!==serviceMonth || c.ujecie_zarzadcze==="rozliczenie_w_czasie")continue;
    const key=JSON.stringify([c.kategoria,sub,(c.kontrahent||"").toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]/g,"")]);
    const row=vendors.get(key)||{category:c.kategoria,subcategory:sub,variable,months:new Map()};
    const value=row.months.get(serviceMonth)||{net:0,gross:0};
    value.net+=amount(c.kwota_netto_cfo);value.gross+=amount(c.kwota_brutto??c.kwota_netto_cfo);
    row.months.set(serviceMonth,value);row.variable ||= variable;vendors.set(key,row);
  }
  const result:BudgetPaymentPlan[]=[];
  for(const [key,row] of vendors) {
    const cashDecision=hasRecurringDecision(explicit,row.category,row.subcategory,month);
    const netDecision=hasRecurringDecision(explicit,row.category,row.subcategory,month,"net");
    if(cashDecision && netDecision)continue;
    // Do not turn an isolated fixed purchase into a subscription.
    if(!row.variable && row.months.size<2)continue;
    const last=[...row.months.keys()].sort().at(-1)!;
    const lastValue=row.months.get(last)!;
    const denominator=Math.max(1,availableMonths.size);
    const net=row.variable?[...row.months.values()].reduce((s,v)=>s+v.net,0)/denominator:lastValue.net;
    const gross=row.variable?[...row.months.values()].reduce((s,v)=>s+v.gross,0)/denominator:lastValue.gross;
    result.push(virtual(month,row.category,row.subcategory,cashDecision?0:gross,netDecision?null:net,
      row.variable ? "Automat: średnia kosztów zmiennych z "+denominator+" mies." : "Automat: regularny koszt, ostatnia kwota z "+last,key));
  }
  // Result: repeat the latest complete team month, unless a future month has already
  // been entered in CFO. Missing people in that latest roster are not reintroduced.
  const employees=snapshot.employeeCosts||[];
  const team=new Map<string,{category:CfoCostCategory;subcategory:string;net:number;source:string}>();
  for(const teamName of ["ksiegowy","marketingowy","sprzedazowy"] as const) {
    const candidates=employees.filter(e=>e.zespol===teamName && e.okres.slice(0,7)<=month && (e.okres.slice(0,7)<cutoff || e.okres.slice(0,7)>=forecastStart));
    const latest=candidates.map(e=>e.okres.slice(0,7)).sort().at(-1);
    if(latest===month)continue; // the recorded future month is already in the result
    for(const e of candidates.filter(e=>e.okres.slice(0,7)===latest)) {
      const category:CfoCostCategory=e.zespol==="ksiegowy"?"koszty_zespolu":"marketing_sprzedaz";
      const rows=e.zespol==="ksiegowy"
        ? [["Wynagrodzenie podstawowe",e.podstawa],["ZUS pracodawcy",e.zus_pracodawcy],["Benefity",e.benefity],["Premie",e.premie],["Szkolenia",e.szkolenia]] as const
        : [[e.zespol==="marketingowy"?"Koszt zespołu marketingowego":"Koszt zespołu sprzedażowego",
          amount(e.podstawa)+amount(e.zus_pracodawcy)+amount(e.benefity)+amount(e.premie)+amount(e.szkolenia)]] as const;
      for(const [subcategory,net]of rows) {
        const key=planKey(category,subcategory),row=team.get(key)||{category,subcategory,net:0,source:"Automat: Zespół CFO, "+latest};
        row.net+=amount(net);team.set(key,row);
      }
    }
  }
  for(const[key,r]of team)if(r.net>0&&!hasRecurringDecision(explicit,r.category,r.subcategory,month,"net"))
    result.push(virtual(month,r.category,r.subcategory,0,r.net,r.source,key));

  // Cash: preserve the actual service-month -> due-date offset for every payroll/tax
  // type. An explicit future row, including zero, replaces that service month's seed.
  const labels:Record<string,string>={wynagrodzenia_netto:"Wynagrodzenia netto",potracenia:"Potrącenia",ppk:"PPK",zus:"ZUS",pit4:"PIT-4 od wynagrodzeń",vat:"VAT",cit:"CIT"};
  for(const [kind,label]of Object.entries(labels)) {
    const known=snapshot.obligations.filter(o=>o.typ===kind);
    const category:CfoCostCategory=kind==="vat"||kind==="cit"?"administracja_ogolne":"koszty_zespolu";
    if(hasRecurringDecision(explicit,category,label,month))continue;
    let estimated=0, hasEstimate=false;
    for(let offset=-12;offset<=1;offset++) {
      const service=shiftDateMonth(month+"-01",offset).slice(0,7);
      if(known.some(o=>o.okres.slice(0,7)===service))continue;
      const seed=known.filter(o=>o.okres.slice(0,7)<service).sort((a,b)=>b.okres.localeCompare(a.okres))[0];
      if(!seed?.termin_platnosci)continue;
      const delay=monthOffset(seed.okres,seed.termin_platnosci);
      if(delay<0||delay>12||service<shiftDateMonth(forecastStart+"-01",-delay).slice(0,7))continue;
      const date=shiftDateMonth(seed.termin_platnosci,monthOffset(seed.okres,service+"-01"));
      if(date.slice(0,7)===month) { estimated+=amount(seed.kwota);hasEstimate=true; }
    }
    if(hasEstimate) {
      const knownDue=known.filter(o=>(o.data_zaplaty||o.termin_platnosci)?.slice(0,7)===month).reduce((s,o)=>s+amount(o.kwota),0);
      result.push(virtual(month,category,label,knownDue+estimated,null,"Automat: rozliczenia CFO i przesunięcie terminu",kind));
    }
  }
  return result;
}
export function mergeForecastPlans(snapshot:CashflowSnapshot,start:string,month:string,plans:BudgetPaymentPlan[],asOf:string) {
  return [...automaticExpensePlans(snapshot,start,month,plans,asOf),...plans];
}
export function netAssumptions(month:string,plans:BudgetPaymentPlan[]) {
  return plans.filter(p=>p.rodzaj==="target" && planApplies(p,month) && p.cel_wyniku_netto!=null)
    .map(p=>({category:p.kategoria,subcategory:p.podkategoria||"Bez podkategorii",amount:amount(p.cel_wyniku_netto)}));
}
