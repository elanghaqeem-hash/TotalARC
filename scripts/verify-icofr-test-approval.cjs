'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {DatabaseSync} = require('node:sqlite');
const crypto = require('node:crypto');
const os = require('node:os');
const cp = require('node:child_process');
const ts = require('typescript');
function load(file, dependencies={}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText,{exports,console,Error,crypto:crypto.webcrypto,Request,Response,URL,TextDecoder,Uint8Array,Date,
    require(id){if (id in dependencies) return dependencies[id]; throw new Error('Unexpected dependency '+id);}});
  return exports;
}
const governance = load('src/lib/icofr-test-governance.ts');
const db = new DatabaseSync(':memory:');
const needed = ['ControlMaster','ICOFRDesignAssessment','ToETest','TestSample','TestingException',
  'ICOFRMappingProposal','SourceDocument','SourceStructuredRecord','ICOFRControlDomain',
  'ICOFRWorkpaperReview','ICOFRWorkpaperEvidenceIndex','ICOFRWorkpaperReviewNote',
  'EvidenceDocument','EvidenceVersion','EvidenceLink','EvidenceBinaryChunk','Institution','AuditLog',
  'RiskMaster','ControlRiskMapping','BusinessProcess','ICOFRFinancialItem','ICOFRAssertion',
  'ICOFRTraceabilityLink','ICOFRScope','ICOFRScopeItem','ICOFRScopeLink'];
const definitions = new Map();
for(const file of fs.readdirSync('src/lib').filter(v=>v.startsWith('d1')&&v.endsWith('.ts'))){
  const source = fs.readFileSync(path.join('src/lib',file),'utf8');
  for(const match of source.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(/g)){
    let depth=1, quoted=false, pos=match.index+match[0].length;
    for(;pos<source.length;pos++){
      const char=source[pos];
      if(char==="'"){if(quoted&&source[pos+1]==="'"){pos++;continue;}quoted=!quoted;}
      if(!quoted){if(char==='(')depth++;if(char===')'&&--depth===0)break;}
    }
    if(depth===0&&!definitions.has(match[1])) definitions.set(match[1],source.slice(match.index,pos+1)+';');
  }
}
// SourceStructuredRecord is provisioned by the source-feed pipeline, not runtime DDL.
definitions.set('SourceStructuredRecord','CREATE TABLE SourceStructuredRecord (id TEXT PRIMARY KEY,institutionId TEXT,sourceDocumentId TEXT,recordKey TEXT,recordType TEXT,status TEXT)');
for(const table of needed){assert.ok(definitions.has(table),'actual schema: '+table);db.exec(definitions.get(table));}
db.exec(governance.TEST_GOVERNANCE_SCHEMA);
function insert(table, overrides){
  const row = {};
  for(const c of db.prepare('PRAGMA table_info('+table+')').all())
    if(c.notnull && c.dflt_value===null) row[c.name]=/INT|REAL/.test(c.type)?0:'fixture-'+c.name;
  Object.assign(row,overrides);
  const keys=Object.keys(row);
  db.prepare('INSERT INTO '+table+' ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').run(...Object.values(row));
}
const tenant='tenant-a', now='2026-10-18T08:00:00.000Z';
const bytes=Buffer.from('actual source evidence stored for the local security fixture');
const hash=crypto.createHash('sha256').update(bytes).digest('hex');
insert('Institution',{id:tenant,name:'Fixture institution'});
insert('ControlMaster',{id:'control',institutionId:tenant,processId:'process'});
const tod={id:'tod',institutionId:tenant,controlDomainId:'domain',period:'FY2026',testerName:'Maker',
  reviewerName:'Checker',objectiveAlignment:1,riskCoverage:1,precisionAdequate:1,evidenceSufficiency:1,
  walkthroughComplete:1,conclusion:'Effective',status:'Approved',notes:'Source-grounded walkthrough'};
