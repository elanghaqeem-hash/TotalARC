import { getCloudflareContext } from '@opennextjs/cloudflare';
import { assertIcofrPeriodWritable } from '@/lib/d1-icofr-period-lock';
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
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
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

function nullable(value: unknown) {
  return value === undefined || value === '' ? null : value;
}

let assuranceSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureAssuranceSchema() {
  if (assuranceSchemaReady) return assuranceSchemaReady;

  assuranceSchemaReady = (async () => {
    const db = await getDb();

    await executeSchemaScript(db, `
    CREATE TABLE IF NOT EXISTS ToETest (
      id TEXT PRIMARY KEY NOT NULL,
      testId TEXT NOT NULL,
      controlId TEXT NOT NULL,
      processId TEXT NOT NULL,
      riskId TEXT,
      testerName TEXT NOT NULL,
      reviewerName TEXT,
      period TEXT NOT NULL,
      populationSize INTEGER NOT NULL DEFAULT 0,
      populationSource TEXT NOT NULL DEFAULT 'Not Provided',
      samplingMethod TEXT NOT NULL DEFAULT 'Not Selected',
      sampleSize INTEGER NOT NULL DEFAULT 0,
      passCount INTEGER NOT NULL DEFAULT 0,
      failCount INTEGER NOT NULL DEFAULT 0,
      testerConclusion TEXT NOT NULL DEFAULT 'Not Assessed',
      finalConclusion TEXT NOT NULL DEFAULT 'Not Assessed',
      status TEXT NOT NULL DEFAULT 'Planned',
      notes TEXT,
      testedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_toe_test_id ON ToETest(testId);
    CREATE INDEX IF NOT EXISTS idx_toe_control ON ToETest(controlId);
    CREATE INDEX IF NOT EXISTS idx_toe_process ON ToETest(processId);

    CREATE TABLE IF NOT EXISTS TestSample (
      id TEXT PRIMARY KEY NOT NULL,
      toeTestId TEXT NOT NULL,
      sampleNumber INTEGER NOT NULL,
      transactionRef TEXT NOT NULL,
      transactionDate TEXT NOT NULL,
      amount REAL,
      attributesTested TEXT,
      result TEXT NOT NULL DEFAULT 'Not Tested',
      failureReason TEXT,
      evidenceRef TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_toe_sample_number ON TestSample(toeTestId, sampleNumber);
    CREATE INDEX IF NOT EXISTS idx_sample_toe ON TestSample(toeTestId);

    CREATE TABLE IF NOT EXISTS TestingException (
      id TEXT PRIMARY KEY NOT NULL,
      toeTestId TEXT NOT NULL,
      exceptionNumber TEXT NOT NULL,
      sampleRef TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'High',
      status TEXT NOT NULL DEFAULT 'Confirmed Exception',
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_exception_toe ON TestingException(toeTestId);

    CREATE TABLE IF NOT EXISTS ControlDeficiency (
      id TEXT PRIMARY KEY NOT NULL,
      exceptionId TEXT,
      deficiencyId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      classification TEXT NOT NULL DEFAULT 'Control Deficiency',
      financialImpact REAL,
      regulatoryImpact TEXT,
      compensatingControls TEXT,
      humanApproved INTEGER NOT NULL DEFAULT 0,
      approvedBy TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deficiency_id ON ControlDeficiency(deficiencyId);
    CREATE INDEX IF NOT EXISTS idx_deficiency_exception ON ControlDeficiency(exceptionId);

    CREATE TABLE IF NOT EXISTS RootCauseAnalysis (
      id TEXT PRIMARY KEY NOT NULL,
      deficiencyId TEXT NOT NULL UNIQUE,
      method TEXT NOT NULL DEFAULT '5 Why',
      why1 TEXT,
      why2 TEXT,
      why3 TEXT,
      why4 TEXT,
      why5 TEXT,
      category TEXT NOT NULL DEFAULT 'Process',
      rootCauseStatement TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Issue (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      issueId TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'TOE',
      processId TEXT NOT NULL,
      riskId TEXT,
      controlId TEXT,
      deficiencyId TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'High',
      ownerName TEXT NOT NULL,
      targetDate TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_issue_enterprise_id ON Issue(institutionId, issueId);
    CREATE INDEX IF NOT EXISTS idx_issue_process ON Issue(processId);
    CREATE INDEX IF NOT EXISTS idx_issue_control ON Issue(controlId);
    CREATE INDEX IF NOT EXISTS idx_issue_deficiency ON Issue(deficiencyId);

    CREATE TABLE IF NOT EXISTS ManagementActionPlan (
      id TEXT PRIMARY KEY NOT NULL,
      mapId TEXT NOT NULL,
      issueId TEXT NOT NULL,
      agreedAction TEXT NOT NULL,
      recommendation TEXT,
      actionOwner TEXT NOT NULL,
      approverName TEXT NOT NULL,
      originalDueDate TEXT NOT NULL,
      revisedDueDate TEXT,
      extensionCount INTEGER NOT NULL DEFAULT 0,
      extensionReason TEXT,
      progressPercent INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Draft',
      completedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_map_enterprise_id ON ManagementActionPlan(mapId);
    CREATE INDEX IF NOT EXISTS idx_map_issue ON ManagementActionPlan(issueId);

    CREATE TABLE IF NOT EXISTS MAPMilestone (
      id TEXT PRIMARY KEY NOT NULL,
      mapId TEXT NOT NULL,
      title TEXT NOT NULL,
      owner TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      progressPercent INTEGER NOT NULL DEFAULT 0,
      evidenceDoc TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_milestone_map ON MAPMilestone(mapId);

    CREATE TABLE IF NOT EXISTS RetestRecord (
      id TEXT PRIMARY KEY NOT NULL,
      mapId TEXT NOT NULL,
      retestId TEXT NOT NULL,
      sampleCount INTEGER NOT NULL DEFAULT 0,
      passedCount INTEGER NOT NULL DEFAULT 0,
      failedCount INTEGER NOT NULL DEFAULT 0,
      testerName TEXT NOT NULL,
      reviewerName TEXT NOT NULL,
      result TEXT NOT NULL DEFAULT 'Not Assessed',
      conclusionNotes TEXT,
      retestedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_retest_enterprise_id ON RetestRecord(retestId);
    CREATE INDEX IF NOT EXISTS idx_retest_map ON RetestRecord(mapId);

    CREATE TABLE IF NOT EXISTS MonitoringRule (
      id TEXT PRIMARY KEY NOT NULL,
      ruleId TEXT NOT NULL,
      controlId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      dataSource TEXT NOT NULL,
      queryLogic TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'Real Time',
      threshold TEXT NOT NULL DEFAULT '0 Transactions',
      status TEXT NOT NULL DEFAULT 'Active',
      lastRunDate TEXT,
      lastStatus TEXT NOT NULL DEFAULT 'Not Run',
      createdAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_monitoring_rule_id ON MonitoringRule(ruleId);
    CREATE INDEX IF NOT EXISTS idx_monitoring_control ON MonitoringRule(controlId);

    CREATE TABLE IF NOT EXISTS MonitoringRun (
      id TEXT PRIMARY KEY NOT NULL,
      ruleId TEXT NOT NULL,
      runTimestamp TEXT NOT NULL,
      populationChecked INTEGER NOT NULL DEFAULT 0,
      exceptionsFound INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Healthy',
      details TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_monitoring_run_rule ON MonitoringRun(ruleId);
    CREATE INDEX IF NOT EXISTS idx_monitoring_run_time ON MonitoringRun(runTimestamp);

    CREATE TABLE IF NOT EXISTS CCMException (
      id TEXT PRIMARY KEY NOT NULL,
      runId TEXT NOT NULL,
      transactionRef TEXT NOT NULL,
      details TEXT NOT NULL,
      detectedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ccm_exception_run ON CCMException(runId);
    `);

    return db;
  })().catch(error => {
    assuranceSchemaReady = null;
    throw error;
  });

  return assuranceSchemaReady;
}

