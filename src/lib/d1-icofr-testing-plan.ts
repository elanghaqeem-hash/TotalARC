import { getTenantDb, getTenantContext } from '@/lib/tenant-context';
import { ensureIcofrScopeSchema } from '@/lib/d1-icofr';
import {
  ensureIcofrTraceabilitySchema,
  saveDesignAssessment
} from '@/lib/d1-icofr-traceability';
import {
  createToeTest,
  ensureAssuranceSchema
} from '@/lib/d1-assurance';
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

async function getDb(): Promise<D1DatabaseLike> {
  await Promise.all([
    ensureIcofrScopeSchema(),
    ensureIcofrTraceabilitySchema(),
    ensureAssuranceSchema()
  ]);

  return getTenantDb();
}

async function all<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql);
  const result = values.length
    ? await stmt.bind(...values).all<T>()
    : await stmt.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql);
  return values.length
    ? stmt.bind(...values).first<T>()
    : stmt.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).run() : stmt.run();
}

async function executeSchema(db: D1DatabaseLike, script: string) {
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
  return value === true || value === 1 || value === '1';
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const testingPlanSchemaReadyByBinding = new Map<string, Promise<D1DatabaseLike>>();

export async function ensureIcofrTestingPlanSchema() {
  const { databaseBinding } = await getTenantContext();
  const cached = testingPlanSchemaReadyByBinding.get(databaseBinding);
  if (cached) return cached;

  const schemaPromise = (async () => {
    const db = await getDb();

    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRTestingCycle (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        scopeId TEXT NOT NULL,
        cycleName TEXT NOT NULL,
        fiscalYear INTEGER NOT NULL,
        reportingPeriod TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        testingStrategy TEXT NOT NULL,
        defaultTester TEXT,
        defaultReviewer TEXT,
        status TEXT NOT NULL DEFAULT 'Planning',
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_testing_cycle_name
        ON ICOFRTestingCycle(institutionId, cycleName, fiscalYear, reportingPeriod);
      CREATE INDEX IF NOT EXISTS idx_icofr_testing_cycle_scope
        ON ICOFRTestingCycle(institutionId, scopeId);

      CREATE TABLE IF NOT EXISTS ICOFRTestingPlanItem (
        id TEXT PRIMARY KEY NOT NULL,
        cycleId TEXT NOT NULL,
        controlDomainId TEXT NOT NULL,
        testType TEXT NOT NULL,
        testingPhase TEXT NOT NULL,
        plannedStartDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        testerName TEXT NOT NULL,
        reviewerName TEXT,
        populationSize INTEGER,
        populationSource TEXT,
        samplingMethod TEXT,
        plannedSampleSize INTEGER,
        carryForward INTEGER NOT NULL DEFAULT 0,
        rollForward INTEGER NOT NULL DEFAULT 0,
        relianceStrategy TEXT,
        priority TEXT NOT NULL DEFAULT 'Medium',
        status TEXT NOT NULL DEFAULT 'Planned',
        todAssessmentId TEXT,
        toeTestId TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_testing_plan_control
        ON ICOFRTestingPlanItem(cycleId, controlDomainId);
      CREATE INDEX IF NOT EXISTS idx_icofr_testing_plan_cycle
        ON ICOFRTestingPlanItem(cycleId, status);
      CREATE INDEX IF NOT EXISTS idx_icofr_testing_plan_execution
        ON ICOFRTestingPlanItem(todAssessmentId, toeTestId);
    `);

    return db;
  })().catch(error => {
    testingPlanSchemaReadyByBinding.delete(databaseBinding);
    throw error;
  });

  testingPlanSchemaReadyByBinding.set(databaseBinding, schemaPromise);
  return schemaPromise;
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
  entityType: string,
  recordId: string,
  newValue: unknown,
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
      'ICOFR testing planning and execution linkage.',
      null,
      nowIso()
    ]
  );
}

export async function saveTestingCycle(input: Record<string, unknown>) {
  const db = await ensureIcofrTestingPlanSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const scopeId = String(input.scopeId || '').trim();
  const cycleName = String(input.cycleName || '').trim();
  const reportingPeriod = String(input.reportingPeriod || '').trim();
  const startDate = String(input.startDate || '').trim();
  const endDate = String(input.endDate || '').trim();
  const testingStrategy = String(input.testingStrategy || '').trim();
  const status = String(input.status || 'Planning').trim();
  const fiscalYear = Number(input.fiscalYear);

  if (
    !scopeId ||
    !cycleName ||
    !reportingPeriod ||
    !startDate ||
    !endDate ||
    !testingStrategy ||
    !Number.isInteger(fiscalYear)
  ) {
    throw new Error('CYCLE_REQUIRED');
  }
  if (endDate < startDate) throw new Error('INVALID_CYCLE_DATES');

  const scope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
    [scopeId, institution.id]
  );
  if (!scope) throw new Error('SCOPE_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    scopeId
  });

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRTestingCycle
      WHERE institutionId=? AND cycleName=? AND fiscalYear=? AND reportingPeriod=? AND id<>?
      LIMIT 1`,
    [institution.id, cycleName, fiscalYear, reportingPeriod, id]
  );
  if (duplicate) throw new Error('CYCLE_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    scopeId,
    cycleName,
    fiscalYear,
    reportingPeriod,
    startDate,
    endDate,
    testingStrategy,
    defaultTester: clean(input.defaultTester),
    defaultReviewer: clean(input.defaultReviewer),
    status,
    notes: clean(input.notes),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRTestingCycle SET
        scopeId=?,cycleName=?,fiscalYear=?,reportingPeriod=?,startDate=?,endDate=?,
        testingStrategy=?,defaultTester=?,defaultReviewer=?,status=?,notes=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.scopeId,
        record.cycleName,
        record.fiscalYear,
        record.reportingPeriod,
        record.startDate,
        record.endDate,
        record.testingStrategy,
        record.defaultTester,
        record.defaultReviewer,
        record.status,
        record.notes,
        record.updatedAt,
        id,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRTestingCycle', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRTestingCycle (
        id,institutionId,scopeId,cycleName,fiscalYear,reportingPeriod,startDate,endDate,
        testingStrategy,defaultTester,defaultReviewer,status,notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.scopeId,
        record.cycleName,
        record.fiscalYear,
        record.reportingPeriod,
        record.startDate,
        record.endDate,
        record.testingStrategy,
        record.defaultTester,
        record.defaultReviewer,
        record.status,
        record.notes,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRTestingCycle', id, record);
  }

  return record;
}

export async function saveTestingPlanItem(input: Record<string, unknown>) {
  const db = await ensureIcofrTestingPlanSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const cycleId = String(input.cycleId || '').trim();
  const controlDomainId = String(input.controlDomainId || '').trim();
  const testType = String(input.testType || '').trim();
  const testingPhase = String(input.testingPhase || '').trim();
  const plannedStartDate = String(input.plannedStartDate || '').trim();
  const dueDate = String(input.dueDate || '').trim();
  const testerName = String(input.testerName || '').trim();
  const priority = String(input.priority || 'Medium').trim();
  const status = String(input.status || 'Planned').trim();

  if (
    !cycleId ||
    !controlDomainId ||
    !testType ||
    !testingPhase ||
    !plannedStartDate ||
    !dueDate ||
    !testerName
  ) {
    throw new Error('PLAN_ITEM_REQUIRED');
  }
  if (!['ToD', 'ToE', 'Both'].includes(testType)) throw new Error('INVALID_TEST_TYPE');
  if (dueDate < plannedStartDate) throw new Error('INVALID_PLAN_DATES');

  const [cycle, control] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? LIMIT 1',
      [cycleId, institution.id]
    ),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
      [controlDomainId, institution.id]
    )
  ]);
  if (!cycle) throw new Error('CYCLE_NOT_FOUND');
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: cycleId
  });

  if (plannedStartDate < String(cycle.startDate) || dueDate > String(cycle.endDate)) {
    throw new Error('OUTSIDE_CYCLE_DATES');
  }

  const populationSize = numberOrNull(input.populationSize);
  const plannedSampleSize = numberOrNull(input.plannedSampleSize);
  if (
    (populationSize !== null && (!Number.isInteger(populationSize) || populationSize < 0)) ||
    (plannedSampleSize !== null && (!Number.isInteger(plannedSampleSize) || plannedSampleSize < 0))
  ) {
    throw new Error('INVALID_SAMPLE_VALUES');
  }
  if (
    populationSize !== null &&
    plannedSampleSize !== null &&
    plannedSampleSize > populationSize
  ) {
    throw new Error('SAMPLE_ABOVE_POPULATION');
  }

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRTestingPlanItem WHERE id=? LIMIT 1',
    [id]
  );

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRTestingPlanItem WHERE cycleId=? AND controlDomainId=? AND id<>? LIMIT 1',
    [cycleId, controlDomainId, id]
  );
  if (duplicate) throw new Error('PLAN_CONTROL_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    cycleId,
    controlDomainId,
    testType,
    testingPhase,
    plannedStartDate,
    dueDate,
    testerName,
    reviewerName: clean(input.reviewerName),
    populationSize,
    populationSource: clean(input.populationSource),
    samplingMethod: clean(input.samplingMethod),
    plannedSampleSize,
    carryForward: bool(input.carryForward),
    rollForward: bool(input.rollForward),
    relianceStrategy: clean(input.relianceStrategy),
    priority,
    status,
    todAssessmentId: existing?.todAssessmentId || null,
    toeTestId: existing?.toeTestId || null,
    notes: clean(input.notes),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRTestingPlanItem SET
        cycleId=?,controlDomainId=?,testType=?,testingPhase=?,plannedStartDate=?,dueDate=?,
        testerName=?,reviewerName=?,populationSize=?,populationSource=?,samplingMethod=?,
        plannedSampleSize=?,carryForward=?,rollForward=?,relianceStrategy=?,priority=?,status=?,
        notes=?,updatedAt=?
       WHERE id=?`,
      [
        record.cycleId,
        record.controlDomainId,
        record.testType,
        record.testingPhase,
        record.plannedStartDate,
        record.dueDate,
        record.testerName,
        record.reviewerName,
        record.populationSize,
        record.populationSource,
        record.samplingMethod,
        record.plannedSampleSize,
        record.carryForward ? 1 : 0,
        record.rollForward ? 1 : 0,
        record.relianceStrategy,
        record.priority,
        record.status,
        record.notes,
        record.updatedAt,
        id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRTestingPlanItem', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRTestingPlanItem (
        id,cycleId,controlDomainId,testType,testingPhase,plannedStartDate,dueDate,
        testerName,reviewerName,populationSize,populationSource,samplingMethod,plannedSampleSize,
        carryForward,rollForward,relianceStrategy,priority,status,todAssessmentId,toeTestId,
        notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?)`,
      [
        record.id,
        record.cycleId,
        record.controlDomainId,
        record.testType,
        record.testingPhase,
        record.plannedStartDate,
        record.dueDate,
        record.testerName,
        record.reviewerName,
        record.populationSize,
        record.populationSource,
        record.samplingMethod,
        record.plannedSampleSize,
        record.carryForward ? 1 : 0,
        record.rollForward ? 1 : 0,
        record.relianceStrategy,
        record.priority,
        record.status,
        record.notes,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRTestingPlanItem', id, record);
  }

  return record;
}

