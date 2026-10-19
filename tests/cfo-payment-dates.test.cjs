const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function moduleFrom(file, dependencies = {}, extra = '') {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, Date, Intl, console, process, require: name => dependencies[name] || {} });
  return exports;
}
const cash = moduleFrom('src/lib/cfoCashflow.ts');
const annual = moduleFrom('src/lib/cfoAnnualCosts.ts', { './cfoCashflow': cash });
const budget = moduleFrom('src/app/budzet/page.tsx', { '@/lib/cfoCashflow': cash, '@/lib/cfoAnnualCosts': annual, '@/app/design': { colors: new Proxy({}, { get: () => '#000' }), radius: {}, shadow: {} } },
  '\nexport { buildBudgetMonths, buildInvoicePaymentProfile, buildCostPaymentProfile, plannedInvoiceCustomerCashFlowForMonth, plannedCostCashFlowForMonth };');
const invoice = { id: 'invoice', typ: 'sprzedaz', status: 'oplacona', kategoria: 'standardowa', klient_id: 'client', kontrahent_nazwa: 'Client', data_wystawienia: '2026-09-01', termin_platnosci: '2026-09-08', data_zaplaty: '2026-09-20', kwota_brutto: 123, okres: '2026-09-01', waluta: 'PLN' };
const cost = { id: 'cost', kontrahent: 'Vendor', data_dokumentu: '2026-09-01', okres_start: '2026-09-01', okres_end: '2026-09-30', kwota_netto_cfo: 100, kwota_brutto: 123, kategoria: 'systemy_technologia', data_zaplaty: '2026-09-22', ignoruj: false };
const obligation = { id: 'salary', typ: 'wynagrodzenia_netto', okres: '2026-08-01', termin_platnosci: '2026-09-10', data_zaplaty: '2026-09-10', kwota: 6000 };

