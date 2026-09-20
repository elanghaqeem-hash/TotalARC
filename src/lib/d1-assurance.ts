import { getCloudflareContext } from '@opennextjs/cloudflare';
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
  const statements = script
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function nullable(value: unknown) {
  return value === undefined || value === '' ? null : value;
}

async function tenantToeTest(
  db: D1DatabaseLike,
  toeTestId: string,
  institutionId: string
) {
  return first<Record<string, unknown>>(
    db,
    `SELECT t.*
       FROM ToETest t
       JOIN BusinessProcess p ON p.id = t.processId
      WHERE t.id = ? AND p.institutionId = ?
      LIMIT 1`,
    [toeTestId, institutionId]
  );
}

async function tenantException(
  db: D1DatabaseLike,
  exceptionId: string,
  institutionId: string
) {
  return first<Record<string, unknown>>(
    db,
    `SELECT e.*
       FROM TestingException e
       JOIN ToETest t ON t.id = e.toeTestId
       JOIN BusinessProcess p ON p.id = t.processId
      WHERE e.id = ? AND p.institutionId = ?
      LIMIT 1`,
    [exceptionId, institutionId]
  );
}

async function tenantDeficiency(
  db: D1DatabaseLike,
  deficiencyId: string,
  institutionId: string
) {
  return first<Record<string, unknown>>(
    db,
    `SELECT d.*
       FROM ControlDeficiency d
       JOIN TestingException e ON e.id = d.exceptionId
       JOIN ToETest t ON t.id = e.toeTestId
       JOIN BusinessProcess p ON p.id = t.processId
      WHERE d.id = ? AND p.institutionId = ?
      LIMIT 1`,
    [deficiencyId, institutionId]
  );
}

async function tenantIssue(
  db: D1DatabaseLike,
  issueId: string,
  institutionId: string
) {
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Issue WHERE id = ? AND institutionId = ? LIMIT 1',
    [issueId, institutionId]
  );
}

async function tenantMap(
  db: D1DatabaseLike,
  mapId: string,
  institutionId: string
) {
  return first<Record<string, unknown>>(
    db,
    `SELECT m.*
       FROM ManagementActionPlan m
       JOIN Issue i ON i.id = m.issueId
      WHERE m.id = ? AND i.institutionId = ?
      LIMIT 1`,
    [mapId, institutionId]
  );
}

async function tenantMonitoringRule(
  db: D1DatabaseLike,
  ruleId: string,
  institutionId: string
) {
  return first<Record<string, unknown>>(
    db,
    `SELECT r.*
       FROM MonitoringRule r
       JOIN ControlMaster c ON c.id = r.controlId
      WHERE r.id = ? AND c.institutionId = ?
      LIMIT 1`,
    [ruleId, institutionId]
  );
}

let assuranceSchemaPromise: Promise<D1DatabaseLike> | null = null;

