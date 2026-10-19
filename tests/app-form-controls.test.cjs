const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react');
const exportsForControls={};
const dates={AppDateInput:()=>null,AppMonthInput:()=>null};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/AppFormControls.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:exportsForControls,require:name=>name==='./AppDateInputs'?dates:name==='./AppSelect'?{default:()=>null,__esModule:true}:name==='@/app/design'?{colors:{muted:'#555'}}:require(name)});
const {AppFormInput,AppFormSelect}=exportsForControls;
test('month picker preserves bounds, disabled state and value handlers',()=>{
 let changed;const result=AppFormInput({type:'month',value:'2026-11',min:'2026-11',disabled:true,id:'month',onChange:event=>changed=event.target.value});
 const picker=result.props.children[0];assert.equal(picker.type,dates.AppMonthInput);assert.equal(picker.props.min,'2026-11');assert.equal(picker.props.disabled,true);assert.equal(picker.props.id,'month');picker.props.onChange('2027-01');assert.equal(changed,'2027-01');
});
test('optional dates retain clearing and the payment date maximum',()=>{
 let changed;const result=AppFormInput({type:'date',value:'2026-10-19',max:'2026-10-19',onChange:event=>changed=event.target.value});
 assert.equal(result.props.children[0].props.max,'2026-10-19');result.props.children[1].props.onClick();assert.equal(changed,'');
 const required=AppFormInput({type:'date',value:'2026-10-19',required:true});assert.equal(required.props.children[1],null);
});
test('selects preserve numeric values, empty choices, nested option text and callback values',()=>{
 let changed;const result=AppFormSelect({value:2,'aria-label':'Miesiąc',children:[React.createElement('option',{value:''},'Wybierz'),[React.createElement('option',{value:2},'luty ',2027)]],onChange:event=>changed=event.target.value});
 assert.equal(result.props.options.length,2);assert.equal(result.props.options[0].value,'');assert.equal(result.props.options[1].value,'2');assert.equal(result.props.options[1].label,'luty 2027');assert.equal(result.props.ariaLabel,'Miesiąc');result.props.onChange('2');assert.equal(changed,'2');
});
test('ordinary text inputs retain their original behavior',()=>{
 const result=AppFormInput({type:'email',value:'a@example.com',placeholder:'Email'});assert.equal(result.type,'input');assert.equal(result.props.type,'email');assert.equal(result.props.placeholder,'Email');
});
