"use client";
import { useState, type CSSProperties } from "react";
import { AppFormInput, AppFormSelect } from "./AppFormControls";
import { colors, radius } from "@/app/design";
import { historyPaymentSuggestions, payrollPlanSuggestions, unresolvedBudgetCosts, planKey, type BudgetPaymentPlan, type BudgetPaymentPlanInput } from "@/lib/budgetPaymentPlan";
import { saveBudgetPaymentPlan, archiveBudgetPaymentPlan } from "@/lib/budgetPaymentPlanService";
import { shiftDateMonth, type CashflowSnapshot } from "@/lib/cfoCashflow";
import type { CfoCostCategory, CfoCostItem } from "@/lib/cfoService";
import type { CfoBudgetOverride } from "@/lib/cfoBudgetService";

type Props = { plans: BudgetPaymentPlan[]; snapshot: CashflowSnapshot; costs: CfoCostItem[];
  month: string; startMonth: string; legacy: CfoBudgetOverride[]; categories: { value: CfoCostCategory; label: string }[];
  onReload: () => Promise<void> };
type Draft = { id?: string; nazwa: string; rodzaj: BudgetPaymentPlan["rodzaj"]; kategoria: CfoCostCategory;
  podkategoria: string; gross: string; net: string; first: string; last: string; count: string; costId: string };