async function initializeAssuranceSchema() {
  const db = await getDb();

  await executeSchemaScript(db, `
    CREATE TABLE IF NOT EXISTS AssessmentCampaign (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      orgUnitId TEXT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'RCSA',
      period TEXT NOT NULL,
      startDate TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      ownerName TEXT NOT NULL,
      approverName TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assessment_campaign_institution ON AssessmentCampaign(institutionId);
    CREATE INDEX IF NOT EXISTS idx_assessment_campaign_org_unit ON AssessmentCampaign(orgUnitId);

    CREATE TABLE IF NOT EXISTS CSAResponse (
      id TEXT PRIMARY KEY NOT NULL,
      campaignId TEXT NOT NULL,
      controlId TEXT NOT NULL,
      wasPerformed INTEGER NOT NULL DEFAULT 0,
      frequencyMet INTEGER NOT NULL DEFAULT 0,
      evidenceAttached INTEGER NOT NULL DEFAULT 0,
      exceptionsFound INTEGER NOT NULL DEFAULT 0,
      exceptionCount INTEGER NOT NULL DEFAULT 0,
      processChanged INTEGER NOT NULL DEFAULT 0,
      controlChanged INTEGER NOT NULL DEFAULT 0,
      csaConclusion TEXT NOT NULL DEFAULT 'Not Performed',
      assessorNotes TEXT,
      assessorName TEXT NOT NULL,
      assessedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_csa_campaign_control ON CSAResponse(campaignId, controlId);
    CREATE INDEX IF NOT EXISTS idx_csa_control ON CSAResponse(controlId);

    CREATE TABLE IF NOT EXISTS FinancialAccount (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      orgUnitId TEXT,
      accountCode TEXT NOT NULL,
      accountName TEXT NOT NULL,
      financialStatement TEXT NOT NULL,
      balanceAmount REAL NOT NULL DEFAULT 0,
      isSignificant INTEGER NOT NULL DEFAULT 0,
      scopingRationale TEXT,
      fraudExposure TEXT NOT NULL DEFAULT 'Not Assessed',
      complexity TEXT NOT NULL DEFAULT 'Not Assessed',
      createdAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_account_code ON FinancialAccount(institutionId, accountCode);
    CREATE INDEX IF NOT EXISTS idx_financial_account_org_unit ON FinancialAccount(orgUnitId);

    CREATE TABLE IF NOT EXISTS AccountAssertionMapping (
      id TEXT PRIMARY KEY NOT NULL,
      accountId TEXT NOT NULL,
      assertion TEXT NOT NULL,
      isInScope INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_account_assertion ON AccountAssertionMapping(accountId, assertion);

    CREATE TABLE IF NOT EXISTS IPERegister (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      orgUnitId TEXT,
      reportName TEXT NOT NULL,
      systemSource TEXT NOT NULL,
      reportOwner TEXT NOT NULL,
      parameters TEXT,
      logicSummary TEXT,
      completenessTested INTEGER NOT NULL DEFAULT 0,
      accuracyTested INTEGER NOT NULL DEFAULT 0,
      evidenceDoc TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ipe_institution ON IPERegister(institutionId);
    CREATE INDEX IF NOT EXISTS idx_ipe_org_unit ON IPERegister(orgUnitId);

    CREATE TABLE IF NOT EXISTS Walkthrough (
      id TEXT PRIMARY KEY NOT NULL,
      controlId TEXT NOT NULL,
      date TEXT NOT NULL,
      participants TEXT,
      transactionRef TEXT,
      systemsInspected TEXT,
      observations TEXT,
      processChanged INTEGER NOT NULL DEFAULT 0,
      conclusion TEXT NOT NULL DEFAULT 'Not Assessed',
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_walkthrough_control ON Walkthrough(controlId);

    CREATE TABLE IF NOT EXISTS ToDTest (
      id TEXT PRIMARY KEY NOT NULL,
      testId TEXT NOT NULL,
      controlId TEXT NOT NULL,
      processId TEXT NOT NULL,
      riskId TEXT,
      testerName TEXT NOT NULL,
      reviewerName TEXT,
      period TEXT NOT NULL,
      testObjective TEXT NOT NULL,
      objectiveAlignment INTEGER NOT NULL DEFAULT 0,
      riskCoverage INTEGER NOT NULL DEFAULT 0,
      precisionAdequate INTEGER NOT NULL DEFAULT 0,
      segregationDuties INTEGER NOT NULL DEFAULT 0,
      evidenceSufficiency INTEGER NOT NULL DEFAULT 0,
      observations TEXT,
      conclusion TEXT NOT NULL DEFAULT 'Not Assessed',
      status TEXT NOT NULL DEFAULT 'Draft',
      testedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tod_test_id ON ToDTest(testId);
    CREATE INDEX IF NOT EXISTS idx_tod_control ON ToDTest(controlId);
    CREATE INDEX IF NOT EXISTS idx_tod_process ON ToDTest(processId);

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

    CREATE TABLE IF NOT EXISTS ControlCertification (
      id TEXT PRIMARY KEY NOT NULL,
      controlId TEXT NOT NULL,
      period TEXT NOT NULL,
      declarationText TEXT NOT NULL,
      certifierName TEXT NOT NULL,
      certifierRole TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      certifiedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_certification_control ON ControlCertification(controlId);

    CREATE TABLE IF NOT EXISTS ManagementAttestation (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      orgUnitId TEXT,
      period TEXT NOT NULL,
      scopeSummary TEXT NOT NULL,
      cfoSignOff INTEGER NOT NULL DEFAULT 0,
      cfoName TEXT,
      croSignOff INTEGER NOT NULL DEFAULT 0,
      croName TEXT,
      overallOpinion TEXT,
      attestedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attestation_institution ON ManagementAttestation(institutionId);
    CREATE INDEX IF NOT EXISTS idx_attestation_org_unit ON ManagementAttestation(orgUnitId);

    CREATE TABLE IF NOT EXISTS Task (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      userId TEXT,
      orgUnitId TEXT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      dueDate TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'High',
      status TEXT NOT NULL DEFAULT 'Pending',
      entityRef TEXT,
      link TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_task_institution ON Task(institutionId);
    CREATE INDEX IF NOT EXISTS idx_task_user ON Task(userId);
    CREATE INDEX IF NOT EXISTS idx_task_org_unit ON Task(orgUnitId);
    CREATE INDEX IF NOT EXISTS idx_task_due_date ON Task(dueDate);

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
}



export async function ensureAssuranceSchema() {
  if (!assuranceSchemaPromise) {
    assuranceSchemaPromise = initializeAssuranceSchema().catch(error => {
      assuranceSchemaPromise = null;
      throw error;
    });
  }
  return assuranceSchemaPromise;
}

function storedBoolean(value: unknown) {
  return value === true || value === 1 || value === '1';
}

async function loadControlContext(
  db: D1DatabaseLike,
  controlId: string,
  institutionId: string
) {
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    [controlId, institutionId]
  );
  if (!control) return null;

  const process = await first<Record<string, unknown>>(
    db,
    'SELECT id, processId, name, legalEntityId, orgUnitId FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    [control.processId, institutionId]
  );

  return {
    ...control,
    isKeyControl: storedBoolean(control.isKeyControl),
    isIcofrKey: storedBoolean(control.isIcofrKey),
    isItgc: storedBoolean(control.isItgc),
    process
  };
}

export async function listRcsaData(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const campaignRows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentCampaign WHERE institutionId = ? ORDER BY startDate DESC, createdAt DESC',
    [institutionId]
  );

  const campaigns = await Promise.all(
    campaignRows.map(async campaign => {
      const responseRows = await all<Record<string, unknown>>(
        db,
        'SELECT * FROM CSAResponse WHERE campaignId = ? ORDER BY assessedAt DESC',
        [campaign.id]
      );
      const csaResponses = await Promise.all(
        responseRows.map(async response => ({
          ...response,
          wasPerformed: storedBoolean(response.wasPerformed),
          frequencyMet: storedBoolean(response.frequencyMet),
          evidenceAttached: storedBoolean(response.evidenceAttached),
          exceptionsFound: storedBoolean(response.exceptionsFound),
          processChanged: storedBoolean(response.processChanged),
          controlChanged: storedBoolean(response.controlChanged),
          exceptionCount: Number(response.exceptionCount || 0),
          control: await loadControlContext(
            db,
            String(response.controlId || ''),
            institutionId
          )
        }))
      );
      return { ...campaign, csaResponses };
    })
  );

  return { campaigns };
}

export async function createAssessmentCampaign(input: {
  name: string;
  type: string;
  period: string;
  startDate: string;
  dueDate: string;
  ownerName: string;
  approverName?: string | null;
  orgUnitId?: string | null;
  legalEntityId?: string | null;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO AssessmentCampaign (
      id, institutionId, legalEntityId, orgUnitId, name, type, period,
      startDate, dueDate, status, ownerName, approverName, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, ?)`,
    [
      id,
      institutionId,
      nullable(input.legalEntityId),
      nullable(input.orgUnitId),
      input.name,
      input.type,
      input.period,
      input.startDate,
      input.dueDate,
      input.ownerName,
      nullable(input.approverName),
      nowIso()
    ]
  );
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentCampaign WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
}