const toe={id:'toe',controlId:'control',processId:'process',riskId:null,period:'FY2026',testerName:'Maker',
  reviewerName:'Checker',populationSize:100,populationSource:'Ledger',samplingMethod:'Random',sampleSize:1,
  passCount:1,failCount:0,testerConclusion:'Effective',finalConclusion:'Effective',status:'Approved',notes:'Tested sample',testedAt:now};
insert('ICOFRDesignAssessment',tod);insert('ToETest',toe);
insert('TestSample',{id:'sample',toeTestId:'toe',sampleNumber:1,result:'Pass',transactionRef:'TX-1',evidenceRef:'EVD-1@v1'});
toe.sampleSnapshot=db.prepare('SELECT '+governance.sampleSnapshotSql()+ ' AS snapshot FROM ToETest t WHERE t.id=?').get('toe').snapshot;
for(const type of ['ToD','ToE']){
  const id=type==='ToD'?'tod':'toe', review='review-'+id;
  insert('ICOFRWorkpaperReview',{id:review,institutionId:tenant,workpaperType:type,workpaperId:id,
    period:'FY2026',preparedBy:'Maker',reviewerName:'Checker',scopeObjectiveComplete:1,proceduresComplete:1,
    evidenceIndexed:1,exceptionsEvaluated:1,crossReferencesComplete:1,conclusionSupported:1,
    preparerConclusion:'Effective',reviewerDecision:'Approved',reviewerConclusion:'Effective',status:'Approved',reviewedAt:now});
  insert('ICOFRWorkpaperEvidenceIndex',{id:'index-'+id,institutionId:tenant,reviewId:review,
    reviewerDecision:'Accepted',reviewedAt:now});
  insert('EvidenceDocument',{id:'doc-'+id,institutionId:tenant,evidenceId:'EVD-'+id,status:'Active',currentVersionId:'version-'+id});
  insert('EvidenceVersion',{id:'version-'+id,documentId:'doc-'+id,institutionId:tenant,
    sizeBytes:bytes.length,sha256:hash,isCurrent:1});
  insert('EvidenceBinaryChunk',{id:'chunk-'+id,versionId:'version-'+id,chunkIndex:0,
    byteLength:bytes.length,dataBase64:bytes.toString('base64')});
  insert('EvidenceLink',{id:'link-'+id,institutionId:tenant,documentId:'doc-'+id,versionId:'version-'+id,
    entityType:'WORKPAPER_EVIDENCE',entityId:'index-'+id});
  insert('ICOFRTestGovernance',{institutionId:tenant,workpaperType:type,workpaperId:id,
    preparerUserId:'maker-id',preparerName:'Maker',reviewerUserId:'checker-id',reviewerName:'Checker',
    reviewerRole:'Reviewer',reviewId:review,approvedAt:now,approvedSnapshot:governance.testSnapshot(type,type==='ToD'?tod:toe)});
  insert('ICOFRTestEvidence',{institutionId:tenant,workpaperType:type,workpaperId:id,evidenceIndexId:'index-'+id,
    versionId:'version-'+id,sha256:hash,evidenceReviewedAt:now});
}
assert.equal(db.prepare('SELECT COUNT(*) n FROM ICOFRPublishedMappingV1').get().n,0,'unpublished mappings cannot qualify');
insert('BusinessProcess',{id:'process',institutionId:tenant});
insert('RiskMaster',{id:'risk',institutionId:tenant,processId:'process'});
insert('ControlRiskMapping',{id:'risk-control',controlId:'control',riskId:'risk'});
insert('ICOFRControlDomain',{id:'domain',institutionId:tenant,category:'PLC',status:'Approved',sourceControlId:'control',keyControl:1});
insert('ICOFRFinancialItem',{id:'account',institutionId:tenant,significant:1,status:'Active'});
insert('ICOFRAssertion',{id:'assertion',institutionId:tenant,financialItemId:'account',assertion:'Completeness',inScope:1});
insert('ICOFRTraceabilityLink',{id:'assertion-risk',institutionId:tenant,sourceType:'ASSERTION',sourceId:'assertion',targetType:'RISK',targetId:'risk',relationship:'ASSERTION_ADDRESSES_RISK'});
insert('ICOFRTraceabilityLink',{id:'risk-domain',institutionId:tenant,sourceType:'RISK',sourceId:'risk',targetType:'ICOFR_CONTROL',targetId:'domain',relationship:'RISK_MITIGATED_BY_CONTROL'});
insert('SourceDocument',{id:'source',institutionId:tenant,rawSha256:hash});
insert('SourceStructuredRecord',{id:'record',institutionId:tenant,sourceDocumentId:'source',recordKey:'ACCOUNT:BS:01',recordType:'ICOFR_SIGNIFICANT_ACCOUNT',status:'ACTIVE'});
insert('ICOFRScope',{id:'scope',institutionId:tenant});
insert('ICOFRScopeItem',{id:'scope-account',scopeId:'scope',itemType:'Financial Account',sourceId:'account'});
insert('ICOFRScopeItem',{id:'scope-process',scopeId:'scope',itemType:'Business Process',sourceId:'process'});
insert('ICOFRScopeLink',{id:'scope-link',scopeId:'scope',fromItemId:'scope-account',toItemId:'scope-process',relationType:'FSLI_TO_PROCESS'});
insert('ICOFRMappingProposal',{id:'mapping',institutionId:tenant,financialItemId:'account',assertion:'Completeness',riskId:'risk',
  controlMasterId:'control',controlDomainId:'domain',sourceDocumentId:'source',sourceRecordKey:'ACCOUNT:BS:01',sourceHash:hash,
  status:'PUBLISHED',createdBy:'creator',ownerReviewedBy:'owner',icofrReviewedBy:'coordinator',approvedBy:'approver'});
