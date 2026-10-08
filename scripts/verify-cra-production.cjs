/**
 * Production CRA gate. Uses pinned Cloudflare D1 and additive-only schema assurance.
 * Never updates or deletes existing bank assessments.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const name=String(process.env.TOTALARC_D1_DATABASE_NAME||'').trim();
const id=String(process.env.TOTALARC_D1_DATABASE_ID||'').trim();
const site=String(process.env.TOTALARC_PRODUCTION_URL||'https://totalarc.elang-haqeem.workers.dev').replace(/\/+$/,'');
if(!name||!id||!/^https:\/\//.test(site))throw Error('CRA_PRODUCTION_CONFIG_REQUIRED');
const config=JSON.parse(fs.readFileSync('wrangler.production.json','utf8'));
const binding=(config.d1_databases||[]).filter(x=>x.binding==='DB');
assert.equal(binding.length,1,'DB binding must be unambiguous');
assert.equal(binding[0].database_id,id,'Refusing to use an unpinned D1 database');
assert.equal(binding[0].database_name,name,'D1 name differs from production binding');
function query(sql){
 const raw=execFileSync('npx',['wrangler','d1','execute',name,'--remote','--json','--command',sql],
  {encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024,env:process.env});
 const response=JSON.parse(raw);
 assert.ok(Array.isArray(response)&&response.length,'Unexpected D1 CLI response');
 assert.ok(response.every(x=>x.success!==false),'D1 returned an execution failure');
 return response.flatMap(x=>Array.isArray(x.results)?x.results:[]);
}
const identity=query("SELECT id FROM Institution WHERE legalName = 'PT. Bank Pembangunan Daerah Kalimantan Barat' LIMIT 1");
assert.equal(identity.length,1,'Unexpected D1: missing expected Bank Kalbar identity');
const ddl=[
  `CREATE TABLE IF NOT EXISTS ComplianceRiskAssessment (
    id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, obligationId TEXT NOT NULL,
    reassessmentOfId TEXT, processId TEXT, riskId TEXT, controlId TEXT, ownerUnitId TEXT NOT NULL,
    productName TEXT, period TEXT NOT NULL,
    inherentLikelihood INTEGER NOT NULL, inherentImpact INTEGER NOT NULL,
    residualLikelihood INTEGER NOT NULL, residualImpact INTEGER NOT NULL,
    inherentScore INTEGER NOT NULL, residualScore INTEGER NOT NULL,
    threatDescription TEXT NOT NULL, existingControls TEXT NOT NULL,
    rationale TEXT NOT NULL, mitigationPlan TEXT, nextReviewDate TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT', preparedById TEXT NOT NULL,
    reviewerId TEXT, reviewNote TEXT, reviewedAt TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ComplianceRiskEvent (
    id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, assessmentId TEXT NOT NULL,
    actorId TEXT NOT NULL, actorRole TEXT NOT NULL, action TEXT NOT NULL,
    comment TEXT, createdAt TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cra_tenant_period ON ComplianceRiskAssessment(institutionId,period,status)',
  'CREATE INDEX IF NOT EXISTS idx_cra_obligation ON ComplianceRiskAssessment(institutionId,obligationId,updatedAt)',
  'CREATE INDEX IF NOT EXISTS idx_cra_review ON ComplianceRiskAssessment(institutionId,status,nextReviewDate)',
  'CREATE INDEX IF NOT EXISTS idx_cra_event ON ComplianceRiskEvent(institutionId,assessmentId,createdAt)'
];
for(const sql of ddl)query(sql);
let columns=query('PRAGMA table_info(ComplianceRiskAssessment)');
if(!columns.some(x=>x.name==='reassessmentOfId')){
 query('ALTER TABLE ComplianceRiskAssessment ADD COLUMN reassessmentOfId TEXT');
 columns=query('PRAGMA table_info(ComplianceRiskAssessment)');
}
assert.ok(columns.some(x=>x.name==='reassessmentOfId'),'Missing reassessment lineage column');
query('CREATE UNIQUE INDEX IF NOT EXISTS idx_cra_reassessment_lineage ON ComplianceRiskAssessment(institutionId,reassessmentOfId)');
const idx=query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ComplianceRiskAssessment'");
for(const key of ['idx_cra_tenant_period','idx_cra_obligation','idx_cra_review','idx_cra_reassessment_lineage'])
 assert.ok(idx.some(x=>x.name===key),'Missing CRA query index '+key);
const orphan=query(`SELECT a.id FROM ComplianceRiskAssessment a
 LEFT JOIN ComplianceRiskAssessment parent
 ON parent.id=a.reassessmentOfId AND parent.institutionId=a.institutionId
 WHERE a.reassessmentOfId IS NOT NULL AND
 (parent.id IS NULL OR parent.obligationId!=a.obligationId OR parent.status!='APPROVED')
 LIMIT 1`);
assert.equal(orphan.length,0,'CRA_REASSESSMENT_TRACEABILITY_FAILED');
const dups=query(`SELECT reassessmentOfId FROM ComplianceRiskAssessment
 WHERE reassessmentOfId IS NOT NULL GROUP BY institutionId,reassessmentOfId
 HAVING COUNT(*)>1 LIMIT 1`);
assert.equal(dups.length,0,'CRA_DUPLICATE_LINEAGE');
console.log('PASS CRA D1 production schema, tenant indexes, append-only event table, lineage integrity.');
async function boundary(method){
 const response=await fetch(site+'/api/compliance/risk-assessment',{
  method,redirect:'manual',headers:method==='POST'?{'content-type':'application/json'}:undefined,
  body:method==='POST'?'{}':undefined,signal:AbortSignal.timeout(18000)
 });
 const location=response.headers.get('location')||'';
 const loginRedirect=[302,303,307,308].includes(response.status)&&
  (/^\/login(?:[/?]|$)/.test(location)||location.startsWith(site+'/login'));
 assert.ok([401,403].includes(response.status)||loginRedirect,
  method+' CRA API may be exposing protected data without a session (HTTP '+response.status+')');
 console.log('PASS CRA '+method+' unauthenticated boundary HTTP '+response.status);
}
(async()=>{await boundary('GET');await boundary('POST');console.log('PASS CRA_PRODUCTION_READINESS');})()
 .catch(err=>{console.error('FAIL CRA_PRODUCTION_READINESS: '+err.message);process.exitCode=1;});
