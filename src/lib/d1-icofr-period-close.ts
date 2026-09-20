import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureIcofrScopeSchema } from '@/lib/d1-icofr';
import { ensureIcofrDomainSchema } from '@/lib/d1-icofr-domains';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
import { ensureIcofrCertificationSchema } from '@/lib/d1-icofr-certification';
import { ensureIcofrExecutiveReportingSchema } from '@/lib/d1-icofr-executive-reporting';
import { ensureIcofrSamplingEvidenceSchema } from '@/lib/d1-icofr-sampling-evidence';
import { ensureIcofrWorkpaperReviewSchema } from '@/lib/d1-icofr-workpaper-review';
import { ensureEvidenceRepositorySchema } from '@/lib/d1-evidence-repository';
import {
  ensureIcofrPeriodLockSchema,
  getIcofrPeriodLockState
} from '@/lib/d1-icofr-period-lock';

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
    ensureCoreDomainSchema(),
    ensureIcofrScopeSchema(),
    ensureIcofrDomainSchema(),
    ensureIcofrTraceabilitySchema(),
    ensureIcofrTestingPlanSchema(),
    ensureAssuranceSchema(),
    ensureIcofrCertificationSchema(),
    ensureIcofrExecutiveReportingSchema(),
    ensureIcofrSamplingEvidenceSchema(),
    ensureIcofrWorkpaperReviewSchema(),
    ensureEvidenceRepositorySchema(),
    ensureIcofrPeriodLockSchema()
  ]);

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

let closeSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrPeriodCloseSchema() {
  if (closeSchemaReady) return closeSchemaReady;

  closeSchemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRPeriodSnapshot (
        id TEXT PRIMARY KEY NOT NULL,
        closeId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        snapshotVersion INTEGER NOT NULL,
        snapshotType TEXT NOT NULL,
        recordCount INTEGER NOT NULL DEFAULT 0,
        contentJson TEXT NOT NULL,
        contentHash TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        createdBy TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_snapshot_version_type
        ON ICOFRPeriodSnapshot(closeId, snapshotVersion, snapshotType);
      CREATE INDEX IF NOT EXISTS idx_icofr_snapshot_close
        ON ICOFRPeriodSnapshot(closeId, snapshotVersion, createdAt);
      CREATE INDEX IF NOT EXISTS idx_icofr_snapshot_institution
        ON ICOFRPeriodSnapshot(institutionId, createdAt);
    `);
    return db;
  })().catch(error => {
    closeSchemaReady = null;
    throw error;
  });

  return closeSchemaReady;
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
      'ICOFR period-close locking, controlled reopening and immutable snapshot versioning.',
      null,
      nowIso()
    ]
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function countRecords(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + (typeof item === 'object' && item !== null ? 1 : 0), 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, item) => sum + (Array.isArray(item) ? item.length : 0),
      0
    );
  }
  return 0;
}

async function captureSnapshotSections(
  db: D1DatabaseLike,
  institutionId: string,
  scopeId: string,
  testingCycleId: string | null,
  attestationId: string,
  period: string
) {
  const scope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
    [scopeId, institutionId]
  );
  if (!scope) throw new Error('SCOPE_NOT_FOUND');

  const cycle = testingCycleId
    ? await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? AND scopeId=? LIMIT 1',
        [testingCycleId, institutionId, scopeId]
      )
    : null;

  if (testingCycleId && !cycle) throw new Error('CYCLE_NOT_FOUND');

  const testingPeriod = cycle
    ? String(cycle.fiscalYear) + ' ' + String(cycle.reportingPeriod)
    : period;

  const [
    scopeItems,
    financialItems,
    assertions,
    traceabilityLinks,
    controlDomains,
    informationRegisters,
    riskMasters,
    controlMasters,
    controlRiskMappings,
    planItems,
    samplingPlans,
    samplingCandidates,
    samplingEvidenceRequests,
    workpaperReviews,
    workpaperReviewNotes,
    workpaperEvidenceIndex,
    designAssessments,
    toeTests,
    testSamples,
    testingExceptions,
    deficiencies,
    issues,
    maps,
    milestones,
    retests,
    subCertifications,
    attestations,
    evidencePacks,
    reportPacks,
    relianceMappings,
    pbcRequests,
    evidenceDocumentsAll,
    evidenceVersionsAll,
    evidenceLinksAll
  ] = await Promise.all([
    all(db, 'SELECT * FROM ICOFRScopeItem WHERE scopeId=? ORDER BY itemType,name', [scopeId]),
    all(db, 'SELECT * FROM ICOFRFinancialItem WHERE institutionId=? ORDER BY recordType,itemCode', [institutionId]),
    all(db, 'SELECT * FROM ICOFRAssertion WHERE institutionId=? ORDER BY financialItemId,assertion', [institutionId]),
    all(db, 'SELECT * FROM ICOFRTraceabilityLink WHERE institutionId=? ORDER BY sourceType,sourceId,targetType,targetId', [institutionId]),
    all(db, "SELECT * FROM ICOFRControlDomain WHERE institutionId=? AND status<>'Retired' ORDER BY category,controlCode", [institutionId]),
    all(db, 'SELECT * FROM ICOFRInformationRegister WHERE institutionId=? ORDER BY artifactType,itemCode', [institutionId]),
    all(db, 'SELECT * FROM RiskMaster WHERE institutionId=? ORDER BY riskId', [institutionId]),
    all(db, 'SELECT * FROM ControlMaster WHERE institutionId=? ORDER BY controlId', [institutionId]),
    all(
      db,
      `SELECT m.*
         FROM ControlRiskMapping m
         JOIN ControlMaster c ON c.id=m.controlId
        WHERE c.institutionId=?
        ORDER BY m.controlId,m.riskId`,
      [institutionId]
    ),
    testingCycleId
      ? all(db, 'SELECT * FROM ICOFRTestingPlanItem WHERE cycleId=? ORDER BY dueDate,createdAt', [testingCycleId])
      : Promise.resolve([]),
    testingCycleId
      ? all(
          db,
          'SELECT * FROM ICOFRSamplingPlan WHERE institutionId=? AND cycleId=? ORDER BY createdAt',
          [institutionId, testingCycleId]
        )
      : all(
          db,
          'SELECT * FROM ICOFRSamplingPlan WHERE institutionId=? AND period=? ORDER BY createdAt',
          [institutionId, testingPeriod]
        ),
    testingCycleId
      ? all(
          db,
          `SELECT c.*
             FROM ICOFRSamplingCandidate c
             JOIN ICOFRSamplingPlan p ON p.id=c.samplingPlanId
            WHERE p.institutionId=? AND p.cycleId=?
            ORDER BY c.samplingPlanId,c.selectionOrder,c.transactionDate,c.transactionRef`,
          [institutionId, testingCycleId]
        )
      : all(
          db,
          `SELECT c.*
             FROM ICOFRSamplingCandidate c
             JOIN ICOFRSamplingPlan p ON p.id=c.samplingPlanId
            WHERE p.institutionId=? AND p.period=?
            ORDER BY c.samplingPlanId,c.selectionOrder,c.transactionDate,c.transactionRef`,
          [institutionId, testingPeriod]
        ),
    testingCycleId
      ? all(
          db,
          `SELECT r.*
             FROM ICOFREvidenceRequest r
             JOIN ICOFRSamplingPlan p ON p.id=r.samplingPlanId
            WHERE p.institutionId=? AND p.cycleId=?
            ORDER BY r.dueDate,r.createdAt`,
          [institutionId, testingCycleId]
        )
      : all(
          db,
          `SELECT r.*
             FROM ICOFREvidenceRequest r
             JOIN ICOFRSamplingPlan p ON p.id=r.samplingPlanId
            WHERE p.institutionId=? AND p.period=?
            ORDER BY r.dueDate,r.createdAt`,
          [institutionId, testingPeriod]
        ),
    testingCycleId
      ? all(
          db,
          'SELECT * FROM ICOFRWorkpaperReview WHERE institutionId=? AND testingCycleId=? ORDER BY updatedAt',
          [institutionId, testingCycleId]
        )
      : all(
          db,
          'SELECT * FROM ICOFRWorkpaperReview WHERE institutionId=? AND period=? ORDER BY updatedAt',
          [institutionId, testingPeriod]
        ),
    testingCycleId
      ? all(
          db,
          `SELECT n.*
             FROM ICOFRWorkpaperReviewNote n
             JOIN ICOFRWorkpaperReview r ON r.id=n.reviewId
            WHERE r.institutionId=? AND r.testingCycleId=?
            ORDER BY n.createdAt`,
          [institutionId, testingCycleId]
        )
      : all(
          db,
          `SELECT n.*
             FROM ICOFRWorkpaperReviewNote n
             JOIN ICOFRWorkpaperReview r ON r.id=n.reviewId
            WHERE r.institutionId=? AND r.period=?
            ORDER BY n.createdAt`,
          [institutionId, testingPeriod]
        ),
    testingCycleId
      ? all(
          db,
          `SELECT e.*
             FROM ICOFRWorkpaperEvidenceIndex e
             JOIN ICOFRWorkpaperReview r ON r.id=e.reviewId
            WHERE r.institutionId=? AND r.testingCycleId=?
            ORDER BY e.createdAt`,
          [institutionId, testingCycleId]
        )
      : all(
          db,
          `SELECT e.*
             FROM ICOFRWorkpaperEvidenceIndex e
             JOIN ICOFRWorkpaperReview r ON r.id=e.reviewId
            WHERE r.institutionId=? AND r.period=?
            ORDER BY e.createdAt`,
          [institutionId, testingPeriod]
        ),
    all(db, 'SELECT * FROM ICOFRDesignAssessment WHERE institutionId=? AND period=? ORDER BY createdAt', [institutionId, testingPeriod]),
    all(
      db,
      `SELECT t.*
         FROM ToETest t
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE c.institutionId=? AND t.period=?
        ORDER BY t.testedAt`,
      [institutionId, testingPeriod]
    ),
    all(
      db,
      `SELECT s.*
         FROM TestSample s
         JOIN ToETest t ON t.id=s.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE c.institutionId=? AND t.period=?
        ORDER BY s.toeTestId,s.sampleNumber`,
      [institutionId, testingPeriod]
    ),
    all(
      db,
      `SELECT e.*
         FROM TestingException e
         JOIN ToETest t ON t.id=e.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE c.institutionId=? AND t.period=?
        ORDER BY e.createdAt`,
      [institutionId, testingPeriod]
    ),
    all(
      db,
      `SELECT d.*
         FROM ControlDeficiency d
         JOIN TestingException e ON e.id=d.exceptionId
         JOIN ToETest t ON t.id=e.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE c.institutionId=? AND t.period=?
        ORDER BY d.createdAt`,
      [institutionId, testingPeriod]
    ),
    all(
      db,
      `SELECT i.*
         FROM Issue i
         JOIN ControlDeficiency d ON d.id=i.deficiencyId
         JOIN TestingException e ON e.id=d.exceptionId
         JOIN ToETest t ON t.id=e.toeTestId
        WHERE i.institutionId=? AND t.period=?
        ORDER BY i.createdAt`,
      [institutionId, testingPeriod]
    ),
    all(
      db,
      `SELECT m.*
         FROM ManagementActionPlan m
         JOIN Issue i ON i.id=m.issueId
         JOIN ControlDeficiency d ON d.id=i.deficiencyId
         JOIN TestingException e ON e.id=d.exceptionId
         JOIN ToETest t ON t.id=e.toeTestId
        WHERE i.institutionId=? AND t.period=?
        ORDER BY m.createdAt`,
      [institutionId, testingPeriod]
    ),
    all(
      db,
      `SELECT mm.*
         FROM MAPMilestone mm
         JOIN ManagementActionPlan m ON m.id=mm.mapId
         JOIN Issue i ON i.id=m.issueId
         JOIN ControlDeficiency d ON d.id=i.deficiencyId
         JOIN TestingException e ON e.id=d.exceptionId
         JOIN ToETest t ON t.id=e.toeTestId
        WHERE i.institutionId=? AND t.period=?
        ORDER BY mm.createdAt`,
      [institutionId, testingPeriod]
    ),
    all(
      db,
      `SELECT r.*
         FROM RetestRecord r
         JOIN ManagementActionPlan m ON m.id=r.mapId
         JOIN Issue i ON i.id=m.issueId
         JOIN ControlDeficiency d ON d.id=i.deficiencyId
         JOIN TestingException e ON e.id=d.exceptionId
         JOIN ToETest t ON t.id=e.toeTestId
        WHERE i.institutionId=? AND t.period=?
        ORDER BY r.retestedAt`,
      [institutionId, testingPeriod]
    ),
    all(db, 'SELECT * FROM ICOFRSubCertification WHERE institutionId=? AND scopeId=? AND period=? ORDER BY subjectType,subjectId', [institutionId, scopeId, period]),
    all(db, 'SELECT * FROM ICOFRManagementAttestation WHERE institutionId=? AND scopeId=? AND period=? ORDER BY updatedAt', [institutionId, scopeId, period]),
    all(
      db,
      `SELECT e.*
         FROM ICOFREvidencePack e
         JOIN ICOFRManagementAttestation a ON a.id=e.attestationId
        WHERE e.institutionId=? AND a.scopeId=? AND a.period=?
        ORDER BY e.updatedAt`,
      [institutionId, scopeId, period]
    ),
    all(db, 'SELECT * FROM ICOFRExecutiveReportPack WHERE institutionId=? AND period=? ORDER BY updatedAt', [institutionId, period]),
    all(db, 'SELECT * FROM ICOFRExternalAuditReliance WHERE institutionId=? AND period=? ORDER BY updatedAt', [institutionId, period]),
    all(db, 'SELECT * FROM ICOFRPBCRequest WHERE institutionId=? AND period=? ORDER BY requestNo', [institutionId, period]),
    all(db, 'SELECT * FROM EvidenceDocument WHERE institutionId=? ORDER BY evidenceId', [institutionId]),
    all(db, 'SELECT * FROM EvidenceVersion WHERE institutionId=? ORDER BY documentId,versionNo', [institutionId]),
    all(db, 'SELECT * FROM EvidenceLink WHERE institutionId=? ORDER BY createdAt', [institutionId])
  ]);

  const attestation = attestations.find(item => String(item.id) === attestationId) || null;

  const snapshotTargetKeys = new Set<string>();
  const addTargets = (type: string, rows: Array<Record<string, unknown>>, idKey = 'id') => {
    for (const row of rows) {
      const id = row[idKey];
      if (id) snapshotTargetKeys.add(type + ':' + String(id));
    }
  };

  addTargets('TESTING_PLAN_ITEM', planItems);
  addTargets('SAMPLING_PLAN', samplingPlans);
  addTargets('WORKPAPER_REVIEW', workpaperReviews);
  addTargets('WORKPAPER_EVIDENCE', workpaperEvidenceIndex);
  addTargets('TOD', designAssessments);
  addTargets('TOE', toeTests);
  addTargets('TOE_SAMPLE', testSamples);
  addTargets('DEFICIENCY', deficiencies);
  addTargets('MAP', maps);
  addTargets('SUB_CERTIFICATION', subCertifications);
  addTargets('ATTESTATION', attestations);
  addTargets('EVIDENCE_PACK', evidencePacks);
  addTargets('PBC_REQUEST', pbcRequests);
  addTargets('CONTROL', controlMasters);
  addTargets('RISK', riskMasters);
  addTargets('PROCESS', []);
  addTargets('SCOPE', scope ? [scope] : []);

  const evidenceLinks = evidenceLinksAll.filter(link =>
    snapshotTargetKeys.has(String(link.entityType) + ':' + String(link.entityId))
  );
  const evidenceDocumentIds = new Set(evidenceLinks.map(link => String(link.documentId)));
  const evidenceVersionIds = new Set(evidenceLinks.map(link => String(link.versionId || '')));
  const evidenceDocuments = evidenceDocumentsAll.filter(item =>
    evidenceDocumentIds.has(String(item.id))
  );
  const evidenceVersions = evidenceVersionsAll.filter(item =>
    evidenceDocumentIds.has(String(item.documentId)) &&
    (evidenceVersionIds.size === 0 || evidenceVersionIds.has(String(item.id)))
  );

  return [
    {
      snapshotType: 'SCOPE',
      content: {
        scope,
        scopeItems
      }
    },
    {
      snapshotType: 'FINANCIAL_REPORTING',
      content: {
        financialItems,
        assertions,
        traceabilityLinks
      }
    },
    {
      snapshotType: 'RCM_AND_CONTROLS',
      content: {
        controlDomains,
        informationRegisters,
        riskMasters,
        controlMasters,
        controlRiskMappings
      }
    },
    {
      snapshotType: 'TESTING_AND_DEFICIENCIES',
      content: {
        testingCycle: cycle,
        testingPeriod,
        planItems,
        samplingPlans,
        samplingCandidates,
        samplingEvidenceRequests,
        workpaperReviews,
        workpaperReviewNotes,
        workpaperEvidenceIndex,
        designAssessments,
        toeTests,
        testSamples,
        testingExceptions,
        deficiencies,
        issues,
        managementActionPlans: maps,
        milestones,
        retests
      }
    },
    {
      snapshotType: 'EVIDENCE_REPOSITORY',
      content: {
        documents: evidenceDocuments,
        versions: evidenceVersions,
        links: evidenceLinks
      }
    },
    {
      snapshotType: 'CERTIFICATION',
      content: {
        selectedAttestation: attestation,
        subCertifications,
        attestations,
        evidencePacks
      }
    },
    {
      snapshotType: 'REPORTING_AND_AUDIT',
      content: {
        reportPacks,
        relianceMappings,
        pbcRequests
      }
    }
  ];
}

async function currentActiveReopen(db: D1DatabaseLike, closeId: string) {
  return first<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRReopenRequest
      WHERE closeId=? AND status='Approved' AND reopenedUntil>=?
      ORDER BY reviewedAt DESC LIMIT 1`,
    [closeId, nowIso()]
  );
}