assert.equal(db.prepare('SELECT COUNT(*) n FROM ICOFRPublishedMappingV1').get().n,1);
for(const sql of ["UPDATE ICOFRMappingProposal SET status='APPROVED'","UPDATE ICOFRMappingProposal SET approvedBy=createdBy",
  "UPDATE ICOFRControlDomain SET category='ITGC'","UPDATE ICOFRControlDomain SET status='Draft'",
  "UPDATE SourceDocument SET rawSha256='changed'","DELETE FROM ICOFRScopeLink","DELETE FROM ControlRiskMapping"]){
  db.exec('SAVEPOINT mapping_gate');db.exec(sql);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ICOFRPublishedMappingV1').get().n,0,sql);
  db.exec('ROLLBACK TO mapping_gate; RELEASE mapping_gate');
}
const eligible=type=>db.prepare('SELECT COUNT(*) n FROM ICOFRApproved'+type+'V1').get().n;
assert.equal(eligible('ToD'),1,'independent, evidenced ToD eligible');
assert.equal(eligible('ToE'),1,'independent, evidenced ToE eligible');
let scenarios=10;
function denied(type,sql){db.exec('SAVEPOINT negative');db.exec(sql);assert.equal(eligible(type),0,sql);db.exec('ROLLBACK TO negative; RELEASE negative');scenarios++;}
denied('ToD',"UPDATE ICOFRDesignAssessment SET status='Draft'");
denied('ToD',"UPDATE ICOFRTestGovernance SET reviewerUserId=preparerUserId");
denied('ToD',"UPDATE ICOFRTestGovernance SET reviewerRole='SystemAdmin'");
denied('ToD',"UPDATE ICOFRDesignAssessment SET period='FY2025'");
denied('ToD',"UPDATE ICOFRDesignAssessment SET objectiveAlignment=0");
denied('ToD',"UPDATE ICOFRWorkpaperEvidenceIndex SET reviewerDecision='Rejected'");
denied('ToD',"DELETE FROM EvidenceLink");
denied('ToD',"DELETE FROM EvidenceBinaryChunk");
denied('ToD',"UPDATE EvidenceVersion SET sizeBytes=sizeBytes+1");
denied('ToD',"UPDATE EvidenceVersion SET sha256='ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'");
denied('ToD',"UPDATE EvidenceDocument SET status='Archived'");
denied('ToD',"UPDATE EvidenceDocument SET currentVersionId='different-version'");
denied('ToD',"UPDATE ICOFRWorkpaperReview SET status='Under Review'");
denied('ToD',"UPDATE ICOFRWorkpaperReview SET evidenceIndexed=0");
denied('ToD',"UPDATE ICOFRTestGovernance SET approvedSnapshot=NULL");
denied('ToD',"INSERT INTO ICOFRWorkpaperEvidenceIndex SELECT 'extra',institutionId,reviewId,'extra','PDF','new',NULL,'Maker','Pending',NULL,NULL,NULL,createdAt,updatedAt FROM ICOFRWorkpaperEvidenceIndex WHERE id='index-tod'");
denied('ToE',"UPDATE TestSample SET transactionRef='changed-after-review'");
denied('ToE',"UPDATE TestSample SET result='Not Tested'");
denied('ToE',"UPDATE TestSample SET evidenceRef=NULL");
denied('ToE',"DELETE FROM TestSample");
denied('ToE',"UPDATE TestSample SET result='Fail'");
// Even a signed ToE for a different period cannot close this ToD chain.
db.exec('SAVEPOINT wrong_period');
const altered={...toe,period:'FY2025'};
db.prepare("UPDATE ToETest SET period=?").run(altered.period);
db.prepare("UPDATE ICOFRWorkpaperReview SET period=? WHERE workpaperType='ToE'").run(altered.period);
db.prepare("UPDATE ICOFRTestGovernance SET approvedSnapshot=? WHERE workpaperType='ToE'").run(governance.testSnapshot('ToE',altered));
assert.equal(eligible('ToE'),1);
assert.equal(db.prepare('SELECT COUNT(*) n FROM ICOFRApprovedToDV1 d JOIN ICOFRApprovedToEV1 e ON e.period=d.period').get().n,0);
db.exec('ROLLBACK TO wrong_period; RELEASE wrong_period');scenarios++;