async function loadMap(db: D1DatabaseLike, row: Record<string, unknown>) {
  const [issue, milestones, retests] = await Promise.all([
    first<Record<string, unknown>>(db, 'SELECT * FROM Issue WHERE id = ? LIMIT 1', [row.issueId]),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM MAPMilestone WHERE mapId = ? ORDER BY dueDate ASC, createdAt ASC',
      [row.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM RetestRecord WHERE mapId = ? ORDER BY retestedAt DESC',
      [row.id]
    )
  ]);

  let issueWithRelations: Record<string, unknown> | null = null;
  if (issue) {
    const [process, control] = await Promise.all([
      first<Record<string, unknown>>(
        db,
        'SELECT id, processId, name FROM BusinessProcess WHERE id = ? LIMIT 1',
        [issue.processId]
      ),
      issue.controlId
        ? first<Record<string, unknown>>(
            db,
            'SELECT id, controlId, name FROM ControlMaster WHERE id = ? LIMIT 1',
            [issue.controlId]
          )
        : Promise.resolve(null)
    ]);
    issueWithRelations = { ...issue, process, control };
  }

  return {
    ...row,
    extensionCount: Number(row.extensionCount || 0),
    progressPercent: Number(row.progressPercent || 0),
    issue: issueWithRelations,
    milestones,
    retests: retests.map(retest => ({
      ...retest,
      sampleCount: Number(retest.sampleCount || 0),
      passedCount: Number(retest.passedCount || 0),
      failedCount: Number(retest.failedCount || 0)
    }))
  };
}

async function loadIssue(db: D1DatabaseLike, row: Record<string, unknown>) {
  const [process, risk, control, deficiency, actionPlanRows] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      'SELECT id, processId, name FROM BusinessProcess WHERE id = ? LIMIT 1',
      [row.processId]
    ),
    row.riskId
      ? first<Record<string, unknown>>(
          db,
          'SELECT id, riskId, name FROM RiskMaster WHERE id = ? LIMIT 1',
          [row.riskId]
        )
      : Promise.resolve(null),
    row.controlId
      ? first<Record<string, unknown>>(
          db,
          'SELECT id, controlId, name FROM ControlMaster WHERE id = ? LIMIT 1',
          [row.controlId]
        )
      : Promise.resolve(null),
    row.deficiencyId
      ? first<Record<string, unknown>>(
          db,
          'SELECT * FROM ControlDeficiency WHERE id = ? LIMIT 1',
          [row.deficiencyId]
        )
      : Promise.resolve(null),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ManagementActionPlan WHERE issueId = ? ORDER BY createdAt DESC',
      [row.id]
    )
  ]);

  let deficiencyWithRoot: Record<string, unknown> | null = null;
  if (deficiency) {
    const rootCause = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM RootCauseAnalysis WHERE deficiencyId = ? LIMIT 1',
      [deficiency.id]
    );
    deficiencyWithRoot = {
      ...deficiency,
      humanApproved: deficiency.humanApproved === 1,
      rootCause
    };
  }

  const actionPlans = await Promise.all(actionPlanRows.map(map => loadMap(db, map)));

  return {
    ...row,
    process,
    risk,
    control,
    deficiency: deficiencyWithRoot,
    actionPlans
  };
}

