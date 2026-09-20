import { getTenantDb, getTenantContext } from '@/lib/tenant-context';
import { ensureCoreDomainSchema } from '@/lib/d1-core';

type D1DatabaseLike = {
  exec: (sql: string) => Promise<unknown>;
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
};

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
  return getTenantDb();
}

async function all<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).run() : statement.run();
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  await db.exec(script);
}

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function scoreRating(score: number) {
  if (score >= 20) return 'Extreme';
  if (score >= 12) return 'High';
  if (score >= 6) return 'Medium';
  return 'Low';
}

function normalizeEffectiveness(value: string) {
  return ['Effective', 'Partially Effective', 'Ineffective', 'Not Applicable'].includes(value)
    ? value
    : 'Not Assessed';
}

const rcsaSchemaReadyByBinding = new Map<string, Promise<D1DatabaseLike>>();

export async function ensureRcsaSchema() {
  const { databaseBinding } = await getTenantContext();
  const cached = rcsaSchemaReadyByBinding.get(databaseBinding);
  if (cached) return cached;

  const schemaPromise = (async () => {
    const db = await getDb();

    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS AssessmentCampaign (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        campaignCode TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'RCSA',
        period TEXT NOT NULL,
        frequency TEXT NOT NULL DEFAULT 'Annual',
        startDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        ownerName TEXT NOT NULL,
        reviewerName TEXT NOT NULL,
        approverName TEXT NOT NULL,
        methodology TEXT NOT NULL DEFAULT 'COSO / ISO 31000 aligned',
        ratingScale TEXT NOT NULL DEFAULT '5x5',
        evidenceRequired INTEGER NOT NULL DEFAULT 1,
        instructions TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_campaign_code
        ON AssessmentCampaign(institutionId, campaignCode);
      CREATE INDEX IF NOT EXISTS idx_assessment_campaign_institution
        ON AssessmentCampaign(institutionId);
      CREATE INDEX IF NOT EXISTS idx_assessment_campaign_status
        ON AssessmentCampaign(status);

      CREATE TABLE IF NOT EXISTS AssessmentScope (
        id TEXT PRIMARY KEY NOT NULL,
        campaignId TEXT NOT NULL,
        processId TEXT NOT NULL,
        riskId TEXT,
        controlId TEXT,
        assessorName TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Not Started',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assessment_scope_campaign
        ON AssessmentScope(campaignId);
      CREATE INDEX IF NOT EXISTS idx_assessment_scope_process
        ON AssessmentScope(processId);
      CREATE INDEX IF NOT EXISTS idx_assessment_scope_risk
        ON AssessmentScope(riskId);
      CREATE INDEX IF NOT EXISTS idx_assessment_scope_control
        ON AssessmentScope(controlId);

      CREATE TABLE IF NOT EXISTS AssessmentResponse (
        id TEXT PRIMARY KEY NOT NULL,
        scopeId TEXT NOT NULL UNIQUE,
        campaignId TEXT NOT NULL,
        processId TEXT NOT NULL,
        riskId TEXT,
        controlId TEXT,
        assessorName TEXT NOT NULL,
        designEffectiveness TEXT NOT NULL DEFAULT 'Not Assessed',
        operatingEffectiveness TEXT NOT NULL DEFAULT 'Not Assessed',
        evidenceQuality TEXT NOT NULL DEFAULT 'Not Assessed',
        residualLikelihood INTEGER NOT NULL DEFAULT 1,
        residualImpact INTEGER NOT NULL DEFAULT 1,
        residualScore INTEGER NOT NULL DEFAULT 1,
        residualRating TEXT NOT NULL DEFAULT 'Low',
        csaConclusion TEXT NOT NULL DEFAULT 'Not Assessed',
        confidenceLevel TEXT NOT NULL DEFAULT 'Medium',
        controlPerformed INTEGER NOT NULL DEFAULT 1,
        exceptionIdentified INTEGER NOT NULL DEFAULT 0,
        evidenceRef TEXT,
        comments TEXT,
        actionRequired INTEGER NOT NULL DEFAULT 0,
        actionOwner TEXT,
        actionDueDate TEXT,
        reviewerName TEXT,
        reviewStatus TEXT NOT NULL DEFAULT 'Pending Review',
        reviewNotes TEXT,
        submittedAt TEXT NOT NULL,
        reviewedAt TEXT,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assessment_response_campaign
        ON AssessmentResponse(campaignId);
      CREATE INDEX IF NOT EXISTS idx_assessment_response_control
        ON AssessmentResponse(controlId);
      CREATE INDEX IF NOT EXISTS idx_assessment_response_risk
        ON AssessmentResponse(riskId);

      CREATE TABLE IF NOT EXISTS AssuranceTask (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        assigneeName TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Medium',
        status TEXT NOT NULL DEFAULT 'Open',
        link TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assurance_task_institution
        ON AssuranceTask(institutionId);
      CREATE INDEX IF NOT EXISTS idx_assurance_task_source
        ON AssuranceTask(sourceType, sourceId);
      CREATE INDEX IF NOT EXISTS idx_assurance_task_status
        ON AssuranceTask(status);
    `);

    return db;
  })().catch(error => {
    rcsaSchemaReadyByBinding.delete(databaseBinding);
    throw error;
  });

  rcsaSchemaReadyByBinding.set(databaseBinding, schemaPromise);
  return schemaPromise;
}

async function primaryInstitution(db: D1DatabaseLike) {
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1'
  );
}

async function writeAudit(
  db: D1DatabaseLike,
  institutionId: string,
  action: string,
  entityType: string,
  recordId: string,
  newValue: unknown,
  reason: string,
  oldValue?: unknown
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id, institutionId, userName, userRole, action, entityType, recordId,
      oldValue, newValue, reason, ipAddress, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      institutionId,
      'System',
      'System',
      action,
      entityType,
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      reason,
      null,
      nowIso()
    ]
  );
}

async function upsertTask(
  db: D1DatabaseLike,
  input: {
    institutionId: string;
    sourceType: string;
    sourceId: string;
    type: string;
    title: string;
    description?: string | null;
    assigneeName: string;
    dueDate: string;
    priority?: string;
    status?: string;
    link?: string | null;
  }
) {
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssuranceTask WHERE sourceType = ? AND sourceId = ? LIMIT 1',
    [input.sourceType, input.sourceId]
  );
  const now = nowIso();

  if (existing) {
    await run(
      db,
      `UPDATE AssuranceTask
          SET type = ?, title = ?, description = ?, assigneeName = ?, dueDate = ?,
              priority = ?, status = ?, link = ?, updatedAt = ?
        WHERE id = ?`,
      [
        input.type,
        input.title,
        clean(input.description),
        input.assigneeName,
        input.dueDate,
        input.priority || 'Medium',
        input.status || 'Open',
        clean(input.link),
        now,
        existing.id
      ]
    );
    return String(existing.id);
  }

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO AssuranceTask (
      id, institutionId, sourceType, sourceId, type, title, description,
      assigneeName, dueDate, priority, status, link, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.institutionId,
      input.sourceType,
      input.sourceId,
      input.type,
      input.title,
      clean(input.description),
      input.assigneeName,
      input.dueDate,
      input.priority || 'Medium',
      input.status || 'Open',
      clean(input.link),
      now,
      now
    ]
  );
  return id;
}

async function loadScope(db: D1DatabaseLike, row: Record<string, unknown>) {
  const [process, risk, control, response] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      'SELECT id, processId, name, ownerName, criticality, classification FROM BusinessProcess WHERE id = ? LIMIT 1',
      [row.processId]
    ),
    row.riskId
      ? first<Record<string, unknown>>(
          db,
          `SELECT id, riskId, name, category, ownerName,
                  inherentLikelihood, inherentImpact, inherentScore, inherentRating,
                  residualLikelihood, residualImpact, residualScore, residualRating
             FROM RiskMaster WHERE id = ? LIMIT 1`,
          [row.riskId]
        )
      : Promise.resolve(null),
    row.controlId
      ? first<Record<string, unknown>>(
          db,
          `SELECT id, controlId, name, objective, controlOwner, type, nature, frequency,
                  isKeyControl, isIcofrKey, designAssessment, operatingStatus, overallHealth
             FROM ControlMaster WHERE id = ? LIMIT 1`,
          [row.controlId]
        )
      : Promise.resolve(null),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM AssessmentResponse WHERE scopeId = ? LIMIT 1',
      [row.id]
    )
  ]);

  return {
    ...row,
    process,
    risk,
    control: control
      ? {
          ...control,
          isKeyControl: bool(control.isKeyControl),
          isIcofrKey: bool(control.isIcofrKey)
        }
      : null,
    response: response
      ? {
          ...response,
          residualLikelihood: Number(response.residualLikelihood || 0),
          residualImpact: Number(response.residualImpact || 0),
          residualScore: Number(response.residualScore || 0),
          controlPerformed: bool(response.controlPerformed),
          exceptionIdentified: bool(response.exceptionIdentified),
          actionRequired: bool(response.actionRequired)
        }
      : null
  };
}

async function loadCampaign(db: D1DatabaseLike, row: Record<string, unknown>) {
  const scopeRows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentScope WHERE campaignId = ? ORDER BY dueDate ASC, createdAt ASC',
    [row.id]
  );
  const scopes: any[] = await Promise.all(scopeRows.map(scope => loadScope(db, scope)));
  const total = scopes.length;
  const submitted = scopes.filter(scope =>
    ['Submitted', 'Reviewed', 'Approved'].includes(String(scope.status))
  ).length;
  const approved = scopes.filter(scope => String(scope.status) === 'Approved').length;
  const actions = scopes.filter(scope => Boolean((scope.response as any)?.actionRequired)).length;

  return {
    ...row,
    evidenceRequired: bool(row.evidenceRequired),
    scopes,
    metrics: {
      total,
      submitted,
      approved,
      actions,
      completionPercent: total === 0 ? 0 : Math.round((submitted / total) * 100)
    }
  };
}

export async function getRcsaWorkspaceData() {
  const db = await ensureRcsaSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      campaigns: [],
      processes: [],
      risks: [],
      controls: [],
      tasks: []
    };
  }

  const [campaignRows, processes, risks, controls, mappings, taskRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM AssessmentCampaign WHERE institutionId = ? ORDER BY startDate DESC, createdAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT id, processId, name, ownerName, criticality, classification, status
         FROM BusinessProcess
        WHERE institutionId = ?
        ORDER BY processId ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT id, processId, riskId, name, category, ownerName,
              inherentLikelihood, inherentImpact, inherentScore, inherentRating,
              residualLikelihood, residualImpact, residualScore, residualRating, status
         FROM RiskMaster
        WHERE institutionId = ?
        ORDER BY riskId ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT id, processId, controlId, name, objective, controlOwner, type, nature, frequency,
              isKeyControl, isIcofrKey, designAssessment, operatingStatus, overallHealth, status
         FROM ControlMaster
        WHERE institutionId = ?
        ORDER BY controlId ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(db, 'SELECT controlId, riskId FROM ControlRiskMapping'),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM AssuranceTask WHERE institutionId = ? ORDER BY dueDate ASC, createdAt DESC',
      [institution.id]
    )
  ]);

  const riskIdsByControl = new Map<string, string[]>();
  for (const mapping of mappings) {
    const controlId = String(mapping.controlId);
    const list = riskIdsByControl.get(controlId) || [];
    list.push(String(mapping.riskId));
    riskIdsByControl.set(controlId, list);
  }

  const campaigns = await Promise.all(campaignRows.map(row => loadCampaign(db, row)));

  return {
    institution,
    campaigns,
    processes,
    risks: risks.map(risk => ({
      ...risk,
      inherentLikelihood: Number(risk.inherentLikelihood || 0),
      inherentImpact: Number(risk.inherentImpact || 0),
      inherentScore: Number(risk.inherentScore || 0),
      residualLikelihood: Number(risk.residualLikelihood || 0),
      residualImpact: Number(risk.residualImpact || 0),
      residualScore: Number(risk.residualScore || 0)
    })),
    controls: controls.map(control => ({
      ...control,
      isKeyControl: bool(control.isKeyControl),
      isIcofrKey: bool(control.isIcofrKey),
      riskIds: riskIdsByControl.get(String(control.id)) || []
    })),
    tasks: taskRows.map(task => ({
      ...task,
      user: { name: task.assigneeName }
    }))
  };
}

async function insertScope(
  db: D1DatabaseLike,
  institutionId: string,
  campaign: Record<string, unknown>,
  input: {
    processId: string;
    riskId?: string | null;
    controlId?: string | null;
    assessorName: string;
    dueDate?: string | null;
  }
) {
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.processId, institutionId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  let risk: Record<string, unknown> | null = null;
  if (input.riskId) {
    risk = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM RiskMaster WHERE id = ? AND institutionId = ? LIMIT 1',
      [input.riskId, institutionId]
    );
    if (!risk) throw new Error('RISK_NOT_FOUND');
    if (String(risk.processId) !== String(process.id)) throw new Error('RISK_PROCESS_MISMATCH');
  }

  let control: Record<string, unknown> | null = null;
  if (input.controlId) {
    control = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
      [input.controlId, institutionId]
    );
    if (!control) throw new Error('CONTROL_NOT_FOUND');
    if (String(control.processId) !== String(process.id)) {
      throw new Error('CONTROL_PROCESS_MISMATCH');
    }
  }

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM AssessmentScope
      WHERE campaignId = ?
        AND processId = ?
        AND COALESCE(riskId, '') = ?
        AND COALESCE(controlId, '') = ?
      LIMIT 1`,
    [campaign.id, process.id, risk ? String(risk.id) : '', control ? String(control.id) : '']
  );
  if (duplicate) throw new Error('ASSESSMENT_SCOPE_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();
  const dueDate = input.dueDate || String(campaign.dueDate);

  await run(
    db,
    `INSERT INTO AssessmentScope (
      id, campaignId, processId, riskId, controlId, assessorName,
      dueDate, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Started', ?, ?)`,
    [
      id,
      campaign.id,
      process.id,
      risk ? risk.id : null,
      control ? control.id : null,
      input.assessorName,
      dueDate,
      now,
      now
    ]
  );

  await upsertTask(db, {
    institutionId,
    sourceType: 'RCSA_SCOPE',
    sourceId: id,
    type: String(campaign.type) + ' Assessment',
    title:
      String(campaign.campaignCode) +
      ' · ' +
      String(control?.controlId || risk?.riskId || process.processId),
    description:
      'Complete assessment for ' +
      String(control?.name || risk?.name || process.name) +
      ' and submit evidence before the due date.',
    assigneeName: input.assessorName,
    dueDate,
    priority: control?.isKeyControl === 1 ? 'High' : 'Medium',
    status: String(campaign.status) === 'Draft' ? 'Pending' : 'Open',
    link: '/rcsa'
  });

  const created = {
    id,
    campaignId: campaign.id,
    processId: process.id,
    riskId: risk ? risk.id : null,
    controlId: control ? control.id : null,
    assessorName: input.assessorName,
    dueDate,
    status: 'Not Started',
    createdAt: now,
    updatedAt: now
  };

  await writeAudit(
    db,
    institutionId,
    'CREATE',
    'AssessmentScope',
    id,
    created,
    'RCSA/CSA assessment scope created and connected to process, risk, control, and Task Center.'
  );

  return created;
}

export async function createAssessmentCampaign(input: {
  campaignCode?: string | null;
  name: string;
  type: string;
  period: string;
  frequency: string;
  startDate: string;
  dueDate: string;
  ownerName: string;
  reviewerName: string;
  approverName: string;
  methodology: string;
  ratingScale: string;
  evidenceRequired: boolean;
  instructions?: string | null;
  status: string;
  initialScope?: {
    processId: string;
    riskId?: string | null;
    controlId?: string | null;
    assessorName: string;
    dueDate?: string | null;
  } | null;
}) {
  const db = await ensureRcsaSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  if (new Date(input.startDate).getTime() > new Date(input.dueDate).getTime()) {
    throw new Error('INVALID_CAMPAIGN_DATES');
  }

  const type = ['RCSA', 'CSA', 'Combined'].includes(input.type) ? input.type : 'RCSA';
  const status = ['Draft', 'Open'].includes(input.status) ? input.status : 'Draft';
  const code =
    input.campaignCode?.trim() ||
    type.replace('Combined', 'RCSA') +
      '-' +
      new Date(input.startDate).getFullYear() +
      '-' +
      crypto.randomUUID().slice(0, 6).toUpperCase();

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM AssessmentCampaign WHERE institutionId = ? AND campaignCode = ? LIMIT 1',
    [institution.id, code]
  );
  if (duplicate) throw new Error('CAMPAIGN_CODE_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();
  const campaign = {
    id,
    institutionId: institution.id,
    campaignCode: code,
    name: input.name,
    type,
    period: input.period,
    frequency: input.frequency,
    startDate: input.startDate,
    dueDate: input.dueDate,
    ownerName: input.ownerName,
    reviewerName: input.reviewerName,
    approverName: input.approverName,
    methodology: input.methodology || 'COSO / ISO 31000 aligned',
    ratingScale: input.ratingScale || '5x5',
    evidenceRequired: input.evidenceRequired,
    instructions: clean(input.instructions),
    status,
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO AssessmentCampaign (
      id, institutionId, campaignCode, name, type, period, frequency, startDate,
      dueDate, ownerName, reviewerName, approverName, methodology, ratingScale,
      evidenceRequired, instructions, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      institution.id,
      code,
      input.name,
      type,
      input.period,
      input.frequency,
      input.startDate,
      input.dueDate,
      input.ownerName,
      input.reviewerName,
      input.approverName,
      campaign.methodology,
      campaign.ratingScale,
      input.evidenceRequired ? 1 : 0,
      campaign.instructions,
      status,
      now,
      now
    ]
  );

  await writeAudit(
    db,
    String(institution.id),
    'CREATE',
    'AssessmentCampaign',
    id,
    campaign,
    'RCSA/CSA campaign created in persistent D1.'
  );

  if (input.initialScope?.processId && input.initialScope.assessorName) {
    await insertScope(db, String(institution.id), campaign, input.initialScope);
  }

  return loadCampaign(db, campaign);
}

export async function addAssessmentScope(input: {
  campaignId: string;
  processId: string;
  riskId?: string | null;
  controlId?: string | null;
  assessorName: string;
  dueDate?: string | null;
}) {
  const db = await ensureRcsaSchema();
  const campaign = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentCampaign WHERE id = ? LIMIT 1',
    [input.campaignId]
  );
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
  if (String(campaign.status) === 'Closed') throw new Error('CAMPAIGN_CLOSED');

  return insertScope(db, String(campaign.institutionId), campaign, input);
}

export async function submitAssessmentResponse(input: {
  scopeId: string;
  assessorName: string;
  designEffectiveness: string;
  operatingEffectiveness: string;
  evidenceQuality: string;
  residualLikelihood: number;
  residualImpact: number;
  csaConclusion: string;
  confidenceLevel: string;
  controlPerformed: boolean;
  exceptionIdentified: boolean;
  evidenceRef?: string | null;
  comments?: string | null;
  actionRequired: boolean;
  actionOwner?: string | null;
  actionDueDate?: string | null;
}) {
  const db = await ensureRcsaSchema();
  const scope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentScope WHERE id = ? LIMIT 1',
    [input.scopeId]
  );
  if (!scope) throw new Error('ASSESSMENT_SCOPE_NOT_FOUND');

  const campaign = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentCampaign WHERE id = ? LIMIT 1',
    [scope.campaignId]
  );
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');
  if (String(campaign.status) === 'Closed') throw new Error('CAMPAIGN_CLOSED');

  if (bool(campaign.evidenceRequired) && !clean(input.evidenceRef) && input.csaConclusion !== 'Not Applicable') {
    throw new Error('EVIDENCE_REQUIRED');
  }
  if (input.actionRequired && (!clean(input.actionOwner) || !clean(input.actionDueDate))) {
    throw new Error('ACTION_FIELDS_REQUIRED');
  }
  if (
    !Number.isInteger(input.residualLikelihood) ||
    input.residualLikelihood < 1 ||
    input.residualLikelihood > 5 ||
    !Number.isInteger(input.residualImpact) ||
    input.residualImpact < 1 ||
    input.residualImpact > 5
  ) {
    throw new Error('INVALID_RESIDUAL_RATING');
  }

  const residualScore = input.residualLikelihood * input.residualImpact;
  const residualRating = scoreRating(residualScore);
  const now = nowIso();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentResponse WHERE scopeId = ? LIMIT 1',
    [scope.id]
  );
  const id = existing ? String(existing.id) : crypto.randomUUID();

  const response = {
    id,
    scopeId: scope.id,
    campaignId: scope.campaignId,
    processId: scope.processId,
    riskId: scope.riskId || null,
    controlId: scope.controlId || null,
    assessorName: input.assessorName,
    designEffectiveness: normalizeEffectiveness(input.designEffectiveness),
    operatingEffectiveness: normalizeEffectiveness(input.operatingEffectiveness),
    evidenceQuality: ['Strong', 'Adequate', 'Limited', 'None'].includes(input.evidenceQuality)
      ? input.evidenceQuality
      : 'Not Assessed',
    residualLikelihood: input.residualLikelihood,
    residualImpact: input.residualImpact,
    residualScore,
    residualRating,
    csaConclusion: normalizeEffectiveness(input.csaConclusion),
    confidenceLevel: ['High', 'Medium', 'Low'].includes(input.confidenceLevel)
      ? input.confidenceLevel
      : 'Medium',
    controlPerformed: input.controlPerformed,
    exceptionIdentified: input.exceptionIdentified,
    evidenceRef: clean(input.evidenceRef),
    comments: clean(input.comments),
    actionRequired: input.actionRequired,
    actionOwner: input.actionRequired ? clean(input.actionOwner) : null,
    actionDueDate: input.actionRequired ? clean(input.actionDueDate) : null,
    reviewerName: null,
    reviewStatus: 'Pending Review',
    reviewNotes: null,
    submittedAt: now,
    reviewedAt: null,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE AssessmentResponse SET
        assessorName = ?, designEffectiveness = ?, operatingEffectiveness = ?,
        evidenceQuality = ?, residualLikelihood = ?, residualImpact = ?,
        residualScore = ?, residualRating = ?, csaConclusion = ?, confidenceLevel = ?,
        controlPerformed = ?, exceptionIdentified = ?, evidenceRef = ?, comments = ?,
        actionRequired = ?, actionOwner = ?, actionDueDate = ?,
        reviewerName = NULL, reviewStatus = 'Pending Review', reviewNotes = NULL,
        submittedAt = ?, reviewedAt = NULL, updatedAt = ?
       WHERE id = ?`,
      [
        response.assessorName,
        response.designEffectiveness,
        response.operatingEffectiveness,
        response.evidenceQuality,
        response.residualLikelihood,
        response.residualImpact,
        response.residualScore,
        response.residualRating,
        response.csaConclusion,
        response.confidenceLevel,
        response.controlPerformed ? 1 : 0,
        response.exceptionIdentified ? 1 : 0,
        response.evidenceRef,
        response.comments,
        response.actionRequired ? 1 : 0,
        response.actionOwner,
        response.actionDueDate,
        response.submittedAt,
        response.updatedAt,
        id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO AssessmentResponse (
        id, scopeId, campaignId, processId, riskId, controlId, assessorName,
        designEffectiveness, operatingEffectiveness, evidenceQuality,
        residualLikelihood, residualImpact, residualScore, residualRating,
        csaConclusion, confidenceLevel, controlPerformed, exceptionIdentified,
        evidenceRef, comments, actionRequired, actionOwner, actionDueDate,
        reviewerName, reviewStatus, reviewNotes, submittedAt, reviewedAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'Pending Review', NULL, ?, NULL, ?)`,
      [
        id,
        response.scopeId,
        response.campaignId,
        response.processId,
        response.riskId,
        response.controlId,
        response.assessorName,
        response.designEffectiveness,
        response.operatingEffectiveness,
        response.evidenceQuality,
        response.residualLikelihood,
        response.residualImpact,
        response.residualScore,
        response.residualRating,
        response.csaConclusion,
        response.confidenceLevel,
        response.controlPerformed ? 1 : 0,
        response.exceptionIdentified ? 1 : 0,
        response.evidenceRef,
        response.comments,
        response.actionRequired ? 1 : 0,
        response.actionOwner,
        response.actionDueDate,
        response.submittedAt,
        response.updatedAt
      ]
    );
  }

  await run(
    db,
    "UPDATE AssessmentScope SET status = 'Submitted', updatedAt = ? WHERE id = ?",
    [now, scope.id]
  );
  await run(
    db,
    "UPDATE AssessmentCampaign SET status = CASE WHEN status = 'Open' THEN 'In Review' ELSE status END, updatedAt = ? WHERE id = ?",
    [now, campaign.id]
  );
  await run(
    db,
    "UPDATE AssuranceTask SET status = 'Completed', updatedAt = ? WHERE sourceType = 'RCSA_SCOPE' AND sourceId = ?",
    [now, scope.id]
  );

  await upsertTask(db, {
    institutionId: String(campaign.institutionId),
    sourceType: 'RCSA_REVIEW',
    sourceId: id,
    type: 'RCSA Review',
    title: String(campaign.campaignCode) + ' · Review submitted assessment',
    description: 'Review self-assessment evidence, conclusion, and residual risk before approval.',
    assigneeName: String(campaign.reviewerName),
    dueDate: String(campaign.dueDate),
    priority: response.csaConclusion === 'Ineffective' ? 'High' : 'Medium',
    status: 'Open',
    link: '/rcsa'
  });

  if (response.actionRequired && response.actionOwner && response.actionDueDate) {
    await upsertTask(db, {
      institutionId: String(campaign.institutionId),
      sourceType: 'RCSA_ACTION',
      sourceId: id,
      type: 'RCSA Action',
      title: String(campaign.campaignCode) + ' · Remediation required',
      description:
        response.comments ||
        'Assessment identified a gap requiring remediation and management follow-up.',
      assigneeName: response.actionOwner,
      dueDate: response.actionDueDate,
      priority: response.csaConclusion === 'Ineffective' ? 'High' : 'Medium',
      status: 'Open',
      link: '/rcsa'
    });
  }

  await writeAudit(
    db,
    String(campaign.institutionId),
    existing ? 'UPDATE' : 'CREATE',
    'AssessmentResponse',
    id,
    response,
    'RCSA/CSA assessment submitted, review task created, and action task generated when remediation is required.',
    existing || undefined
  );

  return response;
}

export async function reviewAssessmentResponse(input: {
  responseId: string;
  reviewerName: string;
  reviewStatus: string;
  reviewNotes?: string | null;
}) {
  const db = await ensureRcsaSchema();
  const response = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentResponse WHERE id = ? LIMIT 1',
    [input.responseId]
  );
  if (!response) throw new Error('ASSESSMENT_RESPONSE_NOT_FOUND');

  const campaign = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentCampaign WHERE id = ? LIMIT 1',
    [response.campaignId]
  );
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

  const reviewStatus = ['Approved', 'Needs Revision'].includes(input.reviewStatus)
    ? input.reviewStatus
    : 'Needs Revision';
  const now = nowIso();

  await run(
    db,
    `UPDATE AssessmentResponse
        SET reviewerName = ?, reviewStatus = ?, reviewNotes = ?, reviewedAt = ?, updatedAt = ?
      WHERE id = ?`,
    [input.reviewerName, reviewStatus, clean(input.reviewNotes), now, now, response.id]
  );

  await run(
    db,
    'UPDATE AssessmentScope SET status = ?, updatedAt = ? WHERE id = ?',
    [reviewStatus === 'Approved' ? 'Approved' : 'Needs Revision', now, response.scopeId]
  );

  await run(
    db,
    "UPDATE AssuranceTask SET status = 'Completed', updatedAt = ? WHERE sourceType = 'RCSA_REVIEW' AND sourceId = ?",
    [now, response.id]
  );

  if (reviewStatus === 'Needs Revision') {
    await run(
      db,
      "UPDATE AssuranceTask SET status = 'Open', updatedAt = ? WHERE sourceType = 'RCSA_SCOPE' AND sourceId = ?",
      [now, response.scopeId]
    );
  }

  if (reviewStatus === 'Approved') {
    if (response.controlId) {
      await run(
        db,
        `UPDATE ControlMaster
            SET designAssessment = ?, operatingStatus = ?, overallHealth = ?,
                healthRationale = ?, updatedAt = ?
          WHERE id = ?`,
        [
          normalizeEffectiveness(String(response.designEffectiveness)),
          normalizeEffectiveness(String(response.operatingEffectiveness)),
          normalizeEffectiveness(String(response.csaConclusion)),
          clean(input.reviewNotes) || clean(response.comments),
          now,
          response.controlId
        ]
      );
    }

    if (response.riskId) {
      await run(
        db,
        `UPDATE RiskMaster
            SET residualLikelihood = ?, residualImpact = ?, residualScore = ?,
                residualRating = ?, updatedAt = ?
          WHERE id = ?`,
        [
          Number(response.residualLikelihood || 1),
          Number(response.residualImpact || 1),
          Number(response.residualScore || 1),
          response.residualRating,
          now,
          response.riskId
        ]
      );
    }
  }

  const pending = await first<{ count?: number }>(
    db,
    `SELECT COUNT(*) AS count
       FROM AssessmentScope
      WHERE campaignId = ? AND status <> 'Approved'`,
    [campaign.id]
  );
  if (Number(pending?.count || 0) === 0) {
    await run(
      db,
      "UPDATE AssessmentCampaign SET status = 'Closed', updatedAt = ? WHERE id = ?",
      [now, campaign.id]
    );
  }

  const updated = {
    ...response,
    reviewerName: input.reviewerName,
    reviewStatus,
    reviewNotes: clean(input.reviewNotes),
    reviewedAt: now,
    updatedAt: now
  };

  await writeAudit(
    db,
    String(campaign.institutionId),
    'REVIEW',
    'AssessmentResponse',
    String(response.id),
    updated,
    reviewStatus === 'Approved'
      ? 'Assessment approved; approved residual risk and control effectiveness synchronized to Risk and Control Master.'
      : 'Assessment returned for revision and assessor task reopened.',
    response
  );

  return updated;
}

export async function updateAssessmentCampaignStatus(input: {
  campaignId: string;
  status: string;
}) {
  const db = await ensureRcsaSchema();
  const campaign = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentCampaign WHERE id = ? LIMIT 1',
    [input.campaignId]
  );
  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

  const status = ['Draft', 'Open', 'In Review', 'Closed'].includes(input.status)
    ? input.status
    : String(campaign.status);
  const now = nowIso();

  await run(
    db,
    'UPDATE AssessmentCampaign SET status = ?, updatedAt = ? WHERE id = ?',
    [status, now, campaign.id]
  );

  if (status === 'Open') {
    await run(
      db,
      "UPDATE AssuranceTask SET status = CASE WHEN status = 'Pending' THEN 'Open' ELSE status END, updatedAt = ? WHERE sourceType = 'RCSA_SCOPE' AND sourceId IN (SELECT id FROM AssessmentScope WHERE campaignId = ?)",
      [now, campaign.id]
    );
  }

  const updated = { ...campaign, status, updatedAt: now };
  await writeAudit(
    db,
    String(campaign.institutionId),
    'UPDATE',
    'AssessmentCampaign',
    String(campaign.id),
    updated,
    'Assessment campaign lifecycle status updated.',
    campaign
  );

  return updated;
}
