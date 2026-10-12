const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports, console, Error, crypto:require('node:crypto').webcrypto, require:name=>{if (imports[name]) return imports[name]; throw Error(name);}});
  return exports;
}
const contract = load('src/lib/organization-import.ts');
const row = (code,parentCode='') => ({code,name:code,type:'Unit',parentCode,source:'Halaman 1: '+code});
assert.throws(()=>contract.validateOrganizationDraft([]));
assert.throws(()=>contract.validateOrganizationDraft([row('A'),row('a')]));
assert.throws(()=>contract.validateOrganizationDraft([row('A','B'),row('B','A')]));
assert.throws(()=>contract.validateOrganizationDraft([row('A','A')]));
assert.throws(()=>contract.validateOrganizationDraft([{...row('A'),type:'Unknown'}]));
assert.throws(()=>contract.validateOrganizationDraft([{...row('A'),source:''}]));
assert.throws(()=>contract.validateOrganizationDraft(Array.from({length:101},(_,i)=>row('U'+i))));
const rows = contract.validateOrganizationDraft([row('B','A'),{...row('A'),institutionId:'bank-b',status:'Approved'}]);
assert.equal(rows[1].institutionId,undefined);
assert.equal(rows[1].status,undefined);
assert.equal(contract.orderOrganizationDraft(rows,[])[0].code,'A');
assert.throws(()=>contract.orderOrganizationDraft(rows,[{id:'existing',code:'A'}]));
assert.throws(()=>contract.orderOrganizationDraft(contract.validateOrganizationDraft([row('B','MISSING')]),[]));
assert.equal(contract.orderOrganizationDraft(contract.validateOrganizationDraft([row('B','EXISTING')]),[{id:'id',code:'EXISTING'}]).length,1);
let context, body, calls=0, failBatch=false, batches=[];
const imports = {
 'next/server':{NextResponse:{json:(data,options={})=>({data,status:options.status||200})}},
 '@/lib/institution-context':{resolveInstitutionAccess:async()=>context},
 '@/lib/ai/http-security':{guardAiPost:async()=>({ok:true,body})},
 '@/lib/organization-import':contract,
 '@/lib/ai/gateway':{runAiGateway:async input=>{calls++;assert.equal(input.institutionId,'bank-a');assert.equal(input.feature,'organization_document');return {text:JSON.stringify({units:[row('A')],complete:true,warnings:[]})};}}
};
const analysis = load('src/app/api/organization/document-analysis/route.ts',imports);
const db = {prepare(sql) { const statement = {sql,values:[],bind(...values){return {...statement,values};},async run(){return {};},async first(){return sql.includes('LegalEntity') ? null : {id:'bank-a'};},async all(){return {results:[]};}};return statement;},async batch(statements){batches.push(statements);if(failBatch)throw Error('database unavailable');return [];}};
const persistence=load('src/lib/d1-organization.ts',{'@opennextjs/cloudflare':{getCloudflareContext:async()=>({env:{DB:db}})},'@/lib/institution-context':{},'@/lib/organization-import':contract});
const save=load('src/app/api/organization/import/route.ts',{...imports,'@/lib/d1-organization':persistence});
(async()=>{
 body={institutionId:'bank-a',text:'Bank organization '.repeat(10)};
 context=null;assert.equal((await analysis.POST({})).status,403);
 context={institution:{id:'bank-a'},profile:{role:'RiskManager',name:'Tester'}};
 assert.equal((await analysis.POST({})).status,403);assert.equal(calls,0);
 context.profile.role='Admin';body.institutionId='bank-b';assert.equal((await analysis.POST({})).status,409);
 body.institutionId='bank-a';assert.equal((await analysis.POST({})).status,200);assert.equal(calls,1);
 body.text='x'.repeat(90001);assert.equal((await analysis.POST({})).status,400);
 body={institutionId:'bank-a',units:[row('B','A'),row('A')],sourceName:'structure.pdf',confirmed:false};
 assert.equal((await save.POST({})).status,400);assert.equal(batches.length,0);
 body.confirmed=true;body.institutionId='bank-b';assert.equal((await save.POST({})).status,409);assert.equal(batches.length,0);
 body.institutionId='bank-a';body.legalEntityId='other-tenant';assert.equal((await save.POST({})).status,400);assert.equal(batches.length,0);
 body.legalEntityId=null;const result=await save.POST({});assert.equal(result.status,201);assert.equal(result.data.count,2);
 assert.equal(batches.length,1);assert.equal(batches[0].length,5);
 const [parent,,child,,audit]=batches[0];assert.equal(parent.values[5],'A');assert.equal(child.values[3],parent.values[0]);
 assert.equal(parent.values[1],'bank-a');assert.equal(audit.values[2],'Tester');assert.equal(audit.values[3],'Admin');
 failBatch=true;assert.equal((await save.POST({})).status,409);
 context.profile.role='ProcessOwner';assert.equal((await save.POST({})).status,403);
 console.log('PASS: draft bounds, cycles, orphans, duplicate codes, tenant/role guards, confirmation, legal entity isolation, parent ordering and one atomic units/evidence/audit batch.');
})().catch(error=>{console.error(error);process.exitCode=1;});