async function loadDeficiency(db: D1DatabaseLike, row: Record<string, unknown>) {
  const [exception, rootCause, issues] = await Promise.all([
    row.exceptionId
      ? first<Record<string, unknown>>(
          db,
          'SELECT * FROM TestingException WHERE id = ? LIMIT 1',
          [row.exceptionId]
        )
      : Promise.resolve(null),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM RootCauseAnalysis WHERE deficiencyId = ? LIMIT 1',
      [row.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM Issue WHERE deficiencyId = ? ORDER BY createdAt DESC',
      [row.id]
    )
  ]);

  return {
    ...row,
    humanApproved: row.humanApproved === 1,
    exception,
    rootCause,
    issues
  };
}

export async function createToeTest(input: {
  testId?: string;
  controlId: string;
  testerName: string;
  reviewerName?: string | null;
  period: string;
  populationSize: number;
  populationSource: string;
  samplingMethod: string;
  notes?: string | null;
}) {
  const db = await ensureAssuranceSchema();
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1',
    [input.controlId]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(control.institutionId),
    period: input.period
  });

  const enterpriseId =
    input.testId && input.testId.trim()
      ? input.testId.trim()
      : 'TOE-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ToETest WHERE testId = ? LIMIT 1',
    [enterpriseId]
  );
  if (duplicate) throw new Error('TOE_TEST_ID_CONFLICT');

  const id = crypto.randomUUID();
  const testedAt = nowIso();

  await run(
    db,
    `INSERT INTO ToETest (
      id, testId, controlId, processId, riskId, testerName, reviewerName, period,
      populationSize, populationSource, samplingMethod, sampleSize, passCount,
      failCount, testerConclusion, finalConclusion, status, notes, testedAt
    ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'Not Assessed', 'Not Assessed', 'Planned', ?, ?)`,
    [
      id,
      enterpriseId,
      control.id,
      control.processId,
      input.testerName,
      nullable(input.reviewerName),
      input.period,
      input.populationSize,
      input.populationSource,
      input.samplingMethod,
      nullable(input.notes),
      testedAt
    ]
  );

  return {
    id,
    testId: enterpriseId,
    controlId: control.id,
    processId: control.processId,
    riskId: null,
    testerName: input.testerName,
    reviewerName: nullable(input.reviewerName),
    period: input.period,
    populationSize: input.populationSize,
    populationSource: input.populationSource,
    samplingMethod: input.samplingMethod,
    sampleSize: 0,
    passCount: 0,
    failCount: 0,
    testerConclusion: 'Not Assessed',
    finalConclusion: 'Not Assessed',
    status: 'Planned',
    notes: nullable(input.notes),
    testedAt
  };
}

export async function addToeSample(input: {
  toeTestId: string;
  transactionRef: string;
  transactionDate: string;
  amount?: number | null;
  attributesTested?: string | null;
  evidenceRef?: string | null;
}) {
  const db = await ensureAssuranceSchema();
  const test = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest WHERE id = ? LIMIT 1',
    [input.toeTestId]
  );
  if (!test) throw new Error('TOE_TEST_NOT_FOUND');

  const testControl = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1',
    [test.controlId]
  );
  if (!testControl) throw new Error('CONTROL_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(testControl.institutionId),
    period: String(test.period)
  });

  const nextNumberRow = await first<{ nextNumber?: number }>(
    db,
    'SELECT COALESCE(MAX(sampleNumber), 0) + 1 AS nextNumber FROM TestSample WHERE toeTestId = ?',
    [input.toeTestId]
  );
  const sampleNumber = Number(nextNumberRow?.nextNumber || 1);
  const id = crypto.randomUUID();

  await run(
    db,
    `INSERT INTO TestSample (
      id, toeTestId, sampleNumber, transactionRef, transactionDate, amount,
      attributesTested, result, failureReason, evidenceRef
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Not Tested', NULL, ?)`,
    [
      id,
      input.toeTestId,
      sampleNumber,
      input.transactionRef,
      input.transactionDate,
      input.amount === null || input.amount === undefined ? null : input.amount,
      nullable(input.attributesTested),
      nullable(input.evidenceRef)
    ]
  );

  await run(
    db,
    'UPDATE ToETest SET sampleSize = ? WHERE id = ?',
    [sampleNumber, input.toeTestId]
  );

  return {
    id,
    toeTestId: input.toeTestId,
    sampleNumber,
    transactionRef: input.transactionRef,
    transactionDate: input.transactionDate,
    amount: input.amount === null || input.amount === undefined ? null : input.amount,
    attributesTested: nullable(input.attributesTested),
    result: 'Not Tested',
    failureReason: null,
    evidenceRef: nullable(input.evidenceRef)
  };
}