export async function closeIcofrPeriod(input: Record<string, unknown>) {
  const db = await ensureIcofrPeriodCloseSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const scopeId = String(input.scopeId || '').trim();
  const testingCycleId = clean(input.testingCycleId);
  const attestationId = String(input.attestationId || '').trim();
  const period = String(input.period || '').trim();
  const closeName = String(input.closeName || '').trim();
  const closeReason = String(input.closeReason || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();
  const reviewerName = String(input.reviewerName || '').trim();
  const approvedBy = String(input.approvedBy || '').trim();
  const freezeConfirmed = bool(input.freezeConfirmed);

  if (
    !scopeId ||
    !attestationId ||
    !period ||
    !closeName ||
    !closeReason ||
    !preparedBy ||
    !reviewerName ||
    !approvedBy ||
    !freezeConfirmed
  ) {
    throw new Error('CLOSE_REQUIRED');
  }

  if (
    preparedBy.toLowerCase() === reviewerName.toLowerCase() ||
    preparedBy.toLowerCase() === approvedBy.toLowerCase() ||
    reviewerName.toLowerCase() === approvedBy.toLowerCase()
  ) {
    throw new Error('MAKER_CHECKER_REQUIRED');
  }

  const scope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
    [scopeId, institution.id]
  );
  if (!scope) throw new Error('SCOPE_NOT_FOUND');

  const cycle = testingCycleId
    ? await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRTestingCycle WHERE id=? AND institutionId=? AND scopeId=? LIMIT 1',
        [testingCycleId, institution.id, scopeId]
      )
    : null;
  if (testingCycleId && !cycle) throw new Error('CYCLE_NOT_FOUND');

  const attestation = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRManagementAttestation
      WHERE id=? AND institutionId=? AND scopeId=? AND period=?
      LIMIT 1`,
    [attestationId, institution.id, scopeId, period]
  );
  if (!attestation) throw new Error('ATTESTATION_NOT_FOUND');
  if (!bool(attestation.cfoSignOff) || !bool(attestation.ceoSignOff)) {
    throw new Error('ATTESTATION_NOT_SIGNED');
  }

  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRPeriodClose
      WHERE institutionId=? AND scopeId=? AND period=?
      LIMIT 1`,
    [institution.id, scopeId, period]
  );

  const activeReopen = existing ? await currentActiveReopen(db, String(existing.id)) : null;
  if (existing && !activeReopen) throw new Error('PERIOD_ALREADY_CLOSED');

  const versionRow = existing
    ? await first<{ nextVersion?: number }>(
        db,
        'SELECT COALESCE(MAX(snapshotVersion),0)+1 AS nextVersion FROM ICOFRPeriodSnapshot WHERE closeId=?',
        [existing.id]
      )
    : null;
  const snapshotVersion = Number(versionRow?.nextVersion || 1);
  const closeId = existing ? String(existing.id) : crypto.randomUUID();
  const testingPeriod = cycle
    ? String(cycle.fiscalYear) + ' ' + String(cycle.reportingPeriod)
    : period;
  const sections = await captureSnapshotSections(
    db,
    String(institution.id),
    scopeId,
    testingCycleId,
    attestationId,
    period
  );

  const createdAt = nowIso();
  const hashes: string[] = [];
  let totalRecords = 0;

  for (const section of sections) {
    const contentJson = JSON.stringify(section.content);
    const contentHash = await sha256(contentJson);
    const recordCount = countRecords(section.content);
    totalRecords += recordCount;
    hashes.push(section.snapshotType + ':' + contentHash);

    await run(
      db,
      `INSERT INTO ICOFRPeriodSnapshot (
        id,closeId,institutionId,snapshotVersion,snapshotType,recordCount,
        contentJson,contentHash,createdAt,createdBy
      ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        closeId,
        institution.id,
        snapshotVersion,
        section.snapshotType,
        recordCount,
        contentJson,
        contentHash,
        createdAt,
        preparedBy
      ]
    );
  }

  const latestSnapshotHash = await sha256(hashes.sort().join('|'));
  const closeRecord = {
    id: closeId,
    institutionId: String(institution.id),
    scopeId,
    testingCycleId,
    attestationId,
    period,
    testingPeriod,
    closeName,
    closeReason,
    preparedBy,
    reviewerName,
    approvedBy,
    status: 'Closed',
    snapshotVersion,
    latestSnapshotHash,
    closedAt: createdAt,
    updatedAt: createdAt
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRPeriodClose SET
        testingCycleId=?,attestationId=?,testingPeriod=?,closeName=?,closeReason=?,preparedBy=?,
        reviewerName=?,approvedBy=?,status='Closed',snapshotVersion=?,latestSnapshotHash=?,
        closedAt=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        testingCycleId,
        attestationId,
        testingPeriod,
        closeName,
        closeReason,
        preparedBy,
        reviewerName,
        approvedBy,
        snapshotVersion,
        latestSnapshotHash,
        createdAt,
        createdAt,
        closeId,
        institution.id
      ]
    );

    await run(
      db,
      `UPDATE ICOFRReopenRequest
        SET status='Closed',closedAt=?,updatedAt=?
        WHERE closeId=? AND status='Approved'`,
      [createdAt, createdAt, closeId]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRPeriodClose (
        id,institutionId,scopeId,testingCycleId,attestationId,period,testingPeriod,closeName,
        closeReason,preparedBy,reviewerName,approvedBy,status,snapshotVersion,
        latestSnapshotHash,closedAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'Closed',?,?,?,?)`,
      [
        closeId,
        institution.id,
        scopeId,
        testingCycleId,
        attestationId,
        period,
        testingPeriod,
        closeName,
        closeReason,
        preparedBy,
        reviewerName,
        approvedBy,
        snapshotVersion,
        latestSnapshotHash,
        createdAt,
        createdAt
      ]
    );
  }

  const result = {
    ...closeRecord,
    snapshotSections: sections.length,
    totalRecords
  };
  await audit(
    db,
    String(institution.id),
    existing ? 'RECLOSE_AND_VERSION' : 'CLOSE_PERIOD',
    'ICOFRPeriodClose',
    closeId,
    result,
    existing || undefined
  );

  return result;
}

