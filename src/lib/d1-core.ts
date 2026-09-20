import { getCloudflareContext } from '@opennextjs/cloudflare';

type D1DatabaseLike = {
  exec: (sql: string) => Promise<unknown>;
  batch?: (statements: unknown[]) => Promise<unknown>;
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

const PROCESS_CATEGORIES = [
  { id: 'ref:CAT-GOV', code: 'CAT-GOV', name: 'Governance & Strategy', orderIndex: 1 },
  { id: 'ref:CAT-CORE', code: 'CAT-CORE', name: 'Core Business Operations', orderIndex: 2 },
  { id: 'ref:CAT-FIN', code: 'CAT-FIN', name: 'Finance & Treasury', orderIndex: 3 },
  { id: 'ref:CAT-IT', code: 'CAT-IT', name: 'Information Technology & Cyber', orderIndex: 4 },
  { id: 'ref:CAT-PROC', code: 'CAT-PROC', name: 'Procurement & Vendor Management', orderIndex: 5 },
  { id: 'ref:CAT-HR', code: 'CAT-HR', name: 'Human Resources & People', orderIndex: 6 }
] as const;

export type D1BusinessProcess = Record<string, unknown> & {
  id: string;
  institutionId: string;
  categoryId: string;
  processId: string;
  name: string;
  description: string | null;
  criticality: string;
  classification: string;
  isIcofrRelevant: boolean;
  status: string;
  category: Record<string, unknown> | null;
  orgUnit: Record<string, unknown> | null;
  objectives: Record<string, unknown>[];
  sipoc: Record<string, unknown> | null;
  activities: Record<string, unknown>[];
  risks: Array<Record<string, unknown>>;
  controls: Array<Record<string, unknown>>;
};

async function getDb(): Promise<D1DatabaseLike> {
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

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function nowIso() {
  return new Date().toISOString();
}

function nullable(value: unknown) {
  return value === undefined || value === '' ? null : value;
}

function riskRating(score: number) {
  if (score >= 15) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  return 'Low';
}

let coreDomainSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureCoreDomainSchema() {
  if (coreDomainSchemaReady) return coreDomainSchemaReady;

  coreDomainSchemaReady = (async () => {
    const db = await getDb();

    await executeSchemaScript(db, `
    CREATE TABLE IF NOT EXISTS Institution (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      legalName TEXT NOT NULL,
      shortName TEXT NOT NULL,
      institutionType TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Indonesia',
      provinceState TEXT,
      city TEXT,
      registeredAddress TEXT,
      operationalAddress TEXT,
      website TEXT,
      generalEmail TEXT,
      telephone TEXT,
      yearEstablished INTEGER,
      registrationNumber TEXT,
      taxId TEXT,
      parentCompany TEXT,
      holdingCompany TEXT,
      stockExchange TEXT,
      ticker TEXT,
      logo TEXT,
      employeeCount TEXT,
      revenueRange TEXT,
      businessModel TEXT,
      operatingModel TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_legal_name ON Institution(legalName);

    CREATE TABLE IF NOT EXISTS ProcessCategory (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS BusinessProcess (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      orgUnitId TEXT,
      categoryId TEXT NOT NULL,
      processId TEXT NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 2,
      parentProcessId TEXT,
      description TEXT,
      ownerName TEXT NOT NULL,
      ownerEmail TEXT,
      managerName TEXT,
      criticality TEXT NOT NULL DEFAULT 'Critical',
      classification TEXT NOT NULL DEFAULT 'Core',
      isIcofrRelevant INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Draft',
      version TEXT NOT NULL DEFAULT '1.0',
      effectiveDate TEXT NOT NULL,
      reviewDate TEXT,
      tags TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_process_institution_process_id
      ON BusinessProcess(institutionId, processId);
    CREATE INDEX IF NOT EXISTS idx_process_institution ON BusinessProcess(institutionId);
    CREATE INDEX IF NOT EXISTS idx_process_category ON BusinessProcess(categoryId);

    CREATE TABLE IF NOT EXISTS ProcessObjective (
      id TEXT PRIMARY KEY NOT NULL,
      processId TEXT NOT NULL,
      objective TEXT NOT NULL,
      strategicGoal TEXT,
      expectedOutcome TEXT,
      kpi TEXT,
      kri TEXT,
      sla TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_objective_process ON ProcessObjective(processId);

    CREATE TABLE IF NOT EXISTS SIPOC (
      id TEXT PRIMARY KEY NOT NULL,
      processId TEXT NOT NULL UNIQUE,
      suppliers TEXT,
      inputs TEXT,
      processSteps TEXT,
      outputs TEXT,
      customers TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ProcessActivity (
      id TEXT PRIMARY KEY NOT NULL,
      processId TEXT NOT NULL,
      activityId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      performer TEXT,
      nature TEXT NOT NULL DEFAULT 'Manual',
      frequency TEXT NOT NULL DEFAULT 'Per Transaction',
      inputData TEXT,
      outputData TEXT,
      systemUsed TEXT,
      sla TEXT,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_process ON ProcessActivity(processId);

    CREATE TABLE IF NOT EXISTS RiskMaster (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      processId TEXT NOT NULL,
      activityId TEXT,
      riskId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      cause TEXT NOT NULL,
      event TEXT NOT NULL,
      impact TEXT NOT NULL,
      category TEXT NOT NULL,
      ownerName TEXT NOT NULL,
      inherentLikelihood INTEGER NOT NULL,
      inherentImpact INTEGER NOT NULL,
      inherentScore INTEGER NOT NULL,
      inherentRating TEXT NOT NULL,
      residualLikelihood INTEGER NOT NULL,
      residualImpact INTEGER NOT NULL,
      residualScore INTEGER NOT NULL,
      residualRating TEXT NOT NULL,
      riskTreatment TEXT NOT NULL DEFAULT 'Not Assessed',
      status TEXT NOT NULL DEFAULT 'Active',
      version TEXT NOT NULL DEFAULT '1.0',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_institution_risk_id
      ON RiskMaster(institutionId, riskId);
    CREATE INDEX IF NOT EXISTS idx_risk_process ON RiskMaster(processId);

    CREATE TABLE IF NOT EXISTS ControlMaster (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      processId TEXT NOT NULL,
      activityId TEXT,
      controlId TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      objective TEXT NOT NULL,
      controlOwner TEXT NOT NULL,
      performer TEXT,
      reviewer TEXT,
      type TEXT NOT NULL DEFAULT 'Preventive',
      nature TEXT NOT NULL DEFAULT 'IT Dependent Manual',
      method TEXT NOT NULL DEFAULT 'Approval',
      frequency TEXT NOT NULL DEFAULT 'Per Transaction',
      isKeyControl INTEGER NOT NULL DEFAULT 0,
      keyControlRationale TEXT,
      isIcofrKey INTEGER NOT NULL DEFAULT 0,
      isItgc INTEGER NOT NULL DEFAULT 0,
      evidenceRequirement TEXT,
      systemDependency TEXT,
      frameworkMapping TEXT,
      regulationMapping TEXT,
      designAssessment TEXT NOT NULL DEFAULT 'Not Assessed',
      operatingStatus TEXT NOT NULL DEFAULT 'Not Assessed',
      overallHealth TEXT NOT NULL DEFAULT 'Not Assessed',
      healthRationale TEXT,
      version TEXT NOT NULL DEFAULT '1.0',
      status TEXT NOT NULL DEFAULT 'Active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_control_institution_control_id
      ON ControlMaster(institutionId, controlId);
    CREATE INDEX IF NOT EXISTS idx_control_process ON ControlMaster(processId);

    CREATE TABLE IF NOT EXISTS ControlRiskMapping (
      id TEXT PRIMARY KEY NOT NULL,
      controlId TEXT NOT NULL,
      riskId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_control_risk_unique
      ON ControlRiskMapping(controlId, riskId);
    CREATE INDEX IF NOT EXISTS idx_mapping_control ON ControlRiskMapping(controlId);
    CREATE INDEX IF NOT EXISTS idx_mapping_risk ON ControlRiskMapping(riskId);

    CREATE TABLE IF NOT EXISTS AuditLog (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT,
      userName TEXT NOT NULL,
      userRole TEXT NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      recordId TEXT NOT NULL,
      oldValue TEXT,
      newValue TEXT,
      reason TEXT,
      ipAddress TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_institution ON AuditLog(institutionId);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON AuditLog(timestamp);
  `);

    const createdAt = nowIso();
    for (const category of PROCESS_CATEGORIES) {
      await run(
        db,
        `INSERT OR IGNORE INTO ProcessCategory
          (id, code, name, description, orderIndex, createdAt)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [category.id, category.code, category.name, category.orderIndex, createdAt]
      );
    }

    return db;
  })().catch(error => {
    coreDomainSchemaReady = null;
    throw error;
  });

  return coreDomainSchemaReady;
}

async function primaryInstitution(db: D1DatabaseLike) {
  const exists = await first<{ count?: number }>(
    db,
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='Institution'"
  );
  if (!Number(exists?.count || 0)) return null;

  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1'
  );
}

async function writeAudit(
  db: D1DatabaseLike,
  input: {
    institutionId?: string | null;
    userName?: string;
    userRole?: string;
    action: string;
    entityType: string;
    recordId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
    ipAddress?: string | null;
  }
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id, institutionId, userName, userRole, action, entityType, recordId,
      oldValue, newValue, reason, ipAddress, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.institutionId || null,
      input.userName || 'System',
      input.userRole || 'System',
      input.action,
      input.entityType,
      input.recordId,
      input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
      input.newValue === undefined ? null : JSON.stringify(input.newValue),
      input.reason || null,
      input.ipAddress || null,
      nowIso()
    ]
  );
}

function processRow(row: Record<string, unknown>) {
  return {
    ...row,
    level: Number(row.level || 0),
    isIcofrRelevant: bool(row.isIcofrRelevant)
  };
}

function riskRow(row: Record<string, unknown>) {
  return {
    ...row,
    inherentLikelihood: Number(row.inherentLikelihood || 0),
    inherentImpact: Number(row.inherentImpact || 0),
    inherentScore: Number(row.inherentScore || 0),
    residualLikelihood: Number(row.residualLikelihood || 0),
    residualImpact: Number(row.residualImpact || 0),
    residualScore: Number(row.residualScore || 0)
  };
}

function controlRow(row: Record<string, unknown>) {
  return {
    ...row,
    isKeyControl: bool(row.isKeyControl),
    isIcofrKey: bool(row.isIcofrKey),
    isItgc: bool(row.isItgc)
  };
}

async function hydrateProcess(
  db: D1DatabaseLike,
  row: Record<string, unknown>,
  categoryMap?: Map<string, Record<string, unknown>>
): Promise<D1BusinessProcess> {
  const id = String(row.id);
  const [objectives, sipoc, activities, risks, controls] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ProcessObjective WHERE processId = ? ORDER BY createdAt ASC',
      [id]
    ),
    first<Record<string, unknown>>(db, 'SELECT * FROM SIPOC WHERE processId = ? LIMIT 1', [id]),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ProcessActivity WHERE processId = ? ORDER BY orderIndex ASC, createdAt ASC',
      [id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM RiskMaster WHERE processId = ? ORDER BY riskId ASC',
      [id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ControlMaster WHERE processId = ? ORDER BY controlId ASC',
      [id]
    )
  ]);

  let category = categoryMap?.get(String(row.categoryId)) || null;
  if (!category) {
    category = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ProcessCategory WHERE id = ? LIMIT 1',
      [row.categoryId]
    );
  }

  return {
    ...processRow(row),
    id: String(row.id),
    institutionId: String(row.institutionId),
    categoryId: String(row.categoryId),
    processId: String(row.processId),
    name: String(row.name),
    description: typeof row.description === 'string' ? row.description : null,
    criticality: String(row.criticality || ''),
    classification: String(row.classification || ''),
    status: String(row.status || ''),
    category,
    orgUnit: null,
    objectives,
    sipoc,
    activities,
    risks: risks.map(riskRow),
    controls: controls.map(controlRow)
  } as D1BusinessProcess;
}

export async function listBusinessProcesses() {
  const db = await ensureCoreDomainSchema();
  const [categories, rows] = await Promise.all([
    all<Record<string, unknown>>(db, 'SELECT * FROM ProcessCategory ORDER BY orderIndex ASC, name ASC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM BusinessProcess ORDER BY processId ASC')
  ]);
  const categoryMap = new Map(categories.map(category => [String(category.id), category]));
  const processes = await Promise.all(rows.map(row => hydrateProcess(db, row, categoryMap)));
  return { processes, categories };
}

export async function findBusinessProcessForAi(identifier: {
  processId?: string;
  processName?: string;
}) {
  const db = await ensureCoreDomainSchema();
  let row: Record<string, unknown> | null = null;

  if (identifier.processId) {
    row = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM BusinessProcess WHERE id = ? OR processId = ? LIMIT 1',
      [identifier.processId, identifier.processId]
    );
  }

  if (!row && identifier.processName) {
    row = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM BusinessProcess WHERE name = ? LIMIT 1',
      [identifier.processName]
    );
  }

  return row ? hydrateProcess(db, row) : null;
}

export async function createBusinessProcess(input: Record<string, unknown>) {
  const db = await ensureCoreDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const category = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ProcessCategory WHERE id = ? LIMIT 1',
    [input.categoryId]
  );
  if (!category) throw new Error('CATEGORY_NOT_FOUND');

  const enterpriseId =
    typeof input.processId === 'string' && input.processId.trim()
      ? input.processId.trim()
      : 'PRC-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM BusinessProcess WHERE institutionId = ? AND processId = ? LIMIT 1',
    [institution.id, enterpriseId]
  );
  if (duplicate) throw new Error('PROCESS_ID_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();

  await run(
    db,
    `INSERT INTO BusinessProcess (
      id, institutionId, legalEntityId, orgUnitId, categoryId, processId, name,
      level, parentProcessId, description, ownerName, ownerEmail, managerName,
      criticality, classification, isIcofrRelevant, status, version,
      effectiveDate, reviewDate, tags, createdAt, updatedAt
    ) VALUES (?, ?, NULL, NULL, ?, ?, ?, 2, NULL, ?, ?, NULL, NULL, ?, ?, ?, 'Draft', '1.0', ?, NULL, NULL, ?, ?)`,
    [
      id,
      institution.id,
      category.id,
      enterpriseId,
      input.name,
      nullable(input.description),
      input.ownerName,
      input.criticality,
      input.classification,
      input.isIcofrRelevant ? 1 : 0,
      now,
      now,
      now
    ]
  );

  const created: Record<string, unknown> = {
    id,
    institutionId: institution.id,
    legalEntityId: null,
    orgUnitId: null,
    categoryId: category.id,
    processId: enterpriseId,
    name: input.name,
    level: 2,
    parentProcessId: null,
    description: nullable(input.description),
    ownerName: input.ownerName,
    ownerEmail: null,
    managerName: null,
    criticality: input.criticality,
    classification: input.classification,
    isIcofrRelevant: input.isIcofrRelevant ? 1 : 0,
    status: 'Draft',
    version: '1.0',
    effectiveDate: now,
    reviewDate: null,
    tags: null,
    createdAt: now,
    updatedAt: now
  };

  await writeAudit(db, {
    institutionId: String(institution.id),
    action: 'CREATE',
    entityType: 'Process',
    recordId: id,
    newValue: created,
    reason: 'Business process registered in Cloudflare D1.'
  });

  return {
    ...processRow(created),
    id,
    institutionId: String(institution.id),
    categoryId: String(category.id),
    processId: enterpriseId,
    name: String(input.name),
    description: typeof created.description === 'string' ? created.description : null,
    criticality: String(input.criticality || ''),
    classification: String(input.classification || ''),
    status: 'Draft',
    category,
    orgUnit: null,
    objectives: [],
    sipoc: null,
    activities: [],
    risks: [],
    controls: []
  } as D1BusinessProcess;
}


export async function updateBusinessProcess(id: string, input: Record<string, unknown>) {
  const db = await ensureCoreDomainSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [id]
  );
  if (!existing) throw new Error('PROCESS_NOT_FOUND');

  const categoryId =
    typeof input.categoryId === 'string' && input.categoryId.trim()
      ? input.categoryId.trim()
      : String(existing.categoryId);

  const category = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ProcessCategory WHERE id = ? LIMIT 1',
    [categoryId]
  );
  if (!category) throw new Error('CATEGORY_NOT_FOUND');

  const enterpriseId =
    typeof input.processId === 'string' && input.processId.trim()
      ? input.processId.trim()
      : String(existing.processId);

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM BusinessProcess WHERE institutionId = ? AND processId = ? AND id <> ? LIMIT 1',
    [existing.institutionId, enterpriseId, id]
  );
  if (duplicate) throw new Error('PROCESS_ID_CONFLICT');

  const name =
    typeof input.name === 'string' && input.name.trim()
      ? input.name.trim()
      : String(existing.name);
  const ownerName =
    typeof input.ownerName === 'string' && input.ownerName.trim()
      ? input.ownerName.trim()
      : String(existing.ownerName);
  const criticality =
    typeof input.criticality === 'string' && input.criticality.trim()
      ? input.criticality.trim()
      : String(existing.criticality);
  const classification =
    typeof input.classification === 'string' && input.classification.trim()
      ? input.classification.trim()
      : String(existing.classification);
  const description =
    typeof input.description === 'string'
      ? (input.description.trim() || null)
      : (existing.description ?? null);
  const isIcofrRelevant =
    input.isIcofrRelevant === undefined
      ? bool(existing.isIcofrRelevant)
      : bool(input.isIcofrRelevant);
  const updatedAt = nowIso();

  await run(
    db,
    `UPDATE BusinessProcess
        SET categoryId = ?,
            processId = ?,
            name = ?,
            description = ?,
            ownerName = ?,
            criticality = ?,
            classification = ?,
            isIcofrRelevant = ?,
            updatedAt = ?
      WHERE id = ?`,
    [
      categoryId,
      enterpriseId,
      name,
      description,
      ownerName,
      criticality,
      classification,
      isIcofrRelevant ? 1 : 0,
      updatedAt,
      id
    ]
  );

  const updated = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [id]
  );
  if (!updated) throw new Error('PROCESS_NOT_FOUND');

  await writeAudit(db, {
    institutionId: String(existing.institutionId),
    action: 'UPDATE',
    entityType: 'Process',
    recordId: id,
    oldValue: processRow(existing),
    newValue: processRow(updated),
    reason: 'Business process master updated in Cloudflare D1.'
  });

  return hydrateProcess(db, updated, new Map([[String(category.id), category]]));
}

export async function deleteBusinessProcess(id: string) {
  const db = await ensureCoreDomainSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [id]
  );
  if (!existing) throw new Error('PROCESS_NOT_FOUND');

  const [riskCountRow, controlCountRow] = await Promise.all([
    first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM RiskMaster WHERE processId = ?',
      [id]
    ),
    first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM ControlMaster WHERE processId = ?',
      [id]
    )
  ]);

  let assuranceCount = 0;
  const assuranceTables = ['ToETest', 'Issue'] as const;
  for (const tableName of assuranceTables) {
    const table = await first<{ count?: number }>(
      db,
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name = ?",
      [tableName]
    );
    if (Number(table?.count || 0) > 0) {
      const dependency = await first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count FROM ${tableName} WHERE processId = ?`,
        [id]
      );
      assuranceCount += Number(dependency?.count || 0);
    }
  }

  let icofrScopeCount = 0;
  const scopeTable = await first<{ count?: number }>(
    db,
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='ICOFRScopeItem'"
  );
  if (Number(scopeTable?.count || 0) > 0) {
    const scopeDependencies = await first<{ count?: number }>(
      db,
      "SELECT COUNT(*) AS count FROM ICOFRScopeItem WHERE sourceId = ? AND lower(itemType) = 'process'",
      [id]
    );
    icofrScopeCount = Number(scopeDependencies?.count || 0);
  }

  const dependencyCount =
    Number(riskCountRow?.count || 0) +
    Number(controlCountRow?.count || 0) +
    assuranceCount +
    icofrScopeCount;

  if (dependencyCount > 0) {
    throw new Error('PROCESS_HAS_DEPENDENCIES');
  }

  const snapshot = await hydrateProcess(db, existing);
  const auditValues = [
    crypto.randomUUID(),
    existing.institutionId || null,
    'System',
    'System',
    'DELETE',
    'Process',
    id,
    JSON.stringify(snapshot),
    null,
    'Business process deleted from Cloudflare D1 after dependency validation.',
    null,
    nowIso()
  ];

  if (db.batch) {
    await db.batch([
      db.prepare('DELETE FROM ProcessObjective WHERE processId = ?').bind(id),
      db.prepare('DELETE FROM SIPOC WHERE processId = ?').bind(id),
      db.prepare('DELETE FROM ProcessActivity WHERE processId = ?').bind(id),
      db.prepare('DELETE FROM BusinessProcess WHERE id = ?').bind(id),
      db.prepare(
        `INSERT INTO AuditLog (
          id, institutionId, userName, userRole, action, entityType, recordId,
          oldValue, newValue, reason, ipAddress, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(...auditValues)
    ]);
  } else {
    await run(db, 'DELETE FROM ProcessObjective WHERE processId = ?', [id]);
    await run(db, 'DELETE FROM SIPOC WHERE processId = ?', [id]);
    await run(db, 'DELETE FROM ProcessActivity WHERE processId = ?', [id]);
    await run(db, 'DELETE FROM BusinessProcess WHERE id = ?', [id]);
    await writeAudit(db, {
      institutionId: String(existing.institutionId),
      action: 'DELETE',
      entityType: 'Process',
      recordId: id,
      oldValue: snapshot,
      newValue: null,
      reason: 'Business process deleted from Cloudflare D1 after dependency validation.'
    });
  }

  return {
    id,
    processId: String(existing.processId),
    name: String(existing.name)
  };
}

export async function listRisks() {
  const db = await ensureCoreDomainSchema();
  const rows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM RiskMaster ORDER BY riskId ASC'
  );

  return Promise.all(
    rows.map(async row => {
      const [process, activity, mappings] = await Promise.all([
        first<Record<string, unknown>>(
          db,
          'SELECT id, processId, name, categoryId, criticality, classification FROM BusinessProcess WHERE id = ? LIMIT 1',
          [row.processId]
        ),
        row.activityId
          ? first<Record<string, unknown>>(
              db,
              'SELECT * FROM ProcessActivity WHERE id = ? LIMIT 1',
              [row.activityId]
            )
          : Promise.resolve(null),
        all<Record<string, unknown>>(
          db,
          `SELECT m.id, m.controlId, m.riskId, m.createdAt,
                  c.controlId AS enterpriseControlId, c.name AS controlName,
                  c.description AS controlDescription, c.objective AS controlObjective,
                  c.controlOwner, c.type, c.nature, c.frequency,
                  c.isKeyControl, c.isIcofrKey, c.overallHealth
             FROM ControlRiskMapping m
             JOIN ControlMaster c ON c.id = m.controlId
            WHERE m.riskId = ?
            ORDER BY c.controlId ASC`,
          [row.id]
        )
      ]);

      return {
        ...riskRow(row),
        process,
        activity,
        controls: mappings.map(mapping => ({
          id: mapping.id,
          controlId: mapping.controlId,
          riskId: mapping.riskId,
          createdAt: mapping.createdAt,
          control: controlRow({
            id: mapping.controlId,
            controlId: mapping.enterpriseControlId,
            name: mapping.controlName,
            description: mapping.controlDescription,
            objective: mapping.controlObjective,
            controlOwner: mapping.controlOwner,
            type: mapping.type,
            nature: mapping.nature,
            frequency: mapping.frequency,
            isKeyControl: mapping.isKeyControl,
            isIcofrKey: mapping.isIcofrKey,
            overallHealth: mapping.overallHealth
          })
        })),
        issues: []
      };
    })
  );
}

export async function createRisk(input: Record<string, unknown>) {
  const db = await ensureCoreDomainSchema();
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [input.processId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const enterpriseId =
    typeof input.riskId === 'string' && input.riskId.trim()
      ? input.riskId.trim()
      : 'RSK-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM RiskMaster WHERE institutionId = ? AND riskId = ? LIMIT 1',
    [process.institutionId, enterpriseId]
  );
  if (duplicate) throw new Error('RISK_ID_CONFLICT');

  const likelihood = Number(input.inherentLikelihood);
  const impactValue = Number(input.inherentImpact);
  const score = likelihood * impactValue;
  const rating = riskRating(score);
  const id = crypto.randomUUID();
  const now = nowIso();
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim()
      : `Due to ${String(input.cause)}, there is a risk that ${String(input.event)}, resulting in ${String(input.impact)}.`;

  await run(
    db,
    `INSERT INTO RiskMaster (
      id, institutionId, processId, activityId, riskId, name, description, cause,
      event, impact, category, ownerName, inherentLikelihood, inherentImpact,
      inherentScore, inherentRating, residualLikelihood, residualImpact,
      residualScore, residualRating, riskTreatment, status, version, createdAt, updatedAt
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not Assessed', 'Active', '1.0', ?, ?)`,
    [
      id,
      process.institutionId,
      process.id,
      enterpriseId,
      input.name,
      description,
      input.cause,
      input.event,
      input.impact,
      input.category,
      input.ownerName,
      likelihood,
      impactValue,
      score,
      rating,
      likelihood,
      impactValue,
      score,
      rating,
      now,
      now
    ]
  );

  const created: Record<string, unknown> = {
    id,
    institutionId: process.institutionId,
    processId: process.id,
    activityId: null,
    riskId: enterpriseId,
    name: input.name,
    description,
    cause: input.cause,
    event: input.event,
    impact: input.impact,
    category: input.category,
    ownerName: input.ownerName,
    inherentLikelihood: likelihood,
    inherentImpact: impactValue,
    inherentScore: score,
    inherentRating: rating,
    residualLikelihood: likelihood,
    residualImpact: impactValue,
    residualScore: score,
    residualRating: rating,
    riskTreatment: 'Not Assessed',
    status: 'Active',
    version: '1.0',
    createdAt: now,
    updatedAt: now
  };

  await writeAudit(db, {
    institutionId: String(process.institutionId),
    action: 'CREATE',
    entityType: 'Risk',
    recordId: id,
    newValue: created,
    reason: 'Risk registered in Cloudflare D1.'
  });

  return {
    ...riskRow(created),
    process: {
      id: process.id,
      processId: process.processId,
      name: process.name
    },
    activity: null,
    controls: [],
    issues: []
  };
}

export async function listControls() {
  const db = await ensureCoreDomainSchema();
  const rows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ControlMaster ORDER BY controlId ASC'
  );

  return Promise.all(
    rows.map(async row => {
      const [process, activity, mappings] = await Promise.all([
        first<Record<string, unknown>>(
          db,
          'SELECT id, processId, name, categoryId, criticality, classification FROM BusinessProcess WHERE id = ? LIMIT 1',
          [row.processId]
        ),
        row.activityId
          ? first<Record<string, unknown>>(
              db,
              'SELECT * FROM ProcessActivity WHERE id = ? LIMIT 1',
              [row.activityId]
            )
          : Promise.resolve(null),
        all<Record<string, unknown>>(
          db,
          `SELECT m.id, m.controlId, m.riskId, m.createdAt,
                  r.riskId AS enterpriseRiskId, r.name AS riskName,
                  r.description AS riskDescription, r.category AS riskCategory,
                  r.inherentScore, r.inherentRating, r.residualScore, r.residualRating
             FROM ControlRiskMapping m
             JOIN RiskMaster r ON r.id = m.riskId
            WHERE m.controlId = ?
            ORDER BY r.riskId ASC`,
          [row.id]
        )
      ]);

      return {
        ...controlRow(row),
        process,
        activity,
        risks: mappings.map(mapping => ({
          id: mapping.id,
          controlId: mapping.controlId,
          riskId: mapping.riskId,
          createdAt: mapping.createdAt,
          risk: riskRow({
            id: mapping.riskId,
            riskId: mapping.enterpriseRiskId,
            name: mapping.riskName,
            description: mapping.riskDescription,
            category: mapping.riskCategory,
            inherentScore: mapping.inherentScore,
            inherentRating: mapping.inherentRating,
            residualScore: mapping.residualScore,
            residualRating: mapping.residualRating
          })
        })),
        todTests: [],
        toeTests: [],
        monitoringRules: [],
        certifications: []
      };
    })
  );
}

export async function createControl(input: Record<string, unknown>) {
  const db = await ensureCoreDomainSchema();
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [input.processId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  let risk: Record<string, unknown> | null = null;
  if (input.riskId) {
    risk = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM RiskMaster WHERE id = ? LIMIT 1',
      [input.riskId]
    );
    if (!risk) throw new Error('RISK_NOT_FOUND');
    if (String(risk.processId) !== String(process.id)) throw new Error('RISK_PROCESS_MISMATCH');
  }

  const enterpriseId =
    typeof input.controlId === 'string' && input.controlId.trim()
      ? input.controlId.trim()
      : 'CTRL-' + crypto.randomUUID().slice(0, 8).toUpperCase();

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ControlMaster WHERE institutionId = ? AND controlId = ? LIMIT 1',
    [process.institutionId, enterpriseId]
  );
  if (duplicate) throw new Error('CONTROL_ID_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();

  await run(
    db,
    `INSERT INTO ControlMaster (
      id, institutionId, processId, activityId, controlId, name, description,
      objective, controlOwner, performer, reviewer, type, nature, method, frequency,
      isKeyControl, keyControlRationale, isIcofrKey, isItgc, evidenceRequirement,
      systemDependency, frameworkMapping, regulationMapping, designAssessment,
      operatingStatus, overallHealth, healthRationale, version, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 'Approval', ?, ?, NULL, ?, 0, NULL, NULL, NULL, NULL, 'Not Assessed', 'Not Assessed', 'Not Assessed', NULL, '1.0', 'Active', ?, ?)`,
    [
      id,
      process.institutionId,
      process.id,
      enterpriseId,
      input.name,
      input.description,
      input.objective,
      input.controlOwner,
      input.type,
      input.nature,
      input.frequency,
      input.isKeyControl ? 1 : 0,
      input.isIcofrKey ? 1 : 0,
      now,
      now
    ]
  );

  if (risk) {
    await run(
      db,
      `INSERT OR IGNORE INTO ControlRiskMapping
        (id, controlId, riskId, createdAt)
       VALUES (?, ?, ?, ?)`,
      [crypto.randomUUID(), id, risk.id, now]
    );
  }

  const created: Record<string, unknown> = {
    id,
    institutionId: process.institutionId,
    processId: process.id,
    activityId: null,
    controlId: enterpriseId,
    name: input.name,
    description: input.description,
    objective: input.objective,
    controlOwner: input.controlOwner,
    performer: null,
    reviewer: null,
    type: input.type,
    nature: input.nature,
    method: 'Approval',
    frequency: input.frequency,
    isKeyControl: input.isKeyControl ? 1 : 0,
    keyControlRationale: null,
    isIcofrKey: input.isIcofrKey ? 1 : 0,
    isItgc: 0,
    evidenceRequirement: null,
    systemDependency: null,
    frameworkMapping: null,
    regulationMapping: null,
    designAssessment: 'Not Assessed',
    operatingStatus: 'Not Assessed',
    overallHealth: 'Not Assessed',
    healthRationale: null,
    version: '1.0',
    status: 'Active',
    createdAt: now,
    updatedAt: now
  };

  await writeAudit(db, {
    institutionId: String(process.institutionId),
    action: 'CREATE',
    entityType: 'Control',
    recordId: id,
    newValue: created,
    reason: risk
      ? 'Control registered and mapped to a persisted risk in Cloudflare D1.'
      : 'Control registered in Cloudflare D1.'
  });

  return {
    ...controlRow(created),
    process: {
      id: process.id,
      processId: process.processId,
      name: process.name
    },
    activity: null,
    risks: risk
      ? [
          {
            controlId: id,
            riskId: risk.id,
            risk: riskRow(risk)
          }
        ]
      : [],
    todTests: [],
    toeTests: [],
    monitoringRules: [],
    certifications: []
  };
}

export async function listRcmRows() {
  const db = await ensureCoreDomainSchema();
  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT
        m.id AS mappingId,
        p.id AS internalProcessId,
        p.processId AS enterpriseProcessId,
        p.name AS processName,
        pc.name AS processCategory,
        r.id AS internalRiskId,
        r.riskId AS enterpriseRiskId,
        r.name AS riskName,
        r.cause AS riskCause,
        r.event AS riskEvent,
        r.impact AS riskImpact,
        r.category AS riskCategory,
        r.activityId,
        r.inherentScore,
        r.inherentRating,
        r.residualScore,
        r.residualRating,
        c.id AS internalControlId,
        c.controlId AS enterpriseControlId,
        c.name AS controlName,
        c.description AS controlDescription,
        c.objective AS controlObjective,
        c.controlOwner,
        c.type AS controlType,
        c.nature AS controlNature,
        c.frequency AS controlFrequency,
        c.evidenceRequirement,
        c.isKeyControl,
        c.isIcofrKey,
        c.overallHealth
      FROM ControlRiskMapping m
      JOIN RiskMaster r ON r.id = m.riskId
      JOIN BusinessProcess p ON p.id = r.processId
      LEFT JOIN ProcessCategory pc ON pc.id = p.categoryId
      JOIN ControlMaster c ON c.id = m.controlId
      ORDER BY p.processId ASC, r.riskId ASC, c.controlId ASC`
  );

  const rcm = await Promise.all(
    rows.map(async (row, index) => {
      const [objective, activity] = await Promise.all([
        first<Record<string, unknown>>(
          db,
          'SELECT objective FROM ProcessObjective WHERE processId = ? ORDER BY createdAt ASC LIMIT 1',
          [row.internalProcessId]
        ),
        row.activityId
          ? first<Record<string, unknown>>(
              db,
              'SELECT name FROM ProcessActivity WHERE id = ? LIMIT 1',
              [row.activityId]
            )
          : Promise.resolve(null)
      ]);

      return {
        id: row.mappingId,
        rowNumber: index + 1,
        processId: row.enterpriseProcessId,
        processName: row.processName,
        processCategory: row.processCategory || 'Uncategorized',
        activityName: activity?.name || 'Process-level risk',
        processObjective: objective?.objective || 'Not provided',
        riskId: row.enterpriseRiskId,
        riskName: row.riskName,
        riskCause: row.riskCause,
        riskEvent: row.riskEvent,
        riskImpact: row.riskImpact,
        riskCategory: row.riskCategory,
        inherentScore: Number(row.inherentScore || 0),
        inherentRating: row.inherentRating,
        residualScore: Number(row.residualScore || 0),
        residualRating: row.residualRating,
        controlId: row.enterpriseControlId,
        controlName: row.controlName,
        controlDescription: row.controlDescription,
        controlObjective: row.controlObjective,
        controlOwner: row.controlOwner,
        controlType: row.controlType,
        controlNature: row.controlNature,
        controlFrequency: row.controlFrequency,
        evidenceRequirement: row.evidenceRequirement || 'Not provided',
        isKeyControl: bool(row.isKeyControl),
        isIcofrKey: bool(row.isIcofrKey),
        csaStatus: 'Not Assessed',
        todConclusion: 'Not Assessed',
        toeConclusion: 'Not Tested',
        toePassRatio: 'Not Tested',
        controlHealth: row.overallHealth || 'Not Assessed',
        issueId: null,
        issueTitle: null,
        issueSeverity: null,
        issueStatus: 'No Issue',
        mapId: null,
        mapAgreedAction: null,
        mapStatus: null,
        mapProgress: null,
        retestResult: null
      };
    })
  );

  return rcm;
}

async function count(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<number> {
  const row = await first<{ count?: number }>(db, sql, values);
  return Number(row?.count || 0);
}

export async function getCoreDashboardData() {
  const db = await ensureCoreDomainSchema();

  const [
    totalProcesses,
    criticalProcesses,
    totalRisks,
    criticalRisks,
    highRisks,
    totalControls,
    keyControls,
    mappedHighCritical,
    highCritical,
    recentAuditLogs
  ] = await Promise.all([
    count(db, 'SELECT COUNT(*) AS count FROM BusinessProcess'),
    count(db, "SELECT COUNT(*) AS count FROM BusinessProcess WHERE criticality = 'Critical'"),
    count(db, 'SELECT COUNT(*) AS count FROM RiskMaster'),
    count(db, "SELECT COUNT(*) AS count FROM RiskMaster WHERE inherentRating = 'Critical'"),
    count(db, "SELECT COUNT(*) AS count FROM RiskMaster WHERE inherentRating = 'High'"),
    count(db, 'SELECT COUNT(*) AS count FROM ControlMaster'),
    count(db, 'SELECT COUNT(*) AS count FROM ControlMaster WHERE isKeyControl = 1'),
    count(
      db,
      `SELECT COUNT(DISTINCT r.id) AS count
         FROM RiskMaster r
         JOIN ControlRiskMapping m ON m.riskId = r.id
        WHERE r.inherentRating IN ('High', 'Critical')`
    ),
    count(
      db,
      "SELECT COUNT(*) AS count FROM RiskMaster WHERE inherentRating IN ('High', 'Critical')"
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM AuditLog ORDER BY timestamp DESC LIMIT 8'
    )
  ]);

  const metrics = {
    totalProcesses,
    criticalProcesses,
    totalRisks,
    criticalRisks,
    highRisks,
    totalControls,
    keyControls,
    failedToEs: 0,
    totalExceptions: 0,
    openIssues: 0,
    closedIssues: 0,
    overdueMAP: 0,
    completedMAP: 0,
    ccmHealthy: 0,
    totalRetests: 0
  };

  const executiveQandA = [
    {
      question: 'Are High/Critical risks mapped to controls?',
      status: highCritical ? `${mappedHighCritical}/${highCritical} mapped` : 'No rated risks',
      summary: highCritical
        ? `${mappedHighCritical} of ${highCritical} High/Critical risks have at least one persisted control mapping.`
        : 'No High/Critical risks are currently registered.',
      badge: 'Cloudflare D1'
    },
    {
      question: 'Have key controls been tested?',
      status: keyControls ? 'Testing data migration pending' : 'No key controls',
      summary: keyControls
        ? 'Key controls are persisted. ToD/ToE persistence is the next D1 migration phase; no testing conclusion is inferred.'
        : 'No key controls are currently registered.',
      badge: 'Cloudflare D1'
    },
    {
      question: 'How many issues remain open?',
      status: 'Remediation migration pending',
      summary: 'Issue and remediation counts are not inferred until their D1 migration is complete.',
      badge: 'Cloudflare D1'
    },
    {
      question: 'Which remediation actions are overdue?',
      status: 'Remediation migration pending',
      summary: 'Management Action Plan status is not inferred until remediation records are persisted in D1.',
      badge: 'Cloudflare D1'
    }
  ];

  return {
    metrics,
    executiveQandA,
    recentAuditLogs,
    storage: 'cloudflare-d1',
    persistenceScope: 'core-bpm-risk-control'
  };
}

export async function recordAiAnalysisAudit(input: {
  institutionId?: string | null;
  processId: string;
  requestId: string;
  provider: string;
  model: string;
  findingsCount: number;
}) {
  const db = await ensureCoreDomainSchema();
  await writeAudit(db, {
    institutionId: input.institutionId || null,
    userName: 'Total ARC AI',
    userRole: 'AI Assistant',
    action: 'AI_ANALYZE',
    entityType: 'BusinessProcess',
    recordId: input.processId,
    newValue: {
      requestId: input.requestId,
      provider: input.provider,
      model: input.model,
      findingsCount: input.findingsCount,
      humanReviewRequired: true
    },
    reason: 'Advisory BPM/RCM control-gap analysis; no autonomous record mutation.'
  });
}
