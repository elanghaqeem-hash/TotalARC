import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';
import { ensureAssuranceSchema, addToeSample, updateToeSample, createTestingExceptionFromSample } from '@/lib/d1-assurance';
import { ensureIcofrExecutiveReportingSchema, savePbcRequest } from '@/lib/d1-icofr-executive-reporting';
import { assertIcofrPeriodWritable } from '@/lib/d1-icofr-period-lock';

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

const METHODS = [
  'Reproducible Random',
  'Systematic',
  'High Value + Systematic',
  'Manual / Judgmental'
] as const;

const EVIDENCE_STATUSES = ['Missing', 'Requested', 'Received', 'Incomplete', 'Complete'] as const;
const EVIDENCE_REVIEWS = ['Pending', 'Accepted', 'Rejected'] as const;

async function getDb(): Promise<D1DatabaseLike> {
  await Promise.all([
    ensureCoreDomainSchema(),
    ensureIcofrTestingPlanSchema(),
    ensureIcofrTraceabilitySchema(),
    ensureAssuranceSchema(),
    ensureIcofrExecutiveReportingSchema()
  ]);

  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function executeSchema(db: D1DatabaseLike, script: string) {
  await db.exec(script);
}

async function all<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql);
  const result = values.length ? await stmt.bind(...values).all<T>() : await stmt.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).first<T>() : stmt.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).run() : stmt.run();
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
  return value === true || value === 1 || value === '1';
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrSamplingEvidenceSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRSamplingPlan (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        cycleId TEXT NOT NULL,
        planItemId TEXT NOT NULL,
        toeTestId TEXT NOT NULL,
        controlDomainId TEXT NOT NULL,
        period TEXT NOT NULL,
        controlFrequency TEXT,
        riskRating TEXT,
        testingStrategy TEXT,
        populationSize INTEGER NOT NULL,
        populationSource TEXT NOT NULL,
        recommendedSampleSize INTEGER NOT NULL,
        targetSampleSize INTEGER NOT NULL,
        selectionMethod TEXT NOT NULL,
        selectionSeed TEXT NOT NULL,
        overrideRationale TEXT,
        attributesToTest TEXT,
        populationCompletenessConfirmed INTEGER NOT NULL DEFAULT 0,
        populationCompletenessBasis TEXT,
        preparedBy TEXT NOT NULL,
        reviewerName TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        approvedAt TEXT,
        selectedAt TEXT,
        completedAt TEXT,
        completedBy TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_sampling_plan_item
        ON ICOFRSamplingPlan(institutionId,planItemId);
      CREATE INDEX IF NOT EXISTS idx_icofr_sampling_plan_cycle
        ON ICOFRSamplingPlan(institutionId,cycleId,status);

      CREATE TABLE IF NOT EXISTS ICOFRSamplingCandidate (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        samplingPlanId TEXT NOT NULL,
        transactionRef TEXT NOT NULL,
        transactionDate TEXT NOT NULL,
        amount REAL,
        stratum TEXT,
        sourceRowRef TEXT,
        attributesTested TEXT,
        selected INTEGER NOT NULL DEFAULT 0,
        selectionOrder INTEGER,
        selectionReason TEXT,
        evidenceReference TEXT,
        evidenceType TEXT,
        evidenceStatus TEXT NOT NULL DEFAULT 'Missing',
        evidenceOwner TEXT,
        evidenceReceivedAt TEXT,
        evidenceReviewerDecision TEXT NOT NULL DEFAULT 'Pending',
        evidenceReviewerName TEXT,
        evidenceReviewerNotes TEXT,
        evidenceReviewedAt TEXT,
        toeSampleId TEXT,
        exceptionId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_sampling_candidate_ref
        ON ICOFRSamplingCandidate(samplingPlanId,transactionRef);
      CREATE INDEX IF NOT EXISTS idx_icofr_sampling_candidate_selected
        ON ICOFRSamplingCandidate(samplingPlanId,selected,evidenceStatus);

      CREATE TABLE IF NOT EXISTS ICOFREvidenceRequest (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        samplingPlanId TEXT NOT NULL,
        candidateId TEXT,
        requestNo TEXT NOT NULL,
        requestType TEXT NOT NULL,
        auditorName TEXT,
        description TEXT NOT NULL,
        owner TEXT NOT NULL,
        reviewerName TEXT,
        requestDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Medium',
        status TEXT NOT NULL DEFAULT 'Open',
        evidenceReference TEXT,
        responseNotes TEXT,
        pbcRequestId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_evidence_request_no
        ON ICOFREvidenceRequest(institutionId,requestNo);
      CREATE INDEX IF NOT EXISTS idx_icofr_evidence_request_plan
        ON ICOFREvidenceRequest(samplingPlanId,status,dueDate);
    `);
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

async function primaryInstitution(db: D1DatabaseLike) {
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1'
  );
}

async function audit(
  db: D1DatabaseLike,
  institutionId: string,
  action: string,
  recordId: string,
  newValue: unknown,
  oldValue?: unknown
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id,institutionId,userName,userRole,action,entityType,recordId,
      oldValue,newValue,reason,ipAddress,timestamp
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      institutionId,
      'System',
      'System',
      action,
      'ICOFRSamplingEvidence',
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      'ICOFR sampling planning, reproducible sample selection, evidence completeness, reviewer sign-off and ToE linkage.',
      null,
      nowIso()
    ]
  );
}

function riskRank(value: unknown) {
  const rating = String(value || '').toLowerCase();
  if (rating === 'critical') return 4;
  if (rating === 'high') return 3;
  if (rating === 'medium' || rating === 'moderate') return 2;
  if (rating === 'low') return 1;
  return 0;
}

function frequencyBase(frequencyValue: unknown) {
  const frequency = String(frequencyValue || '').toLowerCase();
  if (frequency.includes('annual') || frequency.includes('year')) return 1;
  if (frequency.includes('quarter')) return 2;
  if (frequency.includes('month')) return 3;
  if (frequency.includes('week')) return 8;
  if (frequency.includes('day')) return 15;
  if (
    frequency.includes('transaction') ||
    frequency.includes('continuous') ||
    frequency.includes('real-time') ||
    frequency.includes('realtime')
  ) {
    return 25;
  }
  return 5;
}

function strategyFactor(strategyValue: unknown) {
  const strategy = String(strategyValue || '').toLowerCase();
  if (strategy.includes('prior-evidence')) return 0.2;
  if (strategy.includes('rotational')) return 0.4;
  if (strategy.includes('roll-forward')) return 0.6;
  return 1;
}

function recommendedSampleSize(input: {
  populationSize: number;
  frequency: unknown;
  riskRating: unknown;
  strategy: unknown;
}) {
  if (input.populationSize <= 0) return 0;
  let size = frequencyBase(input.frequency);

  const risk = riskRank(input.riskRating);
  if (risk >= 4) size = Math.ceil(size * 1.5);
  else if (risk === 3) size = Math.ceil(size * 1.25);
  else if (risk <= 1) size = Math.max(1, Math.ceil(size * 0.75));

  size = Math.max(1, Math.ceil(size * strategyFactor(input.strategy)));
  return Math.min(input.populationSize, size);
}

async function linkedRiskRating(
  db: D1DatabaseLike,
  institutionId: string,
  controlDomainId: string
) {
  const risks = await all<Record<string, unknown>>(
    db,
    `SELECT r.*
       FROM ICOFRTraceabilityLink l
       JOIN RiskMaster r ON r.id=l.sourceId
      WHERE l.institutionId=?
        AND l.sourceType='RISK'
        AND l.targetType='ICOFR_CONTROL'
        AND l.targetId=?
        AND l.relationship='RISK_MITIGATED_BY_CONTROL'`,
    [institutionId, controlDomainId]
  );

  let value: string | null = null;
  let rank = 0;
  for (const risk of risks) {
    for (const rating of [risk.inherentRating, risk.residualRating]) {
      const candidate = riskRank(rating);
      if (candidate > rank) {
        rank = candidate;
        value = String(rating);
      }
    }
  }
  return value;
}

async function planContext(
  db: D1DatabaseLike,
  institutionId: string,
  planItemId: string
) {
  const row = await first<Record<string, unknown>>(
    db,
    `SELECT
        p.*,
        c.institutionId,
        c.scopeId,
        c.cycleName,
        c.fiscalYear,
        c.reportingPeriod,
        c.startDate AS cycleStartDate,
        c.endDate AS cycleEndDate,
        d.controlCode,
        d.name AS controlName,
        d.category,
        d.frequency,
        d.nature,
        d.keyControl,
        d.sourceControlId,
        t.period AS toePeriod,
        t.populationSize AS toePopulationSize,
        t.populationSource AS toePopulationSource,
        t.samplingMethod AS toeSamplingMethod
      FROM ICOFRTestingPlanItem p
      JOIN ICOFRTestingCycle c ON c.id=p.cycleId
      JOIN ICOFRControlDomain d ON d.id=p.controlDomainId
      LEFT JOIN ToETest t ON t.id=p.toeTestId
      WHERE p.id=? AND c.institutionId=?
      LIMIT 1`,
    [planItemId, institutionId]
  );
  return row;
}

export async function saveSamplingPlan(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const planItemId = String(input.planItemId || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();
  const selectionMethod = String(input.selectionMethod || 'Reproducible Random').trim();

  if (!planItemId || !preparedBy || !METHODS.includes(selectionMethod as typeof METHODS[number])) {
    throw new Error('SAMPLING_PLAN_REQUIRED');
  }

  const context = await planContext(db, String(institution.id), planItemId);
  if (!context) throw new Error('PLAN_ITEM_NOT_FOUND');
  if (!context.toeTestId) throw new Error('TOE_NOT_LAUNCHED');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(context.cycleId)
  });

  const populationSize = Number(context.toePopulationSize ?? context.populationSize ?? 0);
  if (!Number.isInteger(populationSize) || populationSize <= 0) {
    throw new Error('POPULATION_REQUIRED');
  }

  const populationSource = String(
    context.toePopulationSource || context.populationSource || ''
  ).trim();
  if (!populationSource) throw new Error('POPULATION_REQUIRED');

  const riskRating = await linkedRiskRating(
    db,
    String(institution.id),
    String(context.controlDomainId)
  );
  const strategy = String(context.testingPhase || context.relianceStrategy || 'Full Retest');
  const recommendation = recommendedSampleSize({
    populationSize,
    frequency: context.frequency,
    riskRating,
    strategy
  });

  const requestedTarget = numberOrNull(input.targetSampleSize);
  const targetSampleSize =
    requestedTarget === null ? recommendation : Math.trunc(requestedTarget);
  if (
    !Number.isInteger(targetSampleSize) ||
    targetSampleSize <= 0 ||
    targetSampleSize > populationSize
  ) {
    throw new Error('INVALID_TARGET_SAMPLE');
  }

  const overrideRationale = clean(input.overrideRationale);
  if (targetSampleSize !== recommendation && !overrideRationale) {
    throw new Error('SAMPLE_OVERRIDE_RATIONALE_REQUIRED');
  }

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  if (existing && ['Approved', 'Selected', 'In Progress', 'Completed'].includes(String(existing.status))) {
    throw new Error('SAMPLING_PLAN_LOCKED');
  }

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRSamplingPlan WHERE institutionId=? AND planItemId=? AND id<>? LIMIT 1',
    [institution.id, planItemId, id]
  );
  if (duplicate) throw new Error('SAMPLING_PLAN_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    cycleId: String(context.cycleId),
    planItemId,
    toeTestId: String(context.toeTestId),
    controlDomainId: String(context.controlDomainId),
    period: String(context.toePeriod || (String(context.fiscalYear) + ' ' + String(context.reportingPeriod))),
    controlFrequency: clean(context.frequency),
    riskRating,
    testingStrategy: strategy,
    populationSize,
    populationSource,
    recommendedSampleSize: recommendation,
    targetSampleSize,
    selectionMethod,
    selectionSeed: String(input.selectionSeed || existing?.selectionSeed || crypto.randomUUID()).trim(),
    overrideRationale,
    attributesToTest: clean(input.attributesToTest),
    populationCompletenessConfirmed: bool(input.populationCompletenessConfirmed),
    populationCompletenessBasis: clean(input.populationCompletenessBasis),
    preparedBy,
    reviewerName: clean(input.reviewerName),
    status: 'Draft',
    approvedAt: null,
    selectedAt: null,
    completedAt: null,
    completedBy: null,
    notes: clean(input.notes),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRSamplingPlan SET
        cycleId=?,planItemId=?,toeTestId=?,controlDomainId=?,period=?,controlFrequency=?,
        riskRating=?,testingStrategy=?,populationSize=?,populationSource=?,
        recommendedSampleSize=?,targetSampleSize=?,selectionMethod=?,selectionSeed=?,
        overrideRationale=?,attributesToTest=?,populationCompletenessConfirmed=?,
        populationCompletenessBasis=?,preparedBy=?,reviewerName=?,notes=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.cycleId,
        record.planItemId,
        record.toeTestId,
        record.controlDomainId,
        record.period,
        record.controlFrequency,
        record.riskRating,
        record.testingStrategy,
        record.populationSize,
        record.populationSource,
        record.recommendedSampleSize,
        record.targetSampleSize,
        record.selectionMethod,
        record.selectionSeed,
        record.overrideRationale,
        record.attributesToTest,
        record.populationCompletenessConfirmed ? 1 : 0,
        record.populationCompletenessBasis,
        record.preparedBy,
        record.reviewerName,
        record.notes,
        record.updatedAt,
        id,
        institution.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRSamplingPlan (
        id,institutionId,cycleId,planItemId,toeTestId,controlDomainId,period,
        controlFrequency,riskRating,testingStrategy,populationSize,populationSource,
        recommendedSampleSize,targetSampleSize,selectionMethod,selectionSeed,
        overrideRationale,attributesToTest,populationCompletenessConfirmed,
        populationCompletenessBasis,preparedBy,reviewerName,status,approvedAt,
        selectedAt,completedAt,completedBy,notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Draft',NULL,NULL,NULL,NULL,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.cycleId,
        record.planItemId,
        record.toeTestId,
        record.controlDomainId,
        record.period,
        record.controlFrequency,
        record.riskRating,
        record.testingStrategy,
        record.populationSize,
        record.populationSource,
        record.recommendedSampleSize,
        record.targetSampleSize,
        record.selectionMethod,
        record.selectionSeed,
        record.overrideRationale,
        record.attributesToTest,
        record.populationCompletenessConfirmed ? 1 : 0,
        record.populationCompletenessBasis,
        record.preparedBy,
        record.reviewerName,
        record.notes,
        record.createdAt,
        record.updatedAt
      ]
    );
  }

  await audit(
    db,
    String(institution.id),
    existing ? 'UPDATE_SAMPLING_PLAN' : 'CREATE_SAMPLING_PLAN',
    id,
    record,
    existing || undefined
  );
  return record;
}

export async function saveSamplingCandidate(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const samplingPlanId = String(input.samplingPlanId || '').trim();
  const transactionRef = String(input.transactionRef || '').trim();
  const transactionDate = String(input.transactionDate || '').trim();
  if (!samplingPlanId || !transactionRef || !transactionDate) {
    throw new Error('CANDIDATE_REQUIRED');
  }

  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');
  if (String(plan.status) !== 'Draft') throw new Error('SAMPLING_POPULATION_LOCKED');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingCandidate WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  if (existing?.toeSampleId) throw new Error('CANDIDATE_SYNCED');

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRSamplingCandidate WHERE samplingPlanId=? AND transactionRef=? AND id<>? LIMIT 1',
    [samplingPlanId, transactionRef, id]
  );
  if (duplicate) throw new Error('CANDIDATE_CONFLICT');

  const amount = numberOrNull(input.amount);
  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    samplingPlanId,
    transactionRef,
    transactionDate,
    amount,
    stratum: clean(input.stratum),
    sourceRowRef: clean(input.sourceRowRef),
    attributesTested: clean(input.attributesTested),
    selected: existing ? bool(existing.selected) : false,
    selectionOrder: existing?.selectionOrder ?? null,
    selectionReason: existing?.selectionReason ?? null,
    evidenceReference: existing?.evidenceReference ?? null,
    evidenceType: existing?.evidenceType ?? null,
    evidenceStatus: existing?.evidenceStatus || 'Missing',
    evidenceOwner: existing?.evidenceOwner ?? null,
    evidenceReceivedAt: existing?.evidenceReceivedAt ?? null,
    evidenceReviewerDecision: existing?.evidenceReviewerDecision || 'Pending',
    evidenceReviewerName: existing?.evidenceReviewerName ?? null,
    evidenceReviewerNotes: existing?.evidenceReviewerNotes ?? null,
    evidenceReviewedAt: existing?.evidenceReviewedAt ?? null,
    toeSampleId: existing?.toeSampleId ?? null,
    exceptionId: existing?.exceptionId ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRSamplingCandidate SET
        transactionRef=?,transactionDate=?,amount=?,stratum=?,sourceRowRef=?,
        attributesTested=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.transactionRef,
        record.transactionDate,
        record.amount,
        record.stratum,
        record.sourceRowRef,
        record.attributesTested,
        now,
        id,
        institution.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRSamplingCandidate (
        id,institutionId,samplingPlanId,transactionRef,transactionDate,amount,stratum,
        sourceRowRef,attributesTested,selected,selectionOrder,selectionReason,
        evidenceReference,evidenceType,evidenceStatus,evidenceOwner,evidenceReceivedAt,
        evidenceReviewerDecision,evidenceReviewerName,evidenceReviewerNotes,
        evidenceReviewedAt,toeSampleId,exceptionId,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,0,NULL,NULL,NULL,NULL,'Missing',NULL,NULL,'Pending',NULL,NULL,NULL,NULL,NULL,?,?)`,
      [
        record.id,
        record.institutionId,
        record.samplingPlanId,
        record.transactionRef,
        record.transactionDate,
        record.amount,
        record.stratum,
        record.sourceRowRef,
        record.attributesTested,
        record.createdAt,
        record.updatedAt
      ]
    );
  }

  await audit(
    db,
    String(institution.id),
    existing ? 'UPDATE_SAMPLE_CANDIDATE' : 'CREATE_SAMPLE_CANDIDATE',
    samplingPlanId,
    record,
    existing || undefined
  );
  return record;
}