test('paid status settles the invoice without fabricating a receipt date from its due date', () => {
  const paid = cash.actualInvoicePayment({ ...invoice, data_zaplaty: null });
  assert.equal(paid.paidAmount, 123); assert.equal(paid.paymentDate, null);
  assert.equal(cash.actualInvoicePayment({ ...invoice, status: 'przeterminowana' }).paidAmount, 0);
});
test('costs are settled only by their actual date, not by a due date', () => {
  assert.equal(cash.actualCostPayment({ ...cost, data_zaplaty: null, termin_platnosci: '2026-09-10' }).paidAmount, 0);
  assert.equal(cash.actualCostPayment(cost).paidAmount, 123);
});
test('six month average is per counterparty, uses shorter histories and excludes future and invalid samples', () => {
  const samples = [
    { key: 'a', issueDate: '2026-09-01', paidDate: '2026-09-21' },
    { key: 'a', issueDate: '2026-10-01', paidDate: '2026-10-11' },
    { key: 'b', issueDate: '2026-10-01', paidDate: '2026-10-04' },
    { key: 'a', issueDate: '2026-04-18', paidDate: '2026-07-30' },
    { key: 'a', issueDate: '2026-10-01', paidDate: '2026-10-25' },
    { key: 'a', issueDate: '2026-09-01', paidDate: null },
    { key: 'a', issueDate: '2026-09-10', paidDate: '2026-09-09' },
  ];
  const average = cash.paymentAverage(samples, '2026-10-19');
  assert.equal(average.get('a'), 15); assert.equal(average.get('b'), 3);
});
test('real long payment delays are not silently capped at sixty days', () => {
  assert.equal(cash.paymentAverage([{ key: 'a', issueDate: '2026-05-01', paidDate: '2026-08-29' }], '2026-10-19').get('a'), 120);
});
test('payroll and tax deadlines preserve next-month offsets and month ends', () => {
  assert.equal(cash.shiftDateMonth('2026-01-31', 1), '2026-02-28');
  assert.equal(cash.obligationCashflow('2026-10', [obligation], '2026-10', '2026-10-01'), 6000);
  assert.equal(cash.obligationCashflow('2026-11', [obligation], '2026-10', '2026-10-01'), 6000);
});
test('explicit obligations replace projections and separate VAT, CIT, PIT4 and ZUS', () => {
  const rows = [obligation, { ...obligation, id: 'known', okres: '2026-09-01', termin_platnosci: '2026-10-10', data_zaplaty: null, kwota: 7000 },
    ...['zus', 'pit4', 'vat', 'cit'].map((typ, index) => ({ ...obligation, id: typ, typ, okres: '2026-09-01', termin_platnosci: '2026-10-20', data_zaplaty: null, kwota: (index + 1) * 100 }))];
  assert.equal(cash.obligationCashflow('2026-10', rows, '2026-10', '2026-10-01'), 8000);
});
test('an explicit zero month suppresses the recurring obligation', () => {
  assert.equal(cash.obligationCashflow('2026-10', [obligation, { ...obligation, id: 'zero', okres: '2026-09-01', termin_platnosci: null, data_zaplaty: null, kwota: 0 }], '2026-10', '2026-10-01'), 0);
});
test('actual cashflow uses document dates once and excludes unpaid or unknown-date items', () => {
  const rows = cash.cashflowTransactions({ invoices: [invoice, { ...invoice, id: 'unknown', data_zaplaty: null }, { ...invoice, id: 'eur', waluta: 'EUR' }], costs: [cost], obligations: [obligation] });
  assert.equal(rows.length, 3);
  assert.equal(rows.reduce((n, r) => n + r.kwota, 0), -6000);
  assert.equal(rows.find(r => r.id === 'invoice:invoice').data_ksiegowania, '2026-09-20');
});
test('budget timing profiles use confirmed actual dates for both sales and costs', () => {
  const sales = budget.buildInvoicePaymentProfile([{ id: 'i', payerKey: 'client', gross: 123, paidAmount: 123, issueDate: '2026-09-01', paymentDate: '2026-09-20' }], '2026-10-19');
  const purchases = budget.buildCostPaymentProfile([{ id: 'c', vendorKey: 'vendor', amount: 123, paidAmount: 123, documentDate: '2026-09-01', paymentDate: '2026-09-22' }], '2026-10-19');
  assert.equal(sales.averageDaysByCounterparty.get('client'), 19);
  assert.equal(purchases.averageDaysByCounterparty.get('vendor'), 21);
});
test('overdue receivables stay in the first forecast month and paid invoices are not forecast again', () => {
  const profile = { globalAverageDays: 14, averageDaysByCounterparty: new Map([['client', 19]]), asOf: '2026-11-01' };
  const unpaid = { id: 'u', payerKey: 'client', servicePeriod: '2026-09', issueDate: '2026-09-01', dueDate: '2026-09-08', gross: 123, paidAmount: 0, paymentDate: null };
  assert.equal(budget.plannedInvoiceCustomerCashFlowForMonth('2026-11', [unpaid], profile).amount, 123);
  assert.equal(budget.plannedInvoiceCustomerCashFlowForMonth('2026-12', [unpaid], profile).amount, 0);
  assert.equal(budget.plannedInvoiceCustomerCashFlowForMonth('2026-11', [{ ...unpaid, paidAmount: 123, paymentDate: '2026-09-20' }], profile).amount, 0);
});
test('known cost deadlines override the historical estimate, without duplicating paid costs', () => {
  const profile = { globalAverageDays: 14, averageDaysByCounterparty: new Map([['vendor', 21]]), asOf: '2026-10-01' };
  const row = { id: 'c', vendorKey: 'vendor', servicePeriod: '2026-09', documentDate: '2026-09-01', dueDate: '2026-11-15', amount: 123, paidAmount: 0, paymentDate: null };
  assert.equal(budget.plannedCostCashFlowForMonth('2026-11', [row], profile).amount, 123);
  assert.equal(budget.plannedCostCashFlowForMonth('2026-10', [row], profile).amount, 0);
});
test('budget actual execution and opening cash stay independent from accounting wages', () => {
  const snapshot = { invoices: [invoice], costs: [cost], obligations: [obligation] };
  const result = budget.buildBudgetMonths('2026-09', 1, [], [], [{ okres: '2026-09-01', podstawa: 99999, zus_pracodawcy: 9999 }], cash.cashflowTransactions(snapshot), [], [], [], 10000, snapshot);
  assert.equal(result[0].actualCashFlow, -6000);
  // Net payroll settlement is 6000, never the 109998 accounting payroll cost.
  assert.ok(result[0].plannedCashFlow > -100000);
});

