import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureIcofrScopeSchema } from '@/lib/d1-icofr';
import { ensureIcofrDomainSchema } from '@/lib/d1-icofr-domains';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { ensureIcofrPeriodCloseSchema } from '@/lib/d1-icofr-period-close';

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

type SnapshotSections = Record<string, Record<string, unknown>>;

const ITEM_DECISIONS = [
  'Pending',
  'Carry Forward',
  'Revalidate',
  'Replace',
  'Exclude',
  'Carry Forward Follow-up',
  'Resolved / Closed'
] as const;

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
  await ensureIcofrScopeSchema();
  await ensureIcofrDomainSchema();
  await ensureIcofrTraceabilitySchema();
  await ensureIcofrTestingPlanSchema();
  await ensureAssuranceSchema();
  await ensureIcofrPeriodCloseSchema();

  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function executeSchema(db: D1DatabaseLike, script: string) {
  const statements = script
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
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

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
    : [];
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrRollForwardSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRRollForward (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceCloseId TEXT NOT NULL,
        sourceSnapshotVersion INTEGER NOT NULL,
        targetScopeId TEXT NOT NULL,
        targetTestingCycleId TEXT,
        rollForwardName TEXT NOT NULL,
        targetFiscalYear INTEGER NOT NULL,
        targetReportingPeriod TEXT NOT NULL,
        preparedBy TEXT NOT NULL,
        reviewerName TEXT,
        changeAssessmentSummary TEXT,
        materialityReviewStatus TEXT NOT NULL DEFAULT 'Pending',
        scopeReviewStatus TEXT NOT NULL DEFAULT 'Pending',
        deficiencyFollowUpStatus TEXT NOT NULL DEFAULT 'Pending',
        status TEXT NOT NULL DEFAULT 'Draft',
        finalizedBy TEXT,
        finalizedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_rollforward_unique
        ON ICOFRRollForward(
          institutionId,
          sourceCloseId,
          sourceSnapshotVersion,
          targetFiscalYear,
          targetReportingPeriod
        );
      CREATE INDEX IF NOT EXISTS idx_icofr_rollforward_target
        ON ICOFRRollForward(institutionId,targetScopeId,status);
      CREATE INDEX IF NOT EXISTS idx_icofr_rollforward_source
        ON ICOFRRollForward(institutionId,sourceCloseId,sourceSnapshotVersion);

      CREATE TABLE IF NOT EXISTS ICOFRRollForwardItem (
        id TEXT PRIMARY KEY NOT NULL,
        rollForwardId TEXT NOT NULL,
        domain TEXT NOT NULL,
        sourceRecordId TEXT NOT NULL,
        targetRecordId TEXT,
        sourceCode TEXT,
        sourceName TEXT NOT NULL,
        priorPayload TEXT NOT NULL,
        currentPayload TEXT,
        priorHash TEXT NOT NULL,
        currentHash TEXT,
        changeFlag TEXT NOT NULL,
        changedFields TEXT,
        recommendation TEXT NOT NULL,
        decision TEXT NOT NULL DEFAULT 'Pending',
        requiresRevalidation INTEGER NOT NULL DEFAULT 1,
        reviewerNotes TEXT,
        reviewedBy TEXT,
        reviewedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_rollforward_item_unique
        ON ICOFRRollForwardItem(rollForwardId,domain,sourceRecordId);
      CREATE INDEX IF NOT EXISTS idx_icofr_rollforward_item_status
        ON ICOFRRollForwardItem(rollForwardId,decision,requiresRevalidation);
      CREATE INDEX IF NOT EXISTS idx_icofr_rollforward_item_domain
        ON ICOFRRollForwardItem(rollForwardId,domain,changeFlag);
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
      'ICOFRRollForward',
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      'ICOFR annual roll-forward, prior-period change assessment and controlled carry-forward.',
      null,
      nowIso()
    ]
  );
}