export async function removeSamplingCandidate(id: string) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingCandidate WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  if (!existing) throw new Error('CANDIDATE_NOT_FOUND');
  if (existing.toeSampleId || bool(existing.selected)) throw new Error('CANDIDATE_LOCKED');

  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [existing.samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');
  if (String(plan.status) !== 'Draft') throw new Error('SAMPLING_POPULATION_LOCKED');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  await run(db, 'DELETE FROM ICOFRSamplingCandidate WHERE id=? AND institutionId=?', [id, institution.id]);
  await audit(db, String(institution.id), 'DELETE_SAMPLE_CANDIDATE', String(existing.samplingPlanId), { deleted: true }, existing);
  return { success: true };
}

export async function setManualCandidateSelection(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const candidateId = String(input.candidateId || '').trim();
  const selected = bool(input.selected);
  const reason = clean(input.selectionReason);
  if (!candidateId) throw new Error('CANDIDATE_REQUIRED');

  const candidate = await first<Record<string, unknown>>(
    db,
    `SELECT c.*,p.selectionMethod,p.status AS planStatus,p.cycleId
       FROM ICOFRSamplingCandidate c
       JOIN ICOFRSamplingPlan p ON p.id=c.samplingPlanId
      WHERE c.id=? AND c.institutionId=?
      LIMIT 1`,
    [candidateId, institution.id]
  );
  if (!candidate) throw new Error('CANDIDATE_NOT_FOUND');
  if (String(candidate.selectionMethod) !== 'Manual / Judgmental') {
    throw new Error('MANUAL_SELECTION_METHOD_REQUIRED');
  }
  if (!['Draft', 'Approved'].includes(String(candidate.planStatus))) {
    throw new Error('SAMPLING_PLAN_LOCKED');
  }
  if (selected && !reason) throw new Error('MANUAL_SELECTION_REASON_REQUIRED');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(candidate.cycleId)
  });

  await run(
    db,
    `UPDATE ICOFRSamplingCandidate SET
      selected=?,selectionReason=?,selectionOrder=NULL,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [selected ? 1 : 0, selected ? reason : null, nowIso(), candidateId, institution.id]
  );

  return { id: candidateId, selected, selectionReason: selected ? reason : null };
}

export async function approveSamplingPlan(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const samplingPlanId = String(input.samplingPlanId || '').trim();
  const reviewerName = String(input.reviewerName || '').trim();
  const populationCompletenessBasis = String(input.populationCompletenessBasis || '').trim();
  const populationCompletenessConfirmed = bool(input.populationCompletenessConfirmed);

  if (!samplingPlanId || !reviewerName || !populationCompletenessConfirmed || !populationCompletenessBasis) {
    throw new Error('SAMPLING_APPROVAL_REQUIRED');
  }

  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');
  if (String(plan.status) !== 'Draft') throw new Error('SAMPLING_PLAN_LOCKED');
  if (reviewerName.toLowerCase() === String(plan.preparedBy).toLowerCase()) {
    throw new Error('SAMPLING_SELF_REVIEW');
  }

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  const candidateCount = await first<{ count?: number }>(
    db,
    'SELECT COUNT(*) AS count FROM ICOFRSamplingCandidate WHERE samplingPlanId=?',
    [samplingPlanId]
  );
  if (Number(candidateCount?.count || 0) < Number(plan.targetSampleSize || 0)) {
    throw new Error('INSUFFICIENT_CANDIDATES');
  }

  if (String(plan.selectionMethod) === 'Manual / Judgmental') {
    const selectedCount = await first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM ICOFRSamplingCandidate WHERE samplingPlanId=? AND selected=1',
      [samplingPlanId]
    );
    if (Number(selectedCount?.count || 0) !== Number(plan.targetSampleSize || 0)) {
      throw new Error('MANUAL_SELECTION_COUNT');
    }
  }

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRSamplingPlan SET
      populationCompletenessConfirmed=1,populationCompletenessBasis=?,
      reviewerName=?,status='Approved',approvedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [populationCompletenessBasis, reviewerName, now, now, samplingPlanId, institution.id]
  );

  const result = {
    id: samplingPlanId,
    status: 'Approved',
    reviewerName,
    populationCompletenessConfirmed: true,
    populationCompletenessBasis,
    approvedAt: now
  };
  await audit(db, String(institution.id), 'APPROVE_SAMPLING_PLAN', samplingPlanId, result, plan);
  return result;
}

async function hashOrder(seed: string, candidate: Record<string, unknown>) {
  const value = seed + '|' + String(candidate.transactionRef) + '|' + String(candidate.transactionDate);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function systematicPick<T>(rows: T[], count: number) {
  if (count >= rows.length) return rows.map((row, index) => ({ row, order: index + 1 }));
  const result: Array<{ row: T; order: number }> = [];
  const step = rows.length / count;
  const used = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    let selectedIndex = Math.floor(index * step + step / 2);
    while (used.has(selectedIndex) && selectedIndex < rows.length - 1) selectedIndex += 1;
    used.add(selectedIndex);
    result.push({ row: rows[selectedIndex], order: index + 1 });
  }
  return result;
}

export async function selectSamplingCandidates(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const samplingPlanId = String(input.samplingPlanId || '').trim();
  if (!samplingPlanId) throw new Error('SAMPLING_PLAN_NOT_FOUND');

  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');
  if (String(plan.status) !== 'Approved') throw new Error('SAMPLING_NOT_APPROVED');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  const candidates = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingCandidate WHERE samplingPlanId=? ORDER BY transactionDate,transactionRef',
    [samplingPlanId]
  );
  const target = Number(plan.targetSampleSize || 0);
  if (candidates.length < target || target <= 0) throw new Error('INSUFFICIENT_CANDIDATES');

  const method = String(plan.selectionMethod);
  let picks: Array<{ row: Record<string, unknown>; order: number }> = [];

  if (method === 'Manual / Judgmental') {
    const selected = candidates.filter(item => bool(item.selected));
    if (selected.length !== target) throw new Error('MANUAL_SELECTION_COUNT');
    picks = selected.map((row, index) => ({ row, order: index + 1 }));
  } else if (method === 'Reproducible Random') {
    const scored = [];
    for (const row of candidates) {
      scored.push({ row, score: await hashOrder(String(plan.selectionSeed), row) });
    }
    scored.sort((a, b) => a.score.localeCompare(b.score));
    picks = scored.slice(0, target).map((item, index) => ({ row: item.row, order: index + 1 }));
  } else if (method === 'High Value + Systematic') {
    const highCount = Math.min(target, Math.max(1, Math.ceil(target * 0.2)));
    const byAmount = [...candidates].sort(
      (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
    );
    const high = byAmount.slice(0, highCount);
    const highIds = new Set(high.map(item => String(item.id)));
    const remainder = candidates.filter(item => !highIds.has(String(item.id)));
    const rest = systematicPick(remainder, target - high.length).map(item => item.row);
    const combined = [...high, ...rest];
    picks = combined.map((row, index) => ({ row, order: index + 1 }));
  } else {
    picks = systematicPick(candidates, target);
  }

  const pickedIds = new Set(picks.map(item => String(item.row.id)));
  await run(
    db,
    `UPDATE ICOFRSamplingCandidate SET
      selected=0,selectionOrder=NULL,selectionReason=NULL,updatedAt=?
     WHERE samplingPlanId=?`,
    [nowIso(), samplingPlanId]
  );

  for (const pick of picks) {
    const reason =
      method === 'Reproducible Random'
        ? 'Selected by reproducible SHA-256 ordering using the approved sampling-plan seed.'
        : method === 'Systematic'
          ? 'Selected by systematic interval across the registered candidate population.'
          : method === 'High Value + Systematic'
            ? 'Selected through approved high-value plus systematic method.'
            : String(pick.row.selectionReason || 'Manual / judgmental selection approved by reviewer.');

    await run(
      db,
      `UPDATE ICOFRSamplingCandidate SET
        selected=1,selectionOrder=?,selectionReason=?,updatedAt=?
       WHERE id=? AND samplingPlanId=?`,
      [pick.order, reason, nowIso(), pick.row.id, samplingPlanId]
    );
  }

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRSamplingPlan SET status='Selected',selectedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [now, now, samplingPlanId, institution.id]
  );

  const result = {
    id: samplingPlanId,
    method,
    target,
    selected: pickedIds.size,
    selectedAt: now
  };
  await audit(db, String(institution.id), 'SELECT_SAMPLES', samplingPlanId, result, plan);
  return result;
}

export async function saveEvidenceRequest(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const samplingPlanId = String(input.samplingPlanId || '').trim();
  const candidateId = clean(input.candidateId);
  const requestNo = String(input.requestNo || '').trim().toUpperCase();
  const requestType = String(input.requestType || 'Internal Evidence Request').trim();
  const description = String(input.description || '').trim();
  const owner = String(input.owner || '').trim();
  const requestDate = String(input.requestDate || '').trim();
  const dueDate = String(input.dueDate || '').trim();

  if (!samplingPlanId || !requestNo || !description || !owner || !requestDate || !dueDate) {
    throw new Error('EVIDENCE_REQUEST_REQUIRED');
  }
  if (!['Internal Evidence Request', 'External Audit PBC'].includes(requestType)) {
    throw new Error('INVALID_EVIDENCE_REQUEST_TYPE');
  }
  if (dueDate < requestDate) throw new Error('INVALID_EVIDENCE_REQUEST_DATES');

  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  let candidate: Record<string, unknown> | null = null;
  if (candidateId) {
    candidate = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRSamplingCandidate WHERE id=? AND samplingPlanId=? AND institutionId=? LIMIT 1',
      [candidateId, samplingPlanId, institution.id]
    );
    if (!candidate) throw new Error('CANDIDATE_NOT_FOUND');
  }

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFREvidenceRequest WHERE institutionId=? AND requestNo=? LIMIT 1',
    [institution.id, requestNo]
  );
  if (duplicate) throw new Error('EVIDENCE_REQUEST_CONFLICT');

  let pbcRequestId: string | null = null;
  if (requestType === 'External Audit PBC') {
    const auditorName = String(input.auditorName || '').trim();
    if (!auditorName) throw new Error('AUDITOR_REQUIRED');

    const pbc = await savePbcRequest({
      period: plan.period,
      requestNo,
      auditorName,
      category: 'ICOFR Sampling Evidence',
      description,
      relatedType: 'ToE',
      relatedId: plan.toeTestId,
      owner,
      reviewerName: clean(input.reviewerName),
      requestDate,
      dueDate,
      priority: String(input.priority || 'Medium'),
      status: 'Open',
      evidenceReference: null,
      responseNotes:
        candidate
          ? 'Sample candidate ' + String(candidate.transactionRef)
          : 'Sampling plan ' + String(plan.id)
    });
    pbcRequestId = String(pbc.id);
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    samplingPlanId,
    candidateId,
    requestNo,
    requestType,
    auditorName: requestType === 'External Audit PBC' ? clean(input.auditorName) : null,
    description,
    owner,
    reviewerName: clean(input.reviewerName),
    requestDate,
    dueDate,
    priority: String(input.priority || 'Medium'),
    status: 'Open',
    evidenceReference: null,
    responseNotes: null,
    pbcRequestId,
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO ICOFREvidenceRequest (
      id,institutionId,samplingPlanId,candidateId,requestNo,requestType,auditorName,
      description,owner,reviewerName,requestDate,dueDate,priority,status,
      evidenceReference,responseNotes,pbcRequestId,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'Open',NULL,NULL,?,?,?)`,
    [
      record.id,
      record.institutionId,
      record.samplingPlanId,
      record.candidateId,
      record.requestNo,
      record.requestType,
      record.auditorName,
      record.description,
      record.owner,
      record.reviewerName,
      record.requestDate,
      record.dueDate,
      record.priority,
      record.pbcRequestId,
      record.createdAt,
      record.updatedAt
    ]
  );

  if (candidateId) {
    await run(
      db,
      `UPDATE ICOFRSamplingCandidate SET
        evidenceStatus=CASE WHEN evidenceStatus='Missing' THEN 'Requested' ELSE evidenceStatus END,
        evidenceOwner=COALESCE(evidenceOwner,?),updatedAt=?
       WHERE id=?`,
      [owner, now, candidateId]
    );
  }

  await audit(db, String(institution.id), 'CREATE_EVIDENCE_REQUEST', samplingPlanId, record);
  return record;
}