export async function upsertCsaResponse(input: {
  campaignId: string;
  controlId: string;
  wasPerformed: boolean;
  frequencyMet: boolean;
  evidenceAttached: boolean;
  exceptionsFound: boolean;
  exceptionCount: number;
  processChanged: boolean;
  controlChanged: boolean;
  csaConclusion: string;
  assessorNotes?: string | null;
  assessorName: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const campaign = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AssessmentCampaign WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.campaignId, institutionId]
  );
  if (!campaign) throw new Error('RCSA_CAMPAIGN_NOT_FOUND');

  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.controlId, institutionId]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM CSAResponse WHERE campaignId = ? AND controlId = ? LIMIT 1',
    [input.campaignId, input.controlId]
  );
  const assessedAt = nowIso();

  if (existing?.id) {
    await run(
      db,
      `UPDATE CSAResponse
          SET wasPerformed = ?, frequencyMet = ?, evidenceAttached = ?,
              exceptionsFound = ?, exceptionCount = ?, processChanged = ?,
              controlChanged = ?, csaConclusion = ?, assessorNotes = ?,
              assessorName = ?, assessedAt = ?
        WHERE id = ?`,
      [
        input.wasPerformed ? 1 : 0,
        input.frequencyMet ? 1 : 0,
        input.evidenceAttached ? 1 : 0,
        input.exceptionsFound ? 1 : 0,
        input.exceptionCount,
        input.processChanged ? 1 : 0,
        input.controlChanged ? 1 : 0,
        input.csaConclusion,
        nullable(input.assessorNotes),
        input.assessorName,
        assessedAt,
        existing.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO CSAResponse (
        id, campaignId, controlId, wasPerformed, frequencyMet, evidenceAttached,
        exceptionsFound, exceptionCount, processChanged, controlChanged,
        csaConclusion, assessorNotes, assessorName, assessedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.campaignId,
        input.controlId,
        input.wasPerformed ? 1 : 0,
        input.frequencyMet ? 1 : 0,
        input.evidenceAttached ? 1 : 0,
        input.exceptionsFound ? 1 : 0,
        input.exceptionCount,
        input.processChanged ? 1 : 0,
        input.controlChanged ? 1 : 0,
        input.csaConclusion,
        nullable(input.assessorNotes),
        input.assessorName,
        assessedAt
      ]
    );
  }

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM CSAResponse WHERE campaignId = ? AND controlId = ? LIMIT 1',
    [input.campaignId, input.controlId]
  );
}

