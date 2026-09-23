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
  { id: 'ref:CAT-CORE', code: 'CAT-CORE', name: 'Core Business Operation', orderIndex: 2 },
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
  rcmDraft?: Record<string, unknown> | null;
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

async function coreDomainSchemaIsCurrent(db: D1DatabaseLike) {
  const tableNames = [
    'Institution',
    'LegalEntity',
    'OrganizationUnit',
    'ProcessCategory',
    'BusinessProcess',
    'ProcessObjective',
    'SIPOC',
    'ProcessActivity',
    'RiskMaster',
    'OperationalRiskMetadata',
    'ControlMaster',
    'ControlRiskMapping',
    'RCMControlSourceMetadata',
    'RCMLegacyControlRegister',
    'RCMDesignRequirement',
    'RCMDraftReference',
    'RCMIntegrityRun',
    'AuditLog'
  ];
  const tableList = tableNames.map(name => `'${name}'`).join(',');
  const tableRow = await db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM sqlite_master
        WHERE type = 'table' AND name IN (${tableList})`
    )
    .first<{ count?: number }>();

  if (Number(tableRow?.count || 0) !== tableNames.length) return false;

  const [processColumns, riskColumns, controlColumns, categoryRow] = await Promise.all([
    db.prepare('PRAGMA table_info(BusinessProcess)').all<{ name?: string }>(),
    db.prepare('PRAGMA table_info(RiskMaster)').all<{ name?: string }>(),
    db.prepare('PRAGMA table_info(ControlMaster)').all<{ name?: string }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM ProcessCategory
          WHERE code IN ('CAT-GOV','CAT-CORE','CAT-FIN','CAT-IT','CAT-PROC','CAT-HR')`
      )
      .first<{ count?: number }>()
  ]);

  if (Number(categoryRow?.count || 0) !== PROCESS_CATEGORIES.length) return false;

  const processColumnNames = new Set(
    (processColumns.results || []).map(column => String(column.name || ''))
  );
  const riskColumnNames = new Set(
    (riskColumns.results || []).map(column => String(column.name || ''))
  );
  const controlColumnNames = new Set(
    (controlColumns.results || []).map(column => String(column.name || ''))
  );

  return (
    ['level', 'parentProcessId', 'tags', 'updatedAt'].every(name =>
      processColumnNames.has(name)
    ) &&
    ['inherentScore', 'residualScore', 'riskTreatment', 'updatedAt'].every(name =>
      riskColumnNames.has(name)
    ) &&
    ['isItgc', 'frameworkMapping', 'overallHealth', 'updatedAt'].every(name =>
      controlColumnNames.has(name)
    )
  );
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
  if (!Number.isFinite(score) || score <= 0) return 'Not Assessed';
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

    if (await coreDomainSchemaIsCurrent(db)) {
      return db;
    }

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

    CREATE TABLE IF NOT EXISTS LegalEntity (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Indonesia',
      taxId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_entity_institution_code
      ON LegalEntity(institutionId, code);

    CREATE TABLE IF NOT EXISTS OrganizationUnit (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      parentId TEXT,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      headName TEXT,
      headEmail TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_unit_institution_code
      ON OrganizationUnit(institutionId, code);
    CREATE INDEX IF NOT EXISTS idx_org_unit_parent ON OrganizationUnit(parentId);

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
    CREATE INDEX IF NOT EXISTS idx_process_enterprise_id ON BusinessProcess(processId);

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
    CREATE INDEX IF NOT EXISTS idx_objective_process_created
      ON ProcessObjective(processId, createdAt);

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
    CREATE INDEX IF NOT EXISTS idx_activity_process_order
      ON ProcessActivity(processId, orderIndex, createdAt);

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
    CREATE INDEX IF NOT EXISTS idx_risk_enterprise_id ON RiskMaster(riskId);
    CREATE INDEX IF NOT EXISTS idx_risk_inherent_rating ON RiskMaster(inherentRating);

    CREATE TABLE IF NOT EXISTS OperationalRiskMetadata (
      riskId TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      sourceStructuredRecordId TEXT NOT NULL UNIQUE,
      sourceRecordType TEXT NOT NULL,
      sourceRecordKey TEXT NOT NULL,
      sourceDocumentId TEXT NOT NULL,
      sourceRiskRating TEXT,
      sourceStatus TEXT,
      sourceCause TEXT,
      sourceImpactLabel TEXT,
      reviewRequired INTEGER NOT NULL DEFAULT 1,
      feedBatch TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_operational_risk_metadata_institution
      ON OperationalRiskMetadata(institutionId);

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
    CREATE INDEX IF NOT EXISTS idx_control_enterprise_id ON ControlMaster(controlId);
    CREATE INDEX IF NOT EXISTS idx_control_key_flag ON ControlMaster(isKeyControl);

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

    CREATE TABLE IF NOT EXISTS RCMControlSourceMetadata (
      controlId TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      sourceRecordId TEXT,
      sourceDocumentId TEXT,
      sourceRecordType TEXT NOT NULL,
      sourceReference TEXT,
      sourceCycle TEXT,
      sourceProcess TEXT,
      sourceSubprocess TEXT,
      sourceLocation TEXT,
      sourceRawKey TEXT,
      sourceRawType TEXT,
      sourceRawNature TEXT,
      sourceRawFrequency TEXT,
      sourceRawApplication TEXT,
      sourceRawFunction TEXT,
      sourceRawPerformer TEXT,
      taxonomyStatus TEXT NOT NULL,
      mappingStatus TEXT NOT NULL,
      validationStatus TEXT NOT NULL,
      sourcePriority INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      feedBatch TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rcm_source_meta_institution
      ON RCMControlSourceMetadata(institutionId);
    CREATE INDEX IF NOT EXISTS idx_rcm_source_meta_status
      ON RCMControlSourceMetadata(mappingStatus, validationStatus);

    CREATE TABLE IF NOT EXISTS RCMLegacyControlRegister (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      sourceNo INTEGER NOT NULL,
      sourceCycle TEXT NOT NULL,
      processCode TEXT NOT NULL,
      businessProcess TEXT,
      subprocess TEXT,
      location TEXT,
      controlActivity TEXT NOT NULL,
      sourceKey TEXT,
      sourceType TEXT,
      sourceNature TEXT,
      sourceFrequency TEXT,
      sourceApplication TEXT,
      sourceFunction TEXT,
      sourcePerformer TEXT,
      fraudRiskMissing INTEGER NOT NULL DEFAULT 0,
      riskRatingMissing INTEGER NOT NULL DEFAULT 0,
      evidenceMissing INTEGER NOT NULL DEFAULT 0,
      brokenLanguage INTEGER NOT NULL DEFAULT 0,
      applicationPlaceholder INTEGER NOT NULL DEFAULT 0,
      functionPlaceholder INTEGER NOT NULL DEFAULT 0,
      repairFlagCount INTEGER NOT NULL DEFAULT 0,
      reconciliationStatus TEXT NOT NULL,
      operationalControlId TEXT,
      sourceReference TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_legacy_source_no
      ON RCMLegacyControlRegister(institutionId, sourceNo);
    CREATE INDEX IF NOT EXISTS idx_rcm_legacy_cycle
      ON RCMLegacyControlRegister(sourceCycle, reconciliationStatus);

    CREATE TABLE IF NOT EXISTS RCMDesignRequirement (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      requirementCode TEXT NOT NULL,
      processId TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      sourceReference TEXT NOT NULL,
      sourceStatus TEXT NOT NULL,
      validationStatus TEXT NOT NULL,
      status TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_requirement_code
      ON RCMDesignRequirement(institutionId, requirementCode);

    CREATE TABLE IF NOT EXISTS RCMDraftReference (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      referenceType TEXT NOT NULL,
      referenceCode TEXT NOT NULL,
      title TEXT,
      payloadJson TEXT NOT NULL,
      sourceRecordId TEXT,
      sourceDocumentId TEXT,
      sourceReference TEXT NOT NULL,
      sourceStatus TEXT NOT NULL,
      validationRequired INTEGER NOT NULL DEFAULT 1,
      operationalControlId TEXT,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_draft_ref
      ON RCMDraftReference(institutionId, referenceType, referenceCode);

    CREATE TABLE IF NOT EXISTS RCMIntegrityRun (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      batchCode TEXT NOT NULL,
      runAt TEXT NOT NULL,
      status TEXT NOT NULL,
      summaryJson TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rcm_integrity_batch
      ON RCMIntegrityRun(institutionId, batchCode);

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

function uniqueText(values: unknown[], limit = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function parseJsonObject(value: unknown): Record<string, any> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : {};
  } catch {
    return {};
  }
}

function compactFingerprint(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildRcmDerivedBpmDraft(
  process: Record<string, unknown>,
  risks: Array<Record<string, unknown>>,
  controls: Array<Record<string, unknown>>,
  mappingCount: number,
  existing: {
    objectiveCount: number;
    activityCount: number;
    hasSipoc: boolean;
  }
) {
  const hasRcmContext = mappingCount > 0;
  if (!hasRcmContext) return null;

  const missingSections: string[] = [];
  const currentDescription =
    typeof process.description === 'string' ? process.description.trim() : '';
  if (!currentDescription) missingSections.push('description');
  if (existing.objectiveCount === 0) missingSections.push('objective');
  if (existing.activityCount === 0) missingSections.push('activities');
  if (!existing.hasSipoc) missingSections.push('sipoc');
  if (missingSections.length === 0) return null;

  const processName = String(process.name || process.processId || 'Business Process');
  const riskIds = uniqueText(risks.map(item => item.riskId), 200);
  const controlIds = uniqueText(controls.map(item => item.controlId), 300);
  const riskNames = uniqueText(risks.map(item => item.name), 5);
  const controlNames = uniqueText(controls.map(item => item.name), 8);
  const controlObjectives = uniqueText(controls.map(item => item.objective), 4);
  const systems = uniqueText(controls.map(item => item.systemDependency), 6);
  const evidence = uniqueText(controls.map(item => item.evidenceRequirement), 6);
  const performers = uniqueText(
    controls.flatMap(item => [item.performer, item.controlOwner]),
    6
  );
  const reviewers = uniqueText(
    controls.flatMap(item => [item.reviewer, item.controlOwner, process.ownerName]),
    6
  );

  const activities =
    controls.length > 0
      ? controls.map((control, index) => {
          const controlId = String(control.controlId || `CTRL-${index + 1}`);
          const controlName = String(control.name || controlId);
          const description = [
            `Kandidat aktivitas BPM berbasis titik kontrol RCM ${controlId}.`,
            typeof control.description === 'string' && control.description.trim()
              ? control.description.trim()
              : '',
            'Urutan operasional belum dikonfirmasi dan wajib divalidasi user/Process Owner.'
          ]
            .filter(Boolean)
            .join(' ');
          return {
            activityId: `RCM-DRAFT-${String(index + 1).padStart(3, '0')}`,
            name: controlName,
            description,
            performer:
              String(control.performer || control.controlOwner || process.ownerName || '').trim() ||
              null,
            nature: String(control.nature || 'Manual'),
            frequency: String(control.frequency || 'Per Transaction'),
            inputData: control.systemDependency
              ? `Data/transaksi dari ${String(control.systemDependency)}`
              : null,
            outputData: control.evidenceRequirement
              ? String(control.evidenceRequirement)
              : null,
            systemUsed: control.systemDependency
              ? String(control.systemDependency)
              : null,
            sla: null,
            orderIndex: index + 1,
            sourceControlId: controlId
          };
        })
      : risks.map((risk, index) => ({
          activityId: `RCM-DRAFT-RISK-${String(index + 1).padStart(3, '0')}`,
          name: `Risk checkpoint — ${String(risk.name || risk.riskId || index + 1)}`,
          description:
            'Kandidat checkpoint proses diturunkan dari RCM risk karena detail control-point belum tersedia. Urutan dan aktivitas aktual wajib divalidasi user/Process Owner.',
          performer: String(risk.ownerName || process.ownerName || '').trim() || null,
          nature: 'Manual',
          frequency: 'To be validated',
          inputData: null,
          outputData: null,
          systemUsed: null,
          sla: null,
          orderIndex: index + 1,
          sourceRiskId: String(risk.riskId || '')
        }));

  const objectiveRiskText =
    riskNames.length > 0
      ? ` dengan fokus pada mitigasi risiko utama: ${riskNames.join('; ')}`
      : '';
  const objectiveControlText =
    controlObjectives.length > 0
      ? ` serta tujuan kontrol yang tercatat pada RCM: ${controlObjectives.join('; ')}`
      : '';
  const objective =
    `Memastikan proses ${processName} dilaksanakan secara terkendali, lengkap, akurat, tepat waktu, dan sesuai kewenangan${objectiveRiskText}${objectiveControlText}.`;

  const narrative = [
    `Draft BPM untuk ${processName} disusun dari konteks RCM yang tersedia (${risks.length} risk, ${controls.length} control, ${mappingCount} risk-control mapping).`,
    riskNames.length > 0 ? `Risiko acuan: ${riskNames.join('; ')}.` : '',
    controlNames.length > 0 ? `Titik kontrol acuan: ${controlNames.join('; ')}.` : '',
    'Draft ini bukan process flow yang telah dikonfirmasi; batas proses, sequence, role, input/output, dan system dependency harus divalidasi user sebelum digunakan sebagai BPM operasional.'
  ]
    .filter(Boolean)
    .join(' ');

  const sipoc = {
    suppliers:
      performers.length > 0
        ? `Kandidat dari RCM: ${performers.join('; ')}`
        : 'Kandidat supplier/pihak pemberi input — perlu validasi user.',
    inputs:
      systems.length > 0
        ? `Data/transaksi dari sistem RCM: ${systems.join('; ')}`
        : 'Data/transaksi/dokumen sumber proses — perlu validasi user.',
    processSteps:
      activities.length > 0
        ? activities
            .slice(0, 12)
            .map(item => item.name)
            .join(' → ')
        : 'Sequence proses belum cukup didukung oleh RCM.',
    outputs:
      evidence.length > 0
        ? `Kandidat output/evidence: ${evidence.join('; ')}`
        : 'Bukti pelaksanaan kontrol dan output proses — perlu validasi user.',
    customers:
      reviewers.length > 0
        ? `Kandidat penerima/reviewer dari RCM: ${reviewers.join('; ')}`
        : 'Process Owner/downstream stakeholder — perlu validasi user.'
  };

  const fingerprintSource = JSON.stringify({
    processId: process.id,
    processUpdatedAt: process.updatedAt || '',
    mappings: mappingCount,
    risks: risks.map(item => [
      item.riskId || '',
      item.updatedAt || '',
      item.name || ''
    ]),
    controls: controls.map(item => [
      item.controlId || '',
      item.updatedAt || '',
      item.name || '',
      item.objective || ''
    ])
  });

  return {
    status: 'PENDING_USER_VALIDATION',
    derivedFrom: 'RCM',
    sourceFingerprint: compactFingerprint(fingerprintSource),
    notOperationalUntilValidated: true,
    missingSections,
    sourceSummary: {
      riskCount: risks.length,
      controlCount: controls.length,
      mappingCount,
      riskIds,
      controlIds
    },
    narrative,
    objective,
    activities,
    sipoc,
    validationNotes: [
      'Draft dibentuk hanya dari konteks RCM yang tersedia.',
      'Urutan aktivitas mengikuti urutan referensi control ID, bukan bukti sequence operasional.',
      'Draft tidak ditulis ke ProcessObjective, ProcessActivity, atau SIPOC sampai user melakukan Validate & Apply.',
      'User/Process Owner harus memeriksa scope, sequence, role, system, input/output, frekuensi, dan evidence sebelum digunakan.'
    ]
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

  const orgUnit = row.orgUnitId
    ? await first<Record<string, unknown>>(
        db,
        'SELECT * FROM OrganizationUnit WHERE id = ? LIMIT 1',
        [row.orgUnitId]
      )
    : null;

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
    orgUnit,
    objectives,
    sipoc,
    activities,
    risks: risks.map(riskRow),
    controls: controls.map(controlRow)
  } as D1BusinessProcess;
}

export async function listProcessLookups() {
  const db = await ensureCoreDomainSchema();
  return all<Record<string, unknown>>(
    db,
    `SELECT id, institutionId, categoryId, processId, name, criticality,
            classification, isIcofrRelevant, status
       FROM BusinessProcess
      ORDER BY processId ASC`
  );
}

export async function listBusinessProcesses() {
  const db = await ensureCoreDomainSchema();
  const [categories, rows, orgUnits, objectives, sipocs, activities, risks, controls, mappings] = await Promise.all([
    all<Record<string, unknown>>(db, 'SELECT * FROM ProcessCategory ORDER BY orderIndex ASC, name ASC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM BusinessProcess ORDER BY level ASC, processId ASC'),
    all<Record<string, unknown>>(db, "SELECT * FROM OrganizationUnit WHERE status = 'Active' ORDER BY code ASC"),
    all<Record<string, unknown>>(db, 'SELECT * FROM ProcessObjective ORDER BY createdAt ASC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM SIPOC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM ProcessActivity ORDER BY orderIndex ASC, createdAt ASC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM RiskMaster ORDER BY riskId ASC'),
    all<Record<string, unknown>>(db, 'SELECT * FROM ControlMaster ORDER BY controlId ASC'),
    all<Record<string, unknown>>(
      db,
      `SELECT m.id, m.riskId, m.controlId,
              r.processId AS riskProcessId,
              c.processId AS controlProcessId
         FROM ControlRiskMapping m
         JOIN RiskMaster r ON r.id = m.riskId
         JOIN ControlMaster c ON c.id = m.controlId`
    )
  ]);

  const categoryMap = new Map(categories.map(category => [String(category.id), category]));
  const orgUnitMap = new Map(orgUnits.map(unit => [String(unit.id), unit]));
  const sipocMap = new Map(sipocs.map(item => [String(item.processId), item]));
  const groupByProcess = (items: Array<Record<string, unknown>>) => {
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const item of items) {
      const key = String(item.processId || '');
      if (!key) continue;
      const current = grouped.get(key);
      if (current) current.push(item);
      else grouped.set(key, [item]);
    }
    return grouped;
  };

  const objectivesByProcess = groupByProcess(objectives);
  const activitiesByProcess = groupByProcess(activities);
  const risksByProcess = groupByProcess(risks);
  const controlsByProcess = groupByProcess(controls);
  const mappingsByProcess = new Map<
    string,
    { count: number; riskIds: Set<string>; controlIds: Set<string> }
  >();
  for (const mapping of mappings) {
    const riskProcessId = String(mapping.riskProcessId || '');
    const controlProcessId = String(mapping.controlProcessId || '');
    if (!riskProcessId || riskProcessId !== controlProcessId) continue;

    const current =
      mappingsByProcess.get(riskProcessId) || {
        count: 0,
        riskIds: new Set<string>(),
        controlIds: new Set<string>()
      };
    current.count += 1;
    current.riskIds.add(String(mapping.riskId || ''));
    current.controlIds.add(String(mapping.controlId || ''));
    mappingsByProcess.set(riskProcessId, current);
  }

  const processes = rows.map(row => {
    const id = String(row.id);
    const processMapping = mappingsByProcess.get(id);
    const processRisks = risksByProcess.get(id) || [];
    const processControls = controlsByProcess.get(id) || [];
    const mappedRisks = processMapping
      ? processRisks.filter(item => processMapping.riskIds.has(String(item.id)))
      : [];
    const mappedControls = processMapping
      ? processControls.filter(item => processMapping.controlIds.has(String(item.id)))
      : [];

    return {
      ...processRow(row),
      id,
      institutionId: String(row.institutionId),
      categoryId: String(row.categoryId),
      processId: String(row.processId),
      name: String(row.name),
      description: typeof row.description === 'string' ? row.description : null,
      criticality: String(row.criticality || ''),
      classification: String(row.classification || ''),
      status: String(row.status || ''),
      category: categoryMap.get(String(row.categoryId)) || null,
      orgUnit: row.orgUnitId ? orgUnitMap.get(String(row.orgUnitId)) || null : null,
      objectives: objectivesByProcess.get(id) || [],
      sipoc: sipocMap.get(id) || null,
      activities: activitiesByProcess.get(id) || [],
      risks: (risksByProcess.get(id) || []).map(riskRow),
      controls: (controlsByProcess.get(id) || []).map(controlRow),
      rcmDraft: buildRcmDerivedBpmDraft(
        row,
        mappedRisks,
        mappedControls,
        processMapping?.count || 0,
        {
          objectiveCount: (objectivesByProcess.get(id) || []).length,
          activityCount: (activitiesByProcess.get(id) || []).length,
          hasSipoc: Boolean(sipocMap.get(id))
        }
      )
    } as D1BusinessProcess;
  });

  return { processes, categories };
}

export async function applyRcmDerivedBpmDraft(
  processId: string,
  expectedFingerprint?: string
) {
  const db = await ensureCoreDomainSchema();
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [processId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const [risks, controls, mappingRow, objectiveRow, activityRow, sipoc] =
    await Promise.all([
      all<Record<string, unknown>>(
        db,
        `SELECT DISTINCT r.*
           FROM ControlRiskMapping m
           JOIN RiskMaster r ON r.id = m.riskId
           JOIN ControlMaster c ON c.id = m.controlId
          WHERE r.processId = ? AND c.processId = ?
          ORDER BY r.riskId ASC`,
        [processId, processId]
      ),
      all<Record<string, unknown>>(
        db,
        `SELECT DISTINCT c.*
           FROM ControlRiskMapping m
           JOIN RiskMaster r ON r.id = m.riskId
           JOIN ControlMaster c ON c.id = m.controlId
          WHERE r.processId = ? AND c.processId = ?
          ORDER BY c.controlId ASC`,
        [processId, processId]
      ),
      first<{ count?: number }>(
        db,
        `SELECT COUNT(*) AS count
           FROM ControlRiskMapping m
           JOIN RiskMaster r ON r.id = m.riskId
           JOIN ControlMaster c ON c.id = m.controlId
          WHERE r.processId = ? AND c.processId = ?`,
        [processId, processId]
      ),
      first<{ count?: number }>(
        db,
        'SELECT COUNT(*) AS count FROM ProcessObjective WHERE processId = ?',
        [processId]
      ),
      first<{ count?: number }>(
        db,
        'SELECT COUNT(*) AS count FROM ProcessActivity WHERE processId = ?',
        [processId]
      ),
      first<Record<string, unknown>>(
        db,
        'SELECT * FROM SIPOC WHERE processId = ? LIMIT 1',
        [processId]
      )
    ]);

  const draft = buildRcmDerivedBpmDraft(
    process,
    risks,
    controls,
    Number(mappingRow?.count || 0),
    {
      objectiveCount: Number(objectiveRow?.count || 0),
      activityCount: Number(activityRow?.count || 0),
      hasSipoc: Boolean(sipoc)
    }
  ) as Record<string, any> | null;

  if (!draft) throw new Error('RCM_BPM_DRAFT_NOT_AVAILABLE');
  if (
    expectedFingerprint &&
    expectedFingerprint !== String(draft.sourceFingerprint || '')
  ) {
    throw new Error('RCM_BPM_DRAFT_STALE');
  }

  const now = nowIso();
  const appliedSections: string[] = [];
  const missingSections = Array.isArray(draft.missingSections)
    ? draft.missingSections.map((item: unknown) => String(item))
    : [];

  if (missingSections.includes('description')) {
    await run(
      db,
      `UPDATE BusinessProcess
          SET description = ?, updatedAt = ?
        WHERE id = ? AND (description IS NULL OR trim(description) = '')`,
      [String(draft.narrative || ''), now, processId]
    );
    appliedSections.push('description');
  }

  if (missingSections.includes('objective')) {
    const current = await first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM ProcessObjective WHERE processId = ?',
      [processId]
    );
    if (Number(current?.count || 0) === 0) {
      await run(
        db,
        `INSERT INTO ProcessObjective (
          id, processId, objective, strategicGoal, expectedOutcome, kpi, kri, sla, createdAt
        ) VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?)`,
        [crypto.randomUUID(), processId, String(draft.objective || ''), now]
      );
      appliedSections.push('objective');
    }
  }

  if (missingSections.includes('activities')) {
    const current = await first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM ProcessActivity WHERE processId = ?',
      [processId]
    );
    if (Number(current?.count || 0) === 0 && Array.isArray(draft.activities)) {
      for (const activity of draft.activities) {
        await run(
          db,
          `INSERT INTO ProcessActivity (
            id, processId, activityId, name, description, performer, nature,
            frequency, inputData, outputData, systemUsed, sla, orderIndex, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            processId,
            String(activity.activityId || ''),
            String(activity.name || ''),
            nullable(activity.description),
            nullable(activity.performer),
            String(activity.nature || 'Manual'),
            String(activity.frequency || 'Per Transaction'),
            nullable(activity.inputData),
            nullable(activity.outputData),
            nullable(activity.systemUsed),
            nullable(activity.sla),
            Number(activity.orderIndex || 0),
            now
          ]
        );
      }
      appliedSections.push('activities');
    }
  }

  if (missingSections.includes('sipoc')) {
    const current = await first<Record<string, unknown>>(
      db,
      'SELECT id FROM SIPOC WHERE processId = ? LIMIT 1',
      [processId]
    );
    if (!current && draft.sipoc) {
      await run(
        db,
        `INSERT INTO SIPOC (
          id, processId, suppliers, inputs, processSteps, outputs, customers, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          processId,
          nullable(draft.sipoc.suppliers),
          nullable(draft.sipoc.inputs),
          nullable(draft.sipoc.processSteps),
          nullable(draft.sipoc.outputs),
          nullable(draft.sipoc.customers),
          now,
          now
        ]
      );
      appliedSections.push('sipoc');
    }
  }

  const refreshed = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [processId]
  );
  if (!refreshed) throw new Error('PROCESS_NOT_FOUND');

  const tags = parseJsonObject(refreshed.tags);
  tags.rcmDerivedBpm = {
    status: 'VALIDATED_APPLIED',
    derivedFrom: 'RCM',
    sourceFingerprint: draft.sourceFingerprint,
    sourceRiskIds: draft.sourceSummary?.riskIds || [],
    sourceControlIds: draft.sourceSummary?.controlIds || [],
    appliedSections,
    validatedAt: now,
    validationActor: 'Interactive user (authenticated identity unavailable in current BPM flow)'
  };

  await run(
    db,
    'UPDATE BusinessProcess SET tags = ?, updatedAt = ? WHERE id = ?',
    [JSON.stringify(tags), now, processId]
  );

  await writeAudit(db, {
    institutionId: String(process.institutionId),
    userName: 'Interactive User',
    userRole: 'Unverified session',
    action: 'VALIDATE_APPLY',
    entityType: 'Process',
    recordId: processId,
    oldValue: {
      rcmDraftStatus: 'PENDING_USER_VALIDATION',
      sourceFingerprint: draft.sourceFingerprint
    },
    newValue: {
      rcmDraftStatus: 'VALIDATED_APPLIED',
      sourceFingerprint: draft.sourceFingerprint,
      appliedSections
    },
    reason:
      'User explicitly validated and applied an RCM-derived BPM draft. Draft content was not operational before this action.'
  });

  const updated = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM BusinessProcess WHERE id = ? LIMIT 1',
    [processId]
  );
  if (!updated) throw new Error('PROCESS_NOT_FOUND');
  return hydrateProcess(db, updated);
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
  const ownerName =
    typeof input.ownerName === 'string' ? input.ownerName.trim() : '';

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
      ownerName,
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
    ownerName,
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
  const assuranceTables = ['ToDTest', 'ToETest', 'Issue'] as const;
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
      "SELECT COUNT(*) AS count FROM ICOFRScopeItem WHERE sourceId = ? AND lower(itemType) = 'business process'",
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

export async function listRiskLookups() {
  const db = await ensureCoreDomainSchema();
  return all<Record<string, unknown>>(
    db,
    `SELECT id, institutionId, processId, riskId, name, category,
            inherentScore, inherentRating, residualScore, residualRating, status
       FROM RiskMaster
      ORDER BY riskId ASC`
  );
}

export async function listRisks() {
  const db = await ensureCoreDomainSchema();
  const [rows, processes, activities, mappings, sourceMetadata] = await Promise.all([
    all<Record<string, unknown>>(db, 'SELECT * FROM RiskMaster ORDER BY riskId ASC'),
    all<Record<string, unknown>>(
      db,
      'SELECT id, processId, name, level, parentProcessId, categoryId, criticality, classification FROM BusinessProcess'
    ),
    all<Record<string, unknown>>(db, 'SELECT * FROM ProcessActivity'),
    all<Record<string, unknown>>(
      db,
      `SELECT m.id, m.controlId, m.riskId, m.createdAt,
              c.controlId AS enterpriseControlId, c.name AS controlName,
              c.description AS controlDescription, c.objective AS controlObjective,
              c.controlOwner, c.type, c.nature, c.frequency,
              c.isKeyControl, c.isIcofrKey, c.overallHealth
         FROM ControlRiskMapping m
         JOIN ControlMaster c ON c.id = m.controlId
        ORDER BY c.controlId ASC`
    ),
    all<Record<string, unknown>>(db, 'SELECT * FROM OperationalRiskMetadata')
  ]);

  const processById = new Map(processes.map(item => [String(item.id), item]));
  const sourceMetadataByRiskId = new Map(sourceMetadata.map(item => [String(item.riskId), item]));
  const activityById = new Map(activities.map(item => [String(item.id), item]));
  const mappingsByRisk = new Map<string, Array<Record<string, unknown>>>();
  for (const mapping of mappings) {
    const key = String(mapping.riskId);
    const current = mappingsByRisk.get(key);
    if (current) current.push(mapping);
    else mappingsByRisk.set(key, [mapping]);
  }

  return rows.map(row => {
    const riskMappings = mappingsByRisk.get(String(row.id)) || [];
    return {
      ...riskRow(row),
      process: processById.get(String(row.processId)) || null,
      sourceMetadata: sourceMetadataByRiskId.get(String(row.id)) || null,
      activity: row.activityId ? activityById.get(String(row.activityId)) || null : null,
      controls: riskMappings.map(mapping => ({
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
  });
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
  const assessed = likelihood >= 1 && likelihood <= 5 && impactValue >= 1 && impactValue <= 5;
  const score = assessed ? likelihood * impactValue : 0;
  const rating = assessed ? riskRating(score) : 'Not Assessed';
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
  const [rows, processes, activities, mappings] = await Promise.all([
    all<Record<string, unknown>>(db, 'SELECT * FROM ControlMaster ORDER BY controlId ASC'),
    all<Record<string, unknown>>(
      db,
      'SELECT id, processId, name, categoryId, criticality, classification FROM BusinessProcess'
    ),
    all<Record<string, unknown>>(db, 'SELECT * FROM ProcessActivity'),
    all<Record<string, unknown>>(
      db,
      `SELECT m.id, m.controlId, m.riskId, m.createdAt,
              r.riskId AS enterpriseRiskId, r.name AS riskName,
              r.description AS riskDescription, r.category AS riskCategory,
              r.inherentScore, r.inherentRating, r.residualScore, r.residualRating
         FROM ControlRiskMapping m
         JOIN RiskMaster r ON r.id = m.riskId
        ORDER BY r.riskId ASC`
    )
  ]);

  const processById = new Map(processes.map(item => [String(item.id), item]));
  const activityById = new Map(activities.map(item => [String(item.id), item]));
  const mappingsByControl = new Map<string, Array<Record<string, unknown>>>();
  for (const mapping of mappings) {
    const key = String(mapping.controlId);
    const current = mappingsByControl.get(key);
    if (current) current.push(mapping);
    else mappingsByControl.set(key, [mapping]);
  }

  return rows.map(row => {
    const controlMappings = mappingsByControl.get(String(row.id)) || [];
    return {
      ...controlRow(row),
      process: processById.get(String(row.processId)) || null,
      activity: row.activityId ? activityById.get(String(row.activityId)) || null : null,
      risks: controlMappings.map(mapping => ({
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
  });
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
        r.inherentLikelihood,
        r.inherentImpact,
        r.inherentScore,
        r.inherentRating,
        orm.sourceRiskRating AS inherentSourceRating,
        orm.sourceStatus AS inherentSourceStatus,
        orm.reviewRequired AS inherentReviewRequired,
        r.residualScore,
        r.residualRating,
        (SELECT objective
           FROM ProcessObjective po
          WHERE po.processId = p.id
          ORDER BY po.createdAt ASC
          LIMIT 1) AS processObjective,
        (SELECT name
           FROM ProcessActivity pa
          WHERE pa.id = r.activityId
          LIMIT 1) AS activityName,
        c.id AS internalControlId,
        c.controlId AS enterpriseControlId,
        c.name AS controlName,
        c.description AS controlDescription,
        c.objective AS controlObjective,
        c.controlOwner,
        c.performer,
        c.reviewer,
        c.type AS controlType,
        c.nature AS controlNature,
        c.method AS controlMethod,
        c.frequency AS controlFrequency,
        c.evidenceRequirement,
        c.systemDependency,
        c.frameworkMapping,
        c.designAssessment,
        c.operatingStatus,
        c.status AS controlStatus,
        c.isKeyControl,
        c.isIcofrKey,
        c.isItgc,
        c.overallHealth,
        sm.sourceRecordType,
        sm.sourceReference,
        sm.sourceCycle,
        sm.taxonomyStatus,
        sm.mappingStatus,
        sm.validationStatus,
        sm.sourcePriority,
        sm.notes AS sourceNotes
      FROM ControlMaster c
      JOIN BusinessProcess p ON p.id = c.processId
      LEFT JOIN ProcessCategory pc ON pc.id = p.categoryId
      LEFT JOIN ControlRiskMapping m ON m.controlId = c.id
      LEFT JOIN RiskMaster r ON r.id = m.riskId
      LEFT JOIN OperationalRiskMetadata orm ON orm.riskId = r.id
      LEFT JOIN RCMControlSourceMetadata sm ON sm.controlId = c.id
      ORDER BY p.processId ASC, COALESCE(r.riskId, 'ZZZ') ASC, c.controlId ASC`
  );

  return rows.map((row, index) => {
    const mapped = Boolean(row.internalRiskId);
    return {
      id: row.mappingId || `unmapped:${String(row.internalControlId)}`,
      rowNumber: index + 1,
      processId: row.enterpriseProcessId,
      processName: row.processName,
      processCategory: row.processCategory || 'Uncategorized',
      activityName: mapped ? row.activityName || 'Process-level risk' : 'Risk mapping pending',
      processObjective: row.processObjective || 'Not provided',
      riskId: mapped ? row.enterpriseRiskId : 'PENDING',
      riskName: mapped ? row.riskName : 'Risk mapping pending',
      riskCause: mapped ? row.riskCause : null,
      riskEvent: mapped ? row.riskEvent : 'Source-backed control is not yet linked to a validated RiskMaster record.',
      riskImpact: mapped ? row.riskImpact : null,
      riskCategory: mapped ? row.riskCategory : 'Pending',
      inherentLikelihood: mapped ? Number(row.inherentLikelihood || 0) : 0,
      inherentImpact: mapped ? Number(row.inherentImpact || 0) : 0,
      inherentScore: mapped ? Number(row.inherentScore || 0) : 0,
      inherentRating: mapped ? row.inherentRating || 'Not Assessed' : 'Not Assessed',
      inherentSourceRating: mapped && row.inherentSourceRating ? String(row.inherentSourceRating) : null,
      inherentSourceStatus: mapped && row.inherentSourceStatus ? String(row.inherentSourceStatus) : null,
      inherentReviewRequired: mapped ? bool(row.inherentReviewRequired) : false,
      inherentAssessmentStatus: !mapped
        ? 'RISK_MAPPING_PENDING'
        : Number(row.inherentLikelihood || 0) >= 1 &&
            Number(row.inherentLikelihood || 0) <= 5 &&
            Number(row.inherentImpact || 0) >= 1 &&
            Number(row.inherentImpact || 0) <= 5
          ? 'ASSESSED_1_5'
          : row.inherentSourceRating
            ? 'SOURCE_RATING_PENDING_1_5_VALIDATION'
            : 'PENDING_1_5_ASSESSMENT',
      residualScore: mapped ? Number(row.residualScore || 0) : 0,
      residualRating: mapped ? row.residualRating || 'Not Assessed' : 'Not Assessed',
      controlId: row.enterpriseControlId,
      controlName: row.controlName,
      controlDescription: row.controlDescription,
      controlObjective: row.controlObjective,
      controlOwner: row.controlOwner,
      performer: row.performer,
      reviewer: row.reviewer,
      controlType: row.controlType,
      controlNature: row.controlNature,
      controlMethod: row.controlMethod,
      controlFrequency: row.controlFrequency,
      evidenceRequirement: row.evidenceRequirement || 'Not provided',
      systemDependency: row.systemDependency || null,
      frameworkMapping: row.frameworkMapping || null,
      designAssessment: row.designAssessment || 'Not Assessed',
      operatingStatus: row.operatingStatus || 'Not Assessed',
      controlStatus: row.controlStatus || 'Draft',
      isKeyControl: bool(row.isKeyControl),
      isIcofrKey: bool(row.isIcofrKey),
      isItgc: bool(row.isItgc),
      sourceRecordType: row.sourceRecordType || null,
      sourceReference: row.sourceReference || null,
      sourceCycle: row.sourceCycle || null,
      taxonomyStatus: row.taxonomyStatus || null,
      mappingStatus: row.mappingStatus || (mapped ? 'MAPPED' : 'PENDING_RISK_MAPPING'),
      validationStatus: row.validationStatus || null,
      sourcePriority: Number(row.sourcePriority || 0),
      sourceNotes: row.sourceNotes || null,
      csaStatus: 'Not Assessed',
      todConclusion: row.designAssessment || 'Not Assessed',
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
  });
}

export async function getRcmGovernanceData() {
  const db = await ensureCoreDomainSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      summary: {
        controls: 0,
        uusControls: 0,
        itgcControls: 0,
        ckpnRequirements: 0,
        reverseRepoRequirements: 0,
        elcDraftReferences: 0,
        integrity: 'PENDING'
      },
      legacyTotal: 0,
      legacyByCycle: [],
      requirements: [],
      draftReferenceSummary: [],
      sourceMetadataSummary: [],
      latestIntegrity: null
    };
  }

  const institutionId = String(institution.id);
  const [
    controlTotalRow,
    uusControlTotalRow,
    itgcControlTotalRow,
    ckpnRequirementTotalRow,
    reverseRepoRequirementTotalRow,
    elcDraftReferenceTotalRow,
    legacyTotalRow,
    legacyByCycle,
    requirements,
    draftReferenceSummary,
    sourceMetadataSummary,
    latestIntegrity
  ] = await Promise.all([
    first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM ControlMaster WHERE institutionId = ?',
      [institutionId]
    ),
    first<{ count?: number }>(
      db,
      `SELECT COUNT(DISTINCT c.id) AS count
         FROM ControlMaster c
         JOIN RCMControlSourceMetadata sm ON sm.controlId = c.id
        WHERE c.institutionId = ?
          AND sm.institutionId = ?
          AND sm.sourceCycle = 'SYH'`,
      [institutionId, institutionId]
    ),
    first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM ControlMaster WHERE institutionId = ? AND isItgc = 1',
      [institutionId]
    ),
    first<{ count?: number }>(
      db,
      "SELECT COUNT(*) AS count FROM RCMDesignRequirement WHERE institutionId = ? AND category = 'CKPN'",
      [institutionId]
    ),
    first<{ count?: number }>(
      db,
      "SELECT COUNT(*) AS count FROM RCMDesignRequirement WHERE institutionId = ? AND category = 'Reverse Repo'",
      [institutionId]
    ),
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count
         FROM RCMDraftReference
        WHERE institutionId = ?
          AND sourceStatus = 'ILLUSTRATIVE_DRAFT'
          AND referenceType IN ('ELC_PRINCIPLE_TEMPLATE_REFERENCE','ELC_BPM_NARRATIVE_REFERENCE')`,
      [institutionId]
    ),
    first<{ count?: number }>(
      db,
      'SELECT COUNT(*) AS count FROM RCMLegacyControlRegister WHERE institutionId = ?',
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT sourceCycle, reconciliationStatus, COUNT(*) AS controls
         FROM RCMLegacyControlRegister
        WHERE institutionId = ?
        GROUP BY sourceCycle, reconciliationStatus
        ORDER BY sourceCycle, reconciliationStatus`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT r.*, p.processId AS enterpriseProcessId, p.name AS processName
         FROM RCMDesignRequirement r
         JOIN BusinessProcess p ON p.id = r.processId
        WHERE r.institutionId = ?
        ORDER BY r.category, r.requirementCode`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT referenceType, sourceStatus, COUNT(*) AS records
         FROM RCMDraftReference
        WHERE institutionId = ?
        GROUP BY referenceType, sourceStatus
        ORDER BY referenceType, sourceStatus`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT sourceRecordType, taxonomyStatus, mappingStatus, validationStatus, COUNT(*) AS controls
         FROM RCMControlSourceMetadata
        WHERE institutionId = ?
        GROUP BY sourceRecordType, taxonomyStatus, mappingStatus, validationStatus
        ORDER BY sourceRecordType, mappingStatus, validationStatus`,
      [institutionId]
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT *
         FROM RCMIntegrityRun
        WHERE institutionId = ?
        ORDER BY runAt DESC
        LIMIT 1`,
      [institutionId]
    )
  ]);

  let parsedIntegrity: Record<string, unknown> | null = null;
  if (latestIntegrity) {
    try {
      parsedIntegrity = {
        ...latestIntegrity,
        summary: JSON.parse(String(latestIntegrity.summaryJson || '{}'))
      };
    } catch {
      parsedIntegrity = { ...latestIntegrity, summary: null };
    }
  }

  const summary = {
    controls: Number(controlTotalRow?.count || 0),
    uusControls: Number(uusControlTotalRow?.count || 0),
    itgcControls: Number(itgcControlTotalRow?.count || 0),
    ckpnRequirements: Number(ckpnRequirementTotalRow?.count || 0),
    reverseRepoRequirements: Number(reverseRepoRequirementTotalRow?.count || 0),
    elcDraftReferences: Number(elcDraftReferenceTotalRow?.count || 0),
    integrity: String(parsedIntegrity?.status || 'PENDING')
  };

  return {
    summary,
    legacyTotal: Number(legacyTotalRow?.count || 0),
    legacyByCycle: legacyByCycle.map(row => ({
      ...row,
      controls: Number(row.controls || 0)
    })),
    requirements,
    draftReferenceSummary: draftReferenceSummary.map(row => ({
      ...row,
      records: Number(row.records || 0)
    })),
    sourceMetadataSummary: sourceMetadataSummary.map(row => ({
      ...row,
      controls: Number(row.controls || 0)
    })),
    latestIntegrity: parsedIntegrity
  };
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