export async function createTestingExceptionFromSample(input: {
  toeTestId: string;
  sampleId: string;
  severity: string;
  description?: string | null;
}) {
  const db = await ensureAssuranceSchema();
  const test = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest WHERE id = ? LIMIT 1',
    [input.toeTestId]
  );
  if (!test) throw new Error('TOE_TEST_NOT_FOUND');

  const exceptionControl = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1',
    [test.controlId]
  );
  if (!exceptionControl) throw new Error('CONTROL_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(exceptionControl.institutionId),
    period: String(test.period)
  });

  const sample = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM TestSample WHERE id = ? AND toeTestId = ? LIMIT 1',
    [input.sampleId, input.toeTestId]
  );
  if (!sample) throw new Error('SAMPLE_NOT_FOUND');
  if (sample.result !== 'Fail') throw new Error('SAMPLE_NOT_FAILED');

  const failureReason =
    typeof sample.failureReason === 'string' ? sample.failureReason.trim() : '';
  const description = input.description?.trim() || failureReason;
  if (!description) throw new Error('EXCEPTION_DESCRIPTION_REQUIRED');

  const severity = ['Critical', 'High', 'Medium', 'Low'].includes(input.severity)
    ? input.severity
    : 'High';

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM TestingException WHERE toeTestId = ? AND sampleRef = ? LIMIT 1',
    [input.toeTestId, sample.transactionRef]
  );
  if (duplicate) throw new Error('EXCEPTION_ALREADY_EXISTS');

  const id = crypto.randomUUID();
  const exceptionNumber = 'EXC-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  await run(
    db,
    `INSERT INTO TestingException (
      id, toeTestId, exceptionNumber, sampleRef, description, severity, status, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, 'Confirmed Exception', ?)`,
    [
      id,
      input.toeTestId,
      exceptionNumber,
      sample.transactionRef,
      description,
      severity,
      nowIso()
    ]
  );

  return {
    id,
    toeTestId: input.toeTestId,
    exceptionNumber,
    sampleRef: sample.transactionRef,
    description,
    severity,
    status: 'Confirmed Exception',
    createdAt: nowIso()
  };
}

export async function createControlDeficiency(input: {
  exceptionId: string;
  title: string;
  description: string;
  classification: string;
  financialImpact?: number | null;
  regulatoryImpact?: string | null;
  compensatingControls?: string | null;
  approvedBy: string;
}) {
  const db = await ensureAssuranceSchema();
  const exception = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM TestingException WHERE id = ? LIMIT 1',
    [input.exceptionId]
  );
  if (!exception) throw new Error('EXCEPTION_NOT_FOUND');

  const deficiencyTest = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest WHERE id = ? LIMIT 1',
    [exception.toeTestId]
  );
  if (!deficiencyTest) throw new Error('TOE_TEST_NOT_FOUND');

  const deficiencyControl = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1',
    [deficiencyTest.controlId]
  );
  if (!deficiencyControl) throw new Error('CONTROL_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(deficiencyControl.institutionId),
    period: String(deficiencyTest.period)
  });

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ControlDeficiency WHERE exceptionId = ? LIMIT 1',
    [input.exceptionId]
  );
  if (existing) throw new Error('DEFICIENCY_ALREADY_EXISTS');

  const classification = [
    'Control Deficiency',
    'Significant Deficiency',
    'Material Weakness',
    'Observation'
  ].includes(input.classification)
    ? input.classification
    : 'Control Deficiency';

  const id = crypto.randomUUID();
  const deficiencyId = 'DEF-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  await run(
    db,
    `INSERT INTO ControlDeficiency (
      id, exceptionId, deficiencyId, title, description, classification,
      financialImpact, regulatoryImpact, compensatingControls,
      humanApproved, approvedBy, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.exceptionId,
      deficiencyId,
      input.title,
      input.description,
      classification,
      input.financialImpact === null || input.financialImpact === undefined
        ? null
        : input.financialImpact,
      nullable(input.regulatoryImpact),
      nullable(input.compensatingControls),
      input.approvedBy,
      nowIso()
    ]
  );

  return {
    id,
    exceptionId: input.exceptionId,
    deficiencyId,
    title: input.title,
    description: input.description,
    classification,
    financialImpact:
      input.financialImpact === null || input.financialImpact === undefined
        ? null
        : input.financialImpact,
    regulatoryImpact: nullable(input.regulatoryImpact),
    compensatingControls: nullable(input.compensatingControls),
    humanApproved: 1,
    approvedBy: input.approvedBy,
    createdAt: nowIso()
  };
}

export async function createIssueFromDeficiency(input: {
  deficiencyId: string;
  title: string;
  description: string;
  severity: string;
  ownerName: string;
  targetDate: string;
}) {
  const db = await ensureAssuranceSchema();
  const deficiency = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlDeficiency WHERE id = ? LIMIT 1',
    [input.deficiencyId]
  );
  if (!deficiency) throw new Error('DEFICIENCY_NOT_FOUND');
  if (deficiency.humanApproved !== 1) throw new Error('DEFICIENCY_NOT_APPROVED');

  const exception = deficiency.exceptionId
    ? await first<Record<string, unknown>>(
        db,
        'SELECT * FROM TestingException WHERE id = ? LIMIT 1',
        [deficiency.exceptionId]
      )
    : null;
  if (!exception) throw new Error('EXCEPTION_NOT_FOUND');

  const test = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest WHERE id = ? LIMIT 1',
    [exception.toeTestId]
  );
  if (!test) throw new Error('TOE_TEST_NOT_FOUND');

  const process = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [test.processId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const id = crypto.randomUUID();
  const issueId = 'ISS-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  const severity = ['Critical', 'High', 'Medium', 'Low'].includes(input.severity)
    ? input.severity
    : 'High';
  const now = nowIso();

  await run(
    db,
    `INSERT INTO Issue (
      id, institutionId, issueId, source, processId, riskId, controlId,
      deficiencyId, title, description, severity, ownerName, targetDate,
      status, createdAt, updatedAt
    ) VALUES (?, ?, ?, 'TOE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)`,
    [
      id,
      process.institutionId,
      issueId,
      test.processId,
      test.riskId || null,
      test.controlId,
      deficiency.id,
      input.title,
      input.description,
      severity,
      input.ownerName,
      input.targetDate,
      now,
      now
    ]
  );

  return {
    id,
    institutionId: process.institutionId,
    issueId,
    source: 'TOE',
    processId: test.processId,
    riskId: test.riskId || null,
    controlId: test.controlId,
    deficiencyId: deficiency.id,
    title: input.title,
    description: input.description,
    severity,
    ownerName: input.ownerName,
    targetDate: input.targetDate,
    status: 'Open',
    createdAt: now,
    updatedAt: now
  };
}