export async function requestPeriodReopen(input: Record<string, unknown>) {
  const db = await ensureIcofrPeriodCloseSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const closeId = String(input.closeId || '').trim();
  const requestedBy = String(input.requestedBy || '').trim();
  const reason = String(input.reason || '').trim();
  const impactAssessment = String(input.impactAssessment || '').trim();
  const requestedUntil = String(input.requestedUntil || '').trim();

  if (!closeId || !requestedBy || !reason || !impactAssessment || !requestedUntil) {
    throw new Error('REOPEN_REQUIRED');
  }
  if (requestedUntil <= nowIso()) throw new Error('INVALID_REOPEN_UNTIL');

  const close = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRPeriodClose WHERE id=? AND institutionId=? LIMIT 1',
    [closeId, institution.id]
  );
  if (!close) throw new Error('CLOSE_NOT_FOUND');

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRReopenRequest
      WHERE closeId=? AND status IN ('Pending','Approved')
      LIMIT 1`,
    [closeId]
  );
  if (duplicate) throw new Error('REOPEN_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    closeId,
    requestedBy,
    reason,
    impactAssessment,
    requestedUntil,
    status: 'Pending',
    approvedBy: null,
    approvalDecision: null,
    approvalComments: null,
    reopenedUntil: null,
    reviewedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO ICOFRReopenRequest (
      id,institutionId,closeId,requestedBy,reason,impactAssessment,requestedUntil,
      status,approvedBy,approvalDecision,approvalComments,reopenedUntil,reviewedAt,
      closedAt,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,'Pending',NULL,NULL,NULL,NULL,NULL,NULL,?,?)`,
    [
      id,
      institution.id,
      closeId,
      requestedBy,
      reason,
      impactAssessment,
      requestedUntil,
      now,
      now
    ]
  );

  await audit(db, String(institution.id), 'REQUEST_REOPEN', 'ICOFRReopenRequest', id, record);
  return record;
}

