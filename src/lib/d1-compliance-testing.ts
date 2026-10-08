import { ensureComplianceRiskSchema, type ComplianceActor } from '@/lib/d1-compliance-risk-assessment';
import { ensureIcofrWorkpaperReviewSchema } from '@/lib/d1-icofr-workpaper-review';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';

type DB=Awaited<ReturnType<typeof ensureComplianceRiskSchema>>;
export const COMPLIANCE_TEST_READ = new Set([
  'SystemAdmin','Admin','ComplianceOfficer','RiskManager','InternalAuditor',
  'Tester','Reviewer','Executive','ReadOnlyAuditor'
]);
export const COMPLIANCE_TEST_WRITE = new Set([
  'SystemAdmin','Admin','ComplianceOfficer','InternalAuditor','Tester'
]);
export const COMPLIANCE_TEST_REVIEW = new Set([
  'SystemAdmin','Admin','ComplianceOfficer','InternalAuditor','Reviewer'
]);
export type WorkprogramInput={
  code:string;obligationId:string;controlId:string;riskAssessmentId?:string|null;
  monitoringActivityId?:string|null;icofrReviewId?:string|null;
  testType:'TOD'|'TOE'; period:string; objective:string; procedures:string;
  populationDescription:string; populationSize:number; sampleSize:number;
  samplingMethod:string; targetDate:string;
};
type Workpaper=WorkprogramInput&{
  id:string;institutionId:string;status:string;conclusion:string;
  preparedById:string;reviewerId:string|null;reviewNote:string|null;
  reviewedAt:string|null;sourceTestId:string|null;createdAt:string;updatedAt:string;
};
const required=(v:unknown,max=1600)=>{
  const s=String(v??'').trim();
  if(!s||s.length>max)throw new Error('CT_INVALID_INPUT');
  return s;
};
const optional=(v:unknown,max=1600)=>{
  const s=String(v??'').trim();
  if(s.length>max)throw new Error('CT_INVALID_INPUT');
  return s||null;
};
const date=(v:unknown)=>{
  const s=required(v,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      !Number.isFinite(Date.parse(s+'T00:00:00Z')) ||
      new Date(s+'T00:00:00Z').toISOString().slice(0,10)!==s)throw new Error('CT_INVALID_DATE');
  return s;
};
const nint=(v:unknown)=>{
  const n=Number(v);
  if(!Number.isSafeInteger(n)||n<0||n>1000000000)throw new Error('CT_INVALID_SAMPLE');
  return n;
};
const now=()=>new Date().toISOString();
let ready:Promise<DB>|null=null;
export function ensureComplianceTestingSchema():Promise<DB>{
  if(ready)return ready;
  ready=(async()=>{
    const db=await ensureComplianceRiskSchema();
    for(const sql of [
      `CREATE TABLE IF NOT EXISTS ComplianceTestWorkpaper (
        id TEXT PRIMARY KEY,institutionId TEXT NOT NULL,code TEXT NOT NULL,
        obligationId TEXT NOT NULL,controlId TEXT NOT NULL,riskAssessmentId TEXT,
        monitoringActivityId TEXT,icofrReviewId TEXT,sourceTestId TEXT,
        testType TEXT NOT NULL,period TEXT NOT NULL,objective TEXT NOT NULL,
        procedures TEXT NOT NULL,populationDescription TEXT NOT NULL,
        populationSize INTEGER NOT NULL,sampleSize INTEGER NOT NULL,
        samplingMethod TEXT NOT NULL,targetDate TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT', conclusion TEXT NOT NULL DEFAULT 'NOT_ASSESSED',
        preparedById TEXT NOT NULL,reviewerId TEXT,reviewNote TEXT,reviewedAt TEXT,
        createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL
      )`,
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_ct_code ON ComplianceTestWorkpaper(institutionId,code)',
      'CREATE INDEX IF NOT EXISTS idx_ct_status ON ComplianceTestWorkpaper(institutionId,status,period)',
      'CREATE INDEX IF NOT EXISTS idx_ct_obligation ON ComplianceTestWorkpaper(institutionId,obligationId,controlId)',
      `CREATE TABLE IF NOT EXISTS ComplianceTestSample (
        id TEXT PRIMARY KEY,institutionId TEXT NOT NULL,workpaperId TEXT NOT NULL,
        reference TEXT NOT NULL,result TEXT NOT NULL DEFAULT 'NOT_TESTED',
        exceptionNote TEXT,createdAt TEXT NOT NULL
      )`,
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_ct_sample_ref ON ComplianceTestSample(institutionId,workpaperId,reference)',
      `CREATE TABLE IF NOT EXISTS ComplianceTestEvidence (
        id TEXT PRIMARY KEY,institutionId TEXT NOT NULL,workpaperId TEXT NOT NULL,
        documentId TEXT NOT NULL,versionId TEXT NOT NULL,description TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )`,
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_ct_evidence ON ComplianceTestEvidence(institutionId,workpaperId,documentId,versionId)',
      `CREATE TABLE IF NOT EXISTS ComplianceTestFinding (
        id TEXT PRIMARY KEY,institutionId TEXT NOT NULL,workpaperId TEXT NOT NULL,
        title TEXT NOT NULL,description TEXT NOT NULL,severity TEXT NOT NULL,
        ownerUnitId TEXT NOT NULL,dueDate TEXT NOT NULL,mapId TEXT,
        createdAt TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_ct_finding ON ComplianceTestFinding(institutionId,workpaperId,dueDate)',
      `CREATE TABLE IF NOT EXISTS ComplianceTestEvent (
        id TEXT PRIMARY KEY,institutionId TEXT NOT NULL,workpaperId TEXT NOT NULL,
        actorId TEXT NOT NULL,actorRole TEXT NOT NULL,action TEXT NOT NULL,
        comment TEXT,createdAt TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_ct_event ON ComplianceTestEvent(institutionId,workpaperId,createdAt)'
    ])await db.prepare(sql).run();
    return db;
  })().catch(err=>{ready=null;throw err});
  return ready;
}
async function event(db:DB,tenant:string,id:string,actor:ComplianceActor,action:string,detail:string|null=null){
  await db.prepare(`INSERT INTO ComplianceTestEvent(id,institutionId,workpaperId,
    actorId,actorRole,action,comment,createdAt) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(),tenant,id,actor.id,actor.role,action,detail,now()).run();
}
async function get(db:DB,tenant:string,id:string){
  return db.prepare(`SELECT id,institutionId,code,obligationId,controlId,riskAssessmentId,
    monitoringActivityId,icofrReviewId,sourceTestId,testType,period,objective,procedures,
    populationDescription,populationSize,sampleSize,samplingMethod,targetDate,status,
    conclusion,preparedById,reviewerId,reviewNote,reviewedAt,createdAt,updatedAt
    FROM ComplianceTestWorkpaper WHERE institutionId=? AND id=? LIMIT 1`)
    .bind(tenant,id).first<Workpaper>();
}
async function requireWorkpaper(db:DB,tenant:string,id:string){
  const w=await get(db,tenant,required(id,100));
  if(!w)throw new Error('CT_NOT_FOUND');
  return w;
}
async function validateScope(db:DB,tenant:string,input:WorkprogramInput){
  const code=required(input.code,45).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_-]{2,44}$/.test(code))throw new Error('CT_INVALID_INPUT');
  const obligationId=required(input.obligationId,100);
  const controlId=required(input.controlId,100);
  const obligation=await db.prepare(`SELECT id FROM RegulatoryObligation
    WHERE institutionId=? AND id=? AND status='Active' AND complianceStatus!='NOT_APPLICABLE' LIMIT 1`)
    .bind(tenant,obligationId).first<{id:string}>();
  if(!obligation)throw new Error('CT_OBLIGATION_NOT_FOUND');
  const control=await db.prepare(`SELECT l.id FROM RegulatoryObligationLink l
    JOIN ControlMaster c ON c.id=l.targetId AND c.institutionId=l.institutionId
    WHERE l.institutionId=? AND l.obligationId=? AND l.targetType='CONTROL'
      AND l.targetId=? LIMIT 1`).bind(tenant,obligationId,controlId).first<{id:string}>();
  if(!control)throw new Error('CT_CONTROL_NOT_MAPPED');
  const assessment=optional(input.riskAssessmentId,100);
  if(assessment){
    const risk=await db.prepare(`SELECT id FROM ComplianceRiskAssessment
      WHERE institutionId=? AND id=? AND obligationId=? AND status='APPROVED' LIMIT 1`)
      .bind(tenant,assessment,obligationId).first<{id:string}>();
    if(!risk)throw new Error('CT_RISK_NOT_APPROVED');
  }
  const activity=optional(input.monitoringActivityId,100);
  if(activity){
    const monitored=await db.prepare(`SELECT a.id FROM ComplianceMonitoringActivity a
      JOIN ComplianceMonitoringPlan p ON p.id=a.planId AND p.institutionId=a.institutionId
      WHERE a.institutionId=? AND a.id=? AND a.obligationId=? AND a.status!='CANCELLED'
        AND p.status IN ('APPROVED','IN_PROGRESS','COMPLETED') LIMIT 1`)
      .bind(tenant,activity,obligationId).first<{id:string}>();
    if(!monitored)throw new Error('CT_MONITORING_NOT_APPROVED');
  }
  const icofrReviewId=optional(input.icofrReviewId,100);
  const testType=required(input.testType,3);
  if(!['TOD','TOE'].includes(testType))throw new Error('CT_INVALID_INPUT');
  if(icofrReviewId){
    await ensureIcofrWorkpaperReviewSchema();
    const linked=await db.prepare(`SELECT id FROM ICOFRWorkpaperReview
      WHERE institutionId=? AND id=? AND workpaperType=? LIMIT 1`)
      .bind(tenant,icofrReviewId,testType==='TOD'?'ToD':'ToE').first<{id:string}>();
    if(!linked)throw new Error('CT_ICOFR_NOT_FOUND');
  }
  const populationSize=nint(input.populationSize),sampleSize=nint(input.sampleSize);
  if(sampleSize>populationSize || (testType==='TOE' && (sampleSize===0||populationSize===0)))
    throw new Error('CT_INVALID_SAMPLE');
  return {
    code,obligationId,controlId,riskAssessmentId:assessment,monitoringActivityId:activity,
    icofrReviewId,testType,period:required(input.period,40),
    objective:required(input.objective,2000),procedures:required(input.procedures,4000),
    populationDescription:required(input.populationDescription,1600),
    populationSize,sampleSize,samplingMethod:required(input.samplingMethod,180),
    targetDate:date(input.targetDate)
  };
}
export async function testingOptions(tenant:string){
  const db=await ensureComplianceTestingSchema();
  const [obligations,links,controls,risks,activities,units,evidence]=await Promise.all([
    db.prepare(`SELECT id,obligationCode,requirementText FROM RegulatoryObligation
      WHERE institutionId=? AND status='Active' AND complianceStatus!='NOT_APPLICABLE'
      ORDER BY obligationCode LIMIT 500`).bind(tenant).all(),
    db.prepare(`SELECT obligationId,targetId FROM RegulatoryObligationLink
      WHERE institutionId=? AND targetType='CONTROL' LIMIT 3000`).bind(tenant).all(),
    db.prepare('SELECT id,controlId,name FROM ControlMaster WHERE institutionId=? ORDER BY controlId LIMIT 500').bind(tenant).all(),
    db.prepare(`SELECT id,obligationId,period,residualScore FROM ComplianceRiskAssessment
      WHERE institutionId=? AND status='APPROVED' ORDER BY updatedAt DESC LIMIT 300`).bind(tenant).all(),
    db.prepare(`SELECT a.id,a.obligationId,a.description
      FROM ComplianceMonitoringActivity a JOIN ComplianceMonitoringPlan p
      ON p.id=a.planId AND p.institutionId=a.institutionId
      WHERE a.institutionId=? AND p.status IN ('APPROVED','IN_PROGRESS','COMPLETED')
      AND a.status!='CANCELLED' ORDER BY a.scheduledDate DESC LIMIT 300`).bind(tenant).all(),
    db.prepare(`SELECT id,code,name FROM OrganizationUnit
      WHERE institutionId=? AND status='Active' ORDER BY code LIMIT 300`).bind(tenant).all(),
    db.prepare(`SELECT d.id,d.evidenceId,d.title,d.currentVersionId FROM EvidenceDocument d
      WHERE d.institutionId=? AND d.status='Active' AND d.currentVersionId IS NOT NULL
      ORDER BY d.updatedAt DESC LIMIT 300`).bind(tenant).all()
  ]);
  return {obligations:obligations.results||[],links:links.results||[],
    controls:controls.results||[],risks:risks.results||[],activities:activities.results||[],
    units:units.results||[],evidence:evidence.results||[],referenceLimit:500};
}
export async function listTests(tenant:string,page:number){
  const db=await ensureComplianceTestingSchema();const p=Math.max(1,Math.min(100,Math.floor(page)||1));
  const [rows,count]=await Promise.all([
    db.prepare(`SELECT w.id,w.code,w.testType,w.period,w.obligationId,o.obligationCode,
      w.controlId,c.controlId AS controlCode,w.status,w.conclusion,w.targetDate,
      w.preparedById,w.updatedAt,
      (SELECT COUNT(*) FROM ComplianceTestSample s WHERE s.institutionId=w.institutionId AND s.workpaperId=w.id) AS samples,
      (SELECT COUNT(*) FROM ComplianceTestEvidence e WHERE e.institutionId=w.institutionId AND e.workpaperId=w.id) AS evidences
      FROM ComplianceTestWorkpaper w
      JOIN RegulatoryObligation o ON o.institutionId=w.institutionId AND o.id=w.obligationId
      JOIN ControlMaster c ON c.institutionId=w.institutionId AND c.id=w.controlId
      WHERE w.institutionId=? ORDER BY w.updatedAt DESC LIMIT 25 OFFSET ?`).bind(tenant,(p-1)*25).all(),
    db.prepare('SELECT COUNT(*) AS n FROM ComplianceTestWorkpaper WHERE institutionId=?').bind(tenant).first<{n:number}>()
  ]);
  return {items:rows.results||[],total:count?.n||0,page:p,pageSize:25};
}
export async function testingDetail(tenant:string,id:string){
  const db=await ensureComplianceTestingSchema();const record=await requireWorkpaper(db,tenant,id);
  const [samples,evidences,findings,history]=await Promise.all([
    db.prepare(`SELECT id,reference,result,exceptionNote,createdAt FROM ComplianceTestSample
      WHERE institutionId=? AND workpaperId=? ORDER BY createdAt LIMIT 500`).bind(tenant,id).all(),
    db.prepare(`SELECT e.id,e.documentId,e.versionId,e.description,d.evidenceId,d.title
      FROM ComplianceTestEvidence e JOIN EvidenceDocument d ON d.id=e.documentId
      AND d.institutionId=e.institutionId
      WHERE e.institutionId=? AND e.workpaperId=? ORDER BY e.createdAt LIMIT 100`).bind(tenant,id).all(),
    db.prepare(`SELECT id,title,description,severity,ownerUnitId,dueDate,mapId
      FROM ComplianceTestFinding WHERE institutionId=? AND workpaperId=? ORDER BY createdAt LIMIT 100`).bind(tenant,id).all(),
    db.prepare(`SELECT actorId,actorRole,action,comment,createdAt FROM ComplianceTestEvent
      WHERE institutionId=? AND workpaperId=? ORDER BY createdAt DESC LIMIT 80`).bind(tenant,id).all()
  ]);
  return {record,samples:samples.results||[],evidences:evidences.results||[],
    findings:findings.results||[],history:history.results||[]};
}
export async function createTest(tenant:string,input:WorkprogramInput,actor:ComplianceActor,sourceId?:string){
  const db=await ensureComplianceTestingSchema();const data=await validateScope(db,tenant,input);
  const origin=sourceId?await requireWorkpaper(db,tenant,sourceId):null;
  if(origin && (origin.status!=='APPROVED' || origin.obligationId!==data.obligationId ||
                origin.controlId!==data.controlId || origin.testType!==data.testType))
    throw new Error('CT_RETEST_INVALID');
  const id=crypto.randomUUID(),time=now();
  try{
    await db.prepare(`INSERT INTO ComplianceTestWorkpaper
      (id,institutionId,code,obligationId,controlId,riskAssessmentId,monitoringActivityId,
      icofrReviewId,sourceTestId,testType,period,objective,procedures,populationDescription,
      populationSize,sampleSize,samplingMethod,targetDate,status,conclusion,preparedById,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT','NOT_ASSESSED',?,?,?)`)
      .bind(id,tenant,data.code,data.obligationId,data.controlId,data.riskAssessmentId,
        data.monitoringActivityId,data.icofrReviewId,origin?.id||null,data.testType,data.period,
        data.objective,data.procedures,data.populationDescription,data.populationSize,
        data.sampleSize,data.samplingMethod,data.targetDate,actor.id,time,time).run();
  }catch(err){
    if(String(err).toLowerCase().includes('unique'))throw new Error('CT_DUPLICATE');
    throw err;
  }
  await event(db,tenant,id,actor,origin?'CREATE_RETEST':'CREATE',origin?.id||null);
  return get(db,tenant,id);
}
export async function addSample(tenant:string,id:string,actor:ComplianceActor,ref:string,result:string,exceptionNote:string){
  const db=await ensureComplianceTestingSchema(),w=await requireWorkpaper(db,tenant,id);
  if(w.status!=='DRAFT'||w.testType!=='TOE')throw new Error('CT_LOCKED');
  if(!['PASS','FAIL','NOT_TESTED'].includes(result))throw new Error('CT_INVALID_INPUT');
  if(result==='FAIL'&&!exceptionNote.trim())throw new Error('CT_EXCEPTION_REQUIRED');
  const count=await db.prepare(`SELECT COUNT(*) AS n FROM ComplianceTestSample
    WHERE institutionId=? AND workpaperId=?`).bind(tenant,id).first<{n:number}>();
  if(Number(count?.n)>=w.sampleSize)throw new Error('CT_SAMPLE_LIMIT');
  const sampleId=crypto.randomUUID();
  try{
    await db.prepare(`INSERT INTO ComplianceTestSample
      (id,institutionId,workpaperId,reference,result,exceptionNote,createdAt)
      VALUES(?,?,?,?,?,?,?)`)
      .bind(sampleId,tenant,id,required(ref,160),result,result==='FAIL'?required(exceptionNote,1500):null,now()).run();
  }catch(err){if(String(err).toLowerCase().includes('unique'))throw new Error('CT_DUPLICATE');throw err;}
  await event(db,tenant,id,actor,'SAMPLE_ADD',sampleId);
  return {id:sampleId};
}
export async function addEvidence(tenant:string,id:string,actor:ComplianceActor,documentId:string,description:string){
  const db=await ensureComplianceTestingSchema(),w=await requireWorkpaper(db,tenant,id);
  if(w.status!=='DRAFT')throw new Error('CT_LOCKED');
  const doc=await db.prepare(`SELECT id,currentVersionId FROM EvidenceDocument
    WHERE institutionId=? AND id=? AND status='Active' AND currentVersionId IS NOT NULL LIMIT 1`)
    .bind(tenant,required(documentId,100)).first<{id:string;currentVersionId:string}>();
  if(!doc)throw new Error('CT_EVIDENCE_NOT_FOUND');
  const version=await db.prepare('SELECT id FROM EvidenceVersion WHERE institutionId=? AND id=? AND documentId=? LIMIT 1')
    .bind(tenant,doc.currentVersionId,doc.id).first<{id:string}>();
  if(!version)throw new Error('CT_EVIDENCE_NOT_FOUND');
  const eid=crypto.randomUUID();
  try{
    await db.prepare(`INSERT INTO ComplianceTestEvidence
      (id,institutionId,workpaperId,documentId,versionId,description,createdAt)
      VALUES(?,?,?,?,?,?,?)`).bind(eid,tenant,id,doc.id,version.id,required(description,1500),now()).run();
  }catch(err){if(String(err).toLowerCase().includes('unique'))throw new Error('CT_DUPLICATE');throw err;}
  await event(db,tenant,id,actor,'EVIDENCE_ADD',eid);
  return {id:eid};
}
export async function addFinding(tenant:string,id:string,actor:ComplianceActor,input:{
  title:string;description:string;severity:string;ownerUnitId:string;dueDate:string;
}){
  const db=await ensureComplianceTestingSchema(),w=await requireWorkpaper(db,tenant,id);
  if(w.status!=='DRAFT')throw new Error('CT_LOCKED');
  if(!['CRITICAL','HIGH','MEDIUM','LOW'].includes(input.severity))throw new Error('CT_INVALID_INPUT');
  const unit=await db.prepare(`SELECT id FROM OrganizationUnit
    WHERE institutionId=? AND id=? AND status='Active' LIMIT 1`)
    .bind(tenant,required(input.ownerUnitId,100)).first<{id:string}>();
  if(!unit)throw new Error('CT_UNIT_NOT_FOUND');
  const fid=crypto.randomUUID();
  await db.prepare(`INSERT INTO ComplianceTestFinding
    (id,institutionId,workpaperId,title,description,severity,ownerUnitId,dueDate,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(fid,tenant,id,required(input.title,150),
    required(input.description,2000),input.severity,unit.id,date(input.dueDate),now()).run();
  await event(db,tenant,id,actor,'FINDING_ADD',fid);
  return {id:fid};
}
export async function linkFindingMap(tenant:string,workpaperId:string,findingId:string,mapId:string,actor:ComplianceActor){
  const db=await ensureComplianceTestingSchema(),w=await requireWorkpaper(db,tenant,workpaperId);
  if(!['DRAFT','SUBMITTED','APPROVED'].includes(w.status))throw new Error('CT_LOCKED');
  const found=await db.prepare('SELECT id FROM ComplianceTestFinding WHERE institutionId=? AND workpaperId=? AND id=? LIMIT 1')
    .bind(tenant,w.id,required(findingId,100)).first<{id:string}>();
  if(!found)throw new Error('CT_FINDING_NOT_FOUND');
  await ensureAssuranceSchema();
  const map=await db.prepare(`SELECT m.id FROM ManagementActionPlan m
    JOIN Issue i ON i.id=m.issueId AND i.institutionId=?
    WHERE m.id=? LIMIT 1`).bind(tenant,required(mapId,100)).first<{id:string}>();
  if(!map)throw new Error('CT_MAP_NOT_FOUND');
  const result=await db.prepare(`UPDATE ComplianceTestFinding SET mapId=?
    WHERE id=? AND institutionId=? AND workpaperId=? AND mapId IS NULL`)
    .bind(map.id,findingId,tenant,w.id).run() as {meta?:{changes?:number}};
  if(result.meta?.changes===0)throw new Error('CT_CONFLICT');
  await event(db,tenant,w.id,actor,'LINK_MAP',findingId);
  return {id:found.id,mapId:map.id};
}
export async function transitionTest(tenant:string,id:string,actor:ComplianceActor,
  action:string,decision:string,note:string){
  const db=await ensureComplianceTestingSchema(),w=await requireWorkpaper(db,tenant,id);
  let target='';
  if(action==='SUBMIT'){
    if(w.status!=='DRAFT')throw new Error('CT_LOCKED');
    if(w.preparedById!==actor.id&&!['Admin','SystemAdmin'].includes(actor.role))
      throw new Error('CT_OWNER_ONLY');
    const stats=await Promise.all([
      db.prepare(`SELECT COUNT(*) AS n,
        COALESCE(SUM(CASE WHEN result='FAIL' THEN 1 ELSE 0 END),0) AS failed,
        COALESCE(SUM(CASE WHEN result='NOT_TESTED' THEN 1 ELSE 0 END),0) AS pending
        FROM ComplianceTestSample WHERE institutionId=? AND workpaperId=?`)
        .bind(tenant,id).first<{n:number;failed:number;pending:number}>(),
      db.prepare('SELECT COUNT(*) AS n FROM ComplianceTestEvidence WHERE institutionId=? AND workpaperId=?')
        .bind(tenant,id).first<{n:number}>(),
      db.prepare('SELECT COUNT(*) AS n FROM ComplianceTestFinding WHERE institutionId=? AND workpaperId=?')
        .bind(tenant,id).first<{n:number}>()
    ]);
    if(Number(stats[1]?.n)<1)throw new Error('CT_EVIDENCE_REQUIRED');
    if(w.testType==='TOE'&&(Number(stats[0]?.n)!==w.sampleSize || Number(stats[0]?.pending)>0))
      throw new Error('CT_SAMPLES_INCOMPLETE');
    if(Number(stats[0]?.failed)>0 && Number(stats[2]?.n)<1)
      throw new Error('CT_FINDING_REQUIRED');
    target='SUBMITTED';
  }else if(action==='APPROVE'||action==='RETURN'){
    if(w.status!=='SUBMITTED')throw new Error('CT_LOCKED');
    if(actor.id===w.preparedById)throw new Error('CT_SELF_APPROVAL');
    if(!COMPLIANCE_TEST_REVIEW.has(actor.role))throw new Error('CT_FORBIDDEN');
    if(action==='RETURN'){required(note,1500);target='RETURNED';}
    else{
      if(!['EFFECTIVE','PARTIAL','INEFFECTIVE','INCONCLUSIVE'].includes(decision))
        throw new Error('CT_DECISION_REQUIRED');
      const failed=await db.prepare(`SELECT id FROM ComplianceTestSample
        WHERE institutionId=? AND workpaperId=? AND result='FAIL' LIMIT 1`)
        .bind(tenant,id).first<{id:string}>();
      if(failed && decision==='EFFECTIVE')throw new Error('CT_FALSE_PASS');
      target='APPROVED';
    }
  }else if(action==='REVISE'){
    if(w.status!=='RETURNED')throw new Error('CT_LOCKED');
    if(w.preparedById!==actor.id&&!['Admin','SystemAdmin'].includes(actor.role))
      throw new Error('CT_OWNER_ONLY');
    target='DRAFT';
  }else throw new Error('CT_INVALID_INPUT');
  const result=await db.prepare(`UPDATE ComplianceTestWorkpaper
    SET status=?,conclusion=?,reviewerId=?,reviewNote=?,reviewedAt=?,updatedAt=?
    WHERE institutionId=? AND id=? AND status=?`)
    .bind(target,target==='APPROVED'?decision:'NOT_ASSESSED',
      target==='APPROVED'||target==='RETURNED'?actor.id:null,
      target==='APPROVED'||target==='RETURNED'?optional(note,1500):null,
      target==='APPROVED'||target==='RETURNED'?now():null,now(),tenant,id,w.status)
    .run() as {meta?:{changes?:number}};
  if(result.meta?.changes===0)throw new Error('CT_CONFLICT');
  await event(db,tenant,id,actor,action,action==='APPROVE'?decision:optional(note,1500));
  return get(db,tenant,id);
}