export async function updateEvidenceRequest(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const id = String(input.id || '').trim();
  const status = String(input.status || '').trim();
  const evidenceReference = clean(input.evidenceReference);
  const responseNotes = clean(input.responseNotes);

  if (
    !id ||
    !['Open', 'In Progress', 'Submitted', 'Accepted', 'Closed', 'Cancelled'].includes(status)
  ) {
    throw new Error('EVIDENCE_REQUEST_UPDATE_REQUIRED');
  }
  if (['Submitted', 'Accepted', 'Closed'].includes(status) && !evidenceReference) {
    throw new Error('EVIDENCE_REQUEST_REFERENCE_REQUIRED');
  }

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFREvidenceRequest WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  if (!existing) throw new Error('EVIDENCE_REQUEST_NOT_FOUND');

  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [existing.samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  if (existing.pbcRequestId) {
    const pbc = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRPBCRequest WHERE id=? AND institutionId=? LIMIT 1',
      [existing.pbcRequestId, institution.id]
    );
    if (pbc) {
      await savePbcRequest({
        id: pbc.id,
        period: pbc.period,
        requestNo: pbc.requestNo,
        auditorName: pbc.auditorName,
        category: pbc.category,
        description: pbc.description,
        relatedType: pbc.relatedType,
        relatedId: pbc.relatedId,
        owner: pbc.owner,
        reviewerName: pbc.reviewerName,
        requestDate: pbc.requestDate,
        dueDate: pbc.dueDate,
        priority: pbc.priority,
        status,
        evidenceReference,
        responseNotes
      });
    }
  }

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFREvidenceRequest SET
      status=?,evidenceReference=?,responseNotes=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [status, evidenceReference, responseNotes, now, id, institution.id]
  );

  if (existing.candidateId && evidenceReference) {
    await run(
      db,
      `UPDATE ICOFRSamplingCandidate SET
        evidenceReference=?,
        evidenceStatus=CASE
          WHEN evidenceStatus IN ('Missing','Requested') THEN 'Received'
          ELSE evidenceStatus
        END,
        updatedAt=?
       WHERE id=? AND institutionId=?`,
      [evidenceReference, now, existing.candidateId, institution.id]
    );
  }

  const result = {
    id,
    status,
    evidenceReference,
    responseNotes,
    updatedAt: now
  };
  await audit(
    db,
    String(institution.id),
    'UPDATE_EVIDENCE_REQUEST',
    String(existing.samplingPlanId),
    result,
    existing
  );
  return result;
}

