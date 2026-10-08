const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,require:name=>{if(imports[name])return imports[name];throw Error(name);}});
 return exports;
}
const contract=load('src/lib/policy-document-ai.ts');
const clean=contract.cleanPolicyDraft({title:'Test',status:'Approved',institutionId:'bank-b',issueDate:'2026-02-31',documentType:'Invented'},'policy');
assert.deepEqual(JSON.parse(JSON.stringify(clean)),{title:'Test'});
assert.throws(()=>contract.cleanPolicyDraft([], 'policy'));
let context, body, called=0;
const route=load('src/app/api/policy-library/document-analysis/route.ts',{
 'next/server':{NextResponse:{json:(data,options)=>({data,status:options.status||200})}},
 '@/lib/institution-context':{resolveInstitutionAccess:async()=>context},
 '@/lib/ai/http-security':{guardAiPost:async()=>({ok:true,body})},
 '@/lib/policy-document-ai':contract,
 '@/lib/ai/gateway':{runAiGateway:async input=>{called++;assert.equal(input.institutionId,'bank-a');assert.equal(input.sensitivity,'confidential');return {text:'{"draft":{"title":"Draft","status":"Approved"}}',provider:'cloudflare'};}}
});
(async()=>{
 body={kind:'policy',text:'Sumber dokumen kebijakan. '.repeat(10),institutionId:'bank-b'};
 context=null;assert.equal((await route.POST({})).status,403);
 context={institution:{id:'bank-a'},profile:{role:'InstitutionAdmin'}};assert.equal((await route.POST({})).status,403);assert.equal(called,0);
 context.profile.role='ComplianceOfficer';
 const result=await route.POST({});assert.equal(result.status,200);assert.equal(result.data.requiresValidation,true);assert.equal(result.data.draft.status,undefined);
 body.text='x'.repeat(90001);assert.equal((await route.POST({})).status,400);assert.equal(called,1);
 console.log('Policy document AI PASS: RBAC, server tenant scope, input bounds, draft allowlist and invalid dates.');
})().catch(error=>{console.error(error);process.exitCode=1;});