function canonicalRecord(value: Record<string, unknown> | null) {
  if (!value) return null;
  const ignored = new Set([
    'createdAt',
    'updatedAt',
    'timestamp',
    'testedAt',
    'retestedAt',
    'reviewedAt',
    'finalizedAt',
    'closedAt'
  ]);
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (!ignored.has(key)) next[key] = value[key];
  }
  return next;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function comparePayloads(
  prior: Record<string, unknown>,
  current: Record<string, unknown> | null
) {
  const priorCanonical = canonicalRecord(prior) || {};
  const currentCanonical = canonicalRecord(current);
  const priorJson = JSON.stringify(priorCanonical);
  const priorHash = await sha256(priorJson);

  if (!currentCanonical) {
    return {
      priorJson,
      currentJson: null,
      priorHash,
      currentHash: null,
      changeFlag: 'Missing / Retired',
      changedFields: ['Record not found in current register']
    };
  }

  const currentJson = JSON.stringify(currentCanonical);
  const currentHash = await sha256(currentJson);
  const keys = Array.from(
    new Set([...Object.keys(priorCanonical), ...Object.keys(currentCanonical)])
  ).sort();

  const changedFields = keys.filter(
    key => JSON.stringify(priorCanonical[key]) !== JSON.stringify(currentCanonical[key])
  );

  return {
    priorJson,
    currentJson,
    priorHash,
    currentHash,
    changeFlag: priorHash === currentHash ? 'Unchanged' : 'Changed',
    changedFields
  };
}

function labelFor(
  domain: string,
  row: Record<string, unknown>,
  fallbackIndex = 0
) {
  const codeKeys = [
    'itemCode',
    'controlCode',
    'riskId',
    'controlId',
    'deficiencyId',
    'mapId',
    'assertion',
    'code',
    'id'
  ];
  const nameKeys = [
    'name',
    'title',
    'assertion',
    'description',
    'agreedAction',
    'relationship'
  ];
  const sourceCode =
    codeKeys.map(key => row[key]).find(value => value !== null && value !== undefined && String(value).trim()) ||
    domain + '-' + String(fallbackIndex + 1);
  const sourceName =
    nameKeys.map(key => row[key]).find(value => value !== null && value !== undefined && String(value).trim()) ||
    String(sourceCode);

  return {
    sourceCode: String(sourceCode),
    sourceName: String(sourceName)
  };
}

function recommendationFor(domain: string, changeFlag: string, row: Record<string, unknown>) {
  if (domain === 'MATERIALITY') return 'Revalidate materiality and benchmark';
  if (domain === 'SCOPE_ITEM') return 'Revalidate scope inclusion';
  if (domain === 'DEFICIENCY') {
    return 'Carry Forward Follow-up';
  }
  if (domain === 'MAP') {
    const status = String(row.status || '');
    return ['Closed', 'Completed', 'Cancelled'].includes(status)
      ? 'Confirm prior-period closure'
      : 'Carry Forward Follow-up';
  }
  if (changeFlag === 'Missing / Retired') return 'Replace or exclude';
  if (changeFlag === 'Changed') return 'Revalidate';
  return 'Carry Forward';
}

function initialRequiresRevalidation(domain: string) {
  return [
    'MATERIALITY',
    'SCOPE_ITEM',
    'FINANCIAL_ITEM',
    'ASSERTION',
    'TRACEABILITY',
    'CONTROL_DOMAIN',
    'INFORMATION_ARTIFACT',
    'RISK_MASTER',
    'CONTROL_MASTER'
  ].includes(domain);
}

