const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),ts=require("typescript");
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const dictionaries={};
vm.runInNewContext(compile("src/lib/clientDictionaries.ts"),{exports:dictionaries});
test("client and contract ZUS values share health-only and legacy labels",()=>{
 assert.ok(dictionaries.ZUS_SCHEME_OPTIONS.some(x=>x.value==="Tylko zdrowotna"));
 assert.equal(dictionaries.normalizeZusScheme("Preferencyjny"),"Preferencyjny ZUS");
 assert.equal(dictionaries.normalizeZusScheme("Brak"),"Brak ZUS");
 assert.equal(dictionaries.normalizeZusScheme(" Tylko zdrowotna "),"Tylko zdrowotna");
 assert.equal(dictionaries.normalizeZusScheme(null),"");
});
async function createFromContract(legalForm,scheme,address) {
 let inserted,linked;
 const jsx=(type,props)=>({type,props});
 const contract={id:"contract",status:"podpisana",klient_id:null,nazwa_klienta:"Firma testowa",nip:"1234567890",siedziba:address,email_klienta:"test@example.com",reprezentant:"Kontakt",typ_umowy:"KU",pierwszy_okres:"2026-10",abonament_netto:500,limit_dokumentow:20,obsluga_kadrowa:true,ustalenia_indywidualne:"Ustalenia"};
 const ex={};
 vm.runInNewContext(compile("src/components/ContractClientOnboardingPanel.tsx"),{exports:ex,alert:()=>{},console,require:name=>{
  if(name==="react")return {useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>[typeof initial==="function"?{...initial(),forma_prawna:legalForm,schemat_zus:scheme,telefon:"123456789",czynny_vat:true,vat_ue:true}:initial,()=>{}]};
  if(name==="react/jsx-runtime")return {jsx,jsxs:jsx};
  if(name.endsWith("clientDictionaries"))return dictionaries;
  if(name.endsWith("contactFields"))return {normalizeContactList:v=>v||null};
  if(name.endsWith("clientService"))return {findClientByNip:async()=>({data:null,error:null}),createClient:async payload=>{inserted=payload;return {data:{id:"client"},error:null}}};
  if(name.endsWith("crmContractService"))return {updateCrmContract:async(id,payload)=>{linked={id,payload};return {data:{...contract,klient_id:payload.klient_id},error:null}}};
  return {colors:{},radius:{},shadow:{}};
 }});
 const root=ex.default({contract,onCreated:()=>{}});
 const button=root.props.children[0].props.children[1];
 await button.props.onClick();
 return {inserted,linked};
}
test("creating every new JDG copies the saved address and health-only scheme",async()=>{
 const {inserted,linked}=await createFromContract("JDG","Tylko zdrowotna","  ul. Testowa 1, Poznań  ");
 assert.equal(inserted.adres_dzialalnosci,"ul. Testowa 1, Poznań");
 assert.equal(inserted.schemat_zus,"Tylko zdrowotna");
 assert.equal(inserted.email,"test@example.com");
 assert.equal(inserted.czynny_vat,true);assert.equal(inserted.vat_ue,true);
 assert.equal(inserted.pierwszy_okres_rozliczeniowy,"2026-10-01");
 assert.equal(inserted.abonament,500);assert.equal(linked.payload.klient_id,"client");
});
test("contract creation normalizes old schemes and does not add personal ZUS to companies",async()=>{
 assert.equal((await createFromContract("JDG","Preferencyjny",null)).inserted.schemat_zus,"Preferencyjny ZUS");
 const {inserted}=await createFromContract("spółka z o.o.","Tylko zdrowotna","Siedziba");
 assert.equal(inserted.schemat_zus,null);assert.equal(inserted.adres_dzialalnosci,"Siedziba");
});