export async function listTodData(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const [testRows, walkthroughRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT t.*
         FROM ToDTest t
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE p.institutionId = ?
        ORDER BY t.testedAt DESC, t.testId ASC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT w.*
         FROM Walkthrough w
         JOIN ControlMaster c ON c.id = w.controlId
        WHERE c.institutionId = ?
        ORDER BY w.date DESC, w.createdAt DESC`,
      [institutionId]
    )
  ]);

  const todTests = await Promise.all(
    testRows.map(async test => ({
      ...test,
      objectiveAlignment: storedBoolean(test.objectiveAlignment),
      riskCoverage: storedBoolean(test.riskCoverage),
      precisionAdequate: storedBoolean(test.precisionAdequate),
      segregationDuties: storedBoolean(test.segregationDuties),
      evidenceSufficiency: storedBoolean(test.evidenceSufficiency),
      control: await loadControlContext(db, String(test.controlId || ''), institutionId),
      process: await first<Record<string, unknown>>(
        db,
        'SELECT id, processId, name, legalEntityId, orgUnitId FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
        [test.processId, institutionId]
      ),
      risk: test.riskId
        ? await first<Record<string, unknown>>(
            db,
            'SELECT id, riskId, name FROM RiskMaster WHERE id = ? AND institutionId = ? LIMIT 1',
            [test.riskId, institutionId]
          )
        : null
    }))
  );

  const walkthroughs = await Promise.all(
    walkthroughRows.map(async walk => {
      const control = await loadControlContext(db, String(walk.controlId || ''), institutionId);
      return {
        ...walk,
        processChanged: storedBoolean(walk.processChanged),
        control,
        process: (control?.process as Record<string, unknown> | null) || null
      };
    })
  );

  return { todTests, walkthroughs };
}

export async function createTodTest(input: {
  testId?: string;
  controlId: string;
  riskId?: string | null;
  testerName: string;
  reviewerName?: string | null;
  period: string;
  testObjective: string;
  objectiveAlignment: boolean;
  riskCoverage: boolean;
  precisionAdequate: boolean;
  segregationDuties: boolean;
  evidenceSufficiency: boolean;
  observations?: string | null;
  conclusion: string;
  status?: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.controlId, institutionId]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  if (input.riskId) {
    const risk = await first<Record<string, unknown>>(
      db,
      'SELECT id FROM RiskMaster WHERE id = ? AND institutionId = ? AND processId = ? LIMIT 1',
      [input.riskId, institutionId, control.processId]
    );
    if (!risk) throw new Error('RISK_NOT_FOUND');
  }

  const testId = input.testId?.trim() || 'TOD-' + crypto.randomUUID().slice(0, 8).toUpperCase();
  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ToDTest WHERE testId = ? LIMIT 1',
    [testId]
  );
  if (duplicate) throw new Error('TOD_TEST_ID_CONFLICT');

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO ToDTest (
      id, testId, controlId, processId, riskId, testerName, reviewerName,
      period, testObjective, objectiveAlignment, riskCoverage, precisionAdequate,
      segregationDuties, evidenceSufficiency, observations, conclusion, status, testedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      testId,
      control.id,
      control.processId,
      nullable(input.riskId),
      input.testerName,
      nullable(input.reviewerName),
      input.period,
      input.testObjective,
      input.objectiveAlignment ? 1 : 0,
      input.riskCoverage ? 1 : 0,
      input.precisionAdequate ? 1 : 0,
      input.segregationDuties ? 1 : 0,
      input.evidenceSufficiency ? 1 : 0,
      nullable(input.observations),
      input.conclusion,
      input.status || 'Draft',
      nowIso()
    ]
  );

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM ToDTest WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function createWalkthrough(input: {
  controlId: string;
  date: string;
  participants?: string | null;
  transactionRef?: string | null;
  systemsInspected?: string | null;
  observations?: string | null;
  processChanged: boolean;
  conclusion: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.controlId, institutionId]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO Walkthrough (
      id, controlId, date, participants, transactionRef, systemsInspected,
      observations, processChanged, conclusion, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.controlId,
      input.date,
      nullable(input.participants),
      nullable(input.transactionRef),
      nullable(input.systemsInspected),
      nullable(input.observations),
      input.processChanged ? 1 : 0,
      input.conclusion,
      nowIso()
    ]
  );
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Walkthrough WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function listIcofrData(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const [accountRows, ipeRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM FinancialAccount WHERE institutionId = ? ORDER BY accountCode ASC',
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM IPERegister WHERE institutionId = ? ORDER BY reportName ASC',
      [institutionId]
    )
  ]);

  const financialAccounts = await Promise.all(
    accountRows.map(async account => ({
      ...account,
      balanceAmount: Number(account.balanceAmount || 0),
      isSignificant: storedBoolean(account.isSignificant),
      assertions: (await all<Record<string, unknown>>(
        db,
        'SELECT * FROM AccountAssertionMapping WHERE accountId = ? ORDER BY assertion ASC',
        [account.id]
      )).map(assertion => ({
        ...assertion,
        isInScope: storedBoolean(assertion.isInScope)
      }))
    }))
  );

  const ipeRegisters = ipeRows.map(ipe => ({
    ...ipe,
    completenessTested: storedBoolean(ipe.completenessTested),
    accuracyTested: storedBoolean(ipe.accuracyTested)
  }));

  return { financialAccounts, ipeRegisters };
}

export async function createFinancialAccount(input: {
  legalEntityId?: string | null;
  orgUnitId?: string | null;
  accountCode: string;
  accountName: string;
  financialStatement: string;
  balanceAmount: number;
  isSignificant: boolean;
  scopingRationale?: string | null;
  fraudExposure: string;
  complexity: string;
  assertions?: Array<{ assertion: string; isInScope: boolean }>;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM FinancialAccount WHERE institutionId = ? AND accountCode = ? LIMIT 1',
    [institutionId, input.accountCode]
  );
  if (duplicate) throw new Error('FINANCIAL_ACCOUNT_CODE_CONFLICT');

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO FinancialAccount (
      id, institutionId, legalEntityId, orgUnitId, accountCode, accountName,
      financialStatement, balanceAmount, isSignificant, scopingRationale,
      fraudExposure, complexity, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      institutionId,
      nullable(input.legalEntityId),
      nullable(input.orgUnitId),
      input.accountCode,
      input.accountName,
      input.financialStatement,
      input.balanceAmount,
      input.isSignificant ? 1 : 0,
      nullable(input.scopingRationale),
      input.fraudExposure,
      input.complexity,
      nowIso()
    ]
  );

  for (const assertion of input.assertions || []) {
    if (!assertion.assertion.trim()) continue;
    await run(
      db,
      `INSERT INTO AccountAssertionMapping (id, accountId, assertion, isInScope, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        id,
        assertion.assertion.trim(),
        assertion.isInScope ? 1 : 0,
        nowIso()
      ]
    );
  }

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM FinancialAccount WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
}