const dbAdapter={prepare(sql){const statement=db.prepare(sql);
  const bound=args=>({async first(){return statement.get(...args)||null},
    async all(){return{results:statement.all(...args)}},
    async run(){ return {meta:{changes:Number(statement.run(...args).changes)}}; }
  });
  return{...bound([]),bind(...args){return bound(args)}};
}};
const maker={id:'maker-id',institutionId:tenant,name:'Maker',email:'maker@example.invalid',role:'ICOFRCoordinator'};
const checker={...maker,id:'checker-id',name:'Checker',role:'Reviewer'};
async function main(){
  await assert.rejects(()=>governance.assertIndependentReviewer(dbAdapter,tenant,'ToD','tod',{...maker,role:'Reviewer'}),/TOD_SEGREGATION_REQUIRED/);
  await assert.rejects(()=>governance.assertIndependentReviewer(dbAdapter,tenant,'ToD','tod',{...checker,institutionId:'tenant-b'}),/TEST_REVIEWER_REQUIRED/);
  await assert.rejects(()=>governance.bindTestPreparer(dbAdapter,tenant,'ToD','unassigned',maker,'Someone else'),/TEST_PREPARER_REQUIRED/);
  for(const value of [['Approved'],{toString:'Approved'},1,true,null]){
    assert.throws(()=>governance.validateTodInput({status:value}),/TOD_INVALID_FIELD_TYPE/);
  }
  assert.throws(()=>governance.validateTodInput({status:'Unknown'}),/TOD_INVALID_STATUS/);
  assert.throws(()=>governance.validateTodInput({conclusion:['Effective']}),/TOD_INVALID_FIELD_TYPE/);
  assert.throws(()=>governance.assertDesignConclusion({...tod,precisionAdequate:0},'Effective'),/TOD_EFFECTIVENESS_CRITERIA_REQUIRED/);
  let profile=maker,calls=0,actor;
  const route=load('src/app/api/icofr/traceability/route.ts',{
    'next/server':{NextResponse:{json:(v,o={})=>new Response(JSON.stringify(v),{status:o.status||200,headers:o.headers})}},
    '@/lib/institution-context':{resolveInstitutionAccess:async()=>profile?{institution:{id:tenant},profile}:null},
    '@/lib/icofr-test-governance':governance,
    '@/lib/d1-icofr-traceability':{getTraceabilityData:async()=>({}),saveDesignAssessment:async(input,who)=>{
      if(input.status==='Approved')throw new Error('TOD_WORKPAPER_REVIEW_REQUIRED');calls++;actor=who;return {testerName:who.name};}}
  });
  async function post(body,expected,origin='https://fixture.invalid'){
    const response=await route.POST(new Request('https://fixture.invalid/api/icofr/traceability',{
      method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
    assert.equal(response.status,expected,JSON.stringify(body));scenarios++;return response;
  }
  await post({actionType:'SAVE_TOD',status:['Approved']},400);
  await post({actionType:'SAVE_TOD',notes:'x'.repeat(33000)},413);
  await post(null,400);
  await post({actionType:'SAVE_TOD',status:'Approved'},403);
  profile=checker;await post({actionType:'SAVE_TOD',status:'Approved'},409);
  await post({actionType:'SAVE_CHAIN'},409);
  await post({actionType:'REMOVE_CHAIN'},409);
  await post({actionType:'SAVE_TOD',status:'Draft'},403,'https://other.invalid');
  profile={...maker,role:'ReadOnlyAuditor'};await post({actionType:'SAVE_TOD',status:'Draft'},403);
  profile=null;await post({actionType:'SAVE_TOD',status:'Draft'},403);
  assert.equal(calls,0,'denied approvals never reach persistence');
  profile=maker;const result=await post({actionType:'SAVE_TOD',status:'Draft',testerName:'forged'},201);
  assert.equal((await result.json()).testerName,'Maker');assert.equal(actor.id,maker.id);
  // Execute the real approval service against SQLite, including CAS writes and hash verification.
  db.prepare("UPDATE ICOFRTestGovernance SET approvedSnapshot=NULL,reviewId=NULL WHERE workpaperType='ToD'").run();
  db.prepare("UPDATE ICOFRWorkpaperReview SET status='Under Review' WHERE workpaperType='ToD'").run();
  db.prepare("UPDATE ICOFRDesignAssessment SET status='Under Review'").run();
  const noop=async()=>{};
  const workpaper=load('src/lib/d1-icofr-workpaper-review.ts',{
    '@/lib/icofr-test-governance':governance,
    '@/lib/institution-context':{resolveServerActiveInstitutionId:async()=>tenant},
    '@opennextjs/cloudflare':{getCloudflareContext:async()=>({env:{DB:dbAdapter}})},
    '@/lib/d1-core':{ensureCoreDomainSchema:noop},
    '@/lib/d1-icofr-testing-plan':{ensureIcofrTestingPlanSchema:noop},
    '@/lib/d1-icofr-traceability':{ensureIcofrTraceabilitySchema:noop},
    '@/lib/d1-assurance':{ensureAssuranceSchema:noop},
    '@/lib/d1-icofr-period-lock':{assertIcofrPeriodWritable:noop},
    '@/lib/d1-evidence-repository':{ensureEvidenceRepositorySchema:noop,loadEvidenceVersionBytes:async()=>({bytes:new Uint8Array(bytes)})}
  });
  await assert.rejects(()=>workpaper.decideWorkpaperReview({reviewId:'review-tod',reviewerName:'forged',
    decision:'Approve',reviewerConclusion:'Effective',reviewerComments:'Independent review with actual source evidence verified.'},
    {...maker,role:'Reviewer'}),/TOD_SEGREGATION_REQUIRED/);
  await workpaper.decideWorkpaperReview({reviewId:'review-tod',reviewerName:'forged',
    decision:'Approve',reviewerConclusion:'Effective',reviewerComments:'Independent review with actual source evidence verified.'},checker);
  assert.equal(eligible('ToD'),1,'real approval service signs only the reviewed snapshot');
  const signed=db.prepare("SELECT * FROM ICOFRTestGovernance WHERE workpaperType='ToD'").get();
  assert.equal(signed.reviewerUserId,'checker-id');assert.equal(signed.reviewerName,'Checker');
  scenarios+=2;
  db.prepare("UPDATE ICOFRTestGovernance SET approvedSnapshot=NULL,reviewId=NULL WHERE workpaperType='ToE'").run();
  db.prepare("UPDATE ICOFRWorkpaperReview SET status='Under Review' WHERE workpaperType='ToE'").run();
  db.prepare("UPDATE ToETest SET status='Under Review'").run();
  await workpaper.decideWorkpaperReview({reviewId:'review-toe',decision:'Approve',reviewerConclusion:'Effective',
    reviewerComments:'Population, actual samples, source evidence and exceptions reviewed.'},checker);
  assert.equal(eligible('ToE'),1,'real ToE approval signs actual samples and evidence');scenarios++;
  const integritySource=fs.readFileSync('src/lib/d1-icofr-integrity.ts','utf8');
  const required=[...integritySource.split('const INTEGRITY_REQUIRED_TABLES = [')[1].split('] as const')[0].matchAll(/'([^']+)'/g)].map(m=>m[1]);
  for(const table of required) if(!db.prepare('SELECT name FROM sqlite_master WHERE name=?').get(table)){
    assert.ok(definitions.has(table),'integrity fixture schema '+table);db.exec(definitions.get(table));
  }
  dbAdapter.batch=async statements=>Promise.all(statements.map(statement=>statement.all()));
  const integrity=load('src/lib/d1-icofr-integrity.ts',{
    '@opennextjs/cloudflare':{getCloudflareContext:async()=>({env:{DB:dbAdapter}})}
  });
  const complete=await integrity.getIcofrReferentialIntegrityReport();
  assert.equal(complete.metrics.inScopeAssertions,1);
  assert.equal(complete.ok,true,JSON.stringify(complete.checks.filter(v=>v.count)));
  db.exec("SAVEPOINT draft_test; UPDATE ICOFRDesignAssessment SET status='Draft'");
  const draft=await integrity.getIcofrReferentialIntegrityReport();
  assert.equal(draft.ok,false);assert.equal(draft.metrics.controlsWithToD,0);
  assert.equal(draft.metrics.completeChains,0);
  db.exec('ROLLBACK TO draft_test; RELEASE draft_test');
  scenarios++;
  assert.equal(complete.metrics.completeChains,1,'current published PLC with signed same-period tests closes a chain');
  db.prepare("UPDATE ICOFRMappingProposal SET status='APPROVED'").run();
  const incomplete=await integrity.getIcofrReferentialIntegrityReport();
  assert.equal(incomplete.ok,false);
  assert.equal(incomplete.completenessChecks.find(v=>v.code==='ASSERTION_APPROVED_PLC_MAPPING_MISSING').count,1);
  assert.equal(incomplete.metrics.completeChains,0);
  scenarios+=2;
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'totalarc-governance-'));
  try {
    const sqlPath=path.join(temporary,'schema.sql');
    cp.execFileSync(process.execPath,['scripts/prepare-icofr-test-governance-schema.cjs',sqlPath],{stdio:'pipe'});
    const sql=fs.readFileSync(sqlPath,'utf8');
    const before=db.prepare('SELECT COUNT(*) n FROM ICOFRTestGovernance').get().n;
    db.exec(sql);db.exec(sql);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM ICOFRTestGovernance').get().n,before,
      'deployment schema is additive, repeatable and never approves legacy data');
    scenarios++;
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
  console.log('PASS ICOFR test approval: '+scenarios+' SQL/route cases; authenticated IDs, evidence, snapshots and period gates');
}
main().catch(e=>{console.error(e);process.exitCode=1});
