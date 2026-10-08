import { ensureRegulatoryObligationSchema } from '@/lib/d1-regulatory-obligations';

export type ComplianceActor = { id: string; role: string };
type DB = Awaited<ReturnType<typeof ensureRegulatoryObligationSchema>>;
export type RiskInput = {
  obligationId: string; processId?: string | null; riskId?: string | null;
  controlId?: string | null; ownerUnitId: string; productName?: string | null;
  period: string; inherentLikelihood: number; inherentImpact: number;
  residualLikelihood: number; residualImpact: number;
  threatDescription: string; existingControls: string; rationale: string;
  mitigationPlan?: string | null; nextReviewDate: string;
};
type RecordRisk = RiskInput & {
  id: string; institutionId: string; status: string; preparedById: string;
  reassessmentOfId: string | null;
  inherentScore: number; residualScore: number; reviewerId: string | null;
  reviewNote: string | null; reviewedAt: string | null; updatedAt: string;
};

export const COMPLIANCE_RISK_READ = new Set(['SystemAdmin','Admin','ComplianceOfficer','RiskManager','InternalAuditor','Executive','ReadOnlyAuditor']);
export const COMPLIANCE_RISK_WRITE = new Set(['SystemAdmin','Admin','ComplianceOfficer']);
export const COMPLIANCE_RISK_REVIEW = new Set(['SystemAdmin','Admin','ComplianceOfficer']);
const text = (value: unknown, max = 1000) => {
  const s = String(value ?? '').trim();
  if (!s || s.length > max) throw new Error('CRA_INVALID_INPUT');
  return s;
};
const opt = (value: unknown, max = 1000) => {
  const s = String(value ?? '').trim();
  if (s.length > max) throw new Error('CRA_INVALID_INPUT');
  return s || null;
};
const scoreDimension = (value: unknown) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error('CRA_SCORE_INVALID');
  return n;
};
const validDate = (value: unknown) => {
  const s = text(value,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s+'T00:00:00Z')) ||
      new Date(s+'T00:00:00Z').toISOString().slice(0,10) !== s) throw new Error('CRA_DATE_INVALID');
  return s;
};
const now = () => new Date().toISOString();
const localToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

