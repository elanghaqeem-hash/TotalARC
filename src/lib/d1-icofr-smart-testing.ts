import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import {
  ensureIcofrTestingPlanSchema,
  saveTestingPlanItem
} from '@/lib/d1-icofr-testing-plan';
import { ensureIcofrCoverageSchema } from '@/lib/d1-icofr-coverage';
import { ensureIcofrRollForwardSchema } from '@/lib/d1-icofr-roll-forward';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';
import { assertIcofrPeriodWritable } from '@/lib/d1-icofr-period-lock';

type D1DatabaseLike = {
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

const STRATEGIES = [
  'Full Retest',
  'Roll-Forward Test',
  'Rotational Test',
  'Prior-Evidence Reliance Candidate'
] as const;

const REVIEW_DECISIONS = [
  'Pending',
  'Accept Recommendation',
  'Override',
  'Defer'
] as const;

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
  await ensureIcofrTestingPlanSchema();
  await ensureIcofrCoverageSchema();
  await ensureIcofrRollForwardSchema();
  await ensureAssuranceSchema();
  await ensureIcofrTraceabilitySchema();

  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function executeSchema(db: D1DatabaseLike, script: string) {
  for (const statement of script.split(';').map(item => item.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
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

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrSmartTestingSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRTestingStrategyRun (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        cycleId TEXT NOT NULL,
        scopeId TEXT NOT NULL,
        rollForwardId TEXT,
        policyName TEXT NOT NULL,
        scopeMode TEXT NOT NULL DEFAULT 'Key Controls Only',
        defaultPlannedStartDate TEXT NOT NULL,
        defaultDueDate TEXT NOT NULL,
        defaultTester TEXT NOT NULL,
        defaultReviewer TEXT,
        preparedBy TEXT NOT NULL,
        approvedBy TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        notes TEXT,
        generatedAt TEXT NOT NULL,
        approvedAt TEXT,
        appliedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_strategy_cycle
        ON ICOFRTestingStrategyRun(institutionId,cycleId,generatedAt);
      CREATE INDEX IF NOT EXISTS idx_icofr_strategy_status
        ON ICOFRTestingStrategyRun(institutionId,status,updatedAt);

      CREATE TABLE IF NOT EXISTS ICOFRTestingStrategyDecision (
        id TEXT PRIMARY KEY NOT NULL,
        runId TEXT NOT NULL,
        controlDomainId TEXT NOT NULL,
        proposedStrategy TEXT NOT NULL,
        proposedTestType TEXT NOT NULL,
        priority TEXT NOT NULL,
        rationale TEXT NOT NULL,
        factorsJson TEXT NOT NULL,
        priorToeTestId TEXT,
        priorToeConclusion TEXT,
        priorExceptionCount INTEGER NOT NULL DEFAULT 0,
        priorDeficiencyCount INTEGER NOT NULL DEFAULT 0,
        significantDeficiencyCount INTEGER NOT NULL DEFAULT 0,
        openIssueCount INTEGER NOT NULL DEFAULT 0,
        riskRating TEXT,
        rollForwardChangeFlag TEXT,
        rollForwardDecision TEXT,
        itgcDependencyStatus TEXT,
        reviewerDecision TEXT NOT NULL DEFAULT 'Pending',
        overrideStrategy TEXT,
        reviewerName TEXT,
        reviewerNotes TEXT,
        reviewedAt TEXT,
        planItemId TEXT,
        appliedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_strategy_decision_control
        ON ICOFRTestingStrategyDecision(runId,controlDomainId);
      CREATE INDEX IF NOT EXISTS idx_icofr_strategy_decision_review
        ON ICOFRTestingStrategyDecision(runId,reviewerDecision,priority);
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
      'ICOFRTestingStrategy',
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      'Evidence-based ICOFR testing strategy recommendation, human review and testing-plan integration.',
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

function maxRiskRating(rows: Array<Record<string, unknown>>) {
  let best = '';
  let bestRank = 0;
  for (const row of rows) {
    for (const candidate of [row.inherentRating, row.residualRating]) {
      const rank = riskRank(candidate);
      if (rank > bestRank) {
        bestRank = rank;
        best = String(candidate);
      }
    }
  }
  return best || null;
}

function effectiveConclusion(value: unknown) {
  const conclusion = String(value || '');
  return ['Effective', 'Satisfactory', 'Pass', 'Operating Effectively'].includes(conclusion);
}

function adverseConclusion(value: unknown) {
  const conclusion = String(value || '');
  return ['Partially Effective', 'Ineffective', 'Unsatisfactory', 'Fail'].includes(conclusion);
}

function highFrequency(value: unknown) {
  const frequency = String(value || '').toLowerCase();
  return [
    'continuous',
    'per transaction',
    'daily',
    'weekly',
    'monthly',
    'real-time',
    'realtime'
  ].some(token => frequency.includes(token));
}

function automatedNature(value: unknown) {
  const nature = String(value || '').toLowerCase();
  return nature.includes('automated') || nature.includes('automatic');
}

function strategyMapping(strategy: string) {
  if (strategy === 'Roll-Forward Test') {
    return {
      testType: 'ToE',
      testingPhase: 'Roll-Forward',
      carryForward: true,
      rollForward: true,
      relianceStrategy: 'Prior-period evidence considered; perform targeted current-period roll-forward operating-effectiveness work.'
    };
  }
  if (strategy === 'Rotational Test') {
    return {
      testType: 'Both',
      testingPhase: 'Rotational',
      carryForward: true,
      rollForward: false,
      relianceStrategy: 'Rotational testing candidate approved by reviewer; current-period design and selected operating evidence remain required.'
    };
  }
  if (strategy === 'Prior-Evidence Reliance Candidate') {
    return {
      testType: 'ToD',
      testingPhase: 'Prior-Evidence Reliance Review',
      carryForward: true,
      rollForward: false,
      relianceStrategy: 'Prior-period evidence reliance candidate only. Current-period design revalidation is required and additional ToE remains a reviewer decision.'
    };
  }
  return {
    testType: 'Both',
    testingPhase: 'Full Retest',
    carryForward: false,
    rollForward: false,
    relianceStrategy: 'Full current-period design and operating-effectiveness testing required; no prior-period reliance assumed.'
  };
}

async function latestPriorToe(
  db: D1DatabaseLike,
  controlMasterId: string,
  targetPeriod: string
) {
  return first<Record<string, unknown>>(
    db,
    `SELECT * FROM ToETest
      WHERE controlId=? AND period<>?
      ORDER BY testedAt DESC
      LIMIT 1`,
    [controlMasterId, targetPeriod]
  );
}

async function toeHistoryCounts(
  db: D1DatabaseLike,
  controlMasterId: string,
  targetPeriod: string
) {
  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT
        t.id AS toeTestId,
        t.finalConclusion,
        t.failCount,
        e.id AS exceptionId,
        d.id AS deficiencyPk,
        d.classification
      FROM ToETest t
      LEFT JOIN TestingException e ON e.toeTestId=t.id
      LEFT JOIN ControlDeficiency d ON d.exceptionId=e.id
      WHERE t.controlId=? AND t.period<>?`,
    [controlMasterId, targetPeriod]
  );

  const exceptions = new Set<string>();
  const deficiencies = new Set<string>();
  const significant = new Set<string>();
  let historicalFailures = false;

  for (const row of rows) {
    if (row.exceptionId) exceptions.add(String(row.exceptionId));
    if (row.deficiencyPk) deficiencies.add(String(row.deficiencyPk));
    if (
      row.deficiencyPk &&
      ['Significant Deficiency', 'Material Weakness'].includes(String(row.classification))
    ) {
      significant.add(String(row.deficiencyPk));
    }
    if (Number(row.failCount || 0) > 0 || adverseConclusion(row.finalConclusion)) {
      historicalFailures = true;
    }
  }

  const openIssue = await first<{ count?: number }>(
    db,
    `SELECT COUNT(DISTINCT i.id) AS count
       FROM Issue i
      WHERE i.controlId=? AND i.status<>'Closed'`,
    [controlMasterId]
  );

  return {
    exceptionCount: exceptions.size,
    deficiencyCount: deficiencies.size,
    significantDeficiencyCount: significant.size,
    openIssueCount: Number(openIssue?.count || 0),
    historicalFailures
  };
}

async function riskContext(
  db: D1DatabaseLike,
  institutionId: string,
  controlDomainId: string
) {
  return all<Record<string, unknown>>(
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
}

async function rollForwardContext(
  db: D1DatabaseLike,
  rollForwardId: string | null,
  controlDomainId: string
) {
  if (!rollForwardId) return null;
  return first<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRRollForwardItem
      WHERE rollForwardId=? AND domain='CONTROL_DOMAIN' AND sourceRecordId=?
      LIMIT 1`,
    [rollForwardId, controlDomainId]
  );
}

async function itgcContext(
  db: D1DatabaseLike,
  institutionId: string,
  control: Record<string, unknown>,
  targetPeriod: string
) {
  if (String(control.category) !== 'ITAC') {
    return {
      status: 'Not Applicable',
      activeDependencies: 0,
      untestedDependencies: 0,
      adverseDependencies: 0,
      details: [] as Array<Record<string, unknown>>
    };
  }

  const dependencies = await all<Record<string, unknown>>(
    db,
    `SELECT d.*,c.controlCode,c.name,c.sourceControlId,c.status AS controlStatus
       FROM ICOFRControlDependency d
       JOIN ICOFRControlDomain c ON c.id=d.dependencyControlId
      WHERE d.institutionId=?
        AND d.sourceControlId=?
        AND d.status='Active'
        AND c.category='ITGC'
      ORDER BY c.controlCode`,
    [institutionId, control.id]
  );

  if (!dependencies.length) {
    return {
      status: 'Missing ITGC Dependency',
      activeDependencies: 0,
      untestedDependencies: 0,
      adverseDependencies: 0,
      details: []
    };
  }

  const details: Array<Record<string, unknown>> = [];
  let untestedDependencies = 0;
  let adverseDependencies = 0;

  for (const dependency of dependencies) {
    const sourceControlId = dependency.sourceControlId ? String(dependency.sourceControlId) : '';
    const toe = sourceControlId
      ? await latestPriorToe(db, sourceControlId, targetPeriod)
      : null;
    if (!toe) untestedDependencies += 1;
    else if (!effectiveConclusion(toe.finalConclusion) || Number(toe.failCount || 0) > 0) {
      adverseDependencies += 1;
    }
    details.push({
      dependencyControlId: dependency.dependencyControlId,
      controlCode: dependency.controlCode,
      name: dependency.name,
      sourceControlId: dependency.sourceControlId,
      priorToeTestId: toe?.id || null,
      priorToeConclusion: toe?.finalConclusion || null,
      priorFailCount: toe ? Number(toe.failCount || 0) : null
    });
  }

  return {
    status:
      adverseDependencies > 0
        ? 'Supporting ITGC Adverse'
        : untestedDependencies > 0
          ? 'Supporting ITGC Evidence Missing'
          : 'Supporting ITGC Effective',
    activeDependencies: dependencies.length,
    untestedDependencies,
    adverseDependencies,
    details
  };
}

function chooseRecommendation(input: {
  control: Record<string, unknown>;
  priorToe: Record<string, unknown> | null;
  history: {
    exceptionCount: number;
    deficiencyCount: number;
    significantDeficiencyCount: number;
    openIssueCount: number;
    historicalFailures: boolean;
  };
  riskRating: string | null;
  rollForward: Record<string, unknown> | null;
  itgc: {
    status: string;
    activeDependencies: number;
    untestedDependencies: number;
    adverseDependencies: number;
    details: Array<Record<string, unknown>>;
  };
}) {
  const factors: string[] = [];
  const control = input.control;
  const keyControl = bool(control.keyControl);
  const rollChange = String(input.rollForward?.changeFlag || '');
  const rollDecision = String(input.rollForward?.decision || '');
  const priorEffective =
    !!input.priorToe &&
    effectiveConclusion(input.priorToe.finalConclusion) &&
    Number(input.priorToe.failCount || 0) === 0;
  const riskHigh = riskRank(input.riskRating) >= 3;

  if (!control.sourceControlId) factors.push('Control is not linked to enterprise Control Master.');
  if (!input.priorToe) factors.push('No prior-period ToE evidence is available for the linked control.');
  if (input.priorToe && !priorEffective) {
    factors.push('Latest prior-period ToE is not clean/effective.');
  }
  if (input.history.exceptionCount > 0) {
    factors.push(String(input.history.exceptionCount) + ' prior testing exception(s) exist.');
  }
  if (input.history.deficiencyCount > 0) {
    factors.push(String(input.history.deficiencyCount) + ' prior control deficiency record(s) exist.');
  }
  if (input.history.significantDeficiencyCount > 0) {
    factors.push(String(input.history.significantDeficiencyCount) + ' prior Significant Deficiency/Material Weakness record(s) exist.');
  }
  if (input.history.openIssueCount > 0) {
    factors.push(String(input.history.openIssueCount) + ' open assurance issue(s) are linked to the enterprise control.');
  }
  if (rollChange) factors.push('Roll-forward change flag: ' + rollChange + '.');
  if (rollDecision) factors.push('Roll-forward decision: ' + rollDecision + '.');
  if (input.riskRating) factors.push('Highest linked financial-reporting risk rating: ' + input.riskRating + '.');
  if (String(control.category) === 'ITAC') factors.push('ITAC dependency status: ' + input.itgc.status + '.');
  factors.push('Control frequency: ' + String(control.frequency || 'Not specified') + '.');
  factors.push('Control nature: ' + String(control.nature || 'Not specified') + '.');
  factors.push(keyControl ? 'Control is designated as key.' : 'Control is not designated as key.');

  let proposedStrategy: typeof STRATEGIES[number] = 'Full Retest';
  let priority = 'High';

  const hardRetest =
    !control.sourceControlId ||
    !input.priorToe ||
    !priorEffective ||
    input.history.historicalFailures ||
    input.history.deficiencyCount > 0 ||
    input.history.openIssueCount > 0 ||
    ['Changed', 'Missing / Retired'].includes(rollChange) ||
    ['Revalidate', 'Replace'].includes(rollDecision) ||
    riskHigh ||
    input.itgc.adverseDependencies > 0 ||
    input.itgc.untestedDependencies > 0 ||
    input.itgc.status === 'Missing ITGC Dependency';

  if (hardRetest) {
    proposedStrategy = 'Full Retest';
    priority =
      input.history.significantDeficiencyCount > 0 ||
      input.itgc.adverseDependencies > 0 ||
      riskRank(input.riskRating) >= 4
        ? 'Critical'
        : 'High';
  } else if (
    !keyControl &&
    priorEffective &&
    automatedNature(control.nature) &&
    ['Low', 'Medium', 'Moderate'].includes(String(input.riskRating || '')) &&
    (String(control.category) !== 'ITAC' || input.itgc.status === 'Supporting ITGC Effective') &&
    ['Unchanged', ''].includes(rollChange) &&
    ['Carry Forward', ''].includes(rollDecision)
  ) {
    proposedStrategy = 'Prior-Evidence Reliance Candidate';
    priority = 'Low';
  } else if (
    !keyControl &&
    priorEffective &&
    ['Unchanged', ''].includes(rollChange) &&
    ['Carry Forward', ''].includes(rollDecision) &&
    !highFrequency(control.frequency)
  ) {
    proposedStrategy = 'Rotational Test';
    priority = 'Medium';
  } else if (
    priorEffective &&
    ['Unchanged', ''].includes(rollChange) &&
    ['Carry Forward', ''].includes(rollDecision)
  ) {
    proposedStrategy = 'Roll-Forward Test';
    priority = keyControl ? 'High' : 'Medium';
  }

  const mapped = strategyMapping(proposedStrategy);
  const rationale =
    'Recommended ' +
    proposedStrategy +
    ' based on persisted current control attributes, prior ToE/exception/deficiency history, linked risk significance, roll-forward change assessment and documented ITGC dependencies where applicable. Human review is required before the strategy can be applied to the testing plan.';

  return {
    proposedStrategy,
    proposedTestType: mapped.testType,
    priority,
    rationale,
    factors
  };
}

export async function generateSmartTestingStrategy(input: Record<string, unknown>) {
  const db = await ensureIcofrSmartTestingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const cycleId = String(input.cycleId || '').trim();
  const rollForwardId = clean(input.rollForwardId);
  const policyName = String(input.policyName || 'Total ARC Evidence-Based Testing Strategy').trim();
  const scopeMode = String(input.scopeMode || 'Key Controls Only').trim();
  const defaultPlannedStartDate = String(input.defaultPlannedStartDate || '').trim();
  const defaultDueDate = String(input.defaultDueDate || '').trim();
  const defaultTester = String(input.defaultTester || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();

  if (
    !cycleId ||
    !policyName ||
    !['Key Controls Only', 'All Active ICOFR Controls'].includes(scopeMode) ||
    !defaultPlannedStartDate ||
    !defaultDueDate ||
    !defaultTester ||
    !preparedBy
  ) {
    throw new Error('STRATEGY_RUN_REQUIRED');
  }
  if (defaultDueDate < defaultPlannedStartDate) throw new Error('STRATEGY_DATES_INVALID');

  const cycle = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? LIMIT 1',
    [cycleId, institution.id]
  );
  if (!cycle) throw new Error('CYCLE_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: cycleId
  });

  if (
    defaultPlannedStartDate < String(cycle.startDate) ||
    defaultDueDate > String(cycle.endDate)
  ) {
    throw new Error('STRATEGY_OUTSIDE_CYCLE');
  }

  if (rollForwardId) {
    const rollForward = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRRollForward WHERE id=? AND institutionId=? LIMIT 1',
      [rollForwardId, institution.id]
    );
    if (!rollForward) throw new Error('ROLL_FORWARD_NOT_FOUND');
    if (
      String(rollForward.targetScopeId) !== String(cycle.scopeId) ||
      (rollForward.targetTestingCycleId &&
        String(rollForward.targetTestingCycleId) !== cycleId)
    ) {
      throw new Error('ROLL_FORWARD_CYCLE_MISMATCH');
    }
  }

  const controls = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRControlDomain
      WHERE institutionId=?
        AND status<>'Retired'
        ${scopeMode === 'Key Controls Only' ? 'AND keyControl=1' : ''}
      ORDER BY category,controlCode`,
    [institution.id]
  );
  if (!controls.length) throw new Error('NO_ELIGIBLE_CONTROLS');

  const id = crypto.randomUUID();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO ICOFRTestingStrategyRun (
      id,institutionId,cycleId,scopeId,rollForwardId,policyName,scopeMode,
      defaultPlannedStartDate,defaultDueDate,defaultTester,defaultReviewer,
      preparedBy,approvedBy,status,notes,generatedAt,approvedAt,appliedAt,
      createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NULL,'Draft',?,?,NULL,NULL,?,?)`,
    [
      id,
      institution.id,
      cycleId,
      cycle.scopeId,
      rollForwardId,
      policyName,
      scopeMode,
      defaultPlannedStartDate,
      defaultDueDate,
      defaultTester,
      clean(input.defaultReviewer),
      preparedBy,
      clean(input.notes),
      now,
      now,
      now
    ]
  );

  const targetPeriod = String(cycle.fiscalYear) + ' ' + String(cycle.reportingPeriod);

  for (const control of controls) {
    const sourceControlId = control.sourceControlId ? String(control.sourceControlId) : '';
    const [priorToe, history, risks, rollForward, itgc] = await Promise.all([
      sourceControlId ? latestPriorToe(db, sourceControlId, targetPeriod) : Promise.resolve(null),
      sourceControlId
        ? toeHistoryCounts(db, sourceControlId, targetPeriod)
        : Promise.resolve({
            exceptionCount: 0,
            deficiencyCount: 0,
            significantDeficiencyCount: 0,
            openIssueCount: 0,
            historicalFailures: false
          }),
      riskContext(db, String(institution.id), String(control.id)),
      rollForwardContext(db, rollForwardId, String(control.id)),
      itgcContext(db, String(institution.id), control, targetPeriod)
    ]);

    const riskRating = maxRiskRating(risks);
    const recommendation = chooseRecommendation({
      control,
      priorToe,
      history,
      riskRating,
      rollForward,
      itgc
    });

    await run(
      db,
      `INSERT INTO ICOFRTestingStrategyDecision (
        id,runId,controlDomainId,proposedStrategy,proposedTestType,priority,
        rationale,factorsJson,priorToeTestId,priorToeConclusion,priorExceptionCount,
        priorDeficiencyCount,significantDeficiencyCount,openIssueCount,riskRating,
        rollForwardChangeFlag,rollForwardDecision,itgcDependencyStatus,reviewerDecision,
        overrideStrategy,reviewerName,reviewerNotes,reviewedAt,planItemId,appliedAt,
        createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending',NULL,NULL,NULL,NULL,NULL,NULL,?,?)`,
      [
        crypto.randomUUID(),
        id,
        control.id,
        recommendation.proposedStrategy,
        recommendation.proposedTestType,
        recommendation.priority,
        recommendation.rationale,
        JSON.stringify({
          factors: recommendation.factors,
          priorToe: priorToe
            ? {
                id: priorToe.id,
                period: priorToe.period,
                finalConclusion: priorToe.finalConclusion,
                failCount: Number(priorToe.failCount || 0),
                testedAt: priorToe.testedAt
              }
            : null,
          itgc,
          linkedRisks: risks.map(risk => ({
            id: risk.id,
            riskId: risk.riskId,
            name: risk.name,
            inherentRating: risk.inherentRating,
            residualRating: risk.residualRating
          })),
          rollForward: rollForward
            ? {
                changeFlag: rollForward.changeFlag,
                decision: rollForward.decision,
                changedFields: rollForward.changedFields,
                reviewerNotes: rollForward.reviewerNotes
              }
            : null
        }),
        priorToe?.id || null,
        priorToe?.finalConclusion || null,
        history.exceptionCount,
        history.deficiencyCount,
        history.significantDeficiencyCount,
        history.openIssueCount,
        riskRating,
        rollForward?.changeFlag || null,
        rollForward?.decision || null,
        itgc.status,
        now,
        now
      ]
    );
  }

  const result = {
    id,
    cycleId,
    rollForwardId,
    eligibleControls: controls.length,
    status: 'Draft',
    generatedAt: now
  };
  await audit(db, String(institution.id), 'GENERATE_SMART_TESTING_STRATEGY', id, result);
  return result;
}

export async function reviewSmartTestingDecision(input: Record<string, unknown>) {
  const db = await ensureIcofrSmartTestingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const decisionId = String(input.decisionId || '').trim();
  const reviewerDecision = String(input.reviewerDecision || '').trim();
  const reviewerName = String(input.reviewerName || '').trim();
  const overrideStrategy = clean(input.overrideStrategy);
  const reviewerNotes = clean(input.reviewerNotes);

  if (
    !decisionId ||
    !reviewerName ||
    !REVIEW_DECISIONS.includes(reviewerDecision as typeof REVIEW_DECISIONS[number]) ||
    reviewerDecision === 'Pending'
  ) {
    throw new Error('STRATEGY_REVIEW_REQUIRED');
  }
  if (
    reviewerDecision === 'Override' &&
    (!overrideStrategy || !STRATEGIES.includes(overrideStrategy as typeof STRATEGIES[number]))
  ) {
    throw new Error('STRATEGY_OVERRIDE_REQUIRED');
  }
  if (['Override', 'Defer'].includes(reviewerDecision) && !reviewerNotes) {
    throw new Error('STRATEGY_REVIEW_NOTES_REQUIRED');
  }

  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT d.*,r.institutionId,r.preparedBy,r.status AS runStatus
       FROM ICOFRTestingStrategyDecision d
       JOIN ICOFRTestingStrategyRun r ON r.id=d.runId
      WHERE d.id=? AND r.institutionId=?
      LIMIT 1`,
    [decisionId, institution.id]
  );
  if (!existing) throw new Error('STRATEGY_DECISION_NOT_FOUND');
  if (['Approved', 'Applied'].includes(String(existing.runStatus))) {
    throw new Error('STRATEGY_RUN_LOCKED');
  }
  if (reviewerName.toLowerCase() === String(existing.preparedBy).toLowerCase()) {
    throw new Error('STRATEGY_SELF_REVIEW');
  }

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRTestingStrategyDecision SET
      reviewerDecision=?,overrideStrategy=?,reviewerName=?,reviewerNotes=?,
      reviewedAt=?,updatedAt=?
     WHERE id=?`,
    [
      reviewerDecision,
      reviewerDecision === 'Override' ? overrideStrategy : null,
      reviewerName,
      reviewerNotes,
      now,
      now,
      decisionId
    ]
  );

  const result = {
    id: decisionId,
    runId: existing.runId,
    reviewerDecision,
    overrideStrategy: reviewerDecision === 'Override' ? overrideStrategy : null,
    reviewerName,
    reviewerNotes,
    reviewedAt: now
  };
  await audit(
    db,
    String(institution.id),
    'REVIEW_SMART_TESTING_DECISION',
    String(existing.runId),
    result,
    existing
  );
  return result;
}

export async function approveSmartTestingRun(input: Record<string, unknown>) {
  const db = await ensureIcofrSmartTestingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const runId = String(input.runId || '').trim();
  const approvedBy = String(input.approvedBy || '').trim();
  if (!runId || !approvedBy) throw new Error('STRATEGY_APPROVAL_REQUIRED');

  const strategyRun = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRTestingStrategyRun WHERE id=? AND institutionId=? LIMIT 1',
    [runId, institution.id]
  );
  if (!strategyRun) throw new Error('STRATEGY_RUN_NOT_FOUND');
  if (['Approved', 'Applied'].includes(String(strategyRun.status))) {
    throw new Error('STRATEGY_RUN_LOCKED');
  }
  if (approvedBy.toLowerCase() === String(strategyRun.preparedBy).toLowerCase()) {
    throw new Error('STRATEGY_SELF_APPROVAL');
  }

  const unresolved = await first<{ count?: number }>(
    db,
    `SELECT COUNT(*) AS count
       FROM ICOFRTestingStrategyDecision
      WHERE runId=? AND reviewerDecision IN ('Pending','Defer')`,
    [runId]
  );
  if (Number(unresolved?.count || 0) > 0) throw new Error('STRATEGY_DECISIONS_PENDING');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(strategyRun.cycleId)
  });

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRTestingStrategyRun SET
      approvedBy=?,status='Approved',approvedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [approvedBy, now, now, runId, institution.id]
  );

  const result = { id: runId, approvedBy, status: 'Approved', approvedAt: now };
  await audit(db, String(institution.id), 'APPROVE_SMART_TESTING_STRATEGY', runId, result, strategyRun);
  return result;
}