export async function createManagementActionPlan(input: {
  issueId: string;
  agreedAction: string;
  recommendation?: string | null;
  actionOwner: string;
  approverName: string;
  originalDueDate: string;
}) {
  const db = await ensureAssuranceSchema();
  const issue = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM Issue WHERE id = ? LIMIT 1',
    [input.issueId]
  );
  if (!issue) throw new Error('ISSUE_NOT_FOUND');

  const id = crypto.randomUUID();
  const mapId = 'MAP-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  const now = nowIso();

  await run(
    db,
    `INSERT INTO ManagementActionPlan (
      id, mapId, issueId, agreedAction, recommendation, actionOwner,
      approverName, originalDueDate, revisedDueDate, extensionCount,
      extensionReason, progressPercent, status, completedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, 0, 'Draft', NULL, ?, ?)`,
    [
      id,
      mapId,
      issue.id,
      input.agreedAction,
      nullable(input.recommendation),
      input.actionOwner,
      input.approverName,
      input.originalDueDate,
      now,
      now
    ]
  );

  return {
    id,
    mapId,
    issueId: issue.id,
    agreedAction: input.agreedAction,
    recommendation: nullable(input.recommendation),
    actionOwner: input.actionOwner,
    approverName: input.approverName,
    originalDueDate: input.originalDueDate,
    revisedDueDate: null,
    extensionCount: 0,
    extensionReason: null,
    progressPercent: 0,
    status: 'Draft',
    completedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export async function createMapMilestone(input: {
  mapId: string;
  title: string;
  owner: string;
  dueDate: string;
}) {
  const db = await ensureAssuranceSchema();
  const map = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ManagementActionPlan WHERE id = ? LIMIT 1',
    [input.mapId]
  );
  if (!map) throw new Error('MAP_NOT_FOUND');

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO MAPMilestone (
      id, mapId, title, owner, dueDate, status, progressPercent, evidenceDoc, createdAt
    ) VALUES (?, ?, ?, ?, ?, 'Pending', 0, NULL, ?)`,
    [id, map.id, input.title, input.owner, input.dueDate, nowIso()]
  );

  return {
    id,
    mapId: map.id,
    title: input.title,
    owner: input.owner,
    dueDate: input.dueDate,
    status: 'Pending',
    progressPercent: 0,
    evidenceDoc: null,
    createdAt: nowIso()
  };
}

export async function createRetestRecord(input: {
  mapId: string;
  sampleCount: number;
  passedCount: number;
  failedCount: number;
  testerName: string;
  reviewerName: string;
  conclusionNotes?: string | null;
}) {
  const db = await ensureAssuranceSchema();
  const map = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ManagementActionPlan WHERE id = ? LIMIT 1',
    [input.mapId]
  );
  if (!map) throw new Error('MAP_NOT_FOUND');

  if (
    input.sampleCount < 0 ||
    input.passedCount < 0 ||
    input.failedCount < 0 ||
    input.passedCount + input.failedCount !== input.sampleCount
  ) {
    throw new Error('INVALID_RETEST_COUNTS');
  }

  const result =
    input.sampleCount === 0
      ? 'Not Assessed'
      : input.failedCount === 0 && input.passedCount === input.sampleCount
        ? 'Pass'
        : 'Fail';

  const id = crypto.randomUUID();
  const retestId = 'RET-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  await run(
    db,
    `INSERT INTO RetestRecord (
      id, mapId, retestId, sampleCount, passedCount, failedCount,
      testerName, reviewerName, result, conclusionNotes, retestedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      map.id,
      retestId,
      input.sampleCount,
      input.passedCount,
      input.failedCount,
      input.testerName,
      input.reviewerName,
      result,
      nullable(input.conclusionNotes),
      nowIso()
    ]
  );

  return {
    id,
    mapId: map.id,
    retestId,
    sampleCount: input.sampleCount,
    passedCount: input.passedCount,
    failedCount: input.failedCount,
    testerName: input.testerName,
    reviewerName: input.reviewerName,
    result,
    conclusionNotes: nullable(input.conclusionNotes),
    retestedAt: nowIso()
  };
}