export async function generateTestingPlanItems(input: Record<string, unknown>) {
  const db = await ensureIcofrTestingPlanSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const cycleId = String(input.cycleId || '').trim();
  const testType = String(input.testType || '').trim();
  const testingPhase = String(input.testingPhase || '').trim();
  const plannedStartDate = String(input.plannedStartDate || '').trim();
  const dueDate = String(input.dueDate || '').trim();
  const testerName = String(input.testerName || '').trim();

  if (
    !cycleId ||
    !testType ||
    !testingPhase ||
    !plannedStartDate ||
    !dueDate ||
    !testerName
  ) {
    throw new Error('GENERATION_REQUIRED');
  }
  if (!['ToD', 'ToE', 'Both'].includes(testType)) throw new Error('INVALID_TEST_TYPE');

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

  if (plannedStartDate < String(cycle.startDate) || dueDate > String(cycle.endDate) || dueDate < plannedStartDate) {
    throw new Error('OUTSIDE_CYCLE_DATES');
  }

  const controls = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRControlDomain
      WHERE institutionId=? AND keyControl=1 AND status<>'Retired'
      ORDER BY category ASC, controlCode ASC`,
    [institution.id]
  );

  const createdIds: string[] = [];
  const skippedIds: string[] = [];
  const now = nowIso();

  for (const control of controls) {
    const existing = await first<Record<string, unknown>>(
      db,
      'SELECT id FROM ICOFRTestingPlanItem WHERE cycleId=? AND controlDomainId=? LIMIT 1',
      [cycleId, control.id]
    );
    if (existing) {
      skippedIds.push(String(control.id));
      continue;
    }

    const id = crypto.randomUUID();
    await run(
      db,
      `INSERT INTO ICOFRTestingPlanItem (
        id,cycleId,controlDomainId,testType,testingPhase,plannedStartDate,dueDate,
        testerName,reviewerName,populationSize,populationSource,samplingMethod,plannedSampleSize,
        carryForward,rollForward,relianceStrategy,priority,status,todAssessmentId,toeTestId,
        notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,?,?,?, 'Planned',NULL,NULL,?,?,?)`,
      [
        id,
        cycleId,
        control.id,
        testType,
        testingPhase,
        plannedStartDate,
        dueDate,
        testerName,
        clean(input.reviewerName),
        bool(input.carryForward) ? 1 : 0,
        bool(input.rollForward) ? 1 : 0,
        clean(input.relianceStrategy),
        String(input.priority || 'Medium'),
        clean(input.notes),
        now,
        now
      ]
    );
    createdIds.push(id);
  }

  const result = {
    cycleId,
    eligibleKeyControls: controls.length,
    created: createdIds.length,
    skippedExisting: skippedIds.length,
    createdIds
  };

  await audit(db, String(institution.id), 'GENERATE', 'ICOFRTestingPlanItem', cycleId, result);
  return result;
}

export async function launchPlanExecution(
  planItemId: string,
  executionType: 'ToD' | 'ToE'
) {
  const db = await ensureIcofrTestingPlanSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const item = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRTestingPlanItem WHERE id=? LIMIT 1',
    [planItemId]
  );
  if (!item) throw new Error('PLAN_ITEM_NOT_FOUND');

  const cycle = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? LIMIT 1',
    [item.cycleId, institution.id]
  );
  if (!cycle) throw new Error('CYCLE_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(item.cycleId)
  });

  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
    [item.controlDomainId, institution.id]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  const allowedType = String(item.testType);
  if (executionType === 'ToD' && !['ToD', 'Both'].includes(allowedType)) {
    throw new Error('TOD_NOT_PLANNED');
  }
  if (executionType === 'ToE' && !['ToE', 'Both'].includes(allowedType)) {
    throw new Error('TOE_NOT_PLANNED');
  }

  const now = nowIso();

  if (executionType === 'ToD') {
    if (item.todAssessmentId) {
      throw new Error('TOD_ALREADY_LAUNCHED');
    }

    const tod = await saveDesignAssessment({
      controlDomainId: item.controlDomainId,
      period: String(cycle.fiscalYear) + ' ' + String(cycle.reportingPeriod),
      testerName: item.testerName,
      reviewerName: item.reviewerName || null,
      objectiveAlignment: false,
      riskCoverage: false,
      precisionAdequate: false,
      evidenceSufficiency: false,
      walkthroughComplete: false,
      conclusion: 'Not Assessed',
      status: 'Draft',
      notes:
        'Launched from ICOFR testing plan ' +
        String(cycle.cycleName) +
        (item.notes ? '. ' + String(item.notes) : '')
    });

    await run(
      db,
      `UPDATE ICOFRTestingPlanItem
        SET todAssessmentId=?, status='In Progress', updatedAt=?
        WHERE id=?`,
      [tod.id, now, item.id]
    );

    const result = { executionType, planItemId, record: tod };
    await audit(db, String(institution.id), 'LAUNCH_TOD', 'ICOFRTestingPlanItem', planItemId, result);
    return result;
  }

  if (item.toeTestId) {
    throw new Error('TOE_ALREADY_LAUNCHED');
  }
  if (!control.sourceControlId) throw new Error('CONTROL_MASTER_REQUIRED');

  const populationSize = numberOrNull(item.populationSize);
  const populationSource =
    typeof item.populationSource === 'string' ? item.populationSource.trim() : '';
  const samplingMethod =
    typeof item.samplingMethod === 'string' ? item.samplingMethod.trim() : '';

  if (populationSize === null || populationSize < 0 || !populationSource || !samplingMethod) {
    throw new Error('TOE_PLANNING_FIELDS_REQUIRED');
  }

  const toe = await createToeTest({
    controlId: String(control.sourceControlId),
    testerName: String(item.testerName),
    reviewerName: item.reviewerName ? String(item.reviewerName) : null,
    period: String(cycle.fiscalYear) + ' ' + String(cycle.reportingPeriod),
    populationSize,
    populationSource,
    samplingMethod,
    notes:
      'Launched from ICOFR testing plan ' +
      String(cycle.cycleName) +
      (item.plannedSampleSize !== null && item.plannedSampleSize !== undefined
        ? '. Planned sample size: ' + String(item.plannedSampleSize)
        : '') +
      (item.notes ? '. ' + String(item.notes) : '')
  });

  await run(
    db,
    `UPDATE ICOFRTestingPlanItem
      SET toeTestId=?, status='In Progress', updatedAt=?
      WHERE id=?`,
    [toe.id, now, item.id]
  );

  const result = { executionType, planItemId, record: toe };
  await audit(db, String(institution.id), 'LAUNCH_TOE', 'ICOFRTestingPlanItem', planItemId, result);
  return result;
}

export async function removeTestingPlanItem(id: string) {
  const db = await ensureIcofrTestingPlanSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT p.*
       FROM ICOFRTestingPlanItem p
       JOIN ICOFRTestingCycle c ON c.id=p.cycleId
      WHERE p.id=? AND c.institutionId=?
      LIMIT 1`,
    [id, institution.id]
  );
  if (!existing) throw new Error('PLAN_ITEM_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    testingCycleId: String(existing.cycleId)
  });

  if (existing.todAssessmentId || existing.toeTestId) throw new Error('PLAN_EXECUTION_EXISTS');

  await run(db, 'DELETE FROM ICOFRTestingPlanItem WHERE id=?', [id]);
  await audit(
    db,
    String(institution.id),
    'DELETE',
    'ICOFRTestingPlanItem',
    id,
    { deleted: true },
    existing
  );
  return { success: true };
}

