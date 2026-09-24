import { resolveServerActiveInstitutionId } from '@/lib/institution-context';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureIcofrScopeSchema } from '@/lib/d1-icofr';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';
import { ensureIcofrCoverageSchema, getIcofrCoverageData } from '@/lib/d1-icofr-coverage';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { getOrganizationStructure } from '@/lib/d1-organization';
import { assertIcofrPeriodWritable } from '@/lib/d1-icofr-period-lock';
import { ensureIcofrWorkpaperReviewSchema } from '@/lib/d1-icofr-workpaper-review';

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
  await ensureIcofrScopeSchema();
    await ensureIcofrTestingPlanSchema();
    await ensureIcofrCoverageSchema();
    await ensureAssuranceSchema();
    await ensureIcofrWorkpaperReviewSchema();

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
  const statements = script
    .split(';')
    .map(statement => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

async function ensureColumn(
  db: D1DatabaseLike,
  table: string,
  column: string,
  definition: string
) {
  const columns = await all<Record<string, unknown>>(db, `PRAGMA table_info(${table})`);
  if (columns.some(item => String(item.name) === column)) return;
  await run(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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

    for (const [column, definition] of [
      ['certificationRef', 'TEXT'],
      ['certificationType', "TEXT NOT NULL DEFAULT 'Year-End'"],
      ['certificationDate', 'TEXT'],
      ['certifierEmail', 'TEXT'],
      ['scopeComplete', 'INTEGER NOT NULL DEFAULT 0'],
      ['evidenceComplete', 'INTEGER NOT NULL DEFAULT 0'],
      ['judgmentsDisclosed', 'INTEGER NOT NULL DEFAULT 0'],
      ['subsequentEventsDisclosed', 'INTEGER NOT NULL DEFAULT 0'],
      ['managementOverrideDisclosed', 'INTEGER NOT NULL DEFAULT 0'],
      ['materialChangeDetails', 'TEXT'],
      ['deficiencyDetails', 'TEXT'],
      ['fraudDetails', 'TEXT'],
      ['remediationDetails', 'TEXT'],
      ['judgmentDetails', 'TEXT'],
      ['subsequentEventDetails', 'TEXT'],
      ['managementOverrideDetails', 'TEXT'],
      ['evidenceReference', 'TEXT'],
      ['exceptionRationale', 'TEXT'],
      ['additionalComments', 'TEXT'],
      ['reviewerRole', 'TEXT'],
      ['reviewerEmail', 'TEXT']
    ] as const) {
      await ensureColumn(db, 'ICOFRSubCertification', column, definition);
    }

    await run(
      db,
      `UPDATE ICOFRSubCertification
          SET certificationRef = 'ICOFR-CERT-' || substr(replace(id, '-', ''), 1, 10)
        WHERE certificationRef IS NULL OR trim(certificationRef) = ''`
    );
    await run(
      db,
      `UPDATE ICOFRSubCertification
          SET certificationDate = substr(createdAt, 1, 10)
        WHERE certificationDate IS NULL OR trim(certificationDate) = ''`
    );
    await run(
      db,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_subcert_reference
         ON ICOFRSubCertification(institutionId, certificationRef)`
    );

    return db;
  })().catch(error => {
    certificationSchemaReady = null;
    throw error;
  });

  return certificationSchemaReady;
}

async function primaryInstitution(db: D1DatabaseLike) {
  const activeInstitutionId = await resolveServerActiveInstitutionId();
  if (activeInstitutionId) {
    const active = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM Institution WHERE id = ? LIMIT 1',
      [activeInstitutionId]
    );
    if (active) return active;
  }
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
  const certifierEmail = String(input.certifierEmail || '').trim();
  const declarationText = String(input.declarationText || '').trim();
  const certificationType = String(input.certificationType || 'Year-End').trim();
  const certificationDate = String(input.certificationDate || '').trim();

  if (
    !scopeId ||
    !period ||
    !subjectType ||
    !subjectId ||
    !certifierName ||
    !certifierRole ||
    !certifierEmail ||
    !declarationText
  ) {
    throw new Error('SUBCERT_REQUIRED');
  }
  if (!['Legal Entity', 'Organization Unit'].includes(subjectType)) {
    throw new Error('INVALID_SUBJECT_TYPE');
  }
  if (!['Quarterly', 'Semi-Annual', 'Year-End', 'Ad Hoc'].includes(certificationType)) {
    throw new Error('INVALID_CERTIFICATION_TYPE');
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
  const conclusion = String(input.conclusion || 'Not Concluded');
  const reviewerDecision = clean(input.reviewerDecision);
  const certificationRef =
    clean(existing?.certificationRef) ||
    clean(input.certificationRef) ||
    'ICOFR-CERT-' + period.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10) + '-' +
      crypto.randomUUID().slice(0, 6).toUpperCase();

  if (!['Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected'].includes(status)) {
    throw new Error('INVALID_SUBCERT_STATUS');
  }
  if (!['Not Concluded', 'Effective', 'Effective with Exceptions', 'Ineffective'].includes(conclusion)) {
    throw new Error('INVALID_SUBCERT_CONCLUSION');
  }
  if (
    reviewerDecision &&
    !['Approved', 'Returned for Revision', 'Rejected'].includes(reviewerDecision)
  ) {
    throw new Error('INVALID_REVIEWER_DECISION');
  }

  const record = {
    id,
    institutionId: String(institution.id),
    certificationRef,
    scopeId,
    testingCycleId,
    period,
    certificationType,
    certificationDate: certificationDate || existing?.certificationDate || now.slice(0, 10),
    subjectType,
    subjectId,
    certifierName,
    certifierRole,
    certifierEmail,
    declarationText,
    scopeComplete: bool(input.scopeComplete),
    controlsPerformed: bool(input.controlsPerformed),
    evidenceComplete: bool(input.evidenceComplete),
    changesDisclosed: bool(input.changesDisclosed),
    deficienciesDisclosed: bool(input.deficienciesDisclosed),
    fraudDisclosed: bool(input.fraudDisclosed),
    remediationAccurate: bool(input.remediationAccurate),
    judgmentsDisclosed: bool(input.judgmentsDisclosed),
    subsequentEventsDisclosed: bool(input.subsequentEventsDisclosed),
    managementOverrideDisclosed: bool(input.managementOverrideDisclosed),
    materialChangeDetails: clean(input.materialChangeDetails),
    deficiencyDetails: clean(input.deficiencyDetails),
    fraudDetails: clean(input.fraudDetails),
    remediationDetails: clean(input.remediationDetails),
    judgmentDetails: clean(input.judgmentDetails),
    subsequentEventDetails: clean(input.subsequentEventDetails),
    managementOverrideDetails: clean(input.managementOverrideDetails),
    evidenceReference: clean(input.evidenceReference),
    exceptionRationale: clean(input.exceptionRationale),
    additionalComments: clean(input.additionalComments),
    conclusion,
    status,
    reviewerName: clean(input.reviewerName),
    reviewerRole: clean(input.reviewerRole),
    reviewerEmail: clean(input.reviewerEmail),
    reviewerDecision,
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
      !record.scopeComplete ||
      !record.controlsPerformed ||
      !record.evidenceComplete ||
      !record.changesDisclosed ||
      !record.deficienciesDisclosed ||
      !record.fraudDisclosed ||
      !record.remediationAccurate ||
      !record.judgmentsDisclosed ||
      !record.subsequentEventsDisclosed ||
      !record.managementOverrideDisclosed ||
      !record.certificationDate ||
      !record.evidenceReference ||
      record.conclusion === 'Not Concluded'
    ) {
      throw new Error('SUBCERT_DECLARATIONS_INCOMPLETE');
    }
  }

  if (
    ['Effective with Exceptions', 'Ineffective'].includes(record.conclusion) &&
    !record.exceptionRationale
  ) {
    throw new Error('SUBCERT_EXCEPTION_RATIONALE_REQUIRED');
  }

  if (
    status === 'Approved' &&
    (
      !record.reviewerName ||
      !record.reviewerRole ||
      record.reviewerDecision !== 'Approved'
    )
  ) {
    throw new Error('SUBCERT_REVIEW_REQUIRED');
  }

  const values = [
    record.scopeId,
    record.testingCycleId,
    record.period,
    record.certificationRef,
    record.certificationType,
    record.certificationDate,
    record.subjectType,
    record.subjectId,
    record.certifierName,
    record.certifierRole,
    record.certifierEmail,
    record.declarationText,
    record.scopeComplete ? 1 : 0,
    record.controlsPerformed ? 1 : 0,
    record.evidenceComplete ? 1 : 0,
    record.changesDisclosed ? 1 : 0,
    record.deficienciesDisclosed ? 1 : 0,
    record.fraudDisclosed ? 1 : 0,
    record.remediationAccurate ? 1 : 0,
    record.judgmentsDisclosed ? 1 : 0,
    record.subsequentEventsDisclosed ? 1 : 0,
    record.managementOverrideDisclosed ? 1 : 0,
    record.materialChangeDetails,
    record.deficiencyDetails,
    record.fraudDetails,
    record.remediationDetails,
    record.judgmentDetails,
    record.subsequentEventDetails,
    record.managementOverrideDetails,
    record.evidenceReference,
    record.exceptionRationale,
    record.additionalComments,
    record.conclusion,
    record.status,
    record.reviewerName,
    record.reviewerRole,
    record.reviewerEmail,
    record.reviewerDecision,
    record.reviewerComments,
    record.signedAt,
    record.reviewedAt,
    record.updatedAt
  ];

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRSubCertification SET
        scopeId=?,testingCycleId=?,period=?,certificationRef=?,certificationType=?,certificationDate=?,
        subjectType=?,subjectId=?,certifierName=?,certifierRole=?,certifierEmail=?,declarationText=?,
        scopeComplete=?,controlsPerformed=?,evidenceComplete=?,changesDisclosed=?,deficienciesDisclosed=?,
        fraudDisclosed=?,remediationAccurate=?,judgmentsDisclosed=?,subsequentEventsDisclosed=?,
        managementOverrideDisclosed=?,materialChangeDetails=?,deficiencyDetails=?,fraudDetails=?,
        remediationDetails=?,judgmentDetails=?,subsequentEventDetails=?,managementOverrideDetails=?,
        evidenceReference=?,exceptionRationale=?,additionalComments=?,conclusion=?,status=?,
        reviewerName=?,reviewerRole=?,reviewerEmail=?,reviewerDecision=?,reviewerComments=?,
        signedAt=?,reviewedAt=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [...values, id, institution.id]
    );
    await audit(db, String(institution.id), 'UPDATE', 'ICOFRSubCertification', id, record, existing);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRSubCertification (
        id,institutionId,scopeId,testingCycleId,period,certificationRef,certificationType,certificationDate,
        subjectType,subjectId,certifierName,certifierRole,certifierEmail,declarationText,
        scopeComplete,controlsPerformed,evidenceComplete,changesDisclosed,deficienciesDisclosed,fraudDisclosed,
        remediationAccurate,judgmentsDisclosed,subsequentEventsDisclosed,managementOverrideDisclosed,
        materialChangeDetails,deficiencyDetails,fraudDetails,remediationDetails,judgmentDetails,
        subsequentEventDetails,managementOverrideDetails,evidenceReference,exceptionRationale,additionalComments,
        conclusion,status,reviewerName,reviewerRole,reviewerEmail,reviewerDecision,reviewerComments,
        signedAt,reviewedAt,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        record.id,
        record.institutionId,
        record.scopeId,
        record.testingCycleId,
        record.period,
        record.certificationRef,
        record.certificationType,
        record.certificationDate,
        record.subjectType,
        record.subjectId,
        record.certifierName,
        record.certifierRole,
        record.certifierEmail,
        record.declarationText,
        record.scopeComplete ? 1 : 0,
        record.controlsPerformed ? 1 : 0,
        record.evidenceComplete ? 1 : 0,
        record.changesDisclosed ? 1 : 0,
        record.deficienciesDisclosed ? 1 : 0,
        record.fraudDisclosed ? 1 : 0,
        record.remediationAccurate ? 1 : 0,
        record.judgmentsDisclosed ? 1 : 0,
        record.subsequentEventsDisclosed ? 1 : 0,
        record.managementOverrideDisclosed ? 1 : 0,
        record.materialChangeDetails,
        record.deficiencyDetails,
        record.fraudDetails,
        record.remediationDetails,
        record.judgmentDetails,
        record.subsequentEventDetails,
        record.managementOverrideDetails,
        record.evidenceReference,
        record.exceptionRationale,
        record.additionalComments,
        record.conclusion,
        record.status,
        record.reviewerName,
        record.reviewerRole,
        record.reviewerEmail,
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

  const workpaperReviews = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperReview WHERE institutionId=?',
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
  let requiredWorkpaperReviews = 0;
  let approvedWorkpaperReviews = 0;

  const approvedReviewByKey = new Map(
    workpaperReviews
      .filter(
        item =>
          String(item.status) === 'Approved' &&
          String(item.reviewerConclusion) !== 'Not Assessed'
      )
      .map(item => [
        String(item.workpaperType) + ':' + String(item.workpaperId),
        item
      ])
  );

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
      requiredWorkpaperReviews += 1;
      if (
        tod &&
        approvedReviewByKey.has('ToD:' + String(tod.id))
      ) {
        approvedWorkpaperReviews += 1;
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
      requiredWorkpaperReviews += 1;
      if (
        toe &&
        approvedReviewByKey.has('ToE:' + String(toe.id))
      ) {
        approvedWorkpaperReviews += 1;
      }
    }
  }

  const scopeReady = Boolean(scope) && ['Approved', 'Final', 'Closed'].includes(String(scope?.status));
  const planReady = testingCycleId ? missingKeyControlPlans.length === 0 && planItems.length > 0 : false;
  const todReady = requiredTod === completedTod;
  const toeReady = requiredToe === completedToe;
  const workpaperReviewReady =
    requiredWorkpaperReviews > 0 &&
    requiredWorkpaperReviews === approvedWorkpaperReviews;
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
      key: 'WORKPAPER_QUALITY_REVIEW',
      label: 'Required ToD/ToE workpapers passed independent quality review',
      passed: workpaperReviewReady,
      detail: `${approvedWorkpaperReviews} of ${requiredWorkpaperReviews} required workpaper review(s) approved.`
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
      requiredWorkpaperReviews,
      approvedWorkpaperReviews,
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

async function getSubCertificationContext(
  db: D1DatabaseLike,
  institutionId: string
) {
  const [processRows, controlRows, todRows, toeRows, issueRows, mapRows] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT legalEntityId, orgUnitId, COUNT(*) AS processCount
         FROM BusinessProcess
        WHERE institutionId=?
        GROUP BY legalEntityId, orgUnitId`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.legalEntityId, p.orgUnitId,
              COUNT(c.id) AS controlCount,
              SUM(CASE WHEN c.isKeyControl=1 THEN 1 ELSE 0 END) AS keyControlCount,
              SUM(CASE WHEN c.isIcofrKey=1 THEN 1 ELSE 0 END) AS icofrKeyControlCount
         FROM ControlMaster c
         JOIN BusinessProcess p ON p.id=c.processId
        WHERE c.institutionId=? AND p.institutionId=?
        GROUP BY p.legalEntityId, p.orgUnitId`,
      [institutionId, institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.legalEntityId, p.orgUnitId,
              COUNT(d.id) AS todCount,
              SUM(CASE
                    WHEN d.status IN ('Approved','Completed')
                     AND d.conclusion<>'Not Assessed'
                    THEN 1 ELSE 0
                  END) AS todCompleted
         FROM ICOFRDesignAssessment d
         JOIN ICOFRControlDomain cd
           ON cd.id=d.controlDomainId
          AND cd.institutionId=d.institutionId
         JOIN ControlMaster c
           ON c.id=cd.sourceControlId
          AND c.institutionId=d.institutionId
         JOIN BusinessProcess p
           ON p.id=c.processId
          AND p.institutionId=d.institutionId
        WHERE d.institutionId=?
        GROUP BY p.legalEntityId, p.orgUnitId`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.legalEntityId, p.orgUnitId,
              COUNT(t.id) AS toeCount,
              SUM(CASE
                    WHEN t.status IN ('Completed','Closed','Approved')
                     AND t.finalConclusion<>'Not Assessed'
                    THEN 1 ELSE 0
                  END) AS toeCompleted,
              SUM(CASE WHEN t.failCount>0 THEN 1 ELSE 0 END) AS toeWithFailures
         FROM ToETest t
         JOIN BusinessProcess p ON p.id=t.processId
        WHERE p.institutionId=?
        GROUP BY p.legalEntityId, p.orgUnitId`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.legalEntityId, p.orgUnitId,
              COUNT(i.id) AS issueCount,
              SUM(CASE WHEN i.status NOT IN ('Closed','Completed') THEN 1 ELSE 0 END) AS openIssues,
              SUM(CASE
                    WHEN i.status NOT IN ('Closed','Completed')
                     AND i.severity IN ('Critical','High')
                    THEN 1 ELSE 0
                  END) AS openHighCriticalIssues
         FROM Issue i
         JOIN BusinessProcess p ON p.id=i.processId
        WHERE i.institutionId=? AND p.institutionId=?
        GROUP BY p.legalEntityId, p.orgUnitId`,
      [institutionId, institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.legalEntityId, p.orgUnitId,
              COUNT(m.id) AS actionPlanCount,
              SUM(CASE
                    WHEN m.status NOT IN ('Completed','Closed')
                     AND COALESCE(m.revisedDueDate,m.originalDueDate) < ?
                    THEN 1 ELSE 0
                  END) AS overdueActionPlans
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id=m.issueId
         JOIN BusinessProcess p ON p.id=i.processId
        WHERE i.institutionId=? AND p.institutionId=?
        GROUP BY p.legalEntityId, p.orgUnitId`,
      [nowIso().slice(0, 10), institutionId, institutionId]
    )
  ]);

  type Context = {
    processCount: number;
    controlCount: number;
    keyControlCount: number;
    icofrKeyControlCount: number;
    todCount: number;
    todCompleted: number;
    toeCount: number;
    toeCompleted: number;
    toeWithFailures: number;
    issueCount: number;
    openIssues: number;
    openHighCriticalIssues: number;
    actionPlanCount: number;
    overdueActionPlans: number;
  };

  const contexts: Record<string, Context> = {};

  const ensureContext = (key: string) => {
    if (!contexts[key]) {
      contexts[key] = {
        processCount: 0,
        controlCount: 0,
        keyControlCount: 0,
        icofrKeyControlCount: 0,
        todCount: 0,
        todCompleted: 0,
        toeCount: 0,
        toeCompleted: 0,
        toeWithFailures: 0,
        issueCount: 0,
        openIssues: 0,
        openHighCriticalIssues: 0,
        actionPlanCount: 0,
        overdueActionPlans: 0
      };
    }
    return contexts[key];
  };

  const add = (
    row: Record<string, unknown>,
    fields: Array<keyof Context>
  ) => {
    const keys: string[] = [];
    if (row.orgUnitId) keys.push('Organization Unit:' + String(row.orgUnitId));
    if (row.legalEntityId) keys.push('Legal Entity:' + String(row.legalEntityId));

    for (const key of keys) {
      const target = ensureContext(key);
      for (const field of fields) {
        target[field] += Number(row[field] || 0);
      }
    }
  };

  for (const row of processRows) add(row, ['processCount']);
  for (const row of controlRows) {
    add(row, ['controlCount', 'keyControlCount', 'icofrKeyControlCount']);
  }
  for (const row of todRows) add(row, ['todCount', 'todCompleted']);
  for (const row of toeRows) add(row, ['toeCount', 'toeCompleted', 'toeWithFailures']);
  for (const row of issueRows) {
    add(row, ['issueCount', 'openIssues', 'openHighCriticalIssues']);
  }
  for (const row of mapRows) add(row, ['actionPlanCount', 'overdueActionPlans']);

  return contexts;
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

  const organization = await getOrganizationStructure(String(institution.id));
  const [scopes, cycles, subCertifications, attestations, evidencePacks, subjectContext] = await Promise.all([
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
    ),
    getSubCertificationContext(db, String(institution.id))
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
    scopeComplete: bool(item.scopeComplete),
    controlsPerformed: bool(item.controlsPerformed),
    evidenceComplete: bool(item.evidenceComplete),
    changesDisclosed: bool(item.changesDisclosed),
    deficienciesDisclosed: bool(item.deficienciesDisclosed),
    fraudDisclosed: bool(item.fraudDisclosed),
    remediationAccurate: bool(item.remediationAccurate),
    judgmentsDisclosed: bool(item.judgmentsDisclosed),
    subsequentEventsDisclosed: bool(item.subsequentEventsDisclosed),
    managementOverrideDisclosed: bool(item.managementOverrideDisclosed),
    subject: subjectById.get(String(item.subjectType) + ':' + String(item.subjectId)) || null,
    assuranceContext:
      subjectContext[String(item.subjectType) + ':' + String(item.subjectId)] || null
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
    readiness,
    subjectContext
  };
}