test('cashflow reads every page without bank imports and excludes drafts, cancellations and proformas', async () => {
  const calls = [];
  const datasets = {
    faktury: [...Array.from({ length: 1100 }, (_, id) => ({ ...invoice, id: String(id) })),
      { ...invoice, status: 'szkic' }, { ...invoice, status: 'anulowana' }, { ...invoice, typ: 'proforma' }],
    cfo_koszty: Array.from({ length: 601 }, (_, id) => ({ ...cost, id: String(id) })),
    cfo_zobowiazania: [obligation],
    cfo_harmonogramy_roczne: [],
  };
  const supabase = { from(table) {
    assert.ok(datasets[table], 'must not query bank tables');
    const query = { select() { return this; }, order() { return this; }, async range(from, to) {
      calls.push([table, from]); return { data: datasets[table].slice(from, to + 1), error: null };
    } }; return query;
  } };
  const service = moduleFrom('src/lib/cfoCashflowService.ts', { './supabaseClient': { supabase } });
  const result = await service.fetchCashflowSnapshot();
  assert.equal(result.error, null); assert.equal(result.data.invoices.length, 1100); assert.equal(result.data.costs.length, 601);
  assert.ok(calls.some(([table, offset]) => table === 'faktury' && offset === 1000));
});

test('failed cashflow requests return an error instead of a misleading partial snapshot', async () => {
  const supabase = { from(table) {
    return { select() { return this; }, order() { return this; }, async range() {
      return table === 'cfo_zobowiazania' ? { data: null, error: { message: 'offline' } } : { data: [invoice], error: null };
    } };
  } };
  const service = moduleFrom('src/lib/cfoCashflowService.ts', { './supabaseClient': { supabase } });
  const result = await service.fetchCashflowSnapshot();
  assert.equal(result.data, null); assert.equal(result.error.message, 'offline');
});