const blank = (month: string): Draft => ({ nazwa: "", rodzaj: "monthly", kategoria: "systemy_technologia", podkategoria: "", gross: "", net: "", first: month, last: "", count: "", costId: "" });
const money = (value: number) => new Intl.NumberFormat("pl-PL",{style:"currency",currency:"PLN"}).format(value);
const parse = (value: string) => Number(value.replace(/\s/g,"").replace(",","."));
export default function BudgetPaymentPlans({ plans, snapshot, costs, month, startMonth, legacy, categories, onReload }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const active = plans.filter(p=>p.aktywny);
  const overdueObligations = snapshot.obligations.filter(o=>!o.data_zaplaty && (!o.termin_platnosci || o.termin_platnosci<startMonth+"-01") && Number(o.kwota)>0);
  const overdueInvoices = snapshot.invoices.filter(i=>i.status!=="oplacona" && (!i.termin_platnosci || i.termin_platnosci<startMonth+"-01"));
  const pending = unresolvedBudgetCosts(snapshot, startMonth, plans);
  const suggestions = [...historyPaymentSuggestions(costs, startMonth), ...payrollPlanSuggestions(snapshot,startMonth)].filter(s=>!active.some(p=>p.rodzaj==="monthly" && planKey(p.kategoria,p.podkategoria)===planKey(s.category,s.subcategory)));
  const change = (values: Partial<Draft>) => setDraft(current=>current ? {...current,...values}:null);
  function open(d: Draft) { setError(""); setDraft(d); }
  function forCost(cost: CfoCostItem, installments: boolean) {
    open({ ...blank(month), nazwa: cost.kontrahent || cost.opis || "Płatność dokumentu",
      rodzaj: installments ? "installments" : "once", kategoria: cost.kategoria, podkategoria: cost.podkategoria || "",
      gross: installments ? "" : String(cost.kwota_brutto ?? cost.kwota_netto_cfo),
      first: installments && /t.mobile/i.test(cost.kontrahent || "") && /trwał|trwal/i.test(cost.opis || "") ? "2026-10" : month,
      costId: cost.id });
  }
  function edit(p: BudgetPaymentPlan) {
    open({ id:p.id,nazwa:p.nazwa,rodzaj:p.rodzaj,kategoria:p.kategoria,podkategoria:p.podkategoria,
      gross:String(p.kwota_brutto),net:p.kwota_netto===null?"":String(p.kwota_netto),first:p.pierwszy_miesiac.slice(0,7),
      last:p.ostatni_miesiac?.slice(0,7)||"",count:p.liczba_rat?String(p.liczba_rat):"",costId:p.koszt_id||"" });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    const gross = parse(draft.gross), net = draft.net.trim() ? parse(draft.net) : null, count = Number(draft.count);
    if (!draft.gross.trim() || !Number.isFinite(gross) || gross<0 || net!==null && (!Number.isFinite(net)||net<0)) { setError("Podaj poprawne kwoty nie mniejsze niż 0."); return; }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.first) || draft.last && draft.last<draft.first) { setError("Sprawdź pierwszy i ostatni miesiąc."); return; }
    if (draft.rodzaj==="installments" && (!Number.isInteger(count)||count<1||count>600||gross<=0)) { setError("Podaj dodatnią kwotę raty i liczbę rat od 1 do 600."); return; }
    const input: BudgetPaymentPlanInput = { id:draft.id,nazwa:draft.nazwa.trim(),rodzaj:draft.rodzaj,kategoria:draft.kategoria,
      podkategoria:draft.podkategoria.trim(),kwota_brutto:gross,
      kwota_netto:draft.rodzaj==="installments" || draft.rodzaj==="target" ? null : net,
      pierwszy_miesiac:draft.first+"-01",ostatni_miesiac:draft.rodzaj==="monthly" && draft.last?draft.last+"-01":null,
      liczba_rat:draft.rodzaj==="installments"?count:null,koszt_id:draft.costId||null,aktywny:true };
    if (!input.nazwa) {setError("Podaj nazwę planu.");return;}
    setBusy(true);setError("");
    try {
      const result = await saveBudgetPaymentPlan(input);
      if (result.error) { setError("Nie udało się zapisać planu. Odśwież dane i spróbuj ponownie."); return; }
      setDraft(null);await onReload();
    } catch { setError("Nie udało się połączyć z serwerem. Spróbuj ponownie."); }
    finally {setBusy(false);}
  }
  async function archive(p: BudgetPaymentPlan) {
    if(!window.confirm("Wyłączyć ten plan? Historia dokumentów i zapłat pozostanie bez zmian."))return;
    setBusy(true);setError("");
    try { const r=await archiveBudgetPaymentPlan(p.id);if(r.error)setError("Nie udało się wyłączyć planu.");else await onReload(); }
    catch {setError("Nie udało się połączyć z serwerem.");} finally {setBusy(false);}
  }
  const kinds = { monthly:"Stała płatność",installments:"Raty",once:"Jednorazowa płatność",target:"Cel miesiąca" };
  return <div style={{display:"grid",gap:18}}>
    <section style={panel}>
      <div style={heading}><h2 style={{margin:0}}>Harmonogram płatności</h2><button type="button" style={primary} disabled={busy} onClick={()=>open(blank(month))}>Dodaj płatność</button></div>
      <p>Stałe opłaty, raty i wydatki jednorazowe. Kwoty brutto tworzą plan pieniędzy. Opcjonalna kwota netto tworzy plan wyniku; raty same nie zwiększają kosztów.</p>
      {!active.length && <p role="status"><strong>Plan wymaga uzupełnienia.</strong> Historia poniżej podpowiada wartości — nie zatwierdza ich automatycznie.</p>}
      {error && <p role="alert" style={{color:colors.danger}}>{error}</p>}
      <p>W ramach podkategorii porównujemy łączny plan z fakturami, aby nie liczyć tej samej płatności drugi raz. Dla niezależnych wydatków stosuj osobne podkategorie.</p>
      <div style={{overflowX:"auto"}}><table style={table}><thead><tr><th>Nazwa / rodzaj</th><th>Kwota brutto</th><th>Koszt netto</th><th>Okres</th><th>Akcje</th></tr></thead>
        <tbody>{active.map(p=><tr key={p.id}><td style={cell}>{p.nazwa}<small style={{display:"block"}}>{kinds[p.rodzaj]} • {p.podkategoria || "Bez podkategorii"}</small></td>
          <td style={cell}>{money(Number(p.kwota_brutto))}</td><td style={cell}>{p.kwota_netto===null?"Tylko płatność":money(Number(p.kwota_netto))}</td>
          <td style={cell}>{p.pierwszy_miesiac.slice(0,7)}{p.rodzaj==="installments" ? " – "+shiftDateMonth(p.pierwszy_miesiac,Number(p.liczba_rat)-1).slice(0,7)+" ("+p.liczba_rat+" rat)" : p.rodzaj==="monthly" ? " – "+(p.ostatni_miesiac?.slice(0,7)||"do odwołania"):""}</td>
          <td style={cell}><button style={button} disabled={busy} onClick={()=>edit(p)}>Edytuj</button> <button style={button} disabled={busy} onClick={()=>void archive(p)}>Wyłącz</button></td></tr>)}</tbody>
      </table></div>
    </section>
    {(snapshot.annualSchedules||[]).some(s=>s.aktywny) && <details style={panel}><summary>Płatności roczne z CFO</summary><p>Gotówka w miesiącu terminu, koszt netto po 1/12 miesięcznie. Harmonogram zmienisz w CFO.</p>{(snapshot.annualSchedules||[]).filter(s=>s.aktywny).map(s=><div key={s.id} style={line}><span>{s.nazwa} • {s.podkategoria}</span><span>{money(Number(s.kwota_brutto))} • termin {s.termin_platnosci}</span></div>)}</details>}
    {draft && <section style={panel}><h2>{draft.id?"Edytuj":"Dodaj"} plan płatności</h2>
      <form onSubmit={submit}>
        <fieldset disabled={busy} style={{border:0,padding:0,margin:0}}>
          <div style={grid}>
            <label style={field}>Nazwa<input required value={draft.nazwa} onChange={e=>change({nazwa:e.target.value})} style={input}/></label>
            <label style={field}>Rodzaj<AppFormSelect value={draft.rodzaj} onChange={e=>change({rodzaj:e.target.value as Draft["rodzaj"]})}>
              {(Object.entries(kinds).filter(([key])=>key!=="target"||draft.rodzaj==="target")).map(([key,label])=><option key={key} value={key}>{label}</option>)}</AppFormSelect></label>
            <label style={field}>Kategoria<AppFormSelect value={draft.kategoria} onChange={e=>change({kategoria:e.target.value as CfoCostCategory})}>{categories.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</AppFormSelect></label>
            <label style={field}>Podkategoria<input value={draft.podkategoria} onChange={e=>change({podkategoria:e.target.value})} style={input}/></label>
            <label style={field}>{draft.rodzaj==="installments"?"Kwota jednej raty brutto":"Kwota płatności brutto"}<input required inputMode="decimal" value={draft.gross} onChange={e=>change({gross:e.target.value})} style={input}/></label>
            {draft.rodzaj!=="installments" && draft.rodzaj!=="target" && <label style={field}>Koszt w wyniku netto (opcjonalnie)<input inputMode="decimal" value={draft.net} onChange={e=>change({net:e.target.value})} placeholder="Puste = tylko przepływ pieniędzy" style={input}/></label>}
            <label style={field}>Pierwszy miesiąc płatności<AppFormInput type="month" required value={draft.first} onChange={e=>change({first:e.target.value})}/></label>
            {draft.rodzaj==="monthly" && <label style={field}>Ostatni miesiąc (opcjonalnie)<AppFormInput type="month" min={draft.first} value={draft.last} onChange={e=>change({last:e.target.value})}/></label>}
            {draft.rodzaj==="installments" && <label style={field}>Liczba rat<input type="number" required min={1} max={600} value={draft.count} onChange={e=>change({count:e.target.value})} style={input}/></label>}
          </div>
          {draft.costId && <p>Harmonogram zastępuje jednorazowy wypływ z powiązanego dokumentu. Nie oznacza dokumentu jako zapłaconego.</p>}
          {draft.rodzaj==="installments" && /^\d{4}-(0[1-9]|1[0-2])$/.test(draft.first) && Number.isInteger(Number(draft.count)) && Number(draft.count)>0 && Number(draft.count)<=600 && <p>Ostatnia rata: {shiftDateMonth(draft.first+"-01",Number(draft.count)-1).slice(0,7)}. Suma rat: {money((parse(draft.gross)||0)*Number(draft.count))}. Sprawdź zgodność z harmonogramem umowy.</p>}
          <div style={heading}><button type="submit" style={primary}>{busy?"Zapisywanie…":"Zapisz plan"}</button><button type="button" style={button} onClick={()=>setDraft(null)}>Anuluj</button></div>
        </fieldset>
      </form>
    </section>}
    <section style={panel}><h2>Zobowiązania do wyjaśnienia ({pending.length})</h2>
      <p>Brak daty zapłaty i terminu albo termin sprzed początku prognozy. Te dokumenty nie są automatycznie przenoszone do listopada. Ustal płatność, rozpisz raty lub uzupełnij faktyczną zapłatę w <a href="/cfo">CFO</a>.</p>
      {pending.length>0 && <p role="status"><strong>Prognoza nie obejmuje jeszcze tych zobowiązań.</strong> Do ich wyjaśnienia saldo jest niepełne.</p>}
      {(showAll?pending:pending.slice(0,15)).map(c=><div key={c.id} style={line}>
        <span><strong>{c.kontrahent || c.opis}</strong> • {c.numer_dokumentu || "Bez numeru"} • {money(Number(c.kwota_brutto??c.kwota_netto_cfo))}<small style={{display:"block"}}>{c.opis} • {c.okres_start.slice(0,7)}</small></span>
        <div style={heading}><button type="button" style={button} disabled={busy} onClick={()=>forCost(c,false)}>Ustal płatność</button><button type="button" style={button} disabled={busy} onClick={()=>forCost(c,true)}>Rozpisz raty</button></div>
      </div>)}
      {pending.length>15 && <button type="button" style={button} onClick={()=>setShowAll(v=>!v)}>{showAll?"Pokaż mniej":"Pokaż wszystkie"}</button>}
    </section>
    {(overdueObligations.length>0 || overdueInvoices.length>0) && <section style={panel}><h2>Terminy do potwierdzenia</h2>
      <p>Starsze lub pozbawione terminu zobowiązania podatkowo-płacowe: {overdueObligations.length}. Należności bez potwierdzonego terminu przyszłego wpływu: {overdueInvoices.length}. Uzupełnij terminy i faktyczne zapłaty w CFO oraz Fakturach. Nie zakładamy automatycznie rozliczenia zaległości w pierwszym miesiącu.</p>
    </section>}
    <details style={panel}><summary>Podpowiedzi z historii kosztów i ostatnich rozliczeń CFO ({suggestions.length})</summary>
      <p>To średnie kosztów z 3 miesięcy oraz ostatnie rozliczenie zespołu i podatków. Nie są zatwierdzonym planem. „Użyj” otwiera edycję kwoty i końca obowiązywania.</p>
      {suggestions.map(s=><div key={planKey(s.category,s.subcategory)} style={line}><span>{s.subcategory} • {money(s.gross)} brutto / {s.net===null?"bez wpływu na wynik":money(s.net)+" netto"}</span><button type="button" style={button} onClick={()=>open({...blank(month),nazwa:s.subcategory,kategoria:s.category,podkategoria:s.subcategory,gross:s.gross.toFixed(2),net:s.net===null?"":s.net.toFixed(2)})}>Użyj</button></div>)}
    </details>
    {legacy.some(r=>r.typ==="koszt") && <details style={panel}><summary>Stare korekty — tylko do wglądu</summary>
      <p>Nie są doliczane do nowego planu. Nie da się bezpiecznie odtworzyć docelowej kwoty z historycznej różnicy. Zapisz odpowiednią płatność lub kwotę docelową powyżej.</p>
      {legacy.filter(r=>r.typ==="koszt").map(r=><div key={r.id} style={line}><span>{r.opis} • od {r.okres.slice(0,7)} • {r.powtarzanie==="od_miesiaca"?"powtarzalna":"jednorazowa"}</span><span>{money(Number(r.kwota_cashflow))}</span></div>)}
    </details>}
  </div>;
}
const panel: CSSProperties={padding:20,border:"1px solid "+colors.border,borderRadius:radius.input,background:colors.white,color:colors.text};
const heading: CSSProperties={display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"space-between"};
const grid: CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12};
const field: CSSProperties={display:"grid",gap:6,minWidth:0};
const input: CSSProperties={minWidth:0,width:"100%",boxSizing:"border-box",padding:10,border:"1px solid "+colors.border,borderRadius:10,font:"inherit"};
const button: CSSProperties={border:"1px solid "+colors.border,borderRadius:10,padding:"8px 12px",background:colors.white,color:colors.navy,cursor:"pointer"};
const primary: CSSProperties={...button,background:colors.red,color:colors.white,borderColor:colors.red};
const line: CSSProperties={display:"flex",gap:12,justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",padding:"12px 0",borderBottom:"1px solid "+colors.border};
const table: CSSProperties={borderCollapse:"collapse",width:"100%",textAlign:"left"};
const cell: CSSProperties={padding:"10px 8px",borderBottom:"1px solid "+colors.border,verticalAlign:"top"};