export async function applySmartTestingRun(input: Record<string, unknown>) {
  const db = await ensureIcofrSmartTestingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const runId = String(input.runId || '').trim();
  if (!runId) throw new Error('STRATEGY_APPLY_REQUIRED');

  const strategyRun = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRTestingStrategyRun WHERE id=? AND institutionId=? LIMIT 1',
    [runId, institution.id]
  );
  if (!strategyRun) throw new Error('STRATEGY_RUN_NOT_FOUND');
  if (String(strategyRun.status) !== 'Approved') throw new Error('STRATEGY_NOT_APPROVED');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(strategyRun.cycleId)
  });

  const decisions = await all<Record<string, unknown>>(
    db,
    `SELECT d.*,c.controlCode,c.name,c.sourceControlId
       FROM ICOFRTestingStrategyDecision d
       JOIN ICOFRControlDomain c ON c.id=d.controlDomainId
      WHERE d.runId=?
        AND d.reviewerDecision IN ('Accept Recommendation','Override')
      ORDER BY d.priority DESC,c.controlCode`,
    [runId]
  );

  let created = 0;
  let updated = 0;
  const now = nowIso();

  for (const decision of decisions) {
    const effectiveStrategy =
      String(decision.reviewerDecision) === 'Override' && decision.overrideStrategy
        ? String(decision.overrideStrategy)
        : String(decision.proposedStrategy);
    const mapping = strategyMapping(effectiveStrategy);

    const existingPlan = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingPlanItem WHERE cycleId=? AND controlDomainId=? LIMIT 1',
      [strategyRun.cycleId, decision.controlDomainId]
    );

    const strategyNote =
      'Smart testing strategy: ' +
      effectiveStrategy +
      '. Recommendation basis: ' +
      String(decision.rationale || '') +
      (decision.reviewerNotes ? ' Reviewer notes: ' + String(decision.reviewerNotes) : '');

    let planItemId: string;
    if (existingPlan) {
      await run(
        db,
        `UPDATE ICOFRTestingPlanItem SET
          testType=?,testingPhase=?,carryForward=?,rollForward=?,relianceStrategy=?,
          priority=?,notes=?,updatedAt=?
         WHERE id=?`,
        [
          mapping.testType,
          mapping.testingPhase,
          mapping.carryForward ? 1 : 0,
          mapping.rollForward ? 1 : 0,
          mapping.relianceStrategy,
          decision.priority,
          existingPlan.notes
            ? String(existingPlan.notes) + '\n' + strategyNote
            : strategyNote,
          now,
          existingPlan.id
        ]
      );
      planItemId = String(existingPlan.id);
      updated += 1;
    } else {
      const plan = await saveTestingPlanItem({
        cycleId: String(strategyRun.cycleId),
        controlDomainId: String(decision.controlDomainId),
        testType: mapping.testType,
        testingPhase: mapping.testingPhase,
        plannedStartDate: String(strategyRun.defaultPlannedStartDate),
        dueDate: String(strategyRun.defaultDueDate),
        testerName: String(strategyRun.defaultTester),
        reviewerName: clean(strategyRun.defaultReviewer),
        carryForward: mapping.carryForward,
        rollForward: mapping.rollForward,
        relianceStrategy: mapping.relianceStrategy,
        priority: String(decision.priority),
        status: 'Planned',
        notes: strategyNote
      });
      planItemId = String(plan.id);
      created += 1;
    }

    await run(
      db,
      `UPDATE ICOFRTestingStrategyDecision SET
        planItemId=?,appliedAt=?,updatedAt=?
       WHERE id=?`,
      [planItemId, now, now, decision.id]
    );
  }

  await run(
    db,
    `UPDATE ICOFRTestingStrategyRun SET
      status='Applied',appliedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [now, now, runId, institution.id]
  );

  const result = {
    id: runId,
    status: 'Applied',
    appliedDecisions: decisions.length,
    createdPlanItems: created,
    updatedPlanItems: updated,
    appliedAt: now
  };
  await audit(db, String(institution.id), 'APPLY_SMART_TESTING_STRATEGY', runId, result, strategyRun);
  return result;
}

function parseFactors(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function summarizeDecisions(items: Array<Record<string, unknown>>) {
  const byStrategy: Record<string, number> = {};
  const byReview: Record<string, number> = {};
  const byPriority: Record<string, number> = {};

  for (const item of items) {
    const strategy = String(item.overrideStrategy || item.proposedStrategy || 'Unknown');
    const review = String(item.reviewerDecision || 'Pending');
    const priority = String(item.priority || 'Medium');
    byStrategy[strategy] = (byStrategy[strategy] || 0) + 1;
    byReview[review] = (byReview[review] || 0) + 1;
    byPriority[priority] = (byPriority[priority] || 0) + 1;
  }

  return {
    total: items.length,
    pendingReview: byReview.Pending || 0,
    deferred: byReview.Defer || 0,
    accepted: byReview['Accept Recommendation'] || 0,
    overridden: byReview.Override || 0,
    fullRetest: byStrategy['Full Retest'] || 0,
    rollForward: byStrategy['Roll-Forward Test'] || 0,
    rotational: byStrategy['Rotational Test'] || 0,
    priorEvidence: byStrategy['Prior-Evidence Reliance Candidate'] || 0,
    critical: byPriority.Critical || 0,
    byStrategy,
    byReview,
    byPriority
  };
}

export async function getSmartTestingStrategyData() {
  const db = await ensureIcofrSmartTestingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      cycles: [],
      rollForwards: [],
      runs: [],
      metrics: {}
    };
  }

  const [cycles, rollForwards, strategyRuns, controls] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT c.*,s.scopeName
         FROM ICOFRTestingCycle c
         JOIN ICOFRScope s ON s.id=c.scopeId
        WHERE c.institutionId=?
        ORDER BY c.fiscalYear DESC,c.startDate DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT r.*,s.scopeName
         FROM ICOFRRollForward r
         JOIN ICOFRScope s ON s.id=r.targetScopeId
        WHERE r.institutionId=?
        ORDER BY r.createdAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingStrategyRun WHERE institutionId=? ORDER BY generatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT * FROM ICOFRControlDomain
        WHERE institutionId=? AND status<>'Retired'
        ORDER BY category,controlCode`,
      [institution.id]
    )
  ]);

  const controlById = new Map(controls.map(item => [String(item.id), item]));
  const cycleById = new Map(cycles.map(item => [String(item.id), item]));
  const rollForwardById = new Map(rollForwards.map(item => [String(item.id), item]));

  const enriched: Array<Record<string, any>> = [];
  for (const strategyRun of strategyRuns) {
    const decisions = await all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingStrategyDecision WHERE runId=? ORDER BY priority DESC,createdAt',
      [strategyRun.id]
    );

    enriched.push({
      ...strategyRun,
      cycle: cycleById.get(String(strategyRun.cycleId)) || null,
      rollForward: strategyRun.rollForwardId
        ? rollForwardById.get(String(strategyRun.rollForwardId)) || null
        : null,
      decisions: decisions.map(item => ({
        ...item,
        control: controlById.get(String(item.controlDomainId)) || null,
        factors: parseFactors(item.factorsJson)
      })),
      summary: summarizeDecisions(decisions)
    });
  }

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    cycles,
    rollForwards,
    strategies: STRATEGIES,
    runs: enriched,
    metrics: {
      runs: enriched.length,
      draftRuns: enriched.filter(item => item.status === 'Draft').length,
      approvedRuns: enriched.filter(item => item.status === 'Approved').length,
      appliedRuns: enriched.filter(item => item.status === 'Applied').length,
      pendingReviews: enriched.reduce((sum, item) => sum + Number(item.summary.pendingReview || 0), 0),
      fullRetest: enriched.reduce((sum, item) => sum + Number(item.summary.fullRetest || 0), 0),
      rollForward: enriched.reduce((sum, item) => sum + Number(item.summary.rollForward || 0), 0),
      rotational: enriched.reduce((sum, item) => sum + Number(item.summary.rotational || 0), 0),
      priorEvidence: enriched.reduce((sum, item) => sum + Number(item.summary.priorEvidence || 0), 0)
    }
  };
}
