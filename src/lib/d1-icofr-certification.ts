import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureIcofrScopeSchema } from '@/lib/d1-icofr';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';
import { ensureIcofrCoverageSchema, getIcofrCoverageData } from '@/lib/d1-icofr-coverage';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { getOrganizationStructure } from '@/lib/d1-organization';
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

async function getDb(): Promise<D1DatabaseLike> {
  await ensureIcofrScopeSchema();
  await ensureIcofrTestingPlanSchema();
  await ensureIcofrCoverageSchema();
  await ensureAssuranceSchema();

  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function all<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  const result = values.length ? await stmt.bind(...values).all<T>() : await stmt.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).first<T>() : stmt.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).run() : stmt.run();
}

async function executeSchema(db: D1DatabaseLike, script: string) {
  for (const statement of script.split(';').map(item => item.trim()).filter(Boolean)) {
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

let certificationSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrCertificationSchema() {
  if (certificationSchemaReady) return certificationSchemaReady;

  certificationSchemaReady = (async () => {
    const db = await getDb();

    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRSubCertification (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        scopeId TEXT,
        testingCycleId TEXT,
        period TEXT NOT NULL,
        subjectType TEXT NOT NULL,
        subjectId TEXT NOT NULL,
        certifierName TEXT NOT NULL,
        certifierRole TEXT NOT NULL,
        declarationText TEXT NOT NULL,
        controlsPerformed INTEGER NOT NULL DEFAULT 0,
        changesDisclosed INTEGER NOT NULL DEFAULT 0,
        deficienciesDisclosed INTEGER NOT NULL DEFAULT 0,
        fraudDisclosed INTEGER NOT NULL DEFAULT 0,
        remediationAccurate INTEGER NOT NULL DEFAULT 0,
        conclusion TEXT NOT NULL DEFAULT 'Not Concluded',
        status TEXT NOT NULL DEFAULT 'Draft',
        reviewerName TEXT,
        reviewerDecision TEXT,
        reviewerComments TEXT,
        signedAt TEXT,
        reviewedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_subcert_subject_period
        ON ICOFRSubCertification(institutionId, period, subjectType, subjectId);
      CREATE INDEX IF NOT EXISTS idx_icofr_subcert_scope
        ON ICOFRSubCertification(institutionId, scopeId, testingCycleId);

      CREATE TABLE IF NOT EXISTS ICOFRManagementAttestation (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        scopeId TEXT NOT NULL,
        testingCycleId TEXT,
        period TEXT NOT NULL,
        scopeSummary TEXT NOT NULL,
        managementRepresentation TEXT NOT NULL,
        unresolvedDeficiencyDisclosure TEXT,
        overallConclusion TEXT NOT NULL DEFAULT 'Not Concluded',
        preparedBy TEXT NOT NULL,
        reviewedBy TEXT,
        readinessOverride INTEGER NOT NULL DEFAULT 0,
        overrideReason TEXT,
        cfoName TEXT,
        cfoSignOff INTEGER NOT NULL DEFAULT 0,
        cfoSignedAt TEXT,
        ceoName TEXT,
        ceoSignOff INTEGER NOT NULL DEFAULT 0,
        ceoSignedAt TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_attestation_period_scope
        ON ICOFRManagementAttestation(institutionId, scopeId, period);
      CREATE INDEX IF NOT EXISTS idx_icofr_attestation_cycle
        ON ICOFRManagementAttestation(institutionId, testingCycleId);

      CREATE TABLE IF NOT EXISTS ICOFREvidencePack (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        attestationId TEXT NOT NULL,
        packName TEXT NOT NULL,
        period TEXT NOT NULL,
        preparedBy TEXT NOT NULL,
        reviewerName TEXT,
        evidenceIndexRef TEXT NOT NULL,
        testingSummaryRef TEXT,
        deficiencySummaryRef TEXT,
        remediationSummaryRef TEXT,
        representationRef TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_evidence_attestation_name
        ON ICOFREvidencePack(attestationId, packName);
      CREATE INDEX IF NOT EXISTS idx_icofr_evidence_institution
        ON ICOFREvidencePack(institutionId, period);
    `);

    return db;
  })().catch(error => {
    certificationSchemaReady = null;
    throw error;
  });

  return certificationSchemaReady;
}

async function primaryInstitution(db: D1DatabaseLike) {
  return first<Record<string, unknown>>(db, 'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1');
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
      'ICOFR management certification and year-end close.',
      null,
      nowIso()
    ]
  );
}

async function validateScopeAndCycle(
  db: D1DatabaseLike,
  institutionId: string,
  scopeId: string,
  testingCycleId?: string | null
) {
  const scope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
    [scopeId, institutionId]
  );
  if (!scope) throw new Error('SCOPE_NOT_FOUND');

  let cycle: Record<string, unknown> | null = null;
  if (testingCycleId) {
    cycle = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? AND scopeId=? LIMIT 1',
      [testingCycleId, institutionId, scopeId]
    );
    if (!cycle) throw new Error('CYCLE_NOT_FOUND');
  }

  return { scope, cycle };
}

export async function saveSubCertification(input: Record<string, unknown>) {
  const db = await ensureIcofrCertificationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const scopeId = String(input.scopeId || '').trim();
  const testingCycleId = clean(input.testingCycleId);
  const period = String(input.period || '').trim();
  const subjectType = String(input.subjectType || '').trim();
  const subjectId = String(input.subjectId || '').trim();
  const certifierName = String(input.certifierName || '').trim();
  const certifierRole = String(input.certifierRole || '').trim();
  const declarationText = String(input.declarationText || '').trim();

  if (!scopeId || !period || !subjectType || !subjectId || !certifierName || !certifierRole || !declarationText) {
    throw new Error('SUBCERT_REQUIRED');
  }
  if (!['Legal Entity', 'Organization Unit'].includes(subjectType)) {
    throw new Error('INVALID_SUBJECT_TYPE');
  }

  await validateScopeAndCycle(db, String(institution.id), scopeId, testingCycleId);
  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    scopeId,
    period
  });

  const subjectTable = subjectType === 'Legal Entity' ? 'LegalEntity' : 'OrganizationUnit';
  const subject = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM ${subjectTable} WHERE id=? AND institutionId=? LIMIT 1`,
    [subjectId, institution.id]
  );
  if (!subject) throw new Error('SUBJECT_NOT_FOUND');

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSubCertification WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRSubCertification
      WHERE institutionId=? AND period=? AND subjectType=? AND subjectId=? AND id<>?
      LIMIT 1`,
    [institution.id, period, subjectType, subjectId, id]
  );
  if (duplicate) throw new Error('SUBCERT_CONFLICT');

  const now = nowIso();
  const status = String(input.status || 'Draft');
  const record = {
    id,
    institutionId: String(institution.id),
    scopeId,
    testingCycleId,
    period,
    subjectType,
    subjectId,
    certifierName,
    certifierRole,
    declarationText,
    controlsPerformed: bool(input.controlsPerformed),
    changesDisclosed: bool(input.changesDisclosed),
    deficienciesDisclosed: bool(input.deficienciesDisclosed),
    fraudDisclosed: bool(input.fraudDisclosed),
    remediationAccurate: bool(input.remediationAccurate),
    conclusion: String(input.conclusion || 'Not Concluded'),
    status,
    reviewerName: clean(input.reviewerName),
    reviewerDecision: clean(input.reviewerDecision),
    reviewerComments: clean(input.reviewerComments),
    signedAt:
      ['Submitted', 'Approved'].includes(status)
        ? existing?.signedAt || now
        : existing?.signedAt || null,
    reviewedAt:
      status === 'Approved' && input.reviewerName
        ? existing?.reviewedAt || now
        : existing?.reviewedAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (['Submitted', 'Approved'].includes(status)) {
    if (
      !record.controlsPerformed ||
      !record.changesDisclosed ||
      !record.deficienciesDisclosed ||
      !record.fraudDisclosed ||
      !record.remediationAccurate ||
      record.conclusion === 'Not Concluded'
    ) {
      throw new Error('SUBCERT_DECLARATIONS_INCOMPLETE');
    }
  }

  if (status === 'Approved' && (!record.reviewerName || !record.reviewerDecision)) {
    throw new Error('SUBCERT_REVIEW_REQUIRED');
  }

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRSubCertification SET
        scopeId=?,testingCycleId=?,period=?,subjectType=?,subjectId=?,certifierName=?,certifierRole=?,
        declarationText=?,controlsPerformed=?,changesDisclosed=?,deficienciesDisclosed=?,fraudDisclosed=?,
        remediationAccurate=?,conclusion=?,status=?,reviewerName=?,reviewerDecision=?,reviewerComments=?,
        signedAt=?,reviewedAt=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.scopeId,
        record.testingCycleId,
        record.period,
        record.subjectType,
        record.subjectId,
        record.certifierName,
        record.certifierRole,
        record.declarationText,
        record.controlsPerformed ? 1 : 0,
        record.changesDisclosed ? 1 : 0,
        record.deficienciesDisclosed ? 1 : 0,
        record.fraudDisclosed ? 1 : 0,
        record.remediationAccurate ? 1 : 0,
        record.conclusion,
        record.status,
        record.reviewerName,
        record.reviewerDecision,
        record.reviewerComments,
        record.signedAt,
        record.reviewedAt,
        record.updatedAt,
        id,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRSubCertification', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRSubCertification (
        id,institutionId,scopeId,testingCycleId,period,subjectType,subjectId,certifierName,certifierRole,
        declarationText,controlsPerformed,changesDisclosed,deficienciesDisclosed,fraudDisclosed,
        remediationAccurate,conclusion,status,reviewerName,reviewerDecision,reviewerComments,
        signedAt,reviewedAt,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.scopeId,
        record.testingCycleId,
        record.period,
        record.subjectType,
        record.subjectId,
        record.certifierName,
        record.certifierRole,
        record.declarationText,
        record.controlsPerformed ? 1 : 0,
        record.changesDisclosed ? 1 : 0,
        record.deficienciesDisclosed ? 1 : 0,
        record.fraudDisclosed ? 1 : 0,
        record.remediationAccurate ? 1 : 0,
        record.conclusion,
        record.status,
        record.reviewerName,
        record.reviewerDecision,
        record.reviewerComments,
        record.signedAt,
        record.reviewedAt,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRSubCertification', id, record);
  }

  return record;
}

export async function saveManagementAttestation(input: Record<string, unknown>) {
  const db = await ensureIcofrCertificationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const scopeId = String(input.scopeId || '').trim();
  const testingCycleId = clean(input.testingCycleId);
  const period = String(input.period || '').trim();
  const scopeSummary = String(input.scopeSummary || '').trim();
  const managementRepresentation = String(input.managementRepresentation || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();

  if (!scopeId || !period || !scopeSummary || !managementRepresentation || !preparedBy) {
    throw new Error('ATTESTATION_REQUIRED');
  }

  await validateScopeAndCycle(db, String(institution.id), scopeId, testingCycleId);
  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    scopeId,
    period
  });

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRManagementAttestation WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRManagementAttestation
      WHERE institutionId=? AND scopeId=? AND period=? AND id<>?
      LIMIT 1`,
    [institution.id, scopeId, period, id]
  );
  if (duplicate) throw new Error('ATTESTATION_CONFLICT');

  const readinessOverride = bool(input.readinessOverride);
  const overrideReason = clean(input.overrideReason);
  if (readinessOverride && !overrideReason) throw new Error('OVERRIDE_REASON_REQUIRED');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    scopeId,
    testingCycleId,
    period,
    scopeSummary,
    managementRepresentation,
    unresolvedDeficiencyDisclosure: clean(input.unresolvedDeficiencyDisclosure),
    overallConclusion: String(input.overallConclusion || 'Not Concluded'),
    preparedBy,
    reviewedBy: clean(input.reviewedBy),
    readinessOverride,
    overrideReason,
    cfoName: existing?.cfoName || null,
    cfoSignOff: bool(existing?.cfoSignOff),
    cfoSignedAt: existing?.cfoSignedAt || null,
    ceoName: existing?.ceoName || null,
    ceoSignOff: bool(existing?.ceoSignOff),
    ceoSignedAt: existing?.ceoSignedAt || null,
    status: String(input.status || existing?.status || 'Draft'),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRManagementAttestation SET
        scopeId=?,testingCycleId=?,period=?,scopeSummary=?,managementRepresentation=?,
        unresolvedDeficiencyDisclosure=?,overallConclusion=?,preparedBy=?,reviewedBy=?,
        readinessOverride=?,overrideReason=?,status=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.scopeId,
        record.testingCycleId,
        record.period,
        record.scopeSummary,
        record.managementRepresentation,
        record.unresolvedDeficiencyDisclosure,
        record.overallConclusion,
        record.preparedBy,
        record.reviewedBy,
        record.readinessOverride ? 1 : 0,
        record.overrideReason,
        record.status,
        record.updatedAt,
        id,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRManagementAttestation', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRManagementAttestation (
        id,institutionId,scopeId,testingCycleId,period,scopeSummary,managementRepresentation,
        unresolvedDeficiencyDisclosure,overallConclusion,preparedBy,reviewedBy,readinessOverride,
        overrideReason,cfoName,cfoSignOff,cfoSignedAt,ceoName,ceoSignOff,ceoSignedAt,status,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0,NULL,NULL,0,NULL,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.scopeId,
        record.testingCycleId,
        record.period,
        record.scopeSummary,
        record.managementRepresentation,
        record.unresolvedDeficiencyDisclosure,
        record.overallConclusion,
        record.preparedBy,
        record.reviewedBy,
        record.readinessOverride ? 1 : 0,
        record.overrideReason,
        record.status,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFRManagementAttestation', id, record);
  }

  return record;
}

export async function saveEvidencePack(input: Record<string, unknown>) {
  const db = await ensureIcofrCertificationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const attestationId = String(input.attestationId || '').trim();
  const packName = String(input.packName || '').trim();
  const period = String(input.period || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();
  const evidenceIndexRef = String(input.evidenceIndexRef || '').trim();

  if (!attestationId || !packName || !period || !preparedBy || !evidenceIndexRef) {
    throw new Error('EVIDENCE_REQUIRED');
  }

  const attestation = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRManagementAttestation WHERE id=? AND institutionId=? LIMIT 1',
    [attestationId, institution.id]
  );
  if (!attestation) throw new Error('ATTESTATION_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    scopeId: String(attestation.scopeId),
    period: String(attestation.period)
  });

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFREvidencePack WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );

  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFREvidencePack WHERE attestationId=? AND packName=? AND id<>? LIMIT 1',
    [attestationId, packName, id]
  );
  if (duplicate) throw new Error('EVIDENCE_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    attestationId,
    packName,
    period,
    preparedBy,
    reviewerName: clean(input.reviewerName),
    evidenceIndexRef,
    testingSummaryRef: clean(input.testingSummaryRef),
    deficiencySummaryRef: clean(input.deficiencySummaryRef),
    remediationSummaryRef: clean(input.remediationSummaryRef),
    representationRef: clean(input.representationRef),
    status: String(input.status || 'Draft'),
    notes: clean(input.notes),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFREvidencePack SET
        attestationId=?,packName=?,period=?,preparedBy=?,reviewerName=?,evidenceIndexRef=?,
        testingSummaryRef=?,deficiencySummaryRef=?,remediationSummaryRef=?,representationRef=?,
        status=?,notes=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.attestationId,
        record.packName,
        record.period,
        record.preparedBy,
        record.reviewerName,
        record.evidenceIndexRef,
        record.testingSummaryRef,
        record.deficiencySummaryRef,
        record.remediationSummaryRef,
        record.representationRef,
        record.status,
        record.notes,
        record.updatedAt,
        id,
        institution.id
      ]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFREvidencePack', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFREvidencePack (
        id,institutionId,attestationId,packName,period,preparedBy,reviewerName,evidenceIndexRef,
        testingSummaryRef,deficiencySummaryRef,remediationSummaryRef,representationRef,
        status,notes,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.attestationId,
        record.packName,
        record.period,
        record.preparedBy,
        record.reviewerName,
        record.evidenceIndexRef,
        record.testingSummaryRef,
        record.deficiencySummaryRef,
        record.remediationSummaryRef,
        record.representationRef,
        record.status,
        record.notes,
        record.createdAt,
        record.updatedAt
      ]
    );
    await audit(db, String(institution.id), 'CREATE', 'ICOFREvidencePack', id, record);
  }

  return record;
}