const annualSchedule = { id: 'annual', nazwa: 'Licencja', kontrahent: 'Vendor', kategoria: 'systemy_technologia', podkategoria: null, kwota_netto: 12000, kwota_brutto: 14760, pierwszy_okres: '2027-01-01', data_faktury: '2027-01-15', termin_platnosci: '2027-01-25', aktywny: true };
test('annual renewal costs spread over twelve months but cash leaves once in the due month', () => {
  let net=0,cashOut=0;
  for(let month=1;month<=12;month++) {
    const result=annual.annualCostForecast('2027-'+String(month).padStart(2,'0'),[annualSchedule],[],'2027-01-01');
    assert.equal(result.groups[0].net,1000); net+=result.groups[0].net;cashOut+=result.cash;
    assert.equal(result.cash,month===1?14760:0);
  }
  assert.equal(net,12000);assert.equal(cashOut,14760);
  assert.equal(annual.annualCostForecast('2028-01',[annualSchedule],[],'2027-01-01').cash,14760);
});
test('a linked renewal replaces only its own annual cycle, including a different price',()=>{
 const linked={...cost,harmonogram_id:'annual',okres_start:'2027-01-01',okres_end:'2027-12-31',kwota_netto_cfo:15000,kwota_brutto:18450};
 const known=annual.annualCostForecast('2027-01',[annualSchedule],[linked],'2027-01-01');
 assert.equal(known.cash,0);assert.equal(known.groups.length,0);
 assert.equal(annual.nextAnnualRenewal(annualSchedule,[linked],'2027-03-01').due,'2028-01-25');
 assert.equal(annual.annualCostForecast('2028-01',[annualSchedule],[linked],'2027-01-01').cash,14760);
 const ignored=annual.annualCostForecast('2027-01',[annualSchedule],[{...linked,ignoruj:true}],'2027-01-01');
 assert.equal(ignored.cash,14760);
});
test('annual coverage and payment can fall in different years, and leap dates do not drift',()=>{
 const row={...annualSchedule,pierwszy_okres:'2028-01-01',data_faktury:'2027-12-10',termin_platnosci:'2027-12-20'};
 assert.equal(annual.annualCostForecast('2027-12',[row],[],'2027-01-01').cash,14760);
 assert.equal(annual.annualCostForecast('2027-12',[row],[],'2027-01-01').groups.length,0);
 assert.equal(annual.annualCostForecast('2028-01',[row],[],'2027-01-01').groups[0].net,1000);
 const leap={...row,pierwszy_okres:'2028-02-01',termin_platnosci:'2028-02-29'};
 assert.equal(annual.annualCostForecast('2029-02',[leap],[],'2028-01-01').cash,14760);
 assert.equal(annual.annualCostForecast('2029-03',[leap],[],'2028-01-01').cash,0);
});
test('disabling an annual schedule stops forecasts, while older linked documents do not replace a new renewal',()=>{
 assert.equal(annual.annualCostForecast('2027-01',[{...annualSchedule,aktywny:false}],[],'2027-01-01').cash,0);
 const old={...cost,harmonogram_id:'annual',okres_start:'2026-01-01',okres_end:'2026-12-31'};
 assert.equal(annual.annualCostForecast('2027-01',[annualSchedule],[old],'2027-01-01').cash,14760);
});
test('budget adds annual renewals to ordinary costs without treating the yearly invoice as a monthly payment',()=>{
 const source={...cost,id:'old',harmonogram_id:'annual',data_dokumentu:'2026-01-15',data_zaplaty:'2026-01-25',okres_start:'2026-01-01',okres_end:'2026-12-31',kwota_netto_cfo:12000,kwota_brutto:14760,ujecie_zarzadcze:'rozliczenie_w_czasie'};
 const ordinary=['2026-08','2026-09'].map((period,index)=>({...cost,id:'ordinary'+index,kontrahent:'Other',data_dokumentu:period+'-01',data_zaplaty:period+'-10',okres_start:period+'-01',okres_end:period+'-28',kwota_netto_cfo:200,kwota_brutto:246}));
 let rows=[source,...ordinary];let snapshot={invoices:[],costs:rows,obligations:[],annualSchedules:[annualSchedule]};
 let result=budget.buildBudgetMonths('2026-10',15,[],rows,[],[],[],[],[],0,snapshot);
 assert.equal(result[3].plannedCosts,1200);assert.equal(result[3].plannedCashFlow,-15006);
 assert.equal(result[4].plannedCosts,1200);assert.equal(result[4].plannedCashFlow,-246);
 const renewal={...source,id:'renewal',data_dokumentu:'2027-01-15',data_zaplaty:null,termin_platnosci:'2027-01-25',okres_start:'2027-01-01',okres_end:'2027-12-31',kwota_netto_cfo:15000,kwota_brutto:18450};
 rows=[...rows,renewal];snapshot={...snapshot,costs:rows};
 result=budget.buildBudgetMonths('2026-10',15,[],rows,[],[],[],[],[],0,snapshot);
 assert.equal(result[3].plannedCosts,1450);assert.equal(result[3].plannedCashFlow,-18696);
 assert.equal(result[4].plannedCosts,1450);assert.equal(result[4].plannedCashFlow,-246);
});