export async function listToeTests() {
  const db = await ensureAssuranceSchema();
  const tests = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest ORDER BY testedAt DESC, testId ASC'
  );

  return Promise.all(
    tests.map(async test => {
      const [control, process, risk, samples, exceptionRows] = await Promise.all([
        first<Record<string, unknown>>(db, 'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1', [test.controlId]),
        first<Record<string, unknown>>(db, 'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1', [test.processId]),
        test.riskId
          ? first<Record<string, unknown>>(db, 'SELECT * FROM RiskMaster WHERE id = ? LIMIT 1', [test.riskId])
          : Promise.resolve(null),
        all<Record<string, unknown>>(
          db,
          'SELECT * FROM TestSample WHERE toeTestId = ? ORDER BY sampleNumber ASC',
          [test.id]
        ),
        all<Record<string, unknown>>(
          db,
          'SELECT * FROM TestingException WHERE toeTestId = ? ORDER BY createdAt ASC',
          [test.id]
        )
      ]);

      const exceptions = await Promise.all(
        exceptionRows.map(async exception => {
          const deficiencyRows = await all<Record<string, unknown>>(
            db,
            'SELECT * FROM ControlDeficiency WHERE exceptionId = ? ORDER BY createdAt ASC',
            [exception.id]
          );
          const deficiencies = await Promise.all(deficiencyRows.map(row => loadDeficiency(db, row)));
          return { ...exception, deficiencies };
        })
      );

      return {
        ...test,
        populationSize: Number(test.populationSize || 0),
        sampleSize: Number(test.sampleSize || 0),
        passCount: Number(test.passCount || 0),
        failCount: Number(test.failCount || 0),
        control: control
          ? {
              ...control,
              isKeyControl: control.isKeyControl === 1,
              isIcofrKey: control.isIcofrKey === 1,
              isItgc: control.isItgc === 1
            }
          : null,
        process,
        risk,
        samples,
        exceptions
      };
    })
  );
}

export async function updateToeSample(input: {
  sampleId: string;
  result: string;
  failureReason?: string | null;
}) {
  const db = await ensureAssuranceSchema();
  const sample = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM TestSample WHERE id = ? LIMIT 1',
    [input.sampleId]
  );
  if (!sample) throw new Error('SAMPLE_NOT_FOUND');

  const sampleTest = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest WHERE id = ? LIMIT 1',
    [sample.toeTestId]
  );
  if (!sampleTest) throw new Error('TOE_TEST_NOT_FOUND');

  const sampleControl = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1',
    [sampleTest.controlId]
  );
  if (!sampleControl) throw new Error('CONTROL_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(sampleControl.institutionId),
    period: String(sampleTest.period)
  });

  const allowed = new Set(['Pass', 'Fail', 'N/A', 'Not Tested']);
  if (!allowed.has(input.result)) throw new Error('INVALID_SAMPLE_RESULT');
  if (input.result === 'Fail' && !input.failureReason?.trim()) {
    throw new Error('FAILURE_REASON_REQUIRED');
  }

  await run(
    db,
    'UPDATE TestSample SET result = ?, failureReason = ? WHERE id = ?',
    [
      input.result,
      input.result === 'Fail' ? nullable(input.failureReason) : null,
      input.sampleId
    ]
  );

  const counts = await first<{ sampleSize?: number; passCount?: number; failCount?: number }>(
    db,
    `SELECT
       COUNT(*) AS sampleSize,
       SUM(CASE WHEN result = 'Pass' THEN 1 ELSE 0 END) AS passCount,
       SUM(CASE WHEN result = 'Fail' THEN 1 ELSE 0 END) AS failCount
     FROM TestSample
     WHERE toeTestId = ?`,
    [sample.toeTestId]
  );

  await run(
    db,
    'UPDATE ToETest SET sampleSize = ?, passCount = ?, failCount = ? WHERE id = ?',
    [
      Number(counts?.sampleSize || 0),
      Number(counts?.passCount || 0),
      Number(counts?.failCount || 0),
      sample.toeTestId
    ]
  );

  return {
    ...sample,
    result: input.result,
    failureReason: input.result === 'Fail' ? nullable(input.failureReason) : null
  };
}