export async function reviewPeriodReopen(input: Record<string, unknown>) {
  const db = await ensureIcofrPeriodCloseSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const requestId = String(input.requestId || '').trim();
  const approvedBy = String(input.approvedBy || '').trim();
  const decision = String(input.decision || '').trim();
  const approvalComments = String(input.approvalComments || '').trim();
  const reopenedUntil = clean(input.reopenedUntil);

  if (!requestId || !approvedBy || !['Approved', 'Rejected'].includes(decision)) {
    throw new Error('REOPEN_REVIEW_REQUIRED');
  }

  const request = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRReopenRequest WHERE id=? AND institutionId=? LIMIT 1',
    [requestId, institution.id]
  );
  if (!request) throw new Error('REOPEN_NOT_FOUND');
  if (String(request.status) !== 'Pending') throw new Error('REOPEN_ALREADY_REVIEWED');
  if (approvedBy.toLowerCase() === String(request.requestedBy).toLowerCase()) {
    throw new Error('REOPEN_SELF_APPROVAL');
  }

  if (decision === 'Approved') {
    if (!reopenedUntil) throw new Error('REOPEN_UNTIL_REQUIRED');
    if (reopenedUntil <= nowIso()) throw new Error('INVALID_REOPEN_UNTIL');
    if (reopenedUntil > String(request.requestedUntil)) {
      throw new Error('REOPEN_EXCEEDS_REQUEST');
    }
  }

  const now = nowIso();
  const status = decision;
  await run(
    db,
    `UPDATE ICOFRReopenRequest SET
      status=?,approvedBy=?,approvalDecision=?,approvalComments=?,reopenedUntil=?,
      reviewedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      status,
      approvedBy,
      decision,
      approvalComments || null,
      decision === 'Approved' ? reopenedUntil : null,
      now,
      now,
      requestId,
      institution.id
    ]
  );

  const result = {
    ...request,
    status,
    approvedBy,
    approvalDecision: decision,
    approvalComments: approvalComments || null,
    reopenedUntil: decision === 'Approved' ? reopenedUntil : null,
    reviewedAt: now,
    updatedAt: now
  };
  await audit(db, String(institution.id), 'REVIEW_REOPEN', 'ICOFRReopenRequest', requestId, result, request);
  return result;
}

export async function getPeriodCloseData() {
  const db = await ensureIcofrPeriodCloseSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      scopes: [],
      cycles: [],
      attestations: [],
      closes: [],
      reopenRequests: [],
      snapshots: [],
      metrics: {}
    };
  }

  const [scopes, cycles, attestations, closes, reopenRequests, snapshots] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRScope WHERE institutionId=? ORDER BY fiscalYear DESC,updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingCycle WHERE institutionId=? ORDER BY fiscalYear DESC,startDate DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT * FROM ICOFRManagementAttestation
        WHERE institutionId=?
        ORDER BY period DESC,updatedAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRPeriodClose WHERE institutionId=? ORDER BY closedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRReopenRequest WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT id,closeId,institutionId,snapshotVersion,snapshotType,recordCount,
              contentHash,createdAt,createdBy
         FROM ICOFRPeriodSnapshot
        WHERE institutionId=?
        ORDER BY createdAt DESC,snapshotType ASC`,
      [institution.id]
    )
  ]);

  const scopeById = new Map(scopes.map(item => [String(item.id), item]));
  const cycleById = new Map(cycles.map(item => [String(item.id), item]));
  const attestationById = new Map(attestations.map(item => [String(item.id), item]));

  const enrichedCloses = await Promise.all(
    closes.map(async close => {
      const lockState = await getIcofrPeriodLockState({
        institutionId: String(institution.id),
        scopeId: String(close.scopeId)
      });
      const closeSnapshots = snapshots.filter(item => String(item.closeId) === String(close.id));
      return {
        ...close,
        scope: scopeById.get(String(close.scopeId)) || null,
        cycle: close.testingCycleId ? cycleById.get(String(close.testingCycleId)) || null : null,
        attestation: attestationById.get(String(close.attestationId)) || null,
        locked: lockState.locked,
        activeReopen: lockState.reopen,
        snapshotCount: closeSnapshots.length,
        versions: Array.from(new Set(closeSnapshots.map(item => Number(item.snapshotVersion)))).sort(
          (a, b) => b - a
        )
      };
    })
  );

  const now = nowIso();
  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    scopes,
    cycles,
    attestations: attestations.map(item => ({
      ...item,
      cfoSignOff: bool(item.cfoSignOff),
      ceoSignOff: bool(item.ceoSignOff)
    })),
    closes: enrichedCloses,
    reopenRequests,
    snapshots,
    metrics: {
      closedPeriods: closes.length,
      lockedPeriods: enrichedCloses.filter(item => item.locked).length,
      temporarilyReopened: enrichedCloses.filter(item => !item.locked).length,
      pendingReopenRequests: reopenRequests.filter(item => item.status === 'Pending').length,
      snapshotVersions: new Set(
        snapshots.map(item => String(item.closeId) + ':' + String(item.snapshotVersion))
      ).size,
      expiredApprovedReopens: reopenRequests.filter(
        item => item.status === 'Approved' && String(item.reopenedUntil || '') < now
      ).length
    }
  };
}