export async function upsertAccountAssertion(input: {
  accountId: string;
  assertion: string;
  isInScope: boolean;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const account = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM FinancialAccount WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.accountId, institutionId]
  );
  if (!account) throw new Error('FINANCIAL_ACCOUNT_NOT_FOUND');

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM AccountAssertionMapping WHERE accountId = ? AND assertion = ? LIMIT 1',
    [input.accountId, input.assertion]
  );
  if (existing?.id) {
    await run(
      db,
      'UPDATE AccountAssertionMapping SET isInScope = ? WHERE id = ?',
      [input.isInScope ? 1 : 0, existing.id]
    );
  } else {
    await run(
      db,
      `INSERT INTO AccountAssertionMapping (id, accountId, assertion, isInScope, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), input.accountId, input.assertion, input.isInScope ? 1 : 0, nowIso()]
    );
  }
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM AccountAssertionMapping WHERE accountId = ? AND assertion = ? LIMIT 1',
    [input.accountId, input.assertion]
  );
}

export async function createIpeRegister(input: {
  legalEntityId?: string | null;
  orgUnitId?: string | null;
  reportName: string;
  systemSource: string;
  reportOwner: string;
  parameters?: string | null;
  logicSummary?: string | null;
  completenessTested: boolean;
  accuracyTested: boolean;
  evidenceDoc?: string | null;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO IPERegister (
      id, institutionId, legalEntityId, orgUnitId, reportName, systemSource,
      reportOwner, parameters, logicSummary, completenessTested, accuracyTested,
      evidenceDoc, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      institutionId,
      nullable(input.legalEntityId),
      nullable(input.orgUnitId),
      input.reportName,
      input.systemSource,
      input.reportOwner,
      nullable(input.parameters),
      nullable(input.logicSummary),
      input.completenessTested ? 1 : 0,
      input.accuracyTested ? 1 : 0,
      nullable(input.evidenceDoc),
      nowIso()
    ]
  );
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM IPERegister WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
}


export async function listCertificationData(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const [certRows, attestationRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT cert.*
         FROM ControlCertification cert
         JOIN ControlMaster c ON c.id = cert.controlId
        WHERE c.institutionId = ?
        ORDER BY cert.certifiedAt DESC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ManagementAttestation WHERE institutionId = ? ORDER BY attestedAt DESC',
      [institutionId]
    )
  ]);

  const certifications = await Promise.all(
    certRows.map(async cert => ({
      ...cert,
      control: await loadControlContext(db, String(cert.controlId || ''), institutionId)
    }))
  );

  const attestations = attestationRows.map(attestation => ({
    ...attestation,
    cfoSignOff: storedBoolean(attestation.cfoSignOff),
    croSignOff: storedBoolean(attestation.croSignOff)
  }));

  return { certifications, attestations };
}

export async function createControlCertification(input: {
  controlId: string;
  period: string;
  declarationText: string;
  certifierName: string;
  certifierRole: string;
  status: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.controlId, institutionId]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO ControlCertification (
      id, controlId, period, declarationText, certifierName, certifierRole,
      status, certifiedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.controlId,
      input.period,
      input.declarationText,
      input.certifierName,
      input.certifierRole,
      input.status,
      nowIso()
    ]
  );

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlCertification WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function createManagementAttestation(input: {
  legalEntityId?: string | null;
  orgUnitId?: string | null;
  period: string;
  scopeSummary: string;
  cfoSignOff: boolean;
  cfoName?: string | null;
  croSignOff: boolean;
  croName?: string | null;
  overallOpinion?: string | null;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO ManagementAttestation (
      id, institutionId, legalEntityId, orgUnitId, period, scopeSummary,
      cfoSignOff, cfoName, croSignOff, croName, overallOpinion, attestedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      institutionId,
      nullable(input.legalEntityId),
      nullable(input.orgUnitId),
      input.period,
      input.scopeSummary,
      input.cfoSignOff ? 1 : 0,
      nullable(input.cfoName),
      input.croSignOff ? 1 : 0,
      nullable(input.croName),
      nullable(input.overallOpinion),
      nowIso()
    ]
  );

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM ManagementAttestation WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
}

export async function listTasksData(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const rows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM Task WHERE institutionId = ? ORDER BY dueDate ASC, createdAt DESC',
    [institutionId]
  );

  return Promise.all(
    rows.map(async task => {
      const user = task.userId
        ? await first<Record<string, unknown>>(
            db,
            'SELECT id, email, name, role, department, orgUnitId, active FROM AccessUser WHERE id = ? AND institutionId = ? LIMIT 1',
            [task.userId, institutionId]
          )
        : null;
      return {
        ...task,
        user: user
          ? {
              ...user,
              active: Number(user.active) === 1
            }
          : null
      };
    })
  );
}

export async function createTask(input: {
  userId?: string | null;
  orgUnitId?: string | null;
  title: string;
  type: string;
  dueDate: string;
  priority: string;
  status?: string;
  entityRef?: string | null;
  link?: string | null;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();

  if (input.userId) {
    const user = await first<Record<string, unknown>>(
      db,
      'SELECT id FROM AccessUser WHERE id = ? AND institutionId = ? AND active = 1 LIMIT 1',
      [input.userId, institutionId]
    );
    if (!user) throw new Error('TASK_USER_NOT_FOUND');
  }

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO Task (
      id, institutionId, userId, orgUnitId, title, type, dueDate, priority,
      status, entityRef, link, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      institutionId,
      nullable(input.userId),
      nullable(input.orgUnitId),
      input.title,
      input.type,
      input.dueDate,
      input.priority,
      input.status || 'Pending',
      nullable(input.entityRef),
      nullable(input.link),
      nowIso()
    ]
  );

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Task WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
}

export async function updateTaskStatus(input: {
  taskId: string;
  status: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM Task WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.taskId, institutionId]
  );
  if (!existing) throw new Error('TASK_NOT_FOUND');

  await run(
    db,
    'UPDATE Task SET status = ? WHERE id = ? AND institutionId = ?',
    [input.status, input.taskId, institutionId]
  );

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Task WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.taskId, institutionId]
  );
}


export async function listCalendarData(institutionId: string) {
  const db = await ensureAssuranceSchema();

  const [
    campaigns,
    toeTests,
    actionPlans,
    retests,
    certificationRows,
    attestations,
    taskRows
  ] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT id, name, type, period, dueDate, status, ownerName, orgUnitId
         FROM AssessmentCampaign
        WHERE institutionId = ?
        ORDER BY dueDate ASC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT t.id, t.testId, t.testedAt, t.status, t.testerName, p.orgUnitId
         FROM ToETest t
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE p.institutionId = ?
        ORDER BY t.testedAt ASC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT m.id, m.mapId, m.originalDueDate, m.revisedDueDate, m.status,
              m.actionOwner, p.orgUnitId
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id = m.issueId
         JOIN BusinessProcess p ON p.id = i.processId
        WHERE i.institutionId = ?
        ORDER BY COALESCE(m.revisedDueDate, m.originalDueDate) ASC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT r.id, r.retestId, r.retestedAt, r.result, r.testerName, p.orgUnitId
         FROM RetestRecord r
         JOIN ManagementActionPlan m ON m.id = r.mapId
         JOIN Issue i ON i.id = m.issueId
         JOIN BusinessProcess p ON p.id = i.processId
        WHERE i.institutionId = ?
        ORDER BY r.retestedAt ASC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT cert.id, cert.certifiedAt, cert.period, cert.status,
              cert.certifierName, c.controlId AS enterpriseControlId, p.orgUnitId
         FROM ControlCertification cert
         JOIN ControlMaster c ON c.id = cert.controlId
         JOIN BusinessProcess p ON p.id = c.processId
        WHERE c.institutionId = ?
        ORDER BY cert.certifiedAt ASC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT id, period, overallOpinion, cfoName, croName, attestedAt, orgUnitId
         FROM ManagementAttestation
        WHERE institutionId = ?
        ORDER BY attestedAt ASC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT t.id, t.title, t.type, t.dueDate, t.priority, t.status, t.orgUnitId,
              t.userId, u.name AS assigneeName
         FROM Task t
         LEFT JOIN AccessUser u ON u.id = t.userId AND u.institutionId = t.institutionId
        WHERE t.institutionId = ?
        ORDER BY t.dueDate ASC`,
      [institutionId]
    )
  ]);

  return {
    campaigns,
    toeTests,
    actionPlans,
    retests,
    certifications: certificationRows.map(row => ({
      ...row,
      control: {
        controlId: row.enterpriseControlId
      }
    })),
    attestations,
    tasks: taskRows.map(row => ({
      ...row,
      user: row.userId
        ? { id: row.userId, name: row.assigneeName || null }
        : null
    }))
  };
}