export async function listRemediationData() {
  const db = await ensureAssuranceSchema();
  const [exceptionRows, deficiencyRows, issueRows, mapRows, retestRows] = await Promise.all([
    all<Record<string, unknown>>(db, 'SELECT * FROM TestingException ORDER BY createdAt DESC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM ControlDeficiency ORDER BY createdAt DESC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM Issue ORDER BY createdAt DESC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM ManagementActionPlan ORDER BY createdAt DESC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM RetestRecord ORDER BY retestedAt DESC')
  ]);

  const exceptions = await Promise.all(
    exceptionRows.map(async row => {
      const test = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ToETest WHERE id = ? LIMIT 1',
        [row.toeTestId]
      );
      const [control, process, deficiencies] = test
        ? await Promise.all([
            first<Record<string, unknown>>(
              db,
              'SELECT id, controlId, name FROM ControlMaster WHERE id = ? LIMIT 1',
              [test.controlId]
            ),
            first<Record<string, unknown>>(
              db,
              'SELECT id, processId, name FROM BusinessProcess WHERE id = ? LIMIT 1',
              [test.processId]
            ),
            all<Record<string, unknown>>(
              db,
              'SELECT * FROM ControlDeficiency WHERE exceptionId = ? ORDER BY createdAt DESC',
              [row.id]
            )
          ])
        : [null, null, []];

      return {
        ...row,
        test,
        control,
        process,
        deficiencies
      };
    })
  );

  const [deficiencies, issues, maps, retests] = await Promise.all([
    Promise.all(deficiencyRows.map(row => loadDeficiency(db, row))),
    Promise.all(issueRows.map(row => loadIssue(db, row))),
    Promise.all(mapRows.map(row => loadMap(db, row))),
    Promise.all(
      retestRows.map(async row => {
        const map = await first<Record<string, unknown>>(
          db,
          'SELECT * FROM ManagementActionPlan WHERE id = ? LIMIT 1',
          [row.mapId]
        );
        let mapWithIssue: Record<string, unknown> | null = null;
        if (map) {
          const issue = await first<Record<string, unknown>>(
            db,
            'SELECT * FROM Issue WHERE id = ? LIMIT 1',
            [map.issueId]
          );
          mapWithIssue = { ...map, issue };
        }
        return {
          ...row,
          sampleCount: Number(row.sampleCount || 0),
          passedCount: Number(row.passedCount || 0),
          failedCount: Number(row.failedCount || 0),
          map: mapWithIssue
        };
      })
    )
  ]);

  return { exceptions, deficiencies, issues, maps, retests };
}

export async function requestMapExtension(input: {
  mapId: string;
  extensionReason: string;
  newDueDate: string;
  approverName: string;
}) {
  const db = await ensureAssuranceSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ManagementActionPlan WHERE id = ? LIMIT 1',
    [input.mapId]
  );
  if (!existing) throw new Error('MAP_NOT_FOUND');

  const extensionCount = Number(existing.extensionCount || 0) + 1;
  await run(
    db,
    `UPDATE ManagementActionPlan
        SET revisedDueDate = ?, extensionCount = ?, extensionReason = ?,
            approverName = ?, updatedAt = ?
      WHERE id = ?`,
    [
      input.newDueDate,
      extensionCount,
      input.extensionReason,
      input.approverName,
      nowIso(),
      input.mapId
    ]
  );

  return {
    ...existing,
    revisedDueDate: input.newDueDate,
    extensionCount,
    extensionReason: input.extensionReason,
    approverName: input.approverName,
    updatedAt: nowIso()
  };
}

export async function listMonitoringRules() {
  const db = await ensureAssuranceSchema();
  const rules = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM MonitoringRule ORDER BY createdAt DESC, ruleId ASC'
  );

  return Promise.all(
    rules.map(async rule => {
      const control = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1',
        [rule.controlId]
      );

      let controlWithProcess: Record<string, unknown> | null = null;
      if (control) {
        const process = await first<Record<string, unknown>>(
          db,
          'SELECT id, processId, name FROM BusinessProcess WHERE id = ? LIMIT 1',
          [control.processId]
        );
        controlWithProcess = {
          ...control,
          isKeyControl: control.isKeyControl === 1,
          isIcofrKey: control.isIcofrKey === 1,
          isItgc: control.isItgc === 1,
          process
        };
      }

      const runRows = await all<Record<string, unknown>>(
        db,
        'SELECT * FROM MonitoringRun WHERE ruleId = ? ORDER BY runTimestamp DESC LIMIT 10',
        [rule.id]
      );

      const runs = await Promise.all(
        runRows.map(async runRow => ({
          ...runRow,
          populationChecked: Number(runRow.populationChecked || 0),
          exceptionsFound: Number(runRow.exceptionsFound || 0),
          exceptions: await all<Record<string, unknown>>(
            db,
            'SELECT * FROM CCMException WHERE runId = ? ORDER BY detectedAt ASC',
            [runRow.id]
          )
        }))
      );

      return { ...rule, control: controlWithProcess, runs };
    })
  );
}

export async function createMonitoringRule(input: Record<string, unknown>) {
  const db = await ensureAssuranceSchema();
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? LIMIT 1',
    [input.controlId]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  const enterpriseId =
    typeof input.ruleId === 'string' && input.ruleId.trim()
      ? input.ruleId.trim()
      : 'CCM-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM MonitoringRule WHERE ruleId = ? LIMIT 1',
    [enterpriseId]
  );
  if (duplicate) throw new Error('RULE_ID_CONFLICT');

  const id = crypto.randomUUID();
  const createdAt = nowIso();

  await run(
    db,
    `INSERT INTO MonitoringRule (
      id, ruleId, controlId, name, description, dataSource, queryLogic,
      frequency, threshold, status, lastRunDate, lastStatus, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', NULL, 'Not Run', ?)`,
    [
      id,
      enterpriseId,
      control.id,
      input.name,
      input.description,
      input.dataSource,
      input.queryLogic,
      input.frequency || 'Real Time',
      input.threshold || '0 Transactions',
      createdAt
    ]
  );

  return {
    id,
    ruleId: enterpriseId,
    controlId: control.id,
    name: input.name,
    description: input.description,
    dataSource: input.dataSource,
    queryLogic: input.queryLogic,
    frequency: input.frequency || 'Real Time',
    threshold: input.threshold || '0 Transactions',
    status: 'Active',
    lastRunDate: null,
    lastStatus: 'Not Run',
    createdAt
  };
}

