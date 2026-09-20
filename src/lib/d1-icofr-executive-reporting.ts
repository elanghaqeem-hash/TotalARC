import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { ensureIcofrCertificationSchema } from '@/lib/d1-icofr-certification';
import { ensureIcofrCoverageSchema } from '@/lib/d1-icofr-coverage';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';

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
  await ensureAssuranceSchema();
    await ensureIcofrTestingPlanSchema();
    await ensureIcofrCoverageSchema();
    await ensureIcofrCertificationSchema();

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

async function executeSchema(db: D1DatabaseLike, script: string) {
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

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function dayAge(dateValue: unknown) {
  if (typeof dateValue !== 'string' || !dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86400000));
}

let reportingSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrExecutiveReportingSchema() {
  if (reportingSchemaReady) return reportingSchemaReady;

  reportingSchemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRExecutiveReportPack (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        scopeId TEXT,
        testingCycleId TEXT,
        attestationId TEXT,
        period TEXT NOT NULL,
        audience TEXT NOT NULL,
        reportTitle TEXT NOT NULL,
        executiveSummary TEXT NOT NULL,
        keyControlConclusion TEXT,
        deficiencySummary TEXT,
        remediationSummary TEXT,
        auditRelianceSummary TEXT,
        decisionsRequired TEXT,
        preparedBy TEXT NOT NULL,
        reviewerName TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        issuedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_icofr_exec_report_period
        ON ICOFRExecutiveReportPack(institutionId, period, audience);
      CREATE INDEX IF NOT EXISTS idx_icofr_exec_report_scope
        ON ICOFRExecutiveReportPack(institutionId, scopeId, testingCycleId);

      CREATE TABLE IF NOT EXISTS ICOFRExternalAuditReliance (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        period TEXT NOT NULL,
        auditorName TEXT NOT NULL,
        scopeId TEXT,
        controlDomainId TEXT NOT NULL,
        relianceArea TEXT NOT NULL,
        plannedReliance TEXT NOT NULL,
        relianceConclusion TEXT NOT NULL DEFAULT 'Not Assessed',
        workpaperReference TEXT,
        auditorReference TEXT,
        owner TEXT NOT NULL,
        reviewerName TEXT,
        dueDate TEXT,
        status TEXT NOT NULL DEFAULT 'Planning',
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_reliance_control_period
        ON ICOFRExternalAuditReliance(institutionId, period, auditorName, controlDomainId);
      CREATE INDEX IF NOT EXISTS idx_icofr_reliance_status
        ON ICOFRExternalAuditReliance(institutionId, status, dueDate);

      CREATE TABLE IF NOT EXISTS ICOFRPBCRequest (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        period TEXT NOT NULL,
        requestNo TEXT NOT NULL,
        auditorName TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        relatedType TEXT,
        relatedId TEXT,
        owner TEXT NOT NULL,
        reviewerName TEXT,
        requestDate TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'Medium',
        status TEXT NOT NULL DEFAULT 'Open',
        evidenceReference TEXT,
        responseNotes TEXT,
        submittedAt TEXT,
        acceptedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_pbc_request_no
        ON ICOFRPBCRequest(institutionId, period, requestNo);
      CREATE INDEX IF NOT EXISTS idx_icofr_pbc_due
        ON ICOFRPBCRequest(institutionId, status, dueDate);
    `);

    return db;
  })().catch(error => {
    reportingSchemaReady = null;
    throw error;
  });

  return reportingSchemaReady;
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
      'ICOFR executive reporting, external-auditor reliance and PBC tracking.',
      null,
      nowIso()
    ]
  );
}

async function validateOptionalScopeCycle(
  db: D1DatabaseLike,
  institutionId: string,
  scopeId: string | null,
  testingCycleId: string | null
) {
  if (scopeId) {
    const scope = await first(
      db,
      'SELECT id FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
      [scopeId, institutionId]
    );
    if (!scope) throw new Error('SCOPE_NOT_FOUND');
  }

  if (testingCycleId) {
    const cycle = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? LIMIT 1',
      [testingCycleId, institutionId]
    );
    if (!cycle) throw new Error('CYCLE_NOT_FOUND');
    if (scopeId && String(cycle.scopeId) !== scopeId) throw new Error('CYCLE_SCOPE_MISMATCH');
  }
}

export async function saveExecutiveReportPack(input: Record<string, unknown>) {
  const db = await ensureIcofrExecutiveReportingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const period = String(input.period || '').trim();
  const audience = String(input.audience || '').trim();
  const reportTitle = String(input.reportTitle || '').trim();
  const executiveSummary = String(input.executiveSummary || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();
  const scopeId = clean(input.scopeId);
  const testingCycleId = clean(input.testingCycleId);
  const attestationId = clean(input.attestationId);
  const status = String(input.status || 'Draft').trim();

  if (!period || !audience || !reportTitle || !executiveSummary || !preparedBy) {
    throw new Error('REPORT_REQUIRED');
  }

  await validateOptionalScopeCycle(db, String(institution.id), scopeId, testingCycleId);

  if (attestationId) {
    const attestation = await first(
      db,
      'SELECT id FROM ICOFRManagementAttestation WHERE id=? AND institutionId=? LIMIT 1',
      [attestationId, institution.id]
    );
    if (!attestation) throw new Error('ATTESTATION_NOT_FOUND');
  }

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRExecutiveReportPack WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    scopeId,
    testingCycleId,
    attestationId,
    period,
    audience,
    reportTitle,
    executiveSummary,
    keyControlConclusion: clean(input.keyControlConclusion),
    deficiencySummary: clean(input.deficiencySummary),
    remediationSummary: clean(input.remediationSummary),
    auditRelianceSummary: clean(input.auditRelianceSummary),
    decisionsRequired: clean(input.decisionsRequired),
    preparedBy,
    reviewerName: clean(input.reviewerName),
    status,
    issuedAt: status === 'Issued' ? existing?.issuedAt || now : existing?.issuedAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (status === 'Issued' && !record.reviewerName) {
    throw new Error('REPORT_REVIEW_REQUIRED');
  }

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRExecutiveReportPack SET
        scopeId=?,testingCycleId=?,attestationId=?,period=?,audience=?,reportTitle=?,
        executiveSummary=?,keyControlConclusion=?,deficiencySummary=?,remediationSummary=?,
        auditRelianceSummary=?,decisionsRequired=?,preparedBy=?,reviewerName=?,status=?,
        issuedAt=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.scopeId,
        record.testingCycleId,
        record.attestationId,
        record.period,
        record.audience,
        record.reportTitle,
        record.executiveSummary,
        record.keyControlConclusion,
        record.deficiencySummary,
        record.remediationSummary,
        record.auditRelianceSummary,
        record.decisionsRequired,
        record.preparedBy,
        record.reviewerName,
        record.status,
        record.issuedAt,
        record.updatedAt,
        id,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRExecutiveReportPack', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRExecutiveReportPack (
        id,institutionId,scopeId,testingCycleId,attestationId,period,audience,reportTitle,
        executiveSummary,keyControlConclusion,deficiencySummary,remediationSummary,
        auditRelianceSummary,decisionsRequired,preparedBy,reviewerName,status,issuedAt,
        createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.scopeId,
        record.testingCycleId,
        record.attestationId,
        record.period,
        record.audience,
        record.reportTitle,
        record.executiveSummary,
        record.keyControlConclusion,
        record.deficiencySummary,
        record.remediationSummary,
        record.auditRelianceSummary,
        record.decisionsRequired,
        record.preparedBy,
        record.reviewerName,
        record.status,
        record.issuedAt,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRExecutiveReportPack', id, record);
  }

  return record;
}

export async function saveAuditRelianceMapping(input: Record<string, unknown>) {
  const db = await ensureIcofrExecutiveReportingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const period = String(input.period || '').trim();
  const auditorName = String(input.auditorName || '').trim();
  const controlDomainId = String(input.controlDomainId || '').trim();
  const relianceArea = String(input.relianceArea || '').trim();
  const plannedReliance = String(input.plannedReliance || '').trim();
  const owner = String(input.owner || '').trim();
  const scopeId = clean(input.scopeId);
  const dueDate = clean(input.dueDate);

  if (!period || !auditorName || !controlDomainId || !relianceArea || !plannedReliance || !owner) {
    throw new Error('RELIANCE_REQUIRED');
  }

  if (scopeId) {
    const scope = await first(
      db,
      'SELECT id FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
      [scopeId, institution.id]
    );
    if (!scope) throw new Error('SCOPE_NOT_FOUND');
  }

  const control = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRControlDomain WHERE id=? AND institutionId=? LIMIT 1',
    [controlDomainId, institution.id]
  );
  if (!control) throw new Error('CONTROL_NOT_FOUND');

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRExternalAuditReliance WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRExternalAuditReliance
      WHERE institutionId=? AND period=? AND auditorName=? AND controlDomainId=? AND id<>?
      LIMIT 1`,
    [institution.id, period, auditorName, controlDomainId, id]
  );
  if (duplicate) throw new Error('RELIANCE_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    period,
    auditorName,
    scopeId,
    controlDomainId,
    relianceArea,
    plannedReliance,
    relianceConclusion: String(input.relianceConclusion || 'Not Assessed'),
    workpaperReference: clean(input.workpaperReference),
    auditorReference: clean(input.auditorReference),
    owner,
    reviewerName: clean(input.reviewerName),
    dueDate,
    status: String(input.status || 'Planning'),
    notes: clean(input.notes),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (['Accepted for Reliance', 'Closed'].includes(record.status)) {
    if (record.relianceConclusion === 'Not Assessed' || !record.workpaperReference) {
      throw new Error('RELIANCE_CLOSE_REQUIRED');
    }
  }

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRExternalAuditReliance SET
        period=?,auditorName=?,scopeId=?,controlDomainId=?,relianceArea=?,plannedReliance=?,
        relianceConclusion=?,workpaperReference=?,auditorReference=?,owner=?,reviewerName=?,
        dueDate=?,status=?,notes=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.period,
        record.auditorName,
        record.scopeId,
        record.controlDomainId,
        record.relianceArea,
        record.plannedReliance,
        record.relianceConclusion,
        record.workpaperReference,
        record.auditorReference,
        record.owner,
        record.reviewerName,
        record.dueDate,
        record.status,
        record.notes,
        record.updatedAt,
        id,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRExternalAuditReliance', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRExternalAuditReliance (
        id,institutionId,period,auditorName,scopeId,controlDomainId,relianceArea,plannedReliance,
        relianceConclusion,workpaperReference,auditorReference,owner,reviewerName,dueDate,status,
        notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.period,
        record.auditorName,
        record.scopeId,
        record.controlDomainId,
        record.relianceArea,
        record.plannedReliance,
        record.relianceConclusion,
        record.workpaperReference,
        record.auditorReference,
        record.owner,
        record.reviewerName,
        record.dueDate,
        record.status,
        record.notes,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRExternalAuditReliance', id, record);
  }

  return record;
}

export async function savePbcRequest(input: Record<string, unknown>) {
  const db = await ensureIcofrExecutiveReportingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const period = String(input.period || '').trim();
  const requestNo = String(input.requestNo || '').trim().toUpperCase();
  const auditorName = String(input.auditorName || '').trim();
  const category = String(input.category || '').trim();
  const description = String(input.description || '').trim();
  const owner = String(input.owner || '').trim();
  const requestDate = String(input.requestDate || '').trim();
  const dueDate = String(input.dueDate || '').trim();
  const status = String(input.status || 'Open').trim();

  if (!period || !requestNo || !auditorName || !category || !description || !owner || !requestDate || !dueDate) {
    throw new Error('PBC_REQUIRED');
  }
  if (dueDate < requestDate) throw new Error('INVALID_PBC_DATES');

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRPBCRequest WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRPBCRequest
      WHERE institutionId=? AND period=? AND requestNo=? AND id<>?
      LIMIT 1`,
    [institution.id, period, requestNo, id]
  );
  if (duplicate) throw new Error('PBC_CONFLICT');

  const relatedType = clean(input.relatedType);
  const relatedId = clean(input.relatedId);
  const evidenceReference = clean(input.evidenceReference);

  if (['Submitted', 'Accepted', 'Closed'].includes(status) && !evidenceReference) {
    throw new Error('PBC_EVIDENCE_REQUIRED');
  }

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    period,
    requestNo,
    auditorName,
    category,
    description,
    relatedType,
    relatedId,
    owner,
    reviewerName: clean(input.reviewerName),
    requestDate,
    dueDate,
    priority: String(input.priority || 'Medium'),
    status,
    evidenceReference,
    responseNotes: clean(input.responseNotes),
    submittedAt:
      ['Submitted', 'Accepted', 'Closed'].includes(status)
        ? existing?.submittedAt || now
        : existing?.submittedAt || null,
    acceptedAt:
      ['Accepted', 'Closed'].includes(status)
        ? existing?.acceptedAt || now
        : existing?.acceptedAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRPBCRequest SET
        period=?,requestNo=?,auditorName=?,category=?,description=?,relatedType=?,relatedId=?,
        owner=?,reviewerName=?,requestDate=?,dueDate=?,priority=?,status=?,evidenceReference=?,
        responseNotes=?,submittedAt=?,acceptedAt=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.period,
        record.requestNo,
        record.auditorName,
        record.category,
        record.description,
        record.relatedType,
        record.relatedId,
        record.owner,
        record.reviewerName,
        record.requestDate,
        record.dueDate,
        record.priority,
        record.status,
        record.evidenceReference,
        record.responseNotes,
        record.submittedAt,
        record.acceptedAt,
        record.updatedAt,
        id,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRPBCRequest', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRPBCRequest (
        id,institutionId,period,requestNo,auditorName,category,description,relatedType,relatedId,
        owner,reviewerName,requestDate,dueDate,priority,status,evidenceReference,responseNotes,
        submittedAt,acceptedAt,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.period,
        record.requestNo,
        record.auditorName,
        record.category,
        record.description,
        record.relatedType,
        record.relatedId,
        record.owner,
        record.reviewerName,
        record.requestDate,
        record.dueDate,
        record.priority,
        record.status,
        record.evidenceReference,
        record.responseNotes,
        record.submittedAt,
        record.acceptedAt,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRPBCRequest', id, record);
  }

  return record;
}

function pbcTaskLink(relatedType: unknown) {
  switch (String(relatedType || '')) {
    case 'ICOFR Control':
      return '/icofr/traceability';
    case 'ToD':
      return '/tod';
    case 'ToE':
      return '/toe';
    case 'Deficiency':
      return '/icofr/deficiencies';
    case 'MAP':
      return '/remediation';
    case 'Attestation':
      return '/certification';
    case 'Evidence Pack':
      return '/certification';
    default:
      return '/icofr/reporting';
  }
}

export async function listPbcTasks() {
  const db = await ensureIcofrExecutiveReportingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) return [];

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRPBCRequest
      WHERE institutionId=? AND status NOT IN ('Accepted','Closed','Cancelled')
      ORDER BY dueDate ASC, priority DESC`,
    [institution.id]
  );

  return rows.map(item => ({
    id: 'pbc-' + String(item.id),
    type: 'External Audit PBC',
    title: String(item.requestNo) + ' · ' + String(item.description),
    dueDate: item.dueDate,
    priority: item.priority,
    status: item.status,
    link: pbcTaskLink(item.relatedType),
    user: {
      name: item.owner
    },
    sourceId: item.id,
    period: item.period,
    auditorName: item.auditorName
  }));
}

export async function getExecutiveReportingData() {
  const db = await ensureIcofrExecutiveReportingSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      scopes: [],
      cycles: [],
      controls: [],
      attestations: [],
      evidencePacks: [],
      reportPacks: [],
      relianceMappings: [],
      pbcRequests: [],
      selectors: {},
      metrics: {},
      deficiencyAging: {}
    };
  }

  const [
    scopes,
    cycles,
    controls,
    todRows,
    toeRows,
    deficiencies,
    issues,
    maps,
    attestations,
    evidencePacks,
    reportPacks,
    relianceMappings,
    pbcRequests
  ] = await Promise.all([
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
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT d.*
         FROM ControlDeficiency d
         JOIN TestingException e ON e.id=d.exceptionId
         JOIN ToETest t ON t.id=e.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE c.institutionId=?
        ORDER BY d.createdAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM Issue WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT m.*
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id=m.issueId
        WHERE i.institutionId=?
        ORDER BY m.updatedAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRManagementAttestation WHERE institutionId=? ORDER BY period DESC, updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFREvidencePack WHERE institutionId=? ORDER BY period DESC, updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRExecutiveReportPack WHERE institutionId=? ORDER BY period DESC, updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRExternalAuditReliance WHERE institutionId=? ORDER BY period DESC, updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRPBCRequest WHERE institutionId=? ORDER BY dueDate ASC, requestNo ASC',
      [institution.id]
    )
  ]);

  const controlById = new Map(controls.map(item => [String(item.id), item]));
  const todByControl = new Map<string, Record<string, unknown>>();
  for (const item of todRows) {
    const key = String(item.controlDomainId);
    if (!todByControl.has(key)) todByControl.set(key, item);
  }

  const toeBySourceControl = new Map<string, Record<string, unknown>>();
  for (const item of toeRows) {
    const key = String(item.controlId);
    if (!toeBySourceControl.has(key)) toeBySourceControl.set(key, item);
  }

  const issueByDeficiencyId = new Map<string, Record<string, unknown>>();
  for (const issue of issues) {
    if (issue.deficiencyId) issueByDeficiencyId.set(String(issue.deficiencyId), issue);
  }

  const mapByIssueId = new Map<string, Record<string, unknown>>();
  for (const map of maps) {
    const key = String(map.issueId);
    if (!mapByIssueId.has(key)) mapByIssueId.set(key, map);
  }

  const enrichedDeficiencies: Array<Record<string, unknown> & {
    ageDays: number | null;
    issue: Record<string, unknown> | null;
    map: Record<string, unknown> | null;
    unresolved: boolean;
  }> = deficiencies.map(item => {
    const issue = issueByDeficiencyId.get(String(item.id)) || null;
    const map = issue ? mapByIssueId.get(String(issue.id)) || null : null;
    return {
      ...item,
      ageDays: dayAge(item.createdAt),
      issue,
      map,
      unresolved: !issue || String(issue.status) !== 'Closed'
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const openPbc = pbcRequests.filter(item => !['Accepted', 'Closed', 'Cancelled'].includes(String(item.status)));
  const overduePbc = openPbc.filter(item => String(item.dueDate) < today);
  const openMaps = maps.filter(item => !['Closed', 'Completed', 'Cancelled'].includes(String(item.status)));
  const overdueMaps = openMaps.filter(item => String(item.revisedDueDate || item.originalDueDate) < today);

  const keyControls = controls.filter(item => bool(item.keyControl));
  const keyControlsWithTod = keyControls.filter(item => {
    const tod = todByControl.get(String(item.id));
    return Boolean(tod && String(tod.conclusion) !== 'Not Assessed');
  });
  const keyControlsWithToe = keyControls.filter(item => {
    if (!item.sourceControlId) return false;
    const toe = toeBySourceControl.get(String(item.sourceControlId));
    return Boolean(toe && String(toe.finalConclusion) !== 'Not Assessed');
  });

  const signedAttestations = attestations.filter(
    item => bool(item.cfoSignOff) && bool(item.ceoSignOff)
  );

  const acceptedReliance = relianceMappings.filter(
    item => ['Accepted for Reliance', 'Closed'].includes(String(item.status))
  );

  const enrichedReliance = relianceMappings.map(item => {
    const control = controlById.get(String(item.controlDomainId)) || null;
    const tod = control ? todByControl.get(String(control.id)) || null : null;
    const toe =
      control?.sourceControlId
        ? toeBySourceControl.get(String(control.sourceControlId)) || null
        : null;
    return {
      ...item,
      control: control
        ? {
            ...control,
            keyControl: bool(control.keyControl)
          }
        : null,
      tod,
      toe
    };
  });

  const relatedOptions = [
    ...controls.map(item => ({
      id: String(item.id),
      type: 'ICOFR Control',
      label: `${String(item.category)} · ${String(item.controlCode)} · ${String(item.name)}`
    })),
    ...todRows.map(item => ({
      id: String(item.id),
      type: 'ToD',
      label: `${String(item.testId)} · ${String(item.conclusion)}`
    })),
    ...toeRows.map(item => ({
      id: String(item.id),
      type: 'ToE',
      label: `${String(item.testId)} · ${String(item.finalConclusion)}`
    })),
    ...enrichedDeficiencies.map(item => ({
      id: String(item.id),
      type: 'Deficiency',
      label: `${String(item.deficiencyId)} · ${String(item.classification)} · ${String(item.title)}`
    })),
    ...maps.map(item => ({
      id: String(item.id),
      type: 'MAP',
      label: `${String(item.mapId)} · ${String(item.status)}`
    })),
    ...attestations.map(item => ({
      id: String(item.id),
      type: 'Attestation',
      label: `${String(item.period)} · ${String(item.overallConclusion)}`
    })),
    ...evidencePacks.map(item => ({
      id: String(item.id),
      type: 'Evidence Pack',
      label: `${String(item.packName)} · ${String(item.period)}`
    }))
  ];

  const aging = {
    zeroTo30: enrichedDeficiencies.filter(item => item.unresolved && (item.ageDays ?? 0) <= 30).length,
    thirtyOneTo60: enrichedDeficiencies.filter(item => item.unresolved && (item.ageDays ?? 0) > 30 && (item.ageDays ?? 0) <= 60).length,
    sixtyOneTo90: enrichedDeficiencies.filter(item => item.unresolved && (item.ageDays ?? 0) > 60 && (item.ageDays ?? 0) <= 90).length,
    over90: enrichedDeficiencies.filter(item => item.unresolved && (item.ageDays ?? 0) > 90).length
  };

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    scopes,
    cycles,
    controls: controls.map(item => ({ ...item, keyControl: bool(item.keyControl) })),
    attestations: attestations.map(item => ({
      ...item,
      cfoSignOff: bool(item.cfoSignOff),
      ceoSignOff: bool(item.ceoSignOff),
      readinessOverride: bool(item.readinessOverride)
    })),
    evidencePacks,
    reportPacks,
    relianceMappings: enrichedReliance,
    pbcRequests,
    deficiencies: enrichedDeficiencies,
    selectors: {
      relatedOptions
    },
    metrics: {
      keyControls: keyControls.length,
      keyControlsWithTod: keyControlsWithTod.length,
      keyControlsWithToe: keyControlsWithToe.length,
      significantDeficiencies: enrichedDeficiencies.filter(
        item => ['Significant Deficiency', 'Material Weakness'].includes(String(item.classification))
      ).length,
      unresolvedSignificantDeficiencies: enrichedDeficiencies.filter(
        item =>
          item.unresolved &&
          ['Significant Deficiency', 'Material Weakness'].includes(String(item.classification))
      ).length,
      openMaps: openMaps.length,
      overdueMaps: overdueMaps.length,
      signedAttestations: signedAttestations.length,
      openPbc: openPbc.length,
      overduePbc: overduePbc.length,
      relianceMappings: relianceMappings.length,
      acceptedReliance: acceptedReliance.length,
      issuedReportPacks: reportPacks.filter(item => item.status === 'Issued').length
    },
    deficiencyAging: aging
  };
}