async function loadMap(db: D1DatabaseLike, row: Record<string, unknown>, institutionId: string) {
  const [issue, milestones, retests] = await Promise.all([
    first<Record<string, unknown>>(db, 'SELECT * FROM Issue WHERE id = ? AND institutionId = ? LIMIT 1', [row.issueId, institutionId]),
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
        'SELECT id, processId, name, legalEntityId, orgUnitId FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
        [issue.processId, institutionId]
      ),
      issue.controlId
        ? first<Record<string, unknown>>(
            db,
            'SELECT id, controlId, name FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
            [issue.controlId, institutionId]
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

async function loadIssue(db: D1DatabaseLike, row: Record<string, unknown>, institutionId: string) {
  const [process, risk, control, deficiency, actionPlanRows] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      'SELECT id, processId, name, legalEntityId, orgUnitId FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
      [row.processId, institutionId]
    ),
    row.riskId
      ? first<Record<string, unknown>>(
          db,
          'SELECT id, riskId, name FROM RiskMaster WHERE id = ? AND institutionId = ? LIMIT 1',
          [row.riskId, institutionId]
        )
      : Promise.resolve(null),
    row.controlId
      ? first<Record<string, unknown>>(
          db,
          'SELECT id, controlId, name FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
          [row.controlId, institutionId]
        )
      : Promise.resolve(null),
    row.deficiencyId
      ? tenantDeficiency(db, String(row.deficiencyId), institutionId)
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

  const actionPlans = await Promise.all(actionPlanRows.map(map => loadMap(db, map, institutionId)));

  return {
    ...row,
    process,
    risk,
    control,
    deficiency: deficiencyWithRoot,
    actionPlans
  };
}

async function loadDeficiency(db: D1DatabaseLike, row: Record<string, unknown>, institutionId: string) {
  const [exception, rootCause, issues, process] = await Promise.all([
    row.exceptionId
      ? tenantException(db, String(row.exceptionId), institutionId)
      : Promise.resolve(null),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM RootCauseAnalysis WHERE deficiencyId = ? LIMIT 1',
      [row.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM Issue WHERE deficiencyId = ? AND institutionId = ? ORDER BY createdAt DESC',
      [row.id, institutionId]
    ),
    row.exceptionId
      ? first<Record<string, unknown>>(
          db,
          `SELECT p.id, p.processId, p.name, p.legalEntityId, p.orgUnitId
             FROM TestingException e
             JOIN ToETest t ON t.id = e.toeTestId
             JOIN BusinessProcess p ON p.id = t.processId
            WHERE e.id = ? AND p.institutionId = ?
            LIMIT 1`,
          [row.exceptionId, institutionId]
        )
      : Promise.resolve(null)
  ]);

  return {
    ...row,
    humanApproved: row.humanApproved === 1,
    exception,
    rootCause,
    issues,
    process
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
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.controlId, institutionId]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM ToETest WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function addToeSample(input: {
  toeTestId: string;
  transactionRef: string;
  transactionDate: string;
  amount?: number | null;
  attributesTested?: string | null;
  evidenceRef?: string | null;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const test = await tenantToeTest(db, input.toeTestId, institutionId);
  if (!test) throw new Error('TOE_TEST_NOT_FOUND');

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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM TestSample WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function createTestingExceptionFromSample(input: {
  toeTestId: string;
  sampleId: string;
  severity: string;
  description?: string | null;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const test = await tenantToeTest(db, input.toeTestId, institutionId);
  if (!test) throw new Error('TOE_TEST_NOT_FOUND');

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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM TestingException WHERE id = ? LIMIT 1',
    [id]
  );
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
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const exception = await tenantException(db, input.exceptionId, institutionId);
  if (!exception) throw new Error('EXCEPTION_NOT_FOUND');

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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlDeficiency WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function createIssueFromDeficiency(input: {
  deficiencyId: string;
  title: string;
  description: string;
  severity: string;
  ownerName: string;
  targetDate: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const deficiency = await tenantDeficiency(db, input.deficiencyId, institutionId);
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
    'SELECT * FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    [test.processId, institutionId]
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
      institutionId,
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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Issue WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function createManagementActionPlan(input: {
  issueId: string;
  agreedAction: string;
  recommendation?: string | null;
  actionOwner: string;
  approverName: string;
  originalDueDate: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const issue = await tenantIssue(db, input.issueId, institutionId);
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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM ManagementActionPlan WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function createMapMilestone(input: {
  mapId: string;
  title: string;
  owner: string;
  dueDate: string;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const map = await tenantMap(db, input.mapId, institutionId);
  if (!map) throw new Error('MAP_NOT_FOUND');

  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO MAPMilestone (
      id, mapId, title, owner, dueDate, status, progressPercent, evidenceDoc, createdAt
    ) VALUES (?, ?, ?, ?, ?, 'Pending', 0, NULL, ?)`,
    [id, map.id, input.title, input.owner, input.dueDate, nowIso()]
  );

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM MAPMilestone WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function createRetestRecord(input: {
  mapId: string;
  sampleCount: number;
  passedCount: number;
  failedCount: number;
  testerName: string;
  reviewerName: string;
  conclusionNotes?: string | null;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const map = await tenantMap(db, input.mapId, institutionId);
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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM RetestRecord WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function listToeTests(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const tests = await all<Record<string, unknown>>(
    db,
    `SELECT t.*
       FROM ToETest t
       JOIN BusinessProcess p ON p.id = t.processId
      WHERE p.institutionId = ?
      ORDER BY t.testedAt DESC, t.testId ASC`,
    [institutionId]
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
          const deficiencies = await Promise.all(deficiencyRows.map(row => loadDeficiency(db, row, institutionId)));
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
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const sample = await first<Record<string, unknown>>(
    db,
    `SELECT s.*
       FROM TestSample s
       JOIN ToETest t ON t.id = s.toeTestId
       JOIN BusinessProcess p ON p.id = t.processId
      WHERE s.id = ? AND p.institutionId = ?
      LIMIT 1`,
    [input.sampleId, institutionId]
  );
  if (!sample) throw new Error('SAMPLE_NOT_FOUND');

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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM TestSample WHERE id = ? LIMIT 1',
    [input.sampleId]
  );
}

export async function listRemediationData(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const [exceptionRows, deficiencyRows, issueRows, mapRows, retestRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT e.*
         FROM TestingException e
         JOIN ToETest t ON t.id = e.toeTestId
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE p.institutionId = ?
        ORDER BY e.createdAt DESC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT d.*
         FROM ControlDeficiency d
         JOIN TestingException e ON e.id = d.exceptionId
         JOIN ToETest t ON t.id = e.toeTestId
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE p.institutionId = ?
        ORDER BY d.createdAt DESC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(db, 'SELECT * FROM Issue WHERE institutionId = ? ORDER BY createdAt DESC', [institutionId]),
    all<Record<string, unknown>>(
      db,
      `SELECT m.*
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id = m.issueId
        WHERE i.institutionId = ?
        ORDER BY m.createdAt DESC`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT r.*
         FROM RetestRecord r
         JOIN ManagementActionPlan m ON m.id = r.mapId
         JOIN Issue i ON i.id = m.issueId
        WHERE i.institutionId = ?
        ORDER BY r.retestedAt DESC`,
      [institutionId]
    )
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
              'SELECT id, processId, name, legalEntityId, orgUnitId FROM BusinessProcess WHERE id = ? LIMIT 1',
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
    Promise.all(deficiencyRows.map(row => loadDeficiency(db, row, institutionId))),
    Promise.all(issueRows.map(row => loadIssue(db, row, institutionId))),
    Promise.all(mapRows.map(row => loadMap(db, row, institutionId))),
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
          const process = issue
            ? await first<Record<string, unknown>>(
                db,
                'SELECT id, processId, name, legalEntityId, orgUnitId FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
                [issue.processId, institutionId]
              )
            : null;
          mapWithIssue = { ...map, issue: issue ? { ...issue, process } : null };
        }
        return {
          ...row,
          sampleCount: Number(row.sampleCount || 0),
          passedCount: Number(row.passedCount || 0),
          failedCount: Number(row.failedCount || 0),
          map: mapWithIssue,
          process: (mapWithIssue?.issue as Record<string, unknown> | null)?.process || null
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
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const existing = await tenantMap(db, input.mapId, institutionId);
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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM ManagementActionPlan WHERE id = ? LIMIT 1',
    [input.mapId]
  );
}

export async function listMonitoringRules(institutionId: string) {
  const db = await ensureAssuranceSchema();
  const rules = await all<Record<string, unknown>>(
    db,
    `SELECT r.*
       FROM MonitoringRule r
       JOIN ControlMaster c ON c.id = r.controlId
      WHERE c.institutionId = ?
      ORDER BY r.createdAt DESC, r.ruleId ASC`,
    [institutionId]
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
          'SELECT id, processId, name, legalEntityId, orgUnitId FROM BusinessProcess WHERE id = ? LIMIT 1',
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

export async function createMonitoringRule(input: Record<string, unknown>, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.controlId, institutionId]
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

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM MonitoringRule WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function ingestMonitoringRun(input: {
  ruleId: string;
  populationChecked: number;
  exceptionsFound: number;
  details?: string | null;
  exceptions?: Array<{ transactionRef?: string; details?: string }>;
}, institutionId: string) {
  const db = await ensureAssuranceSchema();
  const rule = await tenantMonitoringRule(db, input.ruleId, institutionId);
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

export async function getAssuranceDashboardMetrics(institutionId: string) {
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
      `SELECT COUNT(*) AS count
         FROM ToETest t
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE p.institutionId = ?
          AND (t.failCount > 0 OR t.finalConclusion IN ('Partially Effective', 'Ineffective'))`,
      [institutionId]
    ),
    count(
      db,
      `SELECT COUNT(*) AS count
         FROM TestingException e
         JOIN ToETest t ON t.id = e.toeTestId
         JOIN BusinessProcess p ON p.id = t.processId
        WHERE p.institutionId = ?`,
      [institutionId]
    ),
    count(db, "SELECT COUNT(*) AS count FROM Issue WHERE institutionId = ? AND status <> 'Closed'", [institutionId]),
    count(db, "SELECT COUNT(*) AS count FROM Issue WHERE institutionId = ? AND status = 'Closed'", [institutionId]),
    count(
      db,
      `SELECT COUNT(*) AS count
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id = m.issueId
        WHERE i.institutionId = ? AND m.status = 'Overdue'`,
      [institutionId]
    ),
    count(
      db,
      `SELECT COUNT(*) AS count
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id = m.issueId
        WHERE i.institutionId = ? AND m.status IN ('Completed by Owner', 'Closed')`,
      [institutionId]
    ),
    count(
      db,
      `SELECT COUNT(*) AS count
         FROM MonitoringRule r
         JOIN ControlMaster c ON c.id = r.controlId
        WHERE c.institutionId = ? AND r.lastStatus = 'Healthy'`,
      [institutionId]
    ),
    count(
      db,
      `SELECT COUNT(*) AS count
         FROM RetestRecord r
         JOIN ManagementActionPlan m ON m.id = r.mapId
         JOIN Issue i ON i.id = m.issueId
        WHERE i.institutionId = ?`,
      [institutionId]
    ),
    count(
      db,
      `SELECT COUNT(DISTINCT t.controlId) AS count
         FROM ToETest t
         JOIN ControlMaster c ON c.id = t.controlId
        WHERE c.institutionId = ? AND c.isKeyControl = 1`,
      [institutionId]
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

export async function enrichRcmWithAssurance(
  rows: Array<Record<string, unknown>>,
  institutionId: string
) {
  const db = await ensureAssuranceSchema();

  return Promise.all(
    rows.map(async row => {
      const control = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ControlMaster WHERE controlId = ? AND institutionId = ? LIMIT 1',
        [row.controlId, institutionId]
      );
      if (!control) return row;

      const toe = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ToETest WHERE controlId = ? ORDER BY testedAt DESC LIMIT 1',
        [control.id]
      );
      const issue = await first<Record<string, unknown>>(
        db,
        'SELECT * FROM Issue WHERE controlId = ? AND institutionId = ? ORDER BY createdAt DESC LIMIT 1',
        [control.id, institutionId]
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