export async function updateCandidateEvidence(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const candidateId = String(input.candidateId || '').trim();
  const evidenceStatus = String(input.evidenceStatus || '').trim();
  const evidenceReviewerDecision = String(input.evidenceReviewerDecision || 'Pending').trim();
  const evidenceReference = clean(input.evidenceReference);
  const evidenceType = clean(input.evidenceType);
  const evidenceOwner = clean(input.evidenceOwner);
  const evidenceReviewerName = clean(input.evidenceReviewerName);
  const evidenceReviewerNotes = clean(input.evidenceReviewerNotes);

  if (
    !candidateId ||
    !EVIDENCE_STATUSES.includes(evidenceStatus as typeof EVIDENCE_STATUSES[number]) ||
    !EVIDENCE_REVIEWS.includes(evidenceReviewerDecision as typeof EVIDENCE_REVIEWS[number])
  ) {
    throw new Error('EVIDENCE_UPDATE_REQUIRED');
  }
  if (['Received', 'Incomplete', 'Complete'].includes(evidenceStatus) && !evidenceReference) {
    throw new Error('EVIDENCE_REFERENCE_REQUIRED');
  }
  if (
    ['Accepted', 'Rejected'].includes(evidenceReviewerDecision) &&
    !evidenceReviewerName
  ) {
    throw new Error('EVIDENCE_REVIEWER_REQUIRED');
  }
  if (evidenceReviewerDecision === 'Rejected' && !evidenceReviewerNotes) {
    throw new Error('EVIDENCE_REJECTION_NOTES_REQUIRED');
  }

  const candidate = await first<Record<string, unknown>>(
    db,
    `SELECT c.*,p.cycleId,p.status AS planStatus
       FROM ICOFRSamplingCandidate c
       JOIN ICOFRSamplingPlan p ON p.id=c.samplingPlanId
      WHERE c.id=? AND c.institutionId=?
      LIMIT 1`,
    [candidateId, institution.id]
  );
  if (!candidate) throw new Error('CANDIDATE_NOT_FOUND');
  if (!bool(candidate.selected)) throw new Error('EVIDENCE_SELECTED_SAMPLE_REQUIRED');
  if (
    ['Accepted', 'Rejected'].includes(evidenceReviewerDecision) &&
    evidenceOwner &&
    evidenceReviewerName &&
    evidenceOwner.toLowerCase() === evidenceReviewerName.toLowerCase()
  ) {
    throw new Error('EVIDENCE_SELF_REVIEW');
  }

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(candidate.cycleId)
  });

  const now = nowIso();
  const receivedAt =
    ['Received', 'Incomplete', 'Complete'].includes(evidenceStatus)
      ? candidate.evidenceReceivedAt || now
      : null;
  const reviewedAt =
    ['Accepted', 'Rejected'].includes(evidenceReviewerDecision) ? now : null;

  await run(
    db,
    `UPDATE ICOFRSamplingCandidate SET
      evidenceReference=?,evidenceType=?,evidenceStatus=?,evidenceOwner=?,
      evidenceReceivedAt=?,evidenceReviewerDecision=?,evidenceReviewerName=?,
      evidenceReviewerNotes=?,evidenceReviewedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      evidenceReference,
      evidenceType,
      evidenceStatus,
      evidenceOwner,
      receivedAt,
      evidenceReviewerDecision,
      evidenceReviewerName,
      evidenceReviewerNotes,
      reviewedAt,
      now,
      candidateId,
      institution.id
    ]
  );

  if (candidate.toeSampleId && evidenceReference) {
    await run(
      db,
      'UPDATE TestSample SET evidenceRef=? WHERE id=?',
      [evidenceReference, candidate.toeSampleId]
    );
  }

  const result = {
    id: candidateId,
    evidenceReference,
    evidenceType,
    evidenceStatus,
    evidenceOwner,
    evidenceReceivedAt: receivedAt,
    evidenceReviewerDecision,
    evidenceReviewerName,
    evidenceReviewerNotes,
    evidenceReviewedAt: reviewedAt
  };
  await audit(db, String(institution.id), 'UPDATE_SAMPLE_EVIDENCE', String(candidate.samplingPlanId), result, candidate);
  return result;
}

export async function syncSelectedSamplesToToe(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const samplingPlanId = String(input.samplingPlanId || '').trim();
  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');
  if (!['Selected', 'In Progress'].includes(String(plan.status))) {
    throw new Error('SAMPLES_NOT_SELECTED');
  }

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  const selected = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRSamplingCandidate
      WHERE samplingPlanId=? AND selected=1
      ORDER BY selectionOrder,transactionDate,transactionRef`,
    [samplingPlanId]
  );

  if (selected.length !== Number(plan.targetSampleSize || 0)) {
    throw new Error('SELECTED_SAMPLE_COUNT_MISMATCH');
  }

  let created = 0;
  let alreadyLinked = 0;
  for (const candidate of selected) {
    if (candidate.toeSampleId) {
      alreadyLinked += 1;
      continue;
    }

    const existingSample = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM TestSample WHERE toeTestId=? AND transactionRef=? LIMIT 1',
      [plan.toeTestId, candidate.transactionRef]
    );

    if (existingSample) {
      await run(
        db,
        'UPDATE ICOFRSamplingCandidate SET toeSampleId=?,updatedAt=? WHERE id=?',
        [existingSample.id, nowIso(), candidate.id]
      );
      alreadyLinked += 1;
      continue;
    }

    const sample = await addToeSample({
      toeTestId: String(plan.toeTestId),
      transactionRef: String(candidate.transactionRef),
      transactionDate: String(candidate.transactionDate),
      amount:
        candidate.amount === null || candidate.amount === undefined
          ? null
          : Number(candidate.amount),
      attributesTested:
        clean(candidate.attributesTested) || clean(plan.attributesToTest),
      evidenceRef: clean(candidate.evidenceReference)
    });

    await run(
      db,
      'UPDATE ICOFRSamplingCandidate SET toeSampleId=?,updatedAt=? WHERE id=?',
      [sample.id, nowIso(), candidate.id]
    );
    created += 1;
  }

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRSamplingPlan SET status='In Progress',updatedAt=?
     WHERE id=? AND institutionId=?`,
    [now, samplingPlanId, institution.id]
  );

  const result = { id: samplingPlanId, created, alreadyLinked, status: 'In Progress' };
  await audit(db, String(institution.id), 'SYNC_SELECTED_SAMPLES_TO_TOE', samplingPlanId, result, plan);
  return result;
}

export async function recordLinkedSampleResult(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const candidateId = String(input.candidateId || '').trim();
  const result = String(input.result || '').trim();
  const failureReason = clean(input.failureReason);
  const raiseException = bool(input.raiseException);
  const severity = String(input.severity || 'High').trim();
  const exceptionDescription = clean(input.exceptionDescription);

  if (!candidateId || !['Pass', 'Fail', 'N/A', 'Not Tested'].includes(result)) {
    throw new Error('SAMPLE_RESULT_REQUIRED');
  }
  if (result === 'Fail' && !failureReason) throw new Error('FAILURE_REASON_REQUIRED');

  const candidate = await first<Record<string, unknown>>(
    db,
    `SELECT c.*,p.toeTestId,p.cycleId,p.id AS planId
       FROM ICOFRSamplingCandidate c
       JOIN ICOFRSamplingPlan p ON p.id=c.samplingPlanId
      WHERE c.id=? AND c.institutionId=?
      LIMIT 1`,
    [candidateId, institution.id]
  );
  if (!candidate) throw new Error('CANDIDATE_NOT_FOUND');
  if (!candidate.toeSampleId) throw new Error('TOE_SAMPLE_NOT_LINKED');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(candidate.cycleId)
  });

  const updated = await updateToeSample({
    sampleId: String(candidate.toeSampleId),
    result,
    failureReason
  });

  let exception = null;
  if (result === 'Fail' && raiseException && !candidate.exceptionId) {
    exception = await createTestingExceptionFromSample({
      toeTestId: String(candidate.toeTestId),
      sampleId: String(candidate.toeSampleId),
      severity,
      description: exceptionDescription || failureReason
    });
    await run(
      db,
      'UPDATE ICOFRSamplingCandidate SET exceptionId=?,updatedAt=? WHERE id=?',
      [exception.id, nowIso(), candidateId]
    );
  }

  const response = {
    candidateId,
    toeSampleId: candidate.toeSampleId,
    result: updated.result,
    failureReason: updated.failureReason,
    exception
  };
  await audit(db, String(institution.id), 'RECORD_LINKED_SAMPLE_RESULT', String(candidate.planId), response, candidate);
  return response;
}

export async function completeSamplingPlan(input: Record<string, unknown>) {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const samplingPlanId = String(input.samplingPlanId || '').trim();
  const completedBy = String(input.completedBy || '').trim();
  if (!samplingPlanId || !completedBy) throw new Error('SAMPLING_COMPLETE_REQUIRED');

  const plan = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
    [samplingPlanId, institution.id]
  );
  if (!plan) throw new Error('SAMPLING_PLAN_NOT_FOUND');
  if (String(plan.status) !== 'In Progress') throw new Error('SAMPLING_NOT_IN_PROGRESS');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(plan.cycleId)
  });

  const selected = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSamplingCandidate WHERE samplingPlanId=? AND selected=1',
    [samplingPlanId]
  );
  if (selected.length !== Number(plan.targetSampleSize || 0)) {
    throw new Error('SELECTED_SAMPLE_COUNT_MISMATCH');
  }

  for (const candidate of selected) {
    if (!candidate.toeSampleId) throw new Error('TOE_SAMPLE_NOT_LINKED');
    if (
      String(candidate.evidenceStatus) !== 'Complete' ||
      String(candidate.evidenceReviewerDecision) !== 'Accepted'
    ) {
      throw new Error('EVIDENCE_REVIEW_PENDING');
    }

    const sample = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM TestSample WHERE id=? LIMIT 1',
      [candidate.toeSampleId]
    );
    if (!sample || String(sample.result) === 'Not Tested') {
      throw new Error('SAMPLE_TESTING_PENDING');
    }
  }

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRSamplingPlan SET status='Completed',completedAt=?,completedBy=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [now, completedBy, now, samplingPlanId, institution.id]
  );

  const result = { id: samplingPlanId, status: 'Completed', completedBy, completedAt: now };
  await audit(db, String(institution.id), 'COMPLETE_SAMPLING_PLAN', samplingPlanId, result, plan);
  return result;
}

export async function getSamplingEvidenceData() {
  const db = await ensureIcofrSamplingEvidenceSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      cycles: [],
      eligiblePlanItems: [],
      samplingPlans: [],
      evidenceRequests: [],
      methods: METHODS,
      metrics: {}
    };
  }

  const [cycles, planItems, controls, samplingPlans, candidates, evidenceRequests, toeTests] =
    await Promise.all([
      all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRTestingCycle WHERE institutionId=? ORDER BY fiscalYear DESC,startDate DESC',
        [institution.id]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT p.*
           FROM ICOFRTestingPlanItem p
           JOIN ICOFRTestingCycle c ON c.id=p.cycleId
          WHERE c.institutionId=? AND p.toeTestId IS NOT NULL
          ORDER BY c.fiscalYear DESC,p.dueDate,p.createdAt`,
        [institution.id]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT * FROM ICOFRControlDomain
          WHERE institutionId=? AND status<>'Retired'
          ORDER BY category,controlCode`,
        [institution.id]
      ),
      all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRSamplingPlan WHERE institutionId=? ORDER BY createdAt DESC',
        [institution.id]
      ),
      all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRSamplingCandidate WHERE institutionId=? ORDER BY transactionDate,transactionRef',
        [institution.id]
      ),
      all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFREvidenceRequest WHERE institutionId=? ORDER BY dueDate,createdAt',
        [institution.id]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT t.*
           FROM ToETest t
           JOIN ControlMaster c ON c.id=t.controlId
          WHERE c.institutionId=?
          ORDER BY t.testedAt DESC`,
        [institution.id]
      )
    ]);

  const testIds = toeTests.map(item => String(item.id));
  const samples = testIds.length
    ? await all<Record<string, unknown>>(
        db,
        `SELECT * FROM TestSample
          WHERE toeTestId IN (${testIds.map(() => '?').join(',')})
          ORDER BY toeTestId,sampleNumber`,
        testIds
      )
    : [];

  const controlById = new Map(controls.map(item => [String(item.id), item]));
  const cycleById = new Map(cycles.map(item => [String(item.id), item]));
  const toeById = new Map(toeTests.map(item => [String(item.id), item]));
  const sampleById = new Map(samples.map(item => [String(item.id), item]));

  const eligiblePlanItems = planItems.map(item => ({
    ...item,
    control: controlById.get(String(item.controlDomainId)) || null,
    cycle: cycleById.get(String(item.cycleId)) || null,
    toe: item.toeTestId ? toeById.get(String(item.toeTestId)) || null : null
  }));

  const enrichedPlans: Array<Record<string, any>> = samplingPlans.map(plan => {
    const planCandidates: Array<
      Record<string, unknown> & {
        selected: boolean;
        toeSample: Record<string, unknown> | null;
      }
    > = candidates
      .filter(item => String(item.samplingPlanId) === String(plan.id))
      .map(candidate => ({
        ...candidate,
        selected: bool(candidate.selected),
        toeSample: candidate.toeSampleId
          ? sampleById.get(String(candidate.toeSampleId)) || null
          : null
      }));
    const requests = evidenceRequests.filter(
      item => String(item.samplingPlanId) === String(plan.id)
    );

    return {
      ...plan,
      populationCompletenessConfirmed: bool(plan.populationCompletenessConfirmed),
      control: controlById.get(String(plan.controlDomainId)) || null,
      cycle: cycleById.get(String(plan.cycleId)) || null,
      toe: toeById.get(String(plan.toeTestId)) || null,
      candidates: planCandidates,
      evidenceRequests: requests,
      summary: {
        candidates: planCandidates.length,
        selected: planCandidates.filter(item => item.selected).length,
        linkedToToe: planCandidates.filter(item => item.selected && item.toeSample).length,
        evidenceComplete: planCandidates.filter(
          item =>
            item.selected &&
            item.evidenceStatus === 'Complete' &&
            item.evidenceReviewerDecision === 'Accepted'
        ).length,
        tested: planCandidates.filter(
          item =>
            item.selected &&
            item.toeSample &&
            String((item.toeSample as Record<string, unknown>).result) !== 'Not Tested'
        ).length,
        failed: planCandidates.filter(
          item =>
            item.selected &&
            item.toeSample &&
            String((item.toeSample as Record<string, unknown>).result) === 'Fail'
        ).length,
        openEvidenceRequests: requests.filter(
          item => !['Accepted', 'Closed', 'Cancelled'].includes(String(item.status))
        ).length
      }
    };
  });

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    cycles,
    eligiblePlanItems,
    samplingPlans: enrichedPlans,
    evidenceRequests,
    methods: METHODS,
    evidenceStatuses: EVIDENCE_STATUSES,
    evidenceReviewDecisions: EVIDENCE_REVIEWS,
    metrics: {
      plans: enrichedPlans.length,
      draft: enrichedPlans.filter(item => item.status === 'Draft').length,
      approved: enrichedPlans.filter(item => item.status === 'Approved').length,
      selected: enrichedPlans.filter(item => item.status === 'Selected').length,
      inProgress: enrichedPlans.filter(item => item.status === 'In Progress').length,
      completed: enrichedPlans.filter(item => item.status === 'Completed').length,
      selectedSamples: enrichedPlans.reduce((sum, item) => sum + Number(item.summary.selected || 0), 0),
      evidenceComplete: enrichedPlans.reduce((sum, item) => sum + Number(item.summary.evidenceComplete || 0), 0),
      failedSamples: enrichedPlans.reduce((sum, item) => sum + Number(item.summary.failed || 0), 0)
    }
  };
}