async function readinessForAttestation(
  db: D1DatabaseLike,
  institutionId: string,
  scopeId: string,
  testingCycleId: string | null,
  period: string
) {
  const scope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
    [scopeId, institutionId]
  );

  const keyControls = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRControlDomain
      WHERE institutionId=? AND keyControl=1 AND status<>'Retired'`,
    [institutionId]
  );

  const planItems = testingCycleId
    ? await all<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRTestingPlanItem WHERE cycleId=?',
        [testingCycleId]
      )
    : [];

  const todRows = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRDesignAssessment WHERE institutionId=?',
    [institutionId]
  );

  const toeRows = await all<Record<string, unknown>>(
    db,
    `SELECT t.*
       FROM ToETest t
       JOIN ControlMaster c ON c.id=t.controlId
      WHERE c.institutionId=?`,
    [institutionId]
  );

  const significantDeficiencies = await all<Record<string, unknown>>(
    db,
    `SELECT d.*, i.status AS issueStatus
       FROM ControlDeficiency d
       JOIN TestingException e ON e.id=d.exceptionId
       JOIN ToETest t ON t.id=e.toeTestId
       JOIN ControlMaster c ON c.id=t.controlId
       LEFT JOIN Issue i ON i.deficiencyId=d.id
      WHERE c.institutionId=?
        AND d.classification IN ('Significant Deficiency','Material Weakness')`,
    [institutionId]
  );

  const unresolvedDeficiencies = significantDeficiencies.filter(item => String(item.issueStatus || '') !== 'Closed');

  const subCerts = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRSubCertification WHERE institutionId=? AND period=?',
    [institutionId, period]
  );
  const pendingSubCerts = subCerts.filter(item => !['Submitted', 'Approved'].includes(String(item.status)));

  const plannedControlIds = new Set(planItems.map(item => String(item.controlDomainId)));
  const missingKeyControlPlans = keyControls.filter(item => !plannedControlIds.has(String(item.id)));

  const todById = new Map(todRows.map(item => [String(item.id), item]));
  const toeById = new Map(toeRows.map(item => [String(item.id), item]));

  let requiredTod = 0;
  let completedTod = 0;
  let requiredToe = 0;
  let completedToe = 0;

  for (const item of planItems) {
    const testType = String(item.testType);
    if (['ToD', 'Both'].includes(testType)) {
      requiredTod += 1;
      const tod = item.todAssessmentId ? todById.get(String(item.todAssessmentId)) : null;
      if (
        tod &&
        String(tod.conclusion) !== 'Not Assessed' &&
        ['Approved', 'Completed'].includes(String(tod.status))
      ) {
        completedTod += 1;
      }
    }

    if (['ToE', 'Both'].includes(testType)) {
      requiredToe += 1;
      const toe = item.toeTestId ? toeById.get(String(item.toeTestId)) : null;
      if (
        toe &&
        String(toe.finalConclusion) !== 'Not Assessed' &&
        ['Completed', 'Closed', 'Approved'].includes(String(toe.status))
      ) {
        completedToe += 1;
      }
    }
  }

  const scopeReady = Boolean(scope) && ['Approved', 'Final', 'Closed'].includes(String(scope?.status));
  const planReady = testingCycleId ? missingKeyControlPlans.length === 0 && planItems.length > 0 : false;
  const todReady = requiredTod === completedTod;
  const toeReady = requiredToe === completedToe;
  const deficiencyReady = unresolvedDeficiencies.length === 0;
  const subCertificationReady = pendingSubCerts.length === 0;

  const coverage = await getIcofrCoverageData();
  const highPriorityOpenActions = (coverage.actions || []).filter((item: any) => {
    const priority = String(item.priority || '');
    const status = String(item.status || '');
    return ['Critical', 'High'].includes(priority) && !['Closed', 'Cancelled'].includes(status);
  });

  const gapReady = highPriorityOpenActions.length === 0;

  const gates = [
    {
      key: 'SCOPE_APPROVED',
      label: 'ICOFR scope approved/finalized',
      passed: scopeReady,
      detail: scope ? `Scope status: ${String(scope.status)}` : 'Scope not found.'
    },
    {
      key: 'KEY_CONTROLS_PLANNED',
      label: 'All key ICOFR controls included in testing cycle',
      passed: planReady,
      detail: testingCycleId
        ? `${keyControls.length - missingKeyControlPlans.length} of ${keyControls.length} key controls planned.`
        : 'Testing cycle not linked.'
    },
    {
      key: 'TOD_COMPLETE',
      label: 'Required Test of Design completed',
      passed: todReady,
      detail: `${completedTod} of ${requiredTod} required ToD workpapers completed.`
    },
    {
      key: 'TOE_COMPLETE',
      label: 'Required Test of Operating Effectiveness completed',
      passed: toeReady,
      detail: `${completedToe} of ${requiredToe} required ToE workpapers completed.`
    },
    {
      key: 'NO_UNRESOLVED_SIGNIFICANT_DEFICIENCY',
      label: 'No unresolved significant deficiency/material weakness',
      passed: deficiencyReady,
      detail: `${unresolvedDeficiencies.length} unresolved significant deficiency/material weakness record(s).`
    },
    {
      key: 'HIGH_PRIORITY_GAPS',
      label: 'No open Critical/High ICOFR gap actions',
      passed: gapReady,
      detail: `${highPriorityOpenActions.length} open Critical/High gap action(s).`
    },
    {
      key: 'SUBCERTIFICATIONS',
      label: 'Existing sub-certifications submitted/approved',
      passed: subCertificationReady,
      detail:
        subCerts.length === 0
          ? 'No sub-certification perimeter has been registered for this period.'
          : `${subCerts.length - pendingSubCerts.length} of ${subCerts.length} existing sub-certifications submitted/approved.`
    }
  ];

  return {
    ready: gates.every(item => item.passed),
    gates,
    counts: {
      keyControls: keyControls.length,
      planItems: planItems.length,
      missingKeyControlPlans: missingKeyControlPlans.length,
      requiredTod,
      completedTod,
      requiredToe,
      completedToe,
      unresolvedSignificantDeficiencies: unresolvedDeficiencies.length,
      highPriorityOpenGapActions: highPriorityOpenActions.length,
      subCertifications: subCerts.length,
      pendingSubCertifications: pendingSubCerts.length
    }
  };
}

export async function signManagementAttestation(
  attestationId: string,
  role: 'CFO' | 'CEO',
  signatoryName: string,
  declarationConfirmed: boolean
) {
  const db = await ensureIcofrCertificationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  if (!signatoryName.trim() || !declarationConfirmed) throw new Error('SIGNOFF_REQUIRED');

  const attestation = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRManagementAttestation WHERE id=? AND institutionId=? LIMIT 1',
    [attestationId, institution.id]
  );
  if (!attestation) throw new Error('ATTESTATION_NOT_FOUND');

  await assertIcofrPeriodWritable({
    institutionId: String(institution.id),
    scopeId: String(attestation.scopeId),
    period: String(attestation.period)
  });

  if (String(attestation.overallConclusion) === 'Not Concluded') {
    throw new Error('CONCLUSION_REQUIRED');
  }

  const readiness = await readinessForAttestation(
    db,
    String(institution.id),
    String(attestation.scopeId),
    attestation.testingCycleId ? String(attestation.testingCycleId) : null,
    String(attestation.period)
  );

  if (!readiness.ready && !bool(attestation.readinessOverride)) {
    throw new Error('READINESS_NOT_MET');
  }
  if (!readiness.ready && bool(attestation.readinessOverride) && !clean(attestation.overrideReason)) {
    throw new Error('OVERRIDE_REASON_REQUIRED');
  }

  const now = nowIso();
  if (role === 'CFO') {
    await run(
      db,
      `UPDATE ICOFRManagementAttestation
        SET cfoName=?, cfoSignOff=1, cfoSignedAt=?, status=CASE WHEN ceoSignOff=1 THEN 'Signed' ELSE 'Awaiting CEO Sign-Off' END, updatedAt=?
        WHERE id=? AND institutionId=?`,
      [signatoryName.trim(), now, now, attestationId, institution.id]
    );
  } else {
    await run(
      db,
      `UPDATE ICOFRManagementAttestation
        SET ceoName=?, ceoSignOff=1, ceoSignedAt=?, status=CASE WHEN cfoSignOff=1 THEN 'Signed' ELSE 'Awaiting CFO Sign-Off' END, updatedAt=?
        WHERE id=? AND institutionId=?`,
      [signatoryName.trim(), now, now, attestationId, institution.id]
    );
  }

  const result = {
    attestationId,
    role,
    signatoryName: signatoryName.trim(),
    signedAt: now,
    readinessSnapshot: readiness
  };
  await audit(db, String(institution.id), 'SIGN_OFF', 'ICOFRManagementAttestation', attestationId, result, attestation);
  return result;
}

export async function getCertificationData() {
  const db = await ensureIcofrCertificationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      scopes: [],
      cycles: [],
      legalEntities: [],
      organizationUnits: [],
      subCertifications: [],
      attestations: [],
      evidencePacks: [],
      readiness: {}
    };
  }

  const organization = await getOrganizationStructure();
  const [scopes, cycles, subCertifications, attestations, evidencePacks] = await Promise.all([
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
      'SELECT * FROM ICOFRSubCertification WHERE institutionId=? ORDER BY period DESC, updatedAt DESC',
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
    )
  ]);

  const subjectById = new Map<string, Record<string, unknown>>();
  for (const entity of organization.legalEntities || []) {
    subjectById.set('Legal Entity:' + String(entity.id), entity);
  }
  for (const unit of organization.organizationUnits || []) {
    subjectById.set('Organization Unit:' + String(unit.id), unit);
  }

  const readinessEntries = await Promise.all(
    attestations.map(async attestation => {
      const readiness = await readinessForAttestation(
        db,
        String(institution.id),
        String(attestation.scopeId),
        attestation.testingCycleId ? String(attestation.testingCycleId) : null,
        String(attestation.period)
      );
      return [String(attestation.id), readiness] as const;
    })
  );

  const readiness: Record<string, unknown> = {};
  for (const [id, value] of readinessEntries) readiness[id] = value;

  const enrichedSubCertifications = subCertifications.map(item => ({
    ...item,
    controlsPerformed: bool(item.controlsPerformed),
    changesDisclosed: bool(item.changesDisclosed),
    deficienciesDisclosed: bool(item.deficienciesDisclosed),
    fraudDisclosed: bool(item.fraudDisclosed),
    remediationAccurate: bool(item.remediationAccurate),
    subject: subjectById.get(String(item.subjectType) + ':' + String(item.subjectId)) || null
  }));

  const enrichedAttestations = attestations.map(item => ({
    ...item,
    readinessOverride: bool(item.readinessOverride),
    cfoSignOff: bool(item.cfoSignOff),
    ceoSignOff: bool(item.ceoSignOff)
  }));

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    scopes,
    cycles,
    legalEntities: organization.legalEntities || [],
    organizationUnits: organization.organizationUnits || [],
    subCertifications: enrichedSubCertifications,
    attestations: enrichedAttestations,
    evidencePacks,
    readiness
  };
}