async function loadSnapshot(
  db: D1DatabaseLike,
  institutionId: string,
  sourceCloseId: string,
  version: number
) {
  const close = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRPeriodClose WHERE id=? AND institutionId=? LIMIT 1',
    [sourceCloseId, institutionId]
  );
  if (!close) throw new Error('SOURCE_CLOSE_NOT_FOUND');

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRPeriodSnapshot
      WHERE closeId=? AND institutionId=? AND snapshotVersion=?
      ORDER BY snapshotType`,
    [sourceCloseId, institutionId, version]
  );
  if (!rows.length) throw new Error('SOURCE_SNAPSHOT_NOT_FOUND');

  const sections: SnapshotSections = {};
  for (const row of rows) {
    try {
      sections[String(row.snapshotType)] = objectValue(JSON.parse(String(row.contentJson)));
    } catch {
      throw new Error('SOURCE_SNAPSHOT_INVALID');
    }
  }

  return { close, rows, sections };
}

async function currentRecord(
  db: D1DatabaseLike,
  institutionId: string,
  domain: string,
  sourceRecordId: string,
  targetRecordId: string | null
) {
  if (domain === 'MATERIALITY') {
    return targetRecordId
      ? first<Record<string, unknown>>(
          db,
          'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
          [targetRecordId, institutionId]
        )
      : null;
  }
  if (domain === 'SCOPE_ITEM') {
    return targetRecordId
      ? first<Record<string, unknown>>(db, 'SELECT * FROM ICOFRScopeItem WHERE id=? LIMIT 1', [targetRecordId])
      : null;
  }

  const tableByDomain: Record<string, string> = {
    FINANCIAL_ITEM: 'ICOFRFinancialItem',
    ASSERTION: 'ICOFRAssertion',
    TRACEABILITY: 'ICOFRTraceabilityLink',
    CONTROL_DOMAIN: 'ICOFRControlDomain',
    INFORMATION_ARTIFACT: 'ICOFRInformationRegister',
    RISK_MASTER: 'RiskMaster',
    CONTROL_MASTER: 'ControlMaster',
    DEFICIENCY: 'ControlDeficiency',
    MAP: 'ManagementActionPlan'
  };
  const table = tableByDomain[domain];
  if (!table) return null;

  if (['FINANCIAL_ITEM', 'ASSERTION', 'TRACEABILITY', 'CONTROL_DOMAIN', 'INFORMATION_ARTIFACT', 'RISK_MASTER', 'CONTROL_MASTER'].includes(domain)) {
    return first<Record<string, unknown>>(
      db,
      `SELECT * FROM ${table} WHERE id=? AND institutionId=? LIMIT 1`,
      [sourceRecordId, institutionId]
    );
  }

  return first<Record<string, unknown>>(db, `SELECT * FROM ${table} WHERE id=? LIMIT 1`, [sourceRecordId]);
}

function materialityPayload(scope: Record<string, unknown>) {
  return {
    id: scope.id,
    currency: scope.currency,
    consolidationBasis: scope.consolidationBasis,
    accountingFramework: scope.accountingFramework,
    benchmarkType: scope.benchmarkType,
    benchmarkAmount: scope.benchmarkAmount,
    overallMaterialityPercent: scope.overallMaterialityPercent,
    overallMaterialityAmount: scope.overallMaterialityAmount,
    performanceMaterialityPercent: scope.performanceMaterialityPercent,
    performanceMaterialityAmount: scope.performanceMaterialityAmount,
    clearlyTrivialPercent: scope.clearlyTrivialPercent,
    clearlyTrivialAmount: scope.clearlyTrivialAmount,
    componentMaterialityAmount: scope.componentMaterialityAmount,
    scopeApproach: scope.scopeApproach,
    quantitativeCriteria: scope.quantitativeCriteria,
    qualitativeCriteria: scope.qualitativeCriteria,
    exclusions: scope.exclusions
  };
}

async function insertRollForwardItem(
  db: D1DatabaseLike,
  input: {
    rollForwardId: string;
    domain: string;
    sourceRecordId: string;
    targetRecordId?: string | null;
    row: Record<string, unknown>;
    current?: Record<string, unknown> | null;
    sourceCode?: string | null;
    sourceName?: string | null;
  }
) {
  const compared = await comparePayloads(input.row, input.current || null);
  const fallback = labelFor(input.domain, input.row);
  const sourceCode = input.sourceCode || fallback.sourceCode;
  const sourceName = input.sourceName || fallback.sourceName;
  const recommendation = recommendationFor(input.domain, compared.changeFlag, input.row);
  const now = nowIso();

  await run(
    db,
    `INSERT INTO ICOFRRollForwardItem (
      id,rollForwardId,domain,sourceRecordId,targetRecordId,sourceCode,sourceName,
      priorPayload,currentPayload,priorHash,currentHash,changeFlag,changedFields,
      recommendation,decision,requiresRevalidation,reviewerNotes,reviewedBy,
      reviewedAt,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending',?,NULL,NULL,NULL,?,?)`,
    [
      crypto.randomUUID(),
      input.rollForwardId,
      input.domain,
      input.sourceRecordId,
      input.targetRecordId || null,
      sourceCode,
      sourceName,
      compared.priorJson,
      compared.currentJson,
      compared.priorHash,
      compared.currentHash,
      compared.changeFlag,
      compared.changedFields.join(', ') || null,
      recommendation,
      initialRequiresRevalidation(input.domain) ? 1 : 0,
      now,
      now
    ]
  );
}

