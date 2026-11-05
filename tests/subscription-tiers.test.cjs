const {test}=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const {join}=require("node:path");
const vm=require("node:vm");
const ts=require("typescript");
const React=require("react");
const exportsObject={};
vm.runInNewContext(ts.transpileModule(readFileSync(join(__dirname,"../src/lib/subscriptionPricing.ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,Date,Intl});
const payload=exportsObject.subscriptionPricingPayload;
const base={kilka_abonamentow:true,abonament:"300",limit_dokumentow:"10",abonamenty_progi:[{abonament:"300",limit_dokumentow:"10"},{abonament:"500",limit_dokumentow:"30"}]};
test("pricing normalizes sorted tiers and preserves the activation month",()=>{
 const result=payload({...base,abonamenty_od:"2026-11-01",abonamenty_progi:[...base.abonamenty_progi].reverse()});
 assert.equal(result.abonament,300);assert.equal(result.limit_dokumentow,10);assert.equal(result.abonamenty_od,"2026-11-01");
 assert.equal(result.abonamenty_progi[1].abonament,500);
});
test("invalid tiers are rejected before saving",()=>{
 for(const tiers of [
 [{abonament:"300",limit_dokumentow:"10"}],
 [{abonament:"300",limit_dokumentow:"10"},{abonament:"500",limit_dokumentow:"10"}],
 [{abonament:"300",limit_dokumentow:"10"},{abonament:"200",limit_dokumentow:"30"}],
 [{abonament:"300",limit_dokumentow:"10"},{abonament:"",limit_dokumentow:"30"}],
 [{abonament:"300",limit_dokumentow:"10"},{abonament:"500.001",limit_dokumentow:"30"}],
 [{abonament:"300",limit_dokumentow:"10"},{abonament:"500",limit_dokumentow:"30.5"}],
 ])assert.throws(()=>payload({...base,abonamenty_progi:tiers}));
});
test("disabling tiers preserves a single subscription",()=>{
 const result=payload({...base,kilka_abonamentow:false});
 assert.equal(result.abonament,300);assert.equal(result.limit_dokumentow,10);assert.equal(result.abonamenty_progi.length,0);assert.equal(result.abonamenty_od,null);
});
const uiExports={};
const code=ts.transpileModule(readFileSync(join(__dirname,"../src/components/SubscriptionTiersEditor.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
vm.runInNewContext(code,{exports:uiExports,require:name=>{
 if(name==="react/jsx-runtime")return require(name);
 if(name==="lucide-react")return {Plus:()=>null,X:()=>null};
 if(name==="@/app/design")return {colors:{},radius:{}};
 if(name==="@/components/AppFormControls")return {AppFormInput:"input"};
 throw Error(name);
}});
const Editor=uiExports.default;
function nodes(element) {
 if(!element||typeof element!=="object")return [];
 return [element,...React.Children.toArray(element.props?.children).flatMap(nodes)];
}
test("checkbox enables two editable rows using the existing price",()=>{
 let changed;
 const root=Editor({value:{...base,kilka_abonamentow:false,abonamenty_progi:[]},onChange:value=>changed=value});
 nodes(root).find(n=>n.props.type==="checkbox").props.onChange({target:{checked:true}});
 assert.equal(changed.kilka_abonamentow,true);assert.equal(changed.abonamenty_progi.length,2);assert.equal(changed.abonamenty_progi[0].abonament,"300");
});
test("plus adds another tier and editing the first row updates the base price",()=>{
 let changed;
 const root=Editor({value:base,onChange:value=>changed=value});
 const buttons=nodes(root).filter(n=>n.type==="button");
 buttons[buttons.length-1].props.onClick();
 assert.equal(changed.abonamenty_progi.length,3);
 const field=nodes(root).find(n=>n.props["aria-label"]==="Abonament 1 netto");
 field.props.onChange({target:{value:"350"}});
 assert.equal(changed.abonament,"350");
});