export async function ingestMonitoringRun(input: {
  ruleId: string;
  populationChecked: number;
  exceptionsFound: number;
  details?: string | null;
  exceptions?: Array<{ transactionRef?: string; details?: string }>;
}) {
  const db = await ensureAssuranceSchema();
  const rule = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM MonitoringRule WHERE id = ? LIMIT 1',
    [input.ruleId]
  );
  if (!rule) throw new Error('RULE_NOT_FOUND');

  const status = input.exceptionsFound > 0 ? 'Exception Detected' : 'Healthy';
  const runId = crypto.randomUUID();
  const runTimestamp = nowIso();

  await run(
    db,
    `INSERT INTO MonitoringRun (
      id, ruleId, runTimestamp, populationChecked, exceptionsFound, status, details
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      rule.id,
      runTimestamp,
      input.populationChecked,
      input.exceptionsFound,
      status,
      nullable(input.details)
    ]
  );

  for (const exception of input.exceptions || []) {
    if (!exception.transactionRef || !exception.details) continue;
    await run(
      db,
      `INSERT INTO CCMException (id, runId, transactionRef, details, detectedAt)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), runId, exception.transactionRef, exception.details, runTimestamp]
    );
  }

  await run(
    db,
    'UPDATE MonitoringRule SET lastRunDate = ?, lastStatus = ? WHERE id = ?',
    [runTimestamp, status, rule.id]
  );

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM MonitoringRun WHERE id = ? LIMIT 1',
    [runId]
  );
}

async function count(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const row = await first<{ count?: number }>(db, sql, values);
  return Number(row?.count || 0);
}

export async function getAssuranceDashboardMetrics() {
  const db = await ensureAssuranceSchema();

  const [
    failedToEs,
    totalExceptions,
    openIssues,
    closedIssues,
    overdueMAP,
    completedMAP,
    ccmHealthy,
    totalRetests,
    testedKeyControls
  ] = await Promise.all([
    count(
      db,
      `SELECT COUNT(*) AS count FROM ToETest
        WHERE failCount > 0 OR finalConclusion IN ('Partially Effective', 'Ineffective')`
    ),
    count(db, 'SELECT COUNT(*) AS count FROM TestingException'),
    count(db, "SELECT COUNT(*) AS count FROM Issue WHERE status <> 'Closed'"),
    count(db, "SELECT COUNT(*) AS count FROM Issue WHERE status = 'Closed'"),
    count(db, "SELECT COUNT(*) AS count FROM ManagementActionPlan WHERE status = 'Overdue'"),
    count(
      db,
      "SELECT COUNT(*) AS count FROM ManagementActionPlan WHERE status IN ('Completed by Owner', 'Closed')"
    ),
    count(db, "SELECT COUNT(*) AS count FROM MonitoringRule WHERE lastStatus = 'Healthy'"),
    count(db, 'SELECT COUNT(*) AS count FROM RetestRecord'),
    count(
      db,
      `SELECT COUNT(DISTINCT t.controlId) AS count
         FROM ToETest t
         JOIN ControlMaster c ON c.id = t.controlId
        WHERE c.isKeyControl = 1`
    )
  ]);

  return {
    failedToEs,
    totalExceptions,
    openIssues,
    closedIssues,
    overdueMAP,
    completedMAP,
    ccmHealthy,
    totalRetests,
    testedKeyControls
  };
}

export async function enrichRcmWithAssurance(rows: Array<Record<string, unknown>>) {
  const db = await ensureAssuranceSchema();

  return Promise.all(
    rows.map(async row => {
      const control = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ControlMaster WHERE controlId = ? LIMIT 1',
        [row.controlId]
      );
      if (!control) return row;

      const toe = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ToETest WHERE controlId = ? ORDER BY testedAt DESC LIMIT 1',
        [control.id]
      );
      const issue = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM Issue WHERE controlId = ? ORDER BY createdAt DESC LIMIT 1',
        [control.id]
      );
      const map = issue
        ? await first<Record<string, unknown>>(
            db,
            'SELECT * FROM ManagementActionPlan WHERE issueId = ? ORDER BY createdAt DESC LIMIT 1',
            [issue.id]
          )
        : null;
      const retest = map
        ? await first<Record<string, unknown>>(
            db,
            'SELECT * FROM RetestRecord WHERE mapId = ? ORDER BY retestedAt DESC LIMIT 1',
            [map.id]
          )
        : null;

      return {
        ...row,
        toeConclusion: toe?.finalConclusion || 'Not Tested',
        toePassRatio: toe
          ? `${Number(toe.passCount || 0)}/${Number(toe.sampleSize || 0)} Pass`
          : 'Not Tested',
        issueId: issue?.issueId || null,
        issueTitle: issue?.title || null,
        issueSeverity: issue?.severity || null,
        issueStatus: issue?.status || 'No Issue',
        mapId: map?.mapId || null,
        mapAgreedAction: map?.agreedAction || null,
        mapStatus: map?.status || null,
        mapProgress: map ? `${Number(map.progressPercent || 0)}%` : null,
        retestResult: retest?.result || null
      };
    })
  );
}