export async function getPeriodSnapshotBundle(closeId: string, requestedVersion?: number | null) {
  const db = await ensureIcofrPeriodCloseSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const close = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRPeriodClose WHERE id=? AND institutionId=? LIMIT 1',
    [closeId, institution.id]
  );
  if (!close) throw new Error('CLOSE_NOT_FOUND');

  const version =
    requestedVersion && Number.isInteger(requestedVersion)
      ? requestedVersion
      : Number(close.snapshotVersion || 0);

  const snapshots = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRPeriodSnapshot
      WHERE closeId=? AND snapshotVersion=?
      ORDER BY snapshotType ASC`,
    [closeId, version]
  );
  if (!snapshots.length) throw new Error('SNAPSHOT_NOT_FOUND');

  const sections: Record<string, unknown> = {};
  for (const snapshot of snapshots) {
    sections[String(snapshot.snapshotType)] = JSON.parse(String(snapshot.contentJson));
  }

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    close,
    version,
    snapshots: snapshots.map(item => ({
      id: item.id,
      snapshotType: item.snapshotType,
      recordCount: item.recordCount,
      contentHash: item.contentHash,
      createdAt: item.createdAt,
      createdBy: item.createdBy
    })),
    sections
  };
}

function ascii(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(value: unknown, width = 88) {
  const text = ascii(value).replace(/\s+/g, ' ').trim();
  if (!text) return [''];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? current + ' ' + word : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildPdfBytes(lines: string[]) {
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += 46) {
    pages.push(lines.slice(i, i + 46));
  }
  if (!pages.length) pages.push(['']);

  const objects: string[] = [];
  const fontObject = 3;
  const pageRefs: number[] = [];

  for (let i = 0; i < pages.length; i += 1) {
    pageRefs.push(4 + i * 2);
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs.map(ref => ref + ' 0 R').join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  for (let i = 0; i < pages.length; i += 1) {
    const pageObject = 4 + i * 2;
    const contentObject = pageObject + 1;
    const stream =
      'BT\n/F1 10 Tf\n50 795 Td\n14 TL\n' +
      pages[i].map(line => '(' + ascii(line) + ') Tj\nT*').join('') +
      'ET';
    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] =
      `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = new TextEncoder().encode(pdf).length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i += 1) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function arrayFromSection(section: unknown, key: string): Array<Record<string, unknown>> {
  if (!section || typeof section !== 'object') return [];
  const value = (section as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export async function buildBoardAuditCommitteePdf(closeId: string, version?: number | null) {
  const bundle = await getPeriodSnapshotBundle(closeId, version);
  const scopeSection = bundle.sections.SCOPE as Record<string, unknown> | undefined;
  const testingSection = bundle.sections.TESTING_AND_DEFICIENCIES as Record<string, unknown> | undefined;
  const certificationSection = bundle.sections.CERTIFICATION as Record<string, unknown> | undefined;
  const reportingSection = bundle.sections.REPORTING_AND_AUDIT as Record<string, unknown> | undefined;
  const controlsSection = bundle.sections.RCM_AND_CONTROLS as Record<string, unknown> | undefined;
  const evidenceRepositorySection = bundle.sections.EVIDENCE_REPOSITORY as Record<string, unknown> | undefined;

  const scope = scopeSection?.scope as Record<string, unknown> | undefined;
  const controlDomains = arrayFromSection(controlsSection, 'controlDomains');
  const keyControls = controlDomains.filter(item => bool(item.keyControl));
  const tod = arrayFromSection(testingSection, 'designAssessments');
  const toe = arrayFromSection(testingSection, 'toeTests');
  const samplingPlans = arrayFromSection(testingSection, 'samplingPlans');
  const samplingCandidates = arrayFromSection(testingSection, 'samplingCandidates');
  const samplingEvidenceRequests = arrayFromSection(testingSection, 'samplingEvidenceRequests');
  const workpaperReviews = arrayFromSection(testingSection, 'workpaperReviews');
  const workpaperReviewNotes = arrayFromSection(testingSection, 'workpaperReviewNotes');
  const workpaperEvidenceIndex = arrayFromSection(testingSection, 'workpaperEvidenceIndex');
  const deficiencies = arrayFromSection(testingSection, 'deficiencies');
  const maps = arrayFromSection(testingSection, 'managementActionPlans');
  const attestations = arrayFromSection(certificationSection, 'attestations');
  const reliance = arrayFromSection(reportingSection, 'relianceMappings');
  const pbc = arrayFromSection(reportingSection, 'pbcRequests');
  const reportPacks = arrayFromSection(reportingSection, 'reportPacks');
  const repositoryDocuments = arrayFromSection(evidenceRepositorySection, 'documents');
  const repositoryVersions = arrayFromSection(evidenceRepositorySection, 'versions');
  const repositoryLinks = arrayFromSection(evidenceRepositorySection, 'links');

  const managementAttestation =
    (certificationSection?.selectedAttestation as Record<string, unknown> | null | undefined) ||
    attestations[0] ||
    null;

  const significant = deficiencies.filter(item =>
    ['Significant Deficiency', 'Material Weakness'].includes(String(item.classification))
  );
  const openMaps = maps.filter(item => !['Closed', 'Completed', 'Cancelled'].includes(String(item.status)));
  const openPbc = pbc.filter(item => !['Accepted', 'Closed', 'Cancelled'].includes(String(item.status)));

  const lines: string[] = [
    'TOTAL ARC - ICOFR BOARD / AUDIT COMMITTEE PERIOD-CLOSE PACK',
    '',
    'Institution: ' + ascii(bundle.institution.legalName || bundle.institution.name || ''),
    'Close: ' + ascii(bundle.close.closeName),
    'Period: ' + ascii(bundle.close.period),
    'Snapshot version: ' + String(bundle.version),
    'Closed at: ' + ascii(bundle.close.closedAt),
    'Approved by: ' + ascii(bundle.close.approvedBy),
    'Immutable snapshot hash: ' + ascii(bundle.close.latestSnapshotHash),
    '',
    'SCOPE & MATERIALITY',
    'Scope: ' + ascii(scope?.scopeName || ''),
    'Fiscal year / reporting period: ' + ascii(scope?.fiscalYear || '') + ' / ' + ascii(scope?.reportingPeriod || ''),
    'Overall materiality: ' + ascii(scope?.currency || '') + ' ' + ascii(scope?.overallMaterialityAmount || ''),
    'Performance materiality: ' + ascii(scope?.currency || '') + ' ' + ascii(scope?.performanceMaterialityAmount || ''),
    '',
    'CONTROL & TESTING SNAPSHOT',
    'ICOFR controls: ' + controlDomains.length,
    'Key ICOFR controls: ' + keyControls.length,
    'ToD workpapers captured: ' + tod.length,
    'ToE workpapers captured: ' + toe.length,
    'Sampling plans captured: ' + samplingPlans.length,
    'Selected sampling candidates: ' + samplingCandidates.filter(item => bool(item.selected)).length,
    'Sampling evidence requests: ' + samplingEvidenceRequests.length,
    'Workpaper reviews captured: ' + workpaperReviews.length,
    'Approved workpaper reviews: ' + workpaperReviews.filter(item => String(item.status) === 'Approved').length,
    'Open workpaper review notes: ' + workpaperReviewNotes.filter(item => !['Cleared','Waived'].includes(String(item.status))).length,
    'Workpaper evidence-index records: ' + workpaperEvidenceIndex.length,
    'Enterprise evidence documents linked to this snapshot: ' + repositoryDocuments.length,
    'Pinned enterprise evidence versions: ' + repositoryVersions.length,
    'Enterprise evidence traceability links: ' + repositoryLinks.length,
    'Control deficiencies captured: ' + deficiencies.length,
    'Significant deficiencies / material weaknesses: ' + significant.length,
    'Open MAP at snapshot: ' + openMaps.length,
    '',
    'MANAGEMENT CERTIFICATION',
    'Management conclusion: ' + ascii(managementAttestation?.overallConclusion || 'Not recorded'),
    'CFO sign-off: ' + (bool(managementAttestation?.cfoSignOff) ? 'Recorded' : 'Not recorded'),
    'CEO sign-off: ' + (bool(managementAttestation?.ceoSignOff) ? 'Recorded' : 'Not recorded'),
    '',
    'EXTERNAL AUDIT / PBC',
    'Reliance mappings: ' + reliance.length,
    'PBC requests: ' + pbc.length,
    'Open PBC at snapshot: ' + openPbc.length,
    'Executive report packs: ' + reportPacks.length,
    '',
    'SIGNIFICANT DEFICIENCY DETAIL'
  ];

  if (!significant.length) {
    lines.push('No Significant Deficiency / Material Weakness record captured in this snapshot.');
  } else {
    for (const item of significant.slice(0, 20)) {
      lines.push(
        ...wrapText(
          String(item.deficiencyId || '') +
            ' | ' +
            String(item.classification || '') +
            ' | ' +
            String(item.title || '')
        )
      );
    }
  }

  lines.push('', 'SNAPSHOT INDEX');
  for (const snapshot of bundle.snapshots) {
    lines.push(
      ...wrapText(
        String(snapshot.snapshotType) +
          ' | records=' +
          String(snapshot.recordCount) +
          ' | SHA-256=' +
          String(snapshot.contentHash)
      )
    );
  }

  lines.push(
    '',
    'This pack is generated from the selected immutable period-close snapshot. It does not create or alter management conclusions, audit reliance conclusions, testing results or evidence.'
  );

  return {
    bytes: buildPdfBytes(lines),
    filename:
      'TotalARC-ICOFR-Board-Pack-' +
      ascii(bundle.close.period).replace(/[^A-Za-z0-9_-]+/g, '-') +
      '-v' +
      bundle.version +
      '.pdf'
  };
}

function xmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function excelCell(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  if (typeof value === 'boolean') {
    return `<Cell><Data ss:Type="String">${value ? 'Yes' : 'No'}</Data></Cell>`;
  }
  if (value && typeof value === 'object') {
    return `<Cell><Data ss:Type="String">${xmlEscape(JSON.stringify(value))}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function worksheet(name: string, rows: Array<Record<string, unknown>>) {
  const safeName = name.replace(/[\\/:*?\[\]]/g, ' ').slice(0, 31) || 'Sheet';
  const keys = Array.from(
    new Set(rows.flatMap(row => Object.keys(row)))
  ).slice(0, 40);

  const header = keys.length
    ? '<Row>' + keys.map(key => excelCell(key)).join('') + '</Row>'
    : '<Row>' + excelCell('No records') + '</Row>';
  const body = rows
    .map(row => '<Row>' + keys.map(key => excelCell(row[key])).join('') + '</Row>')
    .join('');

  return `<Worksheet ss:Name="${xmlEscape(safeName)}"><Table>${header}${body}</Table></Worksheet>`;
}

export async function buildExternalAuditorExcel(closeId: string, version?: number | null) {
  const bundle = await getPeriodSnapshotBundle(closeId, version);
  const sections = bundle.sections;

  const indexRows = bundle.snapshots.map(item => ({
    SnapshotVersion: bundle.version,
    SnapshotType: item.snapshotType,
    RecordCount: Number(item.recordCount || 0),
    SHA256: item.contentHash,
    CreatedAt: item.createdAt,
    CreatedBy: item.createdBy
  }));

  const financial = sections.FINANCIAL_REPORTING as Record<string, unknown> | undefined;
  const controls = sections.RCM_AND_CONTROLS as Record<string, unknown> | undefined;
  const testing = sections.TESTING_AND_DEFICIENCIES as Record<string, unknown> | undefined;
  const certification = sections.CERTIFICATION as Record<string, unknown> | undefined;
  const reporting = sections.REPORTING_AND_AUDIT as Record<string, unknown> | undefined;
  const evidenceRepository = sections.EVIDENCE_REPOSITORY as Record<string, unknown> | undefined;

  const sheets = [
    worksheet('Snapshot Index', indexRows),
    worksheet('Financial Items', arrayFromSection(financial, 'financialItems')),
    worksheet('Assertions', arrayFromSection(financial, 'assertions')),
    worksheet('Traceability', arrayFromSection(financial, 'traceabilityLinks')),
    worksheet('ICOFR Controls', arrayFromSection(controls, 'controlDomains')),
    worksheet('Risk Master', arrayFromSection(controls, 'riskMasters')),
    worksheet('Control Master', arrayFromSection(controls, 'controlMasters')),
    worksheet('RCM Mapping', arrayFromSection(controls, 'controlRiskMappings')),
    worksheet('IPE EUC', arrayFromSection(controls, 'informationRegisters')),
    worksheet('Testing Plan', arrayFromSection(testing, 'planItems')),
    worksheet('Sampling Plans', arrayFromSection(testing, 'samplingPlans')),
    worksheet('Sampling Population', arrayFromSection(testing, 'samplingCandidates')),
    worksheet('Evidence Requests', arrayFromSection(testing, 'samplingEvidenceRequests')),
    worksheet('Workpaper Reviews', arrayFromSection(testing, 'workpaperReviews')),
    worksheet('Review Notes', arrayFromSection(testing, 'workpaperReviewNotes')),
    worksheet('Workpaper Evidence', arrayFromSection(testing, 'workpaperEvidenceIndex')),
    worksheet('Evidence Repository', arrayFromSection(evidenceRepository, 'documents')),
    worksheet('Evidence Versions', arrayFromSection(evidenceRepository, 'versions')),
    worksheet('Evidence Links', arrayFromSection(evidenceRepository, 'links')),
    worksheet('ToD', arrayFromSection(testing, 'designAssessments')),
    worksheet('ToE', arrayFromSection(testing, 'toeTests')),
    worksheet('Samples', arrayFromSection(testing, 'testSamples')),
    worksheet('Exceptions', arrayFromSection(testing, 'testingExceptions')),
    worksheet('Deficiencies', arrayFromSection(testing, 'deficiencies')),
    worksheet('Issues', arrayFromSection(testing, 'issues')),
    worksheet('MAP', arrayFromSection(testing, 'managementActionPlans')),
    worksheet('Sub-Certifications', arrayFromSection(certification, 'subCertifications')),
    worksheet('Attestations', arrayFromSection(certification, 'attestations')),
    worksheet('Evidence Packs', arrayFromSection(certification, 'evidencePacks')),
    worksheet('Audit Reliance', arrayFromSection(reporting, 'relianceMappings')),
    worksheet('PBC Requests', arrayFromSection(reporting, 'pbcRequests'))
  ];

  const xml =
    '<?xml version="1.0"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    sheets.join('') +
    '</Workbook>';

  return {
    content: xml,
    filename:
      'TotalARC-ICOFR-External-Auditor-Evidence-' +
      ascii(bundle.close.period).replace(/[^A-Za-z0-9_-]+/g, '-') +
      '-v' +
      bundle.version +
      '.xls'
  };
}