async function copyScopeFromSnapshot(
  db: D1DatabaseLike,
  institutionId: string,
  sourceScope: Record<string, unknown>,
  sourceScopeItems: Array<Record<string, unknown>>,
  input: {
    rollForwardName: string;
    targetFiscalYear: number;
    targetReportingPeriod: string;
    preparedBy: string;
    targetScopeName: string;
  },
  sourceCloseId: string,
  sourceSnapshotVersion: number
) {
  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRScope
      WHERE institutionId=? AND scopeName=? AND fiscalYear=? AND reportingPeriod=?
      LIMIT 1`,
    [
      institutionId,
      input.targetScopeName,
      input.targetFiscalYear,
      input.targetReportingPeriod
    ]
  );
  if (duplicate) throw new Error('TARGET_SCOPE_CONFLICT');

  const scopeId = crypto.randomUUID();
  const now = nowIso();
  const notesPrefix =
    'Rolled forward from closed ICOFR period ' +
    String(sourceCloseId) +
    ' snapshot v' +
    String(sourceSnapshotVersion) +
    '. Prior-period materiality is copied only as a baseline and requires current-period reassessment.';
  const existingNotes = clean(sourceScope.notes);
  const notes = existingNotes ? notesPrefix + '\nPrior-period notes: ' + existingNotes : notesPrefix;

  await run(
    db,
    `INSERT INTO ICOFRScope (
      id,institutionId,scopeName,fiscalYear,reportingPeriod,currency,
      consolidationBasis,accountingFramework,benchmarkType,benchmarkAmount,
      overallMaterialityPercent,overallMaterialityAmount,
      performanceMaterialityPercent,performanceMaterialityAmount,
      clearlyTrivialPercent,clearlyTrivialAmount,componentMaterialityAmount,
      scopeApproach,quantitativeCriteria,qualitativeCriteria,exclusions,status,
      preparedBy,reviewedBy,approvedBy,notes,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Draft',?,NULL,NULL,?,?,?)`,
    [
      scopeId,
      institutionId,
      input.targetScopeName,
      input.targetFiscalYear,
      input.targetReportingPeriod,
      String(sourceScope.currency || ''),
      String(sourceScope.consolidationBasis || ''),
      clean(sourceScope.accountingFramework),
      String(sourceScope.benchmarkType || ''),
      Number(sourceScope.benchmarkAmount || 0),
      Number(sourceScope.overallMaterialityPercent || 0),
      Number(sourceScope.overallMaterialityAmount || 0),
      Number(sourceScope.performanceMaterialityPercent || 0),
      Number(sourceScope.performanceMaterialityAmount || 0),
      sourceScope.clearlyTrivialPercent === null || sourceScope.clearlyTrivialPercent === undefined
        ? null
        : Number(sourceScope.clearlyTrivialPercent),
      sourceScope.clearlyTrivialAmount === null || sourceScope.clearlyTrivialAmount === undefined
        ? null
        : Number(sourceScope.clearlyTrivialAmount),
      sourceScope.componentMaterialityAmount === null || sourceScope.componentMaterialityAmount === undefined
        ? null
        : Number(sourceScope.componentMaterialityAmount),
      String(sourceScope.scopeApproach || ''),
      clean(sourceScope.quantitativeCriteria),
      clean(sourceScope.qualitativeCriteria),
      clean(sourceScope.exclusions),
      input.preparedBy,
      notes,
      now,
      now
    ]
  );

  const itemMap = new Map<string, string>();
  for (const row of sourceScopeItems) {
    const newId = crypto.randomUUID();
    itemMap.set(String(row.id), newId);
    await run(
      db,
      `INSERT INTO ICOFRScopeItem (
        id,scopeId,itemType,sourceId,code,name,inScope,amount,rationale,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        newId,
        scopeId,
        String(row.itemType || 'Other'),
        clean(row.sourceId),
        clean(row.code),
        String(row.name || ''),
        bool(row.inScope) ? 1 : 0,
        row.amount === null || row.amount === undefined ? null : Number(row.amount),
        clean(row.rationale),
        now,
        now
      ]
    );
  }

  return { scopeId, itemMap };
}

async function createOptionalTestingCycle(
  db: D1DatabaseLike,
  institutionId: string,
  scopeId: string,
  input: Record<string, unknown>,
  targetFiscalYear: number,
  targetReportingPeriod: string
) {
  if (!bool(input.createTestingCycle)) return null;

  const cycleName = String(input.cycleName || '').trim();
  const startDate = String(input.cycleStartDate || '').trim();
  const endDate = String(input.cycleEndDate || '').trim();
  const testingStrategy = String(input.testingStrategy || '').trim();
  if (!cycleName || !startDate || !endDate || !testingStrategy) {
    throw new Error('TARGET_CYCLE_REQUIRED');
  }
  if (endDate < startDate) throw new Error('TARGET_CYCLE_DATES');

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRTestingCycle
      WHERE institutionId=? AND cycleName=? AND fiscalYear=? AND reportingPeriod=?
      LIMIT 1`,
    [institutionId, cycleName, targetFiscalYear, targetReportingPeriod]
  );
  if (duplicate) throw new Error('TARGET_CYCLE_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO ICOFRTestingCycle (
      id,institutionId,scopeId,cycleName,fiscalYear,reportingPeriod,startDate,endDate,
      testingStrategy,defaultTester,defaultReviewer,status,notes,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'Planning',?,?,?)`,
    [
      id,
      institutionId,
      scopeId,
      cycleName,
      targetFiscalYear,
      targetReportingPeriod,
      startDate,
      endDate,
      testingStrategy,
      clean(input.defaultTester),
      clean(input.defaultReviewer),
      'Created from ICOFR annual roll-forward. Prior-period testing evidence is not copied; a new testing plan must be confirmed for the target period.',
      now,
      now
    ]
  );

  return id;
}

export async function createIcofrRollForward(input: Record<string, unknown>) {
  const db = await ensureIcofrRollForwardSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const sourceCloseId = String(input.sourceCloseId || '').trim();
  const sourceSnapshotVersion = Number(input.sourceSnapshotVersion);
  const rollForwardName = String(input.rollForwardName || '').trim();
  const targetScopeName = String(input.targetScopeName || '').trim();
  const targetFiscalYear = Number(input.targetFiscalYear);
  const targetReportingPeriod = String(input.targetReportingPeriod || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();
  const changeAssessmentSummary = clean(input.changeAssessmentSummary);

  if (
    !sourceCloseId ||
    !Number.isInteger(sourceSnapshotVersion) ||
    sourceSnapshotVersion <= 0 ||
    !rollForwardName ||
    !targetScopeName ||
    !Number.isInteger(targetFiscalYear) ||
    targetFiscalYear < 2000 ||
    targetFiscalYear > 2200 ||
    !targetReportingPeriod ||
    !preparedBy
  ) {
    throw new Error('ROLL_FORWARD_REQUIRED');
  }

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRRollForward
      WHERE institutionId=? AND sourceCloseId=? AND sourceSnapshotVersion=?
        AND targetFiscalYear=? AND targetReportingPeriod=?
      LIMIT 1`,
    [
      institution.id,
      sourceCloseId,
      sourceSnapshotVersion,
      targetFiscalYear,
      targetReportingPeriod
    ]
  );
  if (duplicate) throw new Error('ROLL_FORWARD_CONFLICT');

  const snapshot = await loadSnapshot(
    db,
    String(institution.id),
    sourceCloseId,
    sourceSnapshotVersion
  );
  const scopeSection = objectValue(snapshot.sections.SCOPE);
  const sourceScope = objectValue(scopeSection.scope);
  const sourceScopeItems = arrayValue(scopeSection.scopeItems);
  if (!sourceScope.id) throw new Error('SOURCE_SCOPE_NOT_FOUND');

  const { scopeId: targetScopeId, itemMap } = await copyScopeFromSnapshot(
    db,
    String(institution.id),
    sourceScope,
    sourceScopeItems,
    {
      rollForwardName,
      targetFiscalYear,
      targetReportingPeriod,
      preparedBy,
      targetScopeName
    },
    sourceCloseId,
    sourceSnapshotVersion
  );

  const targetTestingCycleId = await createOptionalTestingCycle(
    db,
    String(institution.id),
    targetScopeId,
    input,
    targetFiscalYear,
    targetReportingPeriod
  );

  const rollForwardId = crypto.randomUUID();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO ICOFRRollForward (
      id,institutionId,sourceCloseId,sourceSnapshotVersion,targetScopeId,targetTestingCycleId,
      rollForwardName,targetFiscalYear,targetReportingPeriod,preparedBy,reviewerName,
      changeAssessmentSummary,materialityReviewStatus,scopeReviewStatus,deficiencyFollowUpStatus,
      status,finalizedBy,finalizedAt,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,'Pending','Pending','Pending','Draft',NULL,NULL,?,?)`,
    [
      rollForwardId,
      institution.id,
      sourceCloseId,
      sourceSnapshotVersion,
      targetScopeId,
      targetTestingCycleId,
      rollForwardName,
      targetFiscalYear,
      targetReportingPeriod,
      preparedBy,
      changeAssessmentSummary,
      now,
      now
    ]
  );

  const targetScope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
    [targetScopeId, institution.id]
  );

  await insertRollForwardItem(db, {
    rollForwardId,
    domain: 'MATERIALITY',
    sourceRecordId: String(sourceScope.id),
    targetRecordId: targetScopeId,
    row: materialityPayload(sourceScope),
    current: targetScope ? materialityPayload(targetScope) : null,
    sourceCode: 'MATERIALITY',
    sourceName: 'Materiality & scoping methodology'
  });

  for (let index = 0; index < sourceScopeItems.length; index += 1) {
    const row = sourceScopeItems[index];
    const targetId = itemMap.get(String(row.id)) || null;
    const current = targetId
      ? await first<Record<string, unknown>>(db, 'SELECT * FROM ICOFRScopeItem WHERE id=? LIMIT 1', [targetId])
      : null;
    await insertRollForwardItem(db, {
      rollForwardId,
      domain: 'SCOPE_ITEM',
      sourceRecordId: String(row.id),
      targetRecordId: targetId,
      row,
      current,
      sourceCode: clean(row.code),
      sourceName: String(row.name || 'Scope item')
    });
  }

  const financialSection = objectValue(snapshot.sections.FINANCIAL_REPORTING);
  const controlsSection = objectValue(snapshot.sections.RCM_AND_CONTROLS);
  const testingSection = objectValue(snapshot.sections.TESTING_AND_DEFICIENCIES);

  const groups: Array<{ domain: string; rows: Array<Record<string, unknown>> }> = [
    { domain: 'FINANCIAL_ITEM', rows: arrayValue(financialSection.financialItems) },
    { domain: 'ASSERTION', rows: arrayValue(financialSection.assertions) },
    { domain: 'TRACEABILITY', rows: arrayValue(financialSection.traceabilityLinks) },
    { domain: 'CONTROL_DOMAIN', rows: arrayValue(controlsSection.controlDomains) },
    { domain: 'INFORMATION_ARTIFACT', rows: arrayValue(controlsSection.informationRegisters) },
    { domain: 'RISK_MASTER', rows: arrayValue(controlsSection.riskMasters) },
    { domain: 'CONTROL_MASTER', rows: arrayValue(controlsSection.controlMasters) },
    { domain: 'DEFICIENCY', rows: arrayValue(testingSection.deficiencies) },
    {
      domain: 'MAP',
      rows: arrayValue(testingSection.managementActionPlans).filter(
        row => !['Closed', 'Completed', 'Cancelled'].includes(String(row.status || ''))
      )
    }
  ];

  for (const group of groups) {
    for (let index = 0; index < group.rows.length; index += 1) {
      const row = group.rows[index];
      const sourceRecordId = String(row.id || group.domain + '-' + String(index + 1));
      const current = row.id
        ? await currentRecord(
            db,
            String(institution.id),
            group.domain,
            String(row.id),
            String(row.id)
          )
        : null;

      await insertRollForwardItem(db, {
        rollForwardId,
        domain: group.domain,
        sourceRecordId,
        targetRecordId: row.id ? String(row.id) : null,
        row,
        current
      });
    }
  }

  const result = {
    id: rollForwardId,
    sourceCloseId,
    sourceSnapshotVersion,
    targetScopeId,
    targetTestingCycleId,
    rollForwardName,
    targetFiscalYear,
    targetReportingPeriod,
    preparedBy,
    status: 'Draft'
  };

  await audit(
    db,
    String(institution.id),
    'CREATE_ROLL_FORWARD',
    rollForwardId,
    result
  );

  return result;
}

export async function refreshIcofrRollForward(rollForwardId: string) {
  const db = await ensureIcofrRollForwardSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const rollForward = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRRollForward WHERE id=? AND institutionId=? LIMIT 1',
    [rollForwardId, institution.id]
  );
  if (!rollForward) throw new Error('ROLL_FORWARD_NOT_FOUND');
  if (String(rollForward.status) === 'Finalized') throw new Error('ROLL_FORWARD_FINALIZED');

  const items = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRRollForwardItem WHERE rollForwardId=? ORDER BY createdAt',
    [rollForwardId]
  );

  let changed = 0;
  let unchanged = 0;
  let missing = 0;

  for (const item of items) {
    const domain = String(item.domain);
    const sourceRecordId = String(item.sourceRecordId);
    const targetRecordId = item.targetRecordId ? String(item.targetRecordId) : null;
    const prior = objectValue(JSON.parse(String(item.priorPayload)));

    let current = await currentRecord(
      db,
      String(institution.id),
      domain,
      sourceRecordId,
      targetRecordId
    );

    if (domain === 'MATERIALITY' && current) current = materialityPayload(current);

    const compared = await comparePayloads(prior, current);
    if (compared.changeFlag === 'Changed') changed += 1;
    else if (compared.changeFlag === 'Unchanged') unchanged += 1;
    else missing += 1;

    const recommendation = recommendationFor(domain, compared.changeFlag, prior);
    await run(
      db,
      `UPDATE ICOFRRollForwardItem SET
        currentPayload=?,currentHash=?,changeFlag=?,changedFields=?,recommendation=?,updatedAt=?
       WHERE id=? AND rollForwardId=?`,
      [
        compared.currentJson,
        compared.currentHash,
        compared.changeFlag,
        compared.changedFields.join(', ') || null,
        recommendation,
        nowIso(),
        item.id,
        rollForwardId
      ]
    );
  }

  const result = { rollForwardId, changed, unchanged, missing, refreshedAt: nowIso() };
  await audit(
    db,
    String(institution.id),
    'REFRESH_ROLL_FORWARD_DELTAS',
    rollForwardId,
    result
  );
  return result;
}

export async function reviewRollForwardItem(input: Record<string, unknown>) {
  const db = await ensureIcofrRollForwardSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const itemId = String(input.itemId || '').trim();
  const decision = String(input.decision || '').trim();
  const reviewedBy = String(input.reviewedBy || '').trim();
  const reviewerNotes = clean(input.reviewerNotes);

  if (!itemId || !reviewedBy || !ITEM_DECISIONS.includes(decision as typeof ITEM_DECISIONS[number]) || decision === 'Pending') {
    throw new Error('ITEM_REVIEW_REQUIRED');
  }

  const item = await first<Record<string, unknown>>(
    db,
    `SELECT i.*,r.institutionId,r.status AS rollForwardStatus
       FROM ICOFRRollForwardItem i
       JOIN ICOFRRollForward r ON r.id=i.rollForwardId
      WHERE i.id=? AND r.institutionId=?
      LIMIT 1`,
    [itemId, institution.id]
  );
  if (!item) throw new Error('ROLL_FORWARD_ITEM_NOT_FOUND');
  if (String(item.rollForwardStatus) === 'Finalized') throw new Error('ROLL_FORWARD_FINALIZED');

  if (
    ['Revalidate', 'Replace', 'Exclude'].includes(decision) &&
    !reviewerNotes
  ) {
    throw new Error('ITEM_REVIEW_NOTES_REQUIRED');
  }

  const requiresRevalidation = decision === 'Revalidate' ? 1 : 0;
  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRRollForwardItem SET
      decision=?,requiresRevalidation=?,reviewerNotes=?,reviewedBy=?,reviewedAt=?,updatedAt=?
     WHERE id=?`,
    [
      decision,
      requiresRevalidation,
      reviewerNotes,
      reviewedBy,
      now,
      now,
      itemId
    ]
  );

  const result = {
    id: itemId,
    rollForwardId: item.rollForwardId,
    decision,
    requiresRevalidation: requiresRevalidation === 1,
    reviewerNotes,
    reviewedBy,
    reviewedAt: now
  };

  await audit(
    db,
    String(institution.id),
    'REVIEW_ROLL_FORWARD_ITEM',
    String(item.rollForwardId),
    result,
    item
  );

  return result;
}