let cached: Promise<DB> | null = null;
export function ensureComplianceRiskSchema(): Promise<DB> {
  if (cached) return cached;
  cached = (async()=>{
    const db = await ensureRegulatoryObligationSchema();
    for (const statement of [
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
      'CREATE INDEX IF NOT EXISTS idx_cra_tenant_period ON ComplianceRiskAssessment(institutionId,period,status)',
      'CREATE INDEX IF NOT EXISTS idx_cra_obligation ON ComplianceRiskAssessment(institutionId,obligationId,updatedAt)',
      'CREATE INDEX IF NOT EXISTS idx_cra_review ON ComplianceRiskAssessment(institutionId,status,nextReviewDate)',
      `CREATE TABLE IF NOT EXISTS ComplianceRiskEvent (
        id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, assessmentId TEXT NOT NULL,
        actorId TEXT NOT NULL, actorRole TEXT NOT NULL, action TEXT NOT NULL,
        comment TEXT, createdAt TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS idx_cra_event ON ComplianceRiskEvent(institutionId,assessmentId,createdAt)'
    ]) await db.prepare(statement).run();
    // Additive schema migration: preserve previously approved bank assessments.
    const cols = await db.prepare('PRAGMA table_info(ComplianceRiskAssessment)').all<{name:string}>();
    if (!(cols.results||[]).some(column=>column.name==='reassessmentOfId')) {
      try {
        await db.prepare('ALTER TABLE ComplianceRiskAssessment ADD COLUMN reassessmentOfId TEXT').run();
      } catch (e) {
        // Concurrent first requests can observe the old schema before the other migration finishes.
        if (!String(e).toLowerCase().includes('duplicate column')) throw e;
      }
    }
    await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_cra_reassessment_lineage ON ComplianceRiskAssessment(institutionId,reassessmentOfId)').run();
    return db;
  })().catch(e=>{cached=null;throw e;});
  return cached;
}
async function log(db:DB, tenant:string, recordId:string, actor:ComplianceActor, action:string, comment:string|null) {
  await db.prepare('INSERT INTO ComplianceRiskEvent (id,institutionId,assessmentId,actorId,actorRole,action,comment,createdAt) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),tenant,recordId,actor.id,actor.role,action,comment,now()).run();
}
async function lookup(db:DB, tenant:string, table:string, id:string) {
  const allow = ['OrganizationUnit','BusinessProcess','RiskMaster','ControlMaster','RegulatoryObligation'];
  if (!allow.includes(table)) throw new Error('CRA_INVALID_INPUT');
  return Boolean(await db.prepare('SELECT id FROM '+table+' WHERE institutionId = ? AND id = ? LIMIT 1')
    .bind(tenant,id).first<{id:string}>());
}
async function mapped(db:DB, tenant:string, obligationId:string, type:string, targetId:string) {
  return Boolean(await db.prepare(`SELECT id FROM RegulatoryObligationLink
    WHERE institutionId=? AND obligationId=? AND targetType=? AND targetId=? LIMIT 1`)
    .bind(tenant,obligationId,type,targetId).first<{id:string}>());
}
async function validate(db:DB, tenant:string, input:RiskInput) {
  const obligationId = text(input.obligationId,100);
  const obligation = await db.prepare(`SELECT id FROM RegulatoryObligation
    WHERE institutionId=? AND id=? AND status='Active' AND complianceStatus!='NOT_APPLICABLE' LIMIT 1`)
    .bind(tenant,obligationId).first<{id:string}>();
  if (!obligation) throw new Error('CRA_OBLIGATION_NOT_FOUND');
  const ownerUnitId = text(input.ownerUnitId,100);
  if (!(await lookup(db,tenant,'OrganizationUnit',ownerUnitId))) throw new Error('CRA_TARGET_NOT_FOUND');
  const processId = opt(input.processId,100);
  const riskId = opt(input.riskId,100);
  const controlId = opt(input.controlId,100);
  if (processId && (!(await lookup(db,tenant,'BusinessProcess',processId)) ||
                    !(await mapped(db,tenant,obligationId,'PROCESS',processId))))
    throw new Error('CRA_TARGET_NOT_MAPPED');
  if (riskId && (!(await lookup(db,tenant,'RiskMaster',riskId)) ||
                 !(await mapped(db,tenant,obligationId,'RISK',riskId))))
    throw new Error('CRA_TARGET_NOT_MAPPED');
  if (controlId && (!(await lookup(db,tenant,'ControlMaster',controlId)) ||
                    !(await mapped(db,tenant,obligationId,'CONTROL',controlId))))
    throw new Error('CRA_TARGET_NOT_MAPPED');
  if (riskId && processId) {
    const row = await db.prepare('SELECT id FROM RiskMaster WHERE institutionId=? AND id=? AND processId=? LIMIT 1')
      .bind(tenant,riskId,processId).first<{id:string}>();
    if (!row) throw new Error('CRA_TRACEABILITY_INVALID');
  }
  if (controlId && processId) {
    const row = await db.prepare('SELECT id FROM ControlMaster WHERE institutionId=? AND id=? AND processId=? LIMIT 1')
      .bind(tenant,controlId,processId).first<{id:string}>();
    if (!row) throw new Error('CRA_TRACEABILITY_INVALID');
  }
  if (riskId && controlId) {
    const row = await db.prepare(`SELECT m.controlId FROM ControlRiskMapping m
      JOIN ControlMaster c ON c.id=m.controlId AND c.institutionId=?
      JOIN RiskMaster r ON r.id=m.riskId AND r.institutionId=?
      WHERE m.controlId=? AND m.riskId=? LIMIT 1`)
      .bind(tenant,tenant,controlId,riskId).first<{controlId:string}>();
    if (!row) throw new Error('CRA_TRACEABILITY_INVALID');
  }
  const inherentLikelihood = scoreDimension(input.inherentLikelihood);
  const inherentImpact = scoreDimension(input.inherentImpact);
  const residualLikelihood = scoreDimension(input.residualLikelihood);
  const residualImpact = scoreDimension(input.residualImpact);
  const period = text(input.period,50);
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{1,49}$/.test(period)) throw new Error('CRA_INVALID_INPUT');
  const nextReviewDate = validDate(input.nextReviewDate);
  return {
    obligationId,ownerUnitId,processId,riskId,controlId,period,
    productName:opt(input.productName,120),
    inherentLikelihood,inherentImpact,residualLikelihood,residualImpact,
    inherentScore:inherentLikelihood*inherentImpact,
    residualScore:residualLikelihood*residualImpact,
    threatDescription:text(input.threatDescription,2000),
    existingControls:text(input.existingControls,2000),
    rationale:text(input.rationale,2000),
    mitigationPlan:opt(input.mitigationPlan,2000),
    nextReviewDate
  };
}
async function get(db:DB, tenant:string, id:string) {
  return db.prepare(`SELECT id,institutionId,obligationId,reassessmentOfId,processId,riskId,controlId,ownerUnitId,
      productName,period,inherentLikelihood,inherentImpact,residualLikelihood,residualImpact,
      inherentScore,residualScore,threatDescription,existingControls,rationale,mitigationPlan,
      nextReviewDate,status,preparedById,reviewerId,reviewNote,reviewedAt,createdAt,updatedAt
    FROM ComplianceRiskAssessment WHERE institutionId=? AND id=? LIMIT 1`)
    .bind(tenant,id).first<RecordRisk>();
}
export async function listComplianceRisks(tenant:string, page:number, period?:string) {
  const db=await ensureComplianceRiskSchema();
  const p=Math.max(1,Math.min(100,Math.floor(page)||1));
  const value=period ? text(period,50):null;
  const args=value?[tenant,value]:[tenant];
  const where=value?'a.institutionId=? AND a.period=?':'a.institutionId=?';
  const [items,total] = await Promise.all([
    db.prepare(`SELECT a.id,a.obligationId,a.reassessmentOfId,o.obligationCode,a.processId,a.riskId,a.controlId,
      a.productName,a.period,a.ownerUnitId,u.name AS ownerName,a.inherentScore,a.residualScore,
      a.status,a.preparedById,a.nextReviewDate,a.updatedAt
      FROM ComplianceRiskAssessment a
      JOIN RegulatoryObligation o ON o.id=a.obligationId AND o.institutionId=a.institutionId
      LEFT JOIN OrganizationUnit u ON u.id=a.ownerUnitId AND u.institutionId=a.institutionId
      WHERE `+where+` ORDER BY a.updatedAt DESC LIMIT 25 OFFSET ?`).bind(...args,(p-1)*25).all(),
    db.prepare('SELECT COUNT(*) AS n FROM ComplianceRiskAssessment a WHERE '+where)
      .bind(...args).first<{n:number}>()
  ]);
  return {items:items.results||[],total:total?.n||0,page:p,pageSize:25};
}
export async function complianceRiskDetail(tenant:string,id:string) {
  const db=await ensureComplianceRiskSchema();
  const record=await get(db,tenant,text(id,100));
  if(!record) throw new Error('CRA_NOT_FOUND');
  const history=await db.prepare(`SELECT action,actorId,actorRole,comment,createdAt
    FROM ComplianceRiskEvent WHERE institutionId=? AND assessmentId=?
    ORDER BY createdAt DESC LIMIT 50`).bind(tenant,id).all();
  const predecessor = record.reassessmentOfId
    ? await db.prepare(`SELECT id,period,status,inherentScore,residualScore,reviewedAt
      FROM ComplianceRiskAssessment WHERE institutionId=? AND id=? LIMIT 1`)
      .bind(tenant,record.reassessmentOfId).first() : null;
  const successor = await db.prepare(`SELECT id,period,status,inherentScore,residualScore,reviewedAt
    FROM ComplianceRiskAssessment WHERE institutionId=? AND reassessmentOfId=? LIMIT 1`)
    .bind(tenant,id).first();
  return {record,history:history.results||[],predecessor,successor};
}
export async function complianceRiskOptions(tenant:string) {
  const db=await ensureComplianceRiskSchema();
  const [obligations,units,links,processes,risks,controls]=await Promise.all([
    db.prepare(`SELECT id,obligationCode,requirementText,criticality FROM RegulatoryObligation
      WHERE institutionId=? AND status='Active' AND complianceStatus!='NOT_APPLICABLE'
      ORDER BY obligationCode LIMIT 500`).bind(tenant).all(),
    db.prepare(`SELECT id,code,name FROM OrganizationUnit
      WHERE institutionId=? AND status='Active' ORDER BY code LIMIT 500`).bind(tenant).all(),
    db.prepare(`SELECT obligationId,targetType,targetId FROM RegulatoryObligationLink
      WHERE institutionId=? AND targetType IN ('PROCESS','RISK','CONTROL') LIMIT 3000`).bind(tenant).all(),
    db.prepare('SELECT id,processId,name FROM BusinessProcess WHERE institutionId=? ORDER BY processId LIMIT 500').bind(tenant).all(),
    db.prepare('SELECT id,riskId,name FROM RiskMaster WHERE institutionId=? ORDER BY riskId LIMIT 500').bind(tenant).all(),
    db.prepare('SELECT id,controlId,name FROM ControlMaster WHERE institutionId=? ORDER BY controlId LIMIT 500').bind(tenant).all()
  ]);
  return {obligations:obligations.results||[],units:units.results||[],links:links.results||[],
    processes:processes.results||[],risks:risks.results||[],controls:controls.results||[],
    referenceLimit:500};
}
export async function saveComplianceRisk(tenant:string,input:RiskInput,actor:ComplianceActor,id?:string,reassessmentOfId?:string) {
  const db=await ensureComplianceRiskSchema();
  const data=await validate(db,tenant,input);
  if(id && reassessmentOfId)throw new Error('CRA_INVALID_INPUT');
  const prior=reassessmentOfId?await get(db,tenant,text(reassessmentOfId,100)):null;
  if(reassessmentOfId && (!prior || prior.status!=='APPROVED'))throw new Error('CRA_REASSESSMENT_SOURCE_INVALID');
  if(prior && prior.obligationId!==data.obligationId)throw new Error('CRA_REASSESSMENT_OBLIGATION_MISMATCH');
  if(prior) {
    const existing=await db.prepare('SELECT id FROM ComplianceRiskAssessment WHERE institutionId=? AND reassessmentOfId=? LIMIT 1')
      .bind(tenant,prior.id).first();
    if(existing)throw new Error('CRA_ALREADY_REASSESSED');
  }
  const current=id?await get(db,tenant,text(id,100)):null;
  if(id && !current) throw new Error('CRA_NOT_FOUND');
  if(current && current.status!=='DRAFT' && current.status!=='REJECTED') throw new Error('CRA_LOCKED');
  if(current && actor.id!==current.preparedById && !['Admin','SystemAdmin'].includes(actor.role))
    throw new Error('CRA_OWNER_ONLY');
  const time=now();
  if(current) {
    const result=await db.prepare(`UPDATE ComplianceRiskAssessment SET
      obligationId=?,processId=?,riskId=?,controlId=?,ownerUnitId=?,productName=?,period=?,
      inherentLikelihood=?,inherentImpact=?,residualLikelihood=?,residualImpact=?,
      inherentScore=?,residualScore=?,threatDescription=?,existingControls=?,rationale=?,
      mitigationPlan=?,nextReviewDate=?,status='DRAFT',reviewerId=NULL,reviewNote=NULL,
      reviewedAt=NULL,updatedAt=?
      WHERE institutionId=? AND id=? AND status IN ('DRAFT','REJECTED')`)
      .bind(data.obligationId,data.processId,data.riskId,data.controlId,data.ownerUnitId,
        data.productName,data.period,data.inherentLikelihood,data.inherentImpact,
        data.residualLikelihood,data.residualImpact,data.inherentScore,data.residualScore,
        data.threatDescription,data.existingControls,data.rationale,data.mitigationPlan,
        data.nextReviewDate,time,tenant,current.id).run() as {meta?:{changes?:number}};
    if(result.meta?.changes===0)throw new Error('CRA_CONFLICT');
    await log(db,tenant,current.id,actor,'REVISE',JSON.stringify({inherentScore:data.inherentScore,residualScore:data.residualScore}));
    return get(db,tenant,current.id);
  }
  const recordId=crypto.randomUUID();
  try {
    await db.prepare(`INSERT INTO ComplianceRiskAssessment (
    id,institutionId,obligationId,reassessmentOfId,processId,riskId,controlId,ownerUnitId,productName,period,
    inherentLikelihood,inherentImpact,residualLikelihood,residualImpact,inherentScore,residualScore,
    threatDescription,existingControls,rationale,mitigationPlan,nextReviewDate,status,
    preparedById,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'DRAFT',?,?,?)`)
    .bind(recordId,tenant,data.obligationId,prior?.id||null,data.processId,data.riskId,data.controlId,
      data.ownerUnitId,data.productName,data.period,data.inherentLikelihood,
      data.inherentImpact,data.residualLikelihood,data.residualImpact,data.inherentScore,
      data.residualScore,data.threatDescription,data.existingControls,data.rationale,
      data.mitigationPlan,data.nextReviewDate,actor.id,time,time).run();
  } catch(e) {
    if(prior && String(e).toLowerCase().includes('unique'))throw new Error('CRA_ALREADY_REASSESSED');
    throw e;
  }
  await log(db,tenant,recordId,actor,prior?'CREATE_REASSESSMENT':'CREATE',prior?.id||null);
  return get(db,tenant,recordId);
}
export async function transitionComplianceRisk(tenant:string,id:string,action:string,actor:ComplianceActor,note:string) {
  const db=await ensureComplianceRiskSchema();
  const record=await get(db,tenant,text(id,100));
  if(!record)throw new Error('CRA_NOT_FOUND');
  if(action==='SUBMIT') {
    if(record.status!=='DRAFT')throw new Error('CRA_LOCKED');
    if(actor.id!==record.preparedById && !['Admin','SystemAdmin'].includes(actor.role))
      throw new Error('CRA_OWNER_ONLY');
    const result=await db.prepare(`UPDATE ComplianceRiskAssessment SET status='SUBMITTED',
      updatedAt=? WHERE institutionId=? AND id=? AND status='DRAFT'`)
      .bind(now(),tenant,record.id).run() as {meta?:{changes?:number}};
    if(result.meta?.changes===0)throw new Error('CRA_CONFLICT');
  } else if(action==='APPROVE'||action==='REJECT') {
    if(record.status!=='SUBMITTED')throw new Error('CRA_LOCKED');
    if(record.preparedById===actor.id)throw new Error('CRA_SELF_APPROVAL');
    if(!COMPLIANCE_RISK_REVIEW.has(actor.role))throw new Error('CRA_FORBIDDEN');
    const reviewNote=action==='REJECT'?text(note,1500):opt(note,1500);
    const result=await db.prepare(`UPDATE ComplianceRiskAssessment SET status=?,
      reviewerId=?,reviewNote=?,reviewedAt=?,updatedAt=?
      WHERE institutionId=? AND id=? AND status='SUBMITTED'`)
      .bind(action==='APPROVE'?'APPROVED':'REJECTED',actor.id,reviewNote,now(),now(),tenant,record.id)
      .run() as {meta?:{changes?:number}};
    if(result.meta?.changes===0)throw new Error('CRA_CONFLICT');
  } else throw new Error('CRA_INVALID_INPUT');
  await log(db,tenant,record.id,actor,action,opt(note,1500));
  return get(db,tenant,record.id);
}
export function riskBand(score:number) {
  if(score>=16)return 'Kritis';
  if(score>=10)return 'Tinggi';
  if(score>=5)return 'Sedang';
  return 'Rendah';
}