export async function getTestingPlanData() {
  const db = await ensureIcofrTestingPlanSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      scopes: [],
      cycles: [],
      controls: [],
      planItems: [],
      metrics: {}
    };
  }

  const [scopes, cycles, controls, planItems, todRows, toeRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRScope WHERE institutionId=? ORDER BY fiscalYear DESC, updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingCycle WHERE institutionId=? ORDER BY fiscalYear DESC, startDate DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT * FROM ICOFRControlDomain
        WHERE institutionId=? AND status<>'Retired'
        ORDER BY category ASC, controlCode ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.*
         FROM ICOFRTestingPlanItem p
         JOIN ICOFRTestingCycle c ON c.id=p.cycleId
        WHERE c.institutionId=?
        ORDER BY p.dueDate ASC, p.createdAt ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRDesignAssessment WHERE institutionId=? ORDER BY createdAt DESC',
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

  const scopeById = new Map(scopes.map(item => [String(item.id), item]));
  const controlById = new Map(controls.map(item => [String(item.id), item]));
  const todById = new Map(todRows.map(item => [String(item.id), item]));
  const toeById = new Map(toeRows.map(item => [String(item.id), item]));

  const enrichedCycles = cycles.map(cycle => {
    const cycleItems = planItems.filter(item => String(item.cycleId) === String(cycle.id));
    const completed = cycleItems.filter(item => item.status === 'Completed').length;
    const inProgress = cycleItems.filter(item => item.status === 'In Progress').length;
    const planned = cycleItems.filter(item => item.status === 'Planned').length;
    return {
      ...cycle,
      scope: scopeById.get(String(cycle.scopeId)) || null,
      metrics: {
        total: cycleItems.length,
        completed,
        inProgress,
        planned,
        completionPercent:
          cycleItems.length > 0 ? Math.round((completed / cycleItems.length) * 1000) / 10 : null
      }
    };
  });

  const enrichedItems = planItems.map(item => {
    const control = controlById.get(String(item.controlDomainId)) || null;
    const tod = item.todAssessmentId ? todById.get(String(item.todAssessmentId)) || null : null;
    const toe = item.toeTestId ? toeById.get(String(item.toeTestId)) || null : null;

    let derivedExecutionStatus = String(item.status);
    if (tod && toe) {
      const todDone = tod.status === 'Approved' || tod.conclusion === 'Effective' || tod.conclusion === 'Ineffective';
      const toeDone =
        toe.status === 'Completed' ||
        toe.finalConclusion === 'Effective' ||
        toe.finalConclusion === 'Partially Effective' ||
        toe.finalConclusion === 'Ineffective';
      if (todDone && toeDone) derivedExecutionStatus = 'Completed';
      else derivedExecutionStatus = 'In Progress';
    } else if (tod || toe) {
      const requiredOne =
        item.testType === 'ToD' ? tod :
        item.testType === 'ToE' ? toe :
        null;
      if (
        requiredOne &&
        (
          requiredOne.status === 'Approved' ||
          requiredOne.status === 'Completed' ||
          requiredOne.conclusion === 'Effective' ||
          requiredOne.conclusion === 'Ineffective' ||
          requiredOne.finalConclusion === 'Effective' ||
          requiredOne.finalConclusion === 'Partially Effective' ||
          requiredOne.finalConclusion === 'Ineffective'
        )
      ) {
        derivedExecutionStatus = item.testType === 'Both' ? 'In Progress' : 'Completed';
      } else {
        derivedExecutionStatus = 'In Progress';
      }
    }

    return {
      ...item,
      dueDate: String(item.dueDate || ''),
      todAssessmentId: item.todAssessmentId ? String(item.todAssessmentId) : null,
      toeTestId: item.toeTestId ? String(item.toeTestId) : null,
      populationSize: numberOrNull(item.populationSize),
      plannedSampleSize: numberOrNull(item.plannedSampleSize),
      carryForward: bool(item.carryForward),
      rollForward: bool(item.rollForward),
      control: control
        ? {
            ...control,
            keyControl: bool(control.keyControl)
          }
        : null,
      tod,
      toe,
      derivedExecutionStatus
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const activeItems = enrichedItems.filter(item => item.derivedExecutionStatus !== 'Completed');
  const overdue = activeItems.filter(item => String(item.dueDate) < today);

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    scopes,
    cycles: enrichedCycles,
    controls: controls.map(item => ({
      ...item,
      keyControl: bool(item.keyControl)
    })),
    planItems: enrichedItems,
    metrics: {
      cycles: cycles.length,
      totalPlanItems: enrichedItems.length,
      keyControls: controls.filter(item => bool(item.keyControl)).length,
      inProgress: enrichedItems.filter(item => item.derivedExecutionStatus === 'In Progress').length,
      completed: enrichedItems.filter(item => item.derivedExecutionStatus === 'Completed').length,
      overdue: overdue.length,
      todLaunched: enrichedItems.filter(item => item.todAssessmentId).length,
      toeLaunched: enrichedItems.filter(item => item.toeTestId).length
    }
  };
}
