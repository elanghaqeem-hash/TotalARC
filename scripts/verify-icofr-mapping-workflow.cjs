'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Module=require('node:module');
const path=require('node:path');
const ts=require('typescript');
const originalLoad=Module._load;
const source=fs.readFileSync(path.join(process.cwd(),'src/lib/d1-icofr-mapping-workspace.ts'),'utf8');
const proposal={id:'proposal-A',institutionId:'tenant-A',financialItemId:'item-A',
  assertion:'Completeness',riskId:'risk-A',controlMasterId:'control-A',sourceDocumentId:'doc-A',
  sourceRecordKey:'ACCOUNT:BS:01',sourceHash:'a'.repeat(64),
  sourceReference:'ACCOUNT:BS:01 / source sheet B12',
  rationale:'Source control addresses completeness of the reported account.',
  createdBy:'creator-A',ownerReviewedBy:null,icofrReviewedBy:null,approvedBy:null,
  publishedBy:null,status:'DRAFT',version:1,updatedAt:new Date(0).toISOString()};
let sourceSha='a'.repeat(64), ownerAssigned=true, plcReady=true, graphReady=true, traced=0;
const log=[];
const db={prepare(sql){return {bind(...args){return{
  async all(){return {results:[]}},
  async first(){
    if(sql.includes('FROM ICOFRMappingProposal WHERE id='))return {...proposal};
    if(sql.includes('SourceDocument d'))return sourceSha?{rawSha256:sourceSha,recordTitle:'Sample Account'}:null;
    if(sql.includes('FROM BusinessProcess b'))return ownerAssigned?{id:'process-A'}:null;
    if(sql.includes('FROM ICOFRControlDomain'))return plcReady?{id:'PLC-A',category:'PLC',sourceControlId:'control-A'}:null;
    if(sql.includes('FROM ControlRiskMapping m'))return graphReady?{id:'control-A'}:null;
    return null;
  },
  async run(){
    if(sql.includes('UPDATE ICOFRMappingProposal')){
      const oldStatus=(sql.includes("status='PUBLISHED'")||sql.includes("status='APPROVED'"))?'PUBLISHING':args[args.length-2],version=args[args.length-1];
      if(proposal.status!==oldStatus||proposal.version!==version)return {meta:{changes:0}};
      if(sql.includes("SET status='PUBLISHED'"))proposal.status='PUBLISHED';
      else if(sql.includes("SET status='APPROVED'"))proposal.status='APPROVED';
      else if(sql.includes("SET status='PUBLISHING'"))proposal.status='PUBLISHING';
      else proposal.status=args[0];
      proposal.version+=1;
      if(sql.includes('ownerReviewedBy=?'))proposal.ownerReviewedBy=args[2];
      if(sql.includes('icofrReviewedBy=?'))proposal.icofrReviewedBy=args[2];
      if(sql.includes('approvedBy=?'))proposal.approvedBy=args[2];
      if(sql.includes('publishedBy=?'))proposal.publishedBy=args[1];
      proposal.updatedAt=new Date().toISOString();
    }
    if(sql.includes('INSERT INTO ICOFRMappingReviewEvent'))log.push(args);
    return {meta:{changes:1}};
  }
  }} ,async run(){return {meta:{changes:1}}}};
}};
function actor(id,role,orgUnitId='unit-A'){return {id,role,orgUnitId,email:id+'@test.invalid'}}
Module._load=function(req,parent,isMain){
  if(req==='@opennextjs/cloudflare')return {getCloudflareContext:async()=>({env:{DB:db}})};
  if(req==='@/lib/d1-icofr-traceability')return {
    ensureIcofrTraceabilitySchema:async()=>{},saveTraceabilityChain:async()=>{traced++},
    STANDARD_ASSERTIONS:['Completeness','Accuracy']};
  if(req==='@/lib/institution-context')return {resolveServerActiveInstitutionId:async()=>null};
  return originalLoad.call(this,req,parent,isMain);
};
const mod=new Module('mapping-workflow.ts',module);
mod.filename=path.resolve('src/lib/d1-icofr-mapping-workspace.ts');
mod.paths=module.paths;
mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod.filename);
Module._load=originalLoad;
const update=mod.exports.updateMappingStage;
async function rejects(action,who,code){
  await assert.rejects(()=>update('tenant-A',who,{id:proposal.id,action,note:'Evidence and review recorded'}),e=>e.message===code,code);
}
(async()=>{
  await rejects('OWNER_REVIEW',actor('wrong','Reviewer'),'MAPPING_ROLE_DENIED');
  ownerAssigned=false;
  await rejects('OWNER_REVIEW',actor('owner-A','ProcessOwner'),'PROCESS_OWNER_SCOPE_DENIED');
  ownerAssigned=true;sourceSha='b'.repeat(64);
  await rejects('OWNER_REVIEW',actor('owner-A','ProcessOwner'),'SOURCE_VERSION_CHANGED');
  sourceSha='a'.repeat(64);
  await update('tenant-A',actor('owner-A','ProcessOwner'),{id:proposal.id,action:'OWNER_REVIEW',note:'Owner examined source material'});
  assert.equal(proposal.status,'OWNER_REVIEWED');
  await rejects('APPROVE',actor('approver-A','Reviewer'),'INVALID_WORKFLOW_TRANSITION');
  await update('tenant-A',actor('coordinator-A','ICOFRCoordinator'),{id:proposal.id,action:'ICOFR_REVIEW',note:'Assertion and RCM reviewed'});
  await rejects('APPROVE',actor('owner-A','Reviewer'),'SEGREGATION_OF_DUTIES_REQUIRED');
  await update('tenant-A',actor('approver-A','Reviewer'),{id:proposal.id,action:'APPROVE',note:'Independent approval granted'});
  plcReady=false;
  await rejects('PUBLISH',actor('coordinator-A','ICOFRCoordinator'),'PLC_MAPPING_REQUIRED');
  assert.equal(traced,0);
  plcReady=true;graphReady=false;
  await rejects('PUBLISH',actor('coordinator-A','ICOFRCoordinator'),'SOURCE_CHAIN_NOT_FOUND');
  graphReady=true;
  await update('tenant-A',actor('coordinator-A','ICOFRCoordinator'),{id:proposal.id,action:'PUBLISH',note:'All independent reviews completed'});
  assert.equal(traced,1);assert.equal(proposal.status,'PUBLISHED');assert.equal(log.length,4);
  await rejects('PUBLISH',actor('coordinator-A','ICOFRCoordinator'),'INVALID_WORKFLOW_TRANSITION');
  await rejects('OWNER_REVIEW',actor('owner-A','ProcessOwner'),'INVALID_WORKFLOW_TRANSITION');
  assert.ok(source.includes("status='PUBLISHING'"),'CAS publication reservation');
  assert.ok(source.includes('extractSourceEvidence'),'source excerpt grounded in record');
  assert.ok(source.includes('SOURCE_RECORD_CITATION_REQUIRED'),'source identity anchored');
  console.log('ICOFR_MAPPING_WORKFLOW_SECURITY: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