export async function finalizeIcofrRollForward(input: Record<string, unknown>) {
  const db = await ensureIcofrRollForwardSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const rollForwardId = String(input.rollForwardId || '').trim();
  const reviewerName = String(input.reviewerName || '').trim();
  const materialityConfirmed = bool(input.materialityConfirmed);
  const scopeConfirmed = bool(input.scopeConfirmed);
  const deficiencyFollowUpConfirmed = bool(input.deficiencyFollowUpConfirmed);

  if (!rollForwardId || !reviewerName || !materialityConfirmed || !scopeConfirmed || !deficiencyFollowUpConfirmed) {
    throw new Error('FINALIZE_REQUIRED');
  }

  const record = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRRollForward WHERE id=? AND institutionId=? LIMIT 1',
    [rollForwardId, institution.id]
  );
  if (!record) throw new Error('ROLL_FORWARD_NOT_FOUND');
  if (String(record.status) === 'Finalized') throw new Error('ROLL_FORWARD_FINALIZED');
  if (reviewerName.toLowerCase() === String(record.preparedBy).toLowerCase()) {
    throw new Error('ROLL_FORWARD_SELF_REVIEW');
  }

  const pending = await first<{ count?: number }>(
    db,
    `SELECT COUNT(*) AS count
       FROM ICOFRRollForwardItem
      WHERE rollForwardId=?
        AND (decision='Pending' OR requiresRevalidation=1)`,
    [rollForwardId]
  );
  if (Number(pending?.count || 0) > 0) throw new Error('ROLL_FORWARD_ITEMS_PENDING');

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRRollForward SET
      reviewerName=?,materialityReviewStatus='Confirmed',scopeReviewStatus='Confirmed',
      deficiencyFollowUpStatus='Confirmed',status='Finalized',finalizedBy=?,finalizedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      reviewerName,
      reviewerName,
      now,
      now,
      rollForwardId,
      institution.id
    ]
  );

  await run(
    db,
    `UPDATE ICOFRScope SET
      status='Under Review',reviewedBy=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      reviewerName,
      now,
      record.targetScopeId,
      institution.id
    ]
  );

  const result = {
    id: rollForwardId,
    status: 'Finalized',
    reviewerName,
    finalizedAt: now,
    targetScopeId: record.targetScopeId,
    targetTestingCycleId: record.targetTestingCycleId
  };

  await audit(
    db,
    String(institution.id),
    'FINALIZE_ROLL_FORWARD',
    rollForwardId,
    result,
    record
  );

  return result;
}

function summarizeRun(items: Array<Record<string, unknown>>) {
  const byDomain: Record<string, number> = {};
  const byChange: Record<string, number> = {};
  const byDecision: Record<string, number> = {};

  for (const item of items) {
    const domain = String(item.domain || 'Other');
    const change = String(item.changeFlag || 'Unknown');
    const decision = String(item.decision || 'Pending');
    byDomain[domain] = (byDomain[domain] || 0) + 1;
    byChange[change] = (byChange[change] || 0) + 1;
    byDecision[decision] = (byDecision[decision] || 0) + 1;
  }

  return {
    totalItems: items.length,
    changed: byChange.Changed || 0,
    unchanged: byChange.Unchanged || 0,
    missingOrRetired: byChange['Missing / Retired'] || 0,
    pendingDecisions: byDecision.Pending || 0,
    revalidationRequired: items.filter(item => bool(item.requiresRevalidation)).length,
    priorDeficiencies: byDomain.DEFICIENCY || 0,
    openMaps: byDomain.MAP || 0,
    byDomain,
    byChange,
    byDecision
  };
}

export async function getIcofrRollForwardData() {
  const db = await ensureIcofrRollForwardSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      sourceCloses: [],
      rollForwards: [],
      metrics: {}
    };
  }

  const [closes, snapshotRows, rollForwards, scopes] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRPeriodClose WHERE institutionId=? ORDER BY closedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT closeId,snapshotVersion,snapshotType,createdAt
         FROM ICOFRPeriodSnapshot
        WHERE institutionId=?
        ORDER BY createdAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRRollForward WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRScope WHERE institutionId=? ORDER BY fiscalYear DESC,updatedAt DESC',
      [institution.id]
    )
  ]);

  const scopeById = new Map(scopes.map(scope => [String(scope.id), scope]));

  const sourceCloses = closes.map(close => {
    const versions = Array.from(
      new Set(
        snapshotRows
          .filter(row => String(row.closeId) === String(close.id))
          .map(row => Number(row.snapshotVersion))
      )
    ).sort((a, b) => b - a);

    return {
      ...close,
      scope: scopeById.get(String(close.scopeId)) || null,
      versions
    };
  });

  const enriched: Array<Record<string, any>> = [];
  for (const rollForward of rollForwards) {
    const [items, targetScope, targetCycle] = await Promise.all([
      all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRRollForwardItem WHERE rollForwardId=? ORDER BY domain,sourceCode,sourceName',
        [rollForward.id]
      ),
      first<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
        [rollForward.targetScopeId, institution.id]
      ),
      rollForward.targetTestingCycleId
        ? first<Record<string, unknown>>(
            db,
            'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? LIMIT 1',
            [rollForward.targetTestingCycleId, institution.id]
          )
        : Promise.resolve(null)
    ]);

    enriched.push({
      ...rollForward,
      targetScope,
      targetCycle,
      items: items.map(item => ({
        ...item,
        requiresRevalidation: bool(item.requiresRevalidation),
        changedFieldsList: String(item.changedFields || '')
          .split(',')
          .map(value => value.trim())
          .filter(Boolean)
      })),
      summary: summarizeRun(items)
    });
  }

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    sourceCloses,
    rollForwards: enriched,
    metrics: {
      rollForwardRuns: enriched.length,
      finalizedRuns: enriched.filter(item => item.status === 'Finalized').length,
      draftRuns: enriched.filter(item => item.status !== 'Finalized').length,
      changedItems: enriched.reduce((sum, item) => sum + Number(item.summary.changed || 0), 0),
      pendingDecisions: enriched.reduce((sum, item) => sum + Number(item.summary.pendingDecisions || 0), 0),
      priorDeficiencies: enriched.reduce((sum, item) => sum + Number(item.summary.priorDeficiencies || 0), 0),
      openMaps: enriched.reduce((sum, item) => sum + Number(item.summary.openMaps || 0), 0)
    }
  };
}
