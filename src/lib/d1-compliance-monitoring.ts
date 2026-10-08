import { ensureRegulatoryObligationSchema } from '@/lib/d1-regulatory-obligations';

type Db = Awaited<ReturnType<typeof ensureRegulatoryObligationSchema>>;
type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
type ActivityStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE';
type Actor = { id: string; role: string };
export type MonitoringPlanInput = {
  code: string; title: string; year: number; period: string; quarter?: number | null;
  objective: string; scope: string; ownerUnitId: string; startDate: string; endDate: string;
};
export type MonitoringActivityInput = {
  planId: string; obligationId: string; processId?: string | null;
  ownerUnitId: string; description: string; scheduledDate: string;
};
type Plan = MonitoringPlanInput & {
  id: string; institutionId: string; status: PlanStatus; preparedById: string;
  submittedAt: string | null; approvedById: string | null; approvedAt: string | null;
  reviewNote: string | null; createdAt: string; updatedAt: string;
};
type Activity = MonitoringActivityInput & {
  id: string; institutionId: string; status: ActivityStatus;
  actualDate: string | null; outcomeNote: string | null; createdAt: string; updatedAt: string;
};

const STATUSES = new Set<PlanStatus>(['DRAFT','SUBMITTED','APPROVED','REJECTED','IN_PROGRESS','COMPLETED']);
function required(value: unknown, max: number, code = 'MONITORING_INVALID_INPUT') {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) throw new Error(code);
  return text;
}
function optional(value: unknown, max: number) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new Error('MONITORING_INVALID_INPUT');
  return text;
}
function date(value: unknown) {
  const text = required(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      Number.isNaN(Date.parse(text + 'T00:00:00Z')) ||
      new Date(text + 'T00:00:00Z').toISOString().slice(0,10) !== text) {
    throw new Error('MONITORING_INVALID_DATE');
  }
  return text;
}
function timestamp() { return new Date().toISOString(); }
function today() {
  return new Intl.DateTimeFormat('en-CA',{
    year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Jakarta'
  }).format(new Date());
}
function assertScope(institutionId: string, actor: Actor) {
  if (!institutionId || !actor.id || !actor.role) throw new Error('MONITORING_ACCESS_REQUIRED');
}

let ready: Promise<Db> | null = null;
export function ensureMonitoringSchema(): Promise<Db> {
  if (ready) return ready;
  ready = (async () => {
    const db = await ensureRegulatoryObligationSchema();
    // Indexes permit tenant-scoped dashboards and avoid scanning the full D1 database.
    const statements = [
      'CREATE TABLE IF NOT EXISTS ComplianceMonitoringPlan (id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, code TEXT NOT NULL, title TEXT NOT NULL, year INTEGER NOT NULL, period TEXT NOT NULL, quarter INTEGER, objective TEXT NOT NULL, scope TEXT NOT NULL, ownerUnitId TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'DRAFT\', preparedById TEXT NOT NULL, submittedAt TEXT, approvedById TEXT, approvedAt TEXT, reviewNote TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)',
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_cmp_plan_code ON ComplianceMonitoringPlan(institutionId,code)',
      'CREATE INDEX IF NOT EXISTS idx_cmp_plan_queue ON ComplianceMonitoringPlan(institutionId,year,status,startDate)',
      'CREATE TABLE IF NOT EXISTS ComplianceMonitoringActivity (id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, planId TEXT NOT NULL, obligationId TEXT NOT NULL, processId TEXT, ownerUnitId TEXT NOT NULL, description TEXT NOT NULL, scheduledDate TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'PLANNED\', actualDate TEXT, outcomeNote TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS idx_cmp_activity_plan ON ComplianceMonitoringActivity(institutionId,planId,scheduledDate)',
      'CREATE INDEX IF NOT EXISTS idx_cmp_activity_obligation ON ComplianceMonitoringActivity(institutionId,obligationId)',
      'CREATE TABLE IF NOT EXISTS ComplianceMonitoringEvent (id TEXT PRIMARY KEY, institutionId TEXT NOT NULL, planId TEXT NOT NULL, actorId TEXT NOT NULL, actorRole TEXT NOT NULL, action TEXT NOT NULL, detail TEXT, createdAt TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS idx_cmp_event_plan ON ComplianceMonitoringEvent(institutionId,planId,createdAt)'
    ];
    for (const sql of statements) await db.prepare(sql).run();
    return db;
  })().catch(error => { ready = null; throw error; });
  return ready;
}
async function event(db: Db, institutionId: string, planId: string, actor: Actor, action: string, detail = '') {
  await db.prepare('INSERT INTO ComplianceMonitoringEvent (id,institutionId,planId,actorId,actorRole,action,detail,createdAt) VALUES (?,?,?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), institutionId, planId, actor.id, actor.role, action, detail, timestamp()).run();
}
async function unitExists(db: Db, institutionId: string, id: string) {
  return Boolean(await db.prepare('SELECT id FROM OrganizationUnit WHERE institutionId = ? AND id = ? AND status = \'Active\' LIMIT 1')
    .bind(institutionId, id).first<{id:string}>());
}
async function getPlan(db: Db, institutionId: string, id: string) {
  return db.prepare('SELECT id,institutionId,code,title,year,period,quarter,objective,scope,ownerUnitId,startDate,endDate,status,preparedById,submittedAt,approvedById,approvedAt,reviewNote,createdAt,updatedAt FROM ComplianceMonitoringPlan WHERE institutionId = ? AND id = ? LIMIT 1')
    .bind(institutionId, id).first<Plan>();
}
async function planOrThrow(db: Db, institutionId: string, id: string) {
  const plan = await getPlan(db, institutionId, required(id, 100));
  if (!plan) throw new Error('MONITORING_NOT_FOUND');
  return plan;
}
async function updateStatus(db: Db, institutionId: string, plan: Plan, target: PlanStatus, extra: {actorId?:string;note?:string} = {}) {
  if (!STATUSES.has(target)) throw new Error('MONITORING_INVALID_INPUT');
  const now = timestamp();
  const result = await db.prepare('UPDATE ComplianceMonitoringPlan SET status = ?, approvedById = CASE WHEN ? = \'APPROVED\' THEN ? ELSE approvedById END, approvedAt = CASE WHEN ? = \'APPROVED\' THEN ? ELSE approvedAt END, submittedAt = CASE WHEN ? = \'SUBMITTED\' THEN ? ELSE submittedAt END, reviewNote = CASE WHEN ? IN (\'APPROVED\',\'REJECTED\') THEN ? ELSE reviewNote END, updatedAt = ? WHERE institutionId = ? AND id = ? AND status = ?')
    .bind(target,target,extra.actorId || null,target,now,target,now,target,extra.note || null,now,institutionId,plan.id,plan.status).run() as {meta?: {changes?:number}};
  if (result.meta?.changes === 0) throw new Error('MONITORING_CONFLICT');
}
export async function listMonitoringPlans(institutionId: string, page = 1, year?: number) {
  const db = await ensureMonitoringSchema();
  const safePage = Math.min(100, Math.max(1, Math.floor(Number(page) || 1)));
  const targetYear = year && year >= 2000 && year <= 2100 ? year : null;
  const where = targetYear ? 'p.institutionId = ? AND p.year = ?' : 'p.institutionId = ?';
  const args: Array<string | number> = targetYear ? [institutionId,targetYear] : [institutionId];
  const [result, count] = await Promise.all([
    db.prepare('SELECT p.id,p.code,p.title,p.year,p.period,p.quarter,p.startDate,p.endDate,p.status,p.ownerUnitId,u.name AS ownerUnitName,p.preparedById,p.updatedAt, (SELECT COUNT(*) FROM ComplianceMonitoringActivity a WHERE a.institutionId = p.institutionId AND a.planId = p.id) AS activityCount, (SELECT COUNT(*) FROM ComplianceMonitoringActivity a WHERE a.institutionId = p.institutionId AND a.planId = p.id AND a.status = \'DONE\') AS completedCount FROM ComplianceMonitoringPlan p LEFT JOIN OrganizationUnit u ON u.id=p.ownerUnitId AND u.institutionId=p.institutionId WHERE '+where+' ORDER BY p.year DESC,p.updatedAt DESC LIMIT 25 OFFSET ?')
      .bind(...args, (safePage-1)*25).all(),
    db.prepare('SELECT COUNT(*) AS total FROM ComplianceMonitoringPlan p WHERE '+where).bind(...args).first<{total:number}>()
  ]);
  return { plans: result.results || [], total: count?.total || 0, page: safePage, pageSize: 25 };
}
export async function monitoringOptions(institutionId: string) {
  const db = await ensureMonitoringSchema();
  const [units, obligations, processes, processLinks] = await Promise.all([
    db.prepare('SELECT id,code,name,type FROM OrganizationUnit WHERE institutionId = ? AND status = \'Active\' ORDER BY code LIMIT 500').bind(institutionId).all(),
    db.prepare('SELECT id,obligationCode,requirementText,criticality,ownerUnitId,complianceStatus FROM RegulatoryObligation WHERE institutionId = ? AND status = \'Active\' AND complianceStatus != \'NOT_APPLICABLE\' ORDER BY CASE criticality WHEN \'Kritis\' THEN 0 WHEN \'Tinggi\' THEN 1 ELSE 2 END,obligationCode LIMIT 500').bind(institutionId).all(),
    db.prepare('SELECT id,processId,name FROM BusinessProcess WHERE institutionId = ? ORDER BY processId LIMIT 500').bind(institutionId).all(),
    db.prepare('SELECT obligationId,targetId FROM RegulatoryObligationLink WHERE institutionId = ? AND targetType = \'PROCESS\' LIMIT 5000').bind(institutionId).all()
  ]);
  return {units: units.results || [], obligations: obligations.results || [], processes: processes.results || [], processLinks: processLinks.results || [], truncatedAt: 500};
}
export async function monitoringDetail(institutionId: string, planId: string) {
  const db = await ensureMonitoringSchema();
  const plan = await planOrThrow(db, institutionId, planId);
  const [activities, history] = await Promise.all([
    db.prepare('SELECT a.id,a.planId,a.obligationId,a.processId,a.ownerUnitId,a.description,a.scheduledDate,a.status,a.actualDate,a.outcomeNote,o.obligationCode,o.criticality,o.complianceStatus,b.processId AS processCode,u.name AS ownerUnitName FROM ComplianceMonitoringActivity a JOIN RegulatoryObligation o ON o.id=a.obligationId AND o.institutionId=a.institutionId LEFT JOIN BusinessProcess b ON b.id=a.processId AND b.institutionId=a.institutionId LEFT JOIN OrganizationUnit u ON u.id=a.ownerUnitId AND u.institutionId=a.institutionId WHERE a.institutionId = ? AND a.planId = ? ORDER BY a.scheduledDate LIMIT 500').bind(institutionId,planId).all(),
    db.prepare('SELECT actorId,actorRole,action,detail,createdAt FROM ComplianceMonitoringEvent WHERE institutionId = ? AND planId = ? ORDER BY createdAt DESC LIMIT 50').bind(institutionId,planId).all()
  ]);
  return {plan,activities:activities.results || [],history:history.results || []};
}
export async function createMonitoringPlan(institutionId: string, input: MonitoringPlanInput, actor: Actor) {
  assertScope(institutionId,actor);
  const db = await ensureMonitoringSchema();
  const code = required(input.code,40).toUpperCase();
  const year = Number(input.year);
  const period = required(input.period,12).toUpperCase();
  const quarter = period === 'TRIWULAN' ? Number(input.quarter) : null;
  const startDate = date(input.startDate);
  const endDate = date(input.endDate);
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) || !Number.isInteger(year) ||
      year < 2000 || year > 2100 || !['TAHUNAN','TRIWULAN'].includes(period) ||
      (period === 'TRIWULAN' && ![1,2,3,4].includes(Number(quarter))) ||
      endDate < startDate || Number(startDate.slice(0,4)) !== year ||
      Number(endDate.slice(0,4)) !== year ||
      (period === 'TRIWULAN' && (Math.ceil(Number(startDate.slice(5,7))/3) !== quarter ||
       Math.ceil(Number(endDate.slice(5,7))/3) !== quarter))) {
    throw new Error('MONITORING_INVALID_INPUT');
  }
  const ownerUnitId = required(input.ownerUnitId,100);
  if (!(await unitExists(db,institutionId,ownerUnitId))) throw new Error('MONITORING_UNIT_NOT_FOUND');
  const id = crypto.randomUUID(); const now = timestamp();
  try {
    await db.prepare('INSERT INTO ComplianceMonitoringPlan (id,institutionId,code,title,year,period,quarter,objective,scope,ownerUnitId,startDate,endDate,status,preparedById,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,\'DRAFT\',?,?,?)')
      .bind(id,institutionId,code,required(input.title,180),year,period,quarter,
        required(input.objective,2000),required(input.scope,2000),ownerUnitId,startDate,endDate,actor.id,now,now).run();
  } catch(error) {
    if (String(error).toLowerCase().includes('unique')) throw new Error('MONITORING_DUPLICATE');
    throw error;
  }
  await event(db,institutionId,id,actor,'CREATE','Rencana disimpan sebagai draft.');
  return getPlan(db,institutionId,id);
}
export async function addMonitoringActivity(institutionId: string, input: MonitoringActivityInput, actor: Actor) {
  assertScope(institutionId,actor);
  const db = await ensureMonitoringSchema();
  const plan = await planOrThrow(db,institutionId,input.planId);
  if (plan.status !== 'DRAFT') throw new Error('MONITORING_LOCKED');
  const obligationId = required(input.obligationId,100);
  const obligation = await db.prepare('SELECT id,ownerUnitId FROM RegulatoryObligation WHERE institutionId = ? AND id = ? AND status = \'Active\' AND complianceStatus != \'NOT_APPLICABLE\' LIMIT 1').bind(institutionId,obligationId).first<{id:string;ownerUnitId:string|null}>();
  if (!obligation) throw new Error('MONITORING_OBLIGATION_NOT_FOUND');
  const processId = optional(input.processId,100) || null;
  if (processId) {
    // Do not silently invent an obligation-to-process relationship.
    const mapped = await db.prepare('SELECT l.id FROM RegulatoryObligationLink l JOIN BusinessProcess b ON b.id = l.targetId AND b.institutionId=l.institutionId WHERE l.institutionId = ? AND l.obligationId = ? AND l.targetType = \'PROCESS\' AND l.targetId = ? LIMIT 1')
      .bind(institutionId,obligationId,processId).first<{id:string}>();
    if (!mapped) throw new Error('MONITORING_PROCESS_NOT_MAPPED');
  }
  const ownerUnitId = required(input.ownerUnitId,100);
  if (!(await unitExists(db,institutionId,ownerUnitId))) throw new Error('MONITORING_UNIT_NOT_FOUND');
  const scheduledDate = date(input.scheduledDate);
  if (scheduledDate < plan.startDate || scheduledDate > plan.endDate) throw new Error('MONITORING_DATE_OUTSIDE_PLAN');
  const id = crypto.randomUUID();const now = timestamp();
  await db.prepare('INSERT INTO ComplianceMonitoringActivity (id,institutionId,planId,obligationId,processId,ownerUnitId,description,scheduledDate,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,\'PLANNED\',?,?)')
    .bind(id,institutionId,plan.id,obligationId,processId,ownerUnitId,required(input.description,1200),scheduledDate,now,now).run();
  await event(db,institutionId,plan.id,actor,'ADD_ACTIVITY','Aktivitas pemantauan ditambahkan.');
  return {id};
}
export async function transitionMonitoringPlan(institutionId: string, planId: string, action: string, actor: Actor, note = '') {
  assertScope(institutionId,actor);
  const db = await ensureMonitoringSchema();
  const plan = await planOrThrow(db,institutionId,planId);
  const next: Record<string,{from:PlanStatus,to:PlanStatus}> = {
    SUBMIT:{from:'DRAFT',to:'SUBMITTED'},
    APPROVE:{from:'SUBMITTED',to:'APPROVED'},
    REJECT:{from:'SUBMITTED',to:'REJECTED'},
    REVISE:{from:'REJECTED',to:'DRAFT'},
    START:{from:'APPROVED',to:'IN_PROGRESS'},
    COMPLETE:{from:'IN_PROGRESS',to:'COMPLETED'}
  };
  const operation = next[action];
  if (!operation || plan.status !== operation.from) throw new Error('MONITORING_INVALID_TRANSITION');
  if (action === 'APPROVE' || action === 'REJECT') {
    if (plan.preparedById === actor.id) throw new Error('MONITORING_SELF_APPROVAL');
    if (action === 'REJECT' && !note.trim()) throw new Error('MONITORING_NOTE_REQUIRED');
  } else if (['SUBMIT','REVISE'].includes(action) && plan.preparedById !== actor.id &&
             actor.role !== 'SystemAdmin' && actor.role !== 'Admin') {
    throw new Error('MONITORING_OWNER_ONLY');
  }
  if (action === 'SUBMIT') {
    const count = await db.prepare('SELECT COUNT(*) AS total FROM ComplianceMonitoringActivity WHERE institutionId = ? AND planId = ?')
      .bind(institutionId,plan.id).first<{total:number}>();
    if (!count?.total) throw new Error('MONITORING_ACTIVITY_REQUIRED');
  }
  if (action === 'COMPLETE') {
    const count = await db.prepare('SELECT COUNT(*) AS pending FROM ComplianceMonitoringActivity WHERE institutionId = ? AND planId = ? AND status != \'DONE\'')
      .bind(institutionId,plan.id).first<{pending:number}>();
    if (Number(count?.pending) > 0) throw new Error('MONITORING_ACTIVITIES_PENDING');
  }
  await updateStatus(db,institutionId,plan,operation.to,{actorId:actor.id,note:optional(note,1500)});
  await event(db,institutionId,plan.id,actor,action,optional(note,1500));
  return getPlan(db,institutionId,plan.id);
}
export async function progressMonitoringActivity(institutionId: string, activityId: string, status: string,
  actor: Actor, actualDate?:string|null, outcomeNote?:string|null) {
  assertScope(institutionId,actor);
  const db = await ensureMonitoringSchema();
  const activity = await db.prepare('SELECT id,planId,status FROM ComplianceMonitoringActivity WHERE institutionId = ? AND id = ? LIMIT 1')
    .bind(institutionId,required(activityId,100)).first<{id:string;planId:string;status:ActivityStatus}>();
  if (!activity) throw new Error('MONITORING_ACTIVITY_NOT_FOUND');
  const plan = await planOrThrow(db,institutionId,activity.planId);
  if (plan.status !== 'IN_PROGRESS') throw new Error('MONITORING_LOCKED');
  if (!['IN_PROGRESS','DONE'].includes(status) ||
      (status === 'IN_PROGRESS' && activity.status !== 'PLANNED') ||
      (status === 'DONE' && !['PLANNED','IN_PROGRESS'].includes(activity.status))) {
    throw new Error('MONITORING_INVALID_TRANSITION');
  }
  const effectiveDate = status === 'DONE' ? date(actualDate) : null;
  const note = status === 'DONE' ? required(outcomeNote,2000) : optional(outcomeNote,2000);
  if (effectiveDate && effectiveDate > today()) throw new Error('MONITORING_INVALID_DATE');
  const result = await db.prepare('UPDATE ComplianceMonitoringActivity SET status = ?, actualDate = ?, outcomeNote = ?, updatedAt = ? WHERE id = ? AND institutionId = ? AND status = ?')
    .bind(status,effectiveDate,note || null,timestamp(),activity.id,institutionId,activity.status).run() as {meta?:{changes?:number}};
  if (result.meta?.changes === 0) throw new Error('MONITORING_CONFLICT');
  await event(db,institutionId,plan.id,actor,'ACTIVITY_'+status,activity.id);
  return {id:activity.id,status,effectiveDate};
}
