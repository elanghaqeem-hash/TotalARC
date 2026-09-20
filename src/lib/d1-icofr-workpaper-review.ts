import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureIcofrTestingPlanSchema } from '@/lib/d1-icofr-testing-plan';
import { ensureIcofrTraceabilitySchema } from '@/lib/d1-icofr-traceability';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';
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

const WORKPAPER_TYPES = ['ToD', 'ToE'] as const;
const CONCLUSIONS = ['Effective', 'Partially Effective', 'Ineffective'] as const;
const EVIDENCE_DECISIONS = ['Pending', 'Accepted', 'Rejected'] as const;
const NOTE_SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const;

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
  await ensureIcofrTestingPlanSchema();
  await ensureIcofrTraceabilitySchema();
  await ensureAssuranceSchema();
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

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrWorkpaperReviewSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRWorkpaperReview (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        workpaperType TEXT NOT NULL,
        workpaperId TEXT NOT NULL,
        testingCycleId TEXT,
        planItemId TEXT,
        period TEXT NOT NULL,
        preparedBy TEXT NOT NULL,
        reviewerName TEXT,
        scopeObjectiveComplete INTEGER NOT NULL DEFAULT 0,
        proceduresComplete INTEGER NOT NULL DEFAULT 0,
        evidenceIndexed INTEGER NOT NULL DEFAULT 0,
        exceptionsEvaluated INTEGER NOT NULL DEFAULT 0,
        crossReferencesComplete INTEGER NOT NULL DEFAULT 0,
        conclusionSupported INTEGER NOT NULL DEFAULT 0,
        preparerConclusion TEXT NOT NULL DEFAULT 'Not Assessed',
        preparerNotes TEXT,
        reviewerDecision TEXT NOT NULL DEFAULT 'Pending',
        reviewerConclusion TEXT NOT NULL DEFAULT 'Not Assessed',
        reviewerComments TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        submittedAt TEXT,
        reviewedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_workpaper_review_unique
        ON ICOFRWorkpaperReview(institutionId,workpaperType,workpaperId);
      CREATE INDEX IF NOT EXISTS idx_icofr_workpaper_review_cycle
        ON ICOFRWorkpaperReview(institutionId,testingCycleId,status);
      CREATE INDEX IF NOT EXISTS idx_icofr_workpaper_review_period
        ON ICOFRWorkpaperReview(institutionId,period,status);

      CREATE TABLE IF NOT EXISTS ICOFRWorkpaperEvidenceIndex (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        reviewId TEXT NOT NULL,
        evidenceRef TEXT NOT NULL,
        evidenceType TEXT NOT NULL,
        description TEXT NOT NULL,
        source TEXT,
        owner TEXT NOT NULL,
        reviewerDecision TEXT NOT NULL DEFAULT 'Pending',
        reviewerName TEXT,
        reviewerNotes TEXT,
        reviewedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_workpaper_evidence_unique
        ON ICOFRWorkpaperEvidenceIndex(reviewId,evidenceRef);
      CREATE INDEX IF NOT EXISTS idx_icofr_workpaper_evidence_review
        ON ICOFRWorkpaperEvidenceIndex(institutionId,reviewId,reviewerDecision);

      CREATE TABLE IF NOT EXISTS ICOFRWorkpaperReviewNote (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        reviewId TEXT NOT NULL,
        noteNo TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'Medium',
        raisedBy TEXT NOT NULL,
        owner TEXT NOT NULL,
        dueDate TEXT,
        status TEXT NOT NULL DEFAULT 'Open',
        response TEXT,
        responseBy TEXT,
        respondedAt TEXT,
        clearanceDecision TEXT,
        clearanceComment TEXT,
        clearedBy TEXT,
        clearedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_review_note_no
        ON ICOFRWorkpaperReviewNote(institutionId,noteNo);
      CREATE INDEX IF NOT EXISTS idx_icofr_review_note_review
        ON ICOFRWorkpaperReviewNote(institutionId,reviewId,status,dueDate);
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
      'ICOFRWorkpaperReview',
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      'ICOFR ToD/ToE workpaper preparation, supervisory review, review-note clearance and quality-gate governance.',
      null,
      nowIso()
    ]
  );
}

async function workpaperContext(
  db: D1DatabaseLike,
  institutionId: string,
  workpaperType: string,
  workpaperId: string
) {
  if (!WORKPAPER_TYPES.includes(workpaperType as typeof WORKPAPER_TYPES[number])) {
    throw new Error('INVALID_WORKPAPER_TYPE');
  }

  if (workpaperType === 'ToD') {
    return first<Record<string, unknown>>(
      db,
      `SELECT
          d.id AS workpaperId,
          d.testId AS workpaperRef,
          d.period,
          d.testerName,
          d.reviewerName AS sourceReviewerName,
          d.conclusion AS sourceConclusion,
          d.status AS sourceStatus,
          d.controlDomainId,
          cd.controlCode,
          cd.name AS controlName,
          cd.category,
          cd.sourceControlId,
          p.id AS planItemId,
          p.cycleId AS testingCycleId,
          p.testType,
          p.testingPhase,
          p.dueDate
        FROM ICOFRDesignAssessment d
        JOIN ICOFRControlDomain cd ON cd.id=d.controlDomainId
        LEFT JOIN ICOFRTestingPlanItem p ON p.todAssessmentId=d.id
        WHERE d.id=? AND d.institutionId=?
        LIMIT 1`,
      [workpaperId, institutionId]
    );
  }

  return first<Record<string, unknown>>(
    db,
    `SELECT
        t.id AS workpaperId,
        t.testId AS workpaperRef,
        t.period,
        t.testerName,
        t.reviewerName AS sourceReviewerName,
        t.testerConclusion AS sourceTesterConclusion,
        t.finalConclusion AS sourceConclusion,
        t.status AS sourceStatus,
        t.controlId AS sourceControlId,
        cm.controlId AS controlCode,
        cm.name AS controlName,
        p.id AS planItemId,
        p.cycleId AS testingCycleId,
        p.controlDomainId,
        p.testType,
        p.testingPhase,
        p.dueDate
      FROM ToETest t
      JOIN ControlMaster cm ON cm.id=t.controlId
      LEFT JOIN ICOFRTestingPlanItem p ON p.toeTestId=t.id
      WHERE t.id=? AND cm.institutionId=?
      LIMIT 1`,
    [workpaperId, institutionId]
  );
}

async function assertReviewPeriodWritable(
  db: D1DatabaseLike,
  institutionId: string,
  reviewOrContext: Record<string, unknown>
) {
  await assertIcofrPeriodWritable({
    institutionId,
    testingCycleId: clean(reviewOrContext.testingCycleId),
    period: String(reviewOrContext.period || '')
  });
}

function checklistComplete(item: Record<string, unknown>) {
  return [
    item.scopeObjectiveComplete,
    item.proceduresComplete,
    item.evidenceIndexed,
    item.exceptionsEvaluated,
    item.crossReferencesComplete,
    item.conclusionSupported
  ].every(bool);
}

export async function saveWorkpaperReview(input: Record<string, unknown>) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const workpaperType = String(input.workpaperType || '').trim();
  const workpaperId = String(input.workpaperId || '').trim();
  const preparedBy = String(input.preparedBy || '').trim();
  const reviewerName = clean(input.reviewerName);
  const preparerConclusion = String(input.preparerConclusion || 'Not Assessed').trim();

  if (!workpaperType || !workpaperId || !preparedBy) throw new Error('REVIEW_REQUIRED');
  if (!['Not Assessed', ...CONCLUSIONS].includes(preparerConclusion as any)) {
    throw new Error('INVALID_CONCLUSION');
  }

  const context = await workpaperContext(
    db,
    String(institution.id),
    workpaperType,
    workpaperId
  );
  if (!context) throw new Error('WORKPAPER_NOT_FOUND');

  await assertReviewPeriodWritable(db, String(institution.id), context);

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperReview WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  if (existing && String(existing.status) === 'Approved') throw new Error('REVIEW_LOCKED');

  const duplicate = await first<Record<string, unknown>>(
    db,
    `SELECT id FROM ICOFRWorkpaperReview
      WHERE institutionId=? AND workpaperType=? AND workpaperId=? AND id<>?
      LIMIT 1`,
    [institution.id, workpaperType, workpaperId, id]
  );
  if (duplicate) throw new Error('REVIEW_CONFLICT');

  if (
    reviewerName &&
    reviewerName.toLowerCase() === preparedBy.toLowerCase()
  ) {
    throw new Error('SELF_REVIEW');
  }

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    workpaperType,
    workpaperId,
    testingCycleId: clean(context.testingCycleId),
    planItemId: clean(context.planItemId),
    period: String(context.period),
    preparedBy,
    reviewerName,
    scopeObjectiveComplete: bool(input.scopeObjectiveComplete),
    proceduresComplete: bool(input.proceduresComplete),
    evidenceIndexed: bool(input.evidenceIndexed),
    exceptionsEvaluated: bool(input.exceptionsEvaluated),
    crossReferencesComplete: bool(input.crossReferencesComplete),
    conclusionSupported: bool(input.conclusionSupported),
    preparerConclusion,
    preparerNotes: clean(input.preparerNotes),
    reviewerDecision: existing?.reviewerDecision || 'Pending',
    reviewerConclusion: existing?.reviewerConclusion || 'Not Assessed',
    reviewerComments: existing?.reviewerComments || null,
    status:
      existing && ['Submitted', 'Under Review', 'Returned'].includes(String(existing.status))
        ? String(existing.status)
        : 'Draft',
    submittedAt: existing?.submittedAt || null,
    reviewedAt: existing?.reviewedAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRWorkpaperReview SET
        workpaperType=?,workpaperId=?,testingCycleId=?,planItemId=?,period=?,
        preparedBy=?,reviewerName=?,scopeObjectiveComplete=?,proceduresComplete=?,
        evidenceIndexed=?,exceptionsEvaluated=?,crossReferencesComplete=?,
        conclusionSupported=?,preparerConclusion=?,preparerNotes=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.workpaperType,
        record.workpaperId,
        record.testingCycleId,
        record.planItemId,
        record.period,
        record.preparedBy,
        record.reviewerName,
        record.scopeObjectiveComplete ? 1 : 0,
        record.proceduresComplete ? 1 : 0,
        record.evidenceIndexed ? 1 : 0,
        record.exceptionsEvaluated ? 1 : 0,
        record.crossReferencesComplete ? 1 : 0,
        record.conclusionSupported ? 1 : 0,
        record.preparerConclusion,
        record.preparerNotes,
        record.updatedAt,
        id,
        institution.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRWorkpaperReview (
        id,institutionId,workpaperType,workpaperId,testingCycleId,planItemId,period,
        preparedBy,reviewerName,scopeObjectiveComplete,proceduresComplete,evidenceIndexed,
        exceptionsEvaluated,crossReferencesComplete,conclusionSupported,preparerConclusion,
        preparerNotes,reviewerDecision,reviewerConclusion,reviewerComments,status,
        submittedAt,reviewedAt,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pending','Not Assessed',NULL,'Draft',NULL,NULL,?,?)`,
      [
        record.id,
        record.institutionId,
        record.workpaperType,
        record.workpaperId,
        record.testingCycleId,
        record.planItemId,
        record.period,
        record.preparedBy,
        record.reviewerName,
        record.scopeObjectiveComplete ? 1 : 0,
        record.proceduresComplete ? 1 : 0,
        record.evidenceIndexed ? 1 : 0,
        record.exceptionsEvaluated ? 1 : 0,
        record.crossReferencesComplete ? 1 : 0,
        record.conclusionSupported ? 1 : 0,
        record.preparerConclusion,
        record.preparerNotes,
        record.createdAt,
        record.updatedAt
      ]
    );
  }

  await audit(
    db,
    String(institution.id),
    existing ? 'UPDATE_WORKPAPER_REVIEW' : 'CREATE_WORKPAPER_REVIEW',
    id,
    record,
    existing || undefined
  );
  return record;
}

export async function saveWorkpaperEvidence(input: Record<string, unknown>) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const reviewId = String(input.reviewId || '').trim();
  const evidenceRef = String(input.evidenceRef || '').trim();
  const evidenceType = String(input.evidenceType || '').trim();
  const description = String(input.description || '').trim();
  const owner = String(input.owner || '').trim();

  if (!reviewId || !evidenceRef || !evidenceType || !description || !owner) {
    throw new Error('EVIDENCE_REQUIRED');
  }

  const review = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperReview WHERE id=? AND institutionId=? LIMIT 1',
    [reviewId, institution.id]
  );
  if (!review) throw new Error('REVIEW_NOT_FOUND');
  if (String(review.status) === 'Approved') throw new Error('REVIEW_LOCKED');

  await assertReviewPeriodWritable(db, String(institution.id), review);

  const id =
    typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID();
  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperEvidenceIndex WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  const duplicate = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM ICOFRWorkpaperEvidenceIndex WHERE reviewId=? AND evidenceRef=? AND id<>? LIMIT 1',
    [reviewId, evidenceRef, id]
  );
  if (duplicate) throw new Error('EVIDENCE_CONFLICT');

  const now = nowIso();
  const record = {
    id,
    institutionId: String(institution.id),
    reviewId,
    evidenceRef,
    evidenceType,
    description,
    source: clean(input.source),
    owner,
    reviewerDecision: existing?.reviewerDecision || 'Pending',
    reviewerName: existing?.reviewerName || null,
    reviewerNotes: existing?.reviewerNotes || null,
    reviewedAt: existing?.reviewedAt || null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRWorkpaperEvidenceIndex SET
        evidenceRef=?,evidenceType=?,description=?,source=?,owner=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        record.evidenceRef,
        record.evidenceType,
        record.description,
        record.source,
        record.owner,
        record.updatedAt,
        id,
        institution.id
      ]
    );
  } else {
    await run(
      db,
      `INSERT INTO ICOFRWorkpaperEvidenceIndex (
        id,institutionId,reviewId,evidenceRef,evidenceType,description,source,owner,
        reviewerDecision,reviewerName,reviewerNotes,reviewedAt,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,'Pending',NULL,NULL,NULL,?,?)`,
      [
        record.id,
        record.institutionId,
        record.reviewId,
        record.evidenceRef,
        record.evidenceType,
        record.description,
        record.source,
        record.owner,
        record.createdAt,
        record.updatedAt
      ]
    );
  }

  await audit(
    db,
    String(institution.id),
    existing ? 'UPDATE_WORKPAPER_EVIDENCE' : 'CREATE_WORKPAPER_EVIDENCE',
    reviewId,
    record,
    existing || undefined
  );
  return record;
}

export async function reviewWorkpaperEvidence(input: Record<string, unknown>) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const evidenceId = String(input.evidenceId || '').trim();
  const reviewerDecision = String(input.reviewerDecision || '').trim();
  const reviewerName = String(input.reviewerName || '').trim();
  const reviewerNotes = clean(input.reviewerNotes);

  if (
    !evidenceId ||
    !reviewerName ||
    !EVIDENCE_DECISIONS.includes(reviewerDecision as typeof EVIDENCE_DECISIONS[number])
  ) {
    throw new Error('EVIDENCE_REVIEW_REQUIRED');
  }
  if (reviewerDecision === 'Rejected' && !reviewerNotes) {
    throw new Error('EVIDENCE_REJECTION_NOTES_REQUIRED');
  }

  const evidence = await first<Record<string, unknown>>(
    db,
    `SELECT e.*,r.preparedBy,r.reviewerName AS assignedReviewer,r.status AS reviewStatus,
        r.testingCycleId,r.period
       FROM ICOFRWorkpaperEvidenceIndex e
       JOIN ICOFRWorkpaperReview r ON r.id=e.reviewId
      WHERE e.id=? AND e.institutionId=?
      LIMIT 1`,
    [evidenceId, institution.id]
  );
  if (!evidence) throw new Error('EVIDENCE_NOT_FOUND');
  if (String(evidence.reviewStatus) === 'Approved') throw new Error('REVIEW_LOCKED');
  if (reviewerName.toLowerCase() === String(evidence.owner || '').toLowerCase()) {
    throw new Error('EVIDENCE_SELF_REVIEW');
  }
  if (
    evidence.assignedReviewer &&
    reviewerName.toLowerCase() !== String(evidence.assignedReviewer).toLowerCase()
  ) {
    throw new Error('UNASSIGNED_REVIEWER');
  }

  await assertReviewPeriodWritable(db, String(institution.id), evidence);

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRWorkpaperEvidenceIndex SET
      reviewerDecision=?,reviewerName=?,reviewerNotes=?,reviewedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      reviewerDecision,
      reviewerName,
      reviewerNotes,
      reviewerDecision === 'Pending' ? null : now,
      now,
      evidenceId,
      institution.id
    ]
  );

  const result = {
    id: evidenceId,
    reviewerDecision,
    reviewerName,
    reviewerNotes,
    reviewedAt: reviewerDecision === 'Pending' ? null : now
  };
  await audit(db, String(institution.id), 'REVIEW_WORKPAPER_EVIDENCE', String(evidence.reviewId), result, evidence);
  return result;
}

export async function removeWorkpaperEvidence(id: string) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const evidence = await first<Record<string, unknown>>(
    db,
    `SELECT e.*,r.status AS reviewStatus,r.testingCycleId,r.period
       FROM ICOFRWorkpaperEvidenceIndex e
       JOIN ICOFRWorkpaperReview r ON r.id=e.reviewId
      WHERE e.id=? AND e.institutionId=?
      LIMIT 1`,
    [id, institution.id]
  );
  if (!evidence) throw new Error('EVIDENCE_NOT_FOUND');
  if (String(evidence.reviewStatus) === 'Approved') throw new Error('REVIEW_LOCKED');

  await assertReviewPeriodWritable(db, String(institution.id), evidence);

  await run(
    db,
    'DELETE FROM ICOFRWorkpaperEvidenceIndex WHERE id=? AND institutionId=?',
    [id, institution.id]
  );
  await audit(db, String(institution.id), 'DELETE_WORKPAPER_EVIDENCE', String(evidence.reviewId), { deleted: true }, evidence);
  return { success: true };
}

export async function createWorkpaperReviewNote(input: Record<string, unknown>) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const reviewId = String(input.reviewId || '').trim();
  const title = String(input.title || '').trim();
  const description = String(input.description || '').trim();
  const raisedBy = String(input.raisedBy || '').trim();
  const owner = String(input.owner || '').trim();
  const severity = String(input.severity || 'Medium').trim();
  const dueDate = clean(input.dueDate);

  if (!reviewId || !title || !description || !raisedBy || !owner) {
    throw new Error('REVIEW_NOTE_REQUIRED');
  }
  if (!NOTE_SEVERITIES.includes(severity as typeof NOTE_SEVERITIES[number])) {
    throw new Error('INVALID_NOTE_SEVERITY');
  }

  const review = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperReview WHERE id=? AND institutionId=? LIMIT 1',
    [reviewId, institution.id]
  );
  if (!review) throw new Error('REVIEW_NOT_FOUND');
  if (String(review.status) === 'Approved') throw new Error('REVIEW_LOCKED');

  if (
    review.reviewerName &&
    raisedBy.toLowerCase() !== String(review.reviewerName).toLowerCase()
  ) {
    throw new Error('UNASSIGNED_REVIEWER');
  }

  await assertReviewPeriodWritable(db, String(institution.id), review);

  const nextRow = await first<{ nextNo?: number }>(
    db,
    `SELECT COALESCE(MAX(CAST(SUBSTR(noteNo,4) AS INTEGER)),0)+1 AS nextNo
       FROM ICOFRWorkpaperReviewNote
      WHERE institutionId=?`,
    [institution.id]
  );
  const noteNo = 'RN-' + String(Number(nextRow?.nextNo || 1)).padStart(5, '0');
  const id = crypto.randomUUID();
  const now = nowIso();

  const record = {
    id,
    institutionId: String(institution.id),
    reviewId,
    noteNo,
    title,
    description,
    severity,
    raisedBy,
    owner,
    dueDate,
    status: 'Open',
    response: null,
    responseBy: null,
    respondedAt: null,
    clearanceDecision: null,
    clearanceComment: null,
    clearedBy: null,
    clearedAt: null,
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO ICOFRWorkpaperReviewNote (
      id,institutionId,reviewId,noteNo,title,description,severity,raisedBy,owner,dueDate,
      status,response,responseBy,respondedAt,clearanceDecision,clearanceComment,
      clearedBy,clearedAt,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,'Open',NULL,NULL,NULL,NULL,NULL,NULL,NULL,?,?)`,
    [
      record.id,
      record.institutionId,
      record.reviewId,
      record.noteNo,
      record.title,
      record.description,
      record.severity,
      record.raisedBy,
      record.owner,
      record.dueDate,
      record.createdAt,
      record.updatedAt
    ]
  );

  await audit(db, String(institution.id), 'CREATE_REVIEW_NOTE', reviewId, record);
  return record;
}

export async function respondWorkpaperReviewNote(input: Record<string, unknown>) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const noteId = String(input.noteId || '').trim();
  const response = String(input.response || '').trim();
  const responseBy = String(input.responseBy || '').trim();
  if (!noteId || !response || !responseBy) throw new Error('REVIEW_NOTE_RESPONSE_REQUIRED');

  const note = await first<Record<string, unknown>>(
    db,
    `SELECT n.*,r.testingCycleId,r.period,r.status AS reviewStatus
       FROM ICOFRWorkpaperReviewNote n
       JOIN ICOFRWorkpaperReview r ON r.id=n.reviewId
      WHERE n.id=? AND n.institutionId=?
      LIMIT 1`,
    [noteId, institution.id]
  );
  if (!note) throw new Error('REVIEW_NOTE_NOT_FOUND');
  if (!['Open', 'Responded'].includes(String(note.status))) throw new Error('REVIEW_NOTE_CLOSED');
  if (
    String(note.owner || '').trim() &&
    responseBy.toLowerCase() !== String(note.owner).toLowerCase()
  ) {
    throw new Error('REVIEW_NOTE_OWNER_REQUIRED');
  }

  await assertReviewPeriodWritable(db, String(institution.id), note);

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRWorkpaperReviewNote SET
      response=?,responseBy=?,respondedAt=?,status='Responded',updatedAt=?
     WHERE id=? AND institutionId=?`,
    [response, responseBy, now, now, noteId, institution.id]
  );

  const result = { id: noteId, status: 'Responded', response, responseBy, respondedAt: now };
  await audit(db, String(institution.id), 'RESPOND_REVIEW_NOTE', String(note.reviewId), result, note);
  return result;
}

export async function clearWorkpaperReviewNote(input: Record<string, unknown>) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const noteId = String(input.noteId || '').trim();
  const clearedBy = String(input.clearedBy || '').trim();
  const clearanceDecision = String(input.clearanceDecision || '').trim();
  const clearanceComment = String(input.clearanceComment || '').trim();

  if (
    !noteId ||
    !clearedBy ||
    !['Cleared', 'Waived'].includes(clearanceDecision) ||
    !clearanceComment
  ) {
    throw new Error('REVIEW_NOTE_CLEARANCE_REQUIRED');
  }

  const note = await first<Record<string, unknown>>(
    db,
    `SELECT n.*,r.reviewerName,r.testingCycleId,r.period,r.status AS reviewStatus
       FROM ICOFRWorkpaperReviewNote n
       JOIN ICOFRWorkpaperReview r ON r.id=n.reviewId
      WHERE n.id=? AND n.institutionId=?
      LIMIT 1`,
    [noteId, institution.id]
  );
  if (!note) throw new Error('REVIEW_NOTE_NOT_FOUND');
  if (String(note.status) !== 'Responded') throw new Error('REVIEW_NOTE_NOT_RESPONDED');
  if (clearedBy.toLowerCase() === String(note.owner || '').toLowerCase()) {
    throw new Error('REVIEW_NOTE_SELF_CLEARANCE');
  }
  if (
    note.reviewerName &&
    clearedBy.toLowerCase() !== String(note.reviewerName).toLowerCase()
  ) {
    throw new Error('UNASSIGNED_REVIEWER');
  }

  await assertReviewPeriodWritable(db, String(institution.id), note);

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRWorkpaperReviewNote SET
      clearanceDecision=?,clearanceComment=?,clearedBy=?,clearedAt=?,
      status=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      clearanceDecision,
      clearanceComment,
      clearedBy,
      now,
      clearanceDecision,
      now,
      noteId,
      institution.id
    ]
  );

  const result = {
    id: noteId,
    status: clearanceDecision,
    clearanceDecision,
    clearanceComment,
    clearedBy,
    clearedAt: now
  };
  await audit(db, String(institution.id), 'CLEAR_REVIEW_NOTE', String(note.reviewId), result, note);
  return result;
}

export async function submitWorkpaperReview(reviewId: string) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const review = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperReview WHERE id=? AND institutionId=? LIMIT 1',
    [reviewId, institution.id]
  );
  if (!review) throw new Error('REVIEW_NOT_FOUND');
  if (String(review.status) === 'Approved') throw new Error('REVIEW_LOCKED');

  await assertReviewPeriodWritable(db, String(institution.id), review);

  if (!checklistComplete(review)) throw new Error('CHECKLIST_INCOMPLETE');
  if (!CONCLUSIONS.includes(String(review.preparerConclusion) as typeof CONCLUSIONS[number])) {
    throw new Error('PREPARER_CONCLUSION_REQUIRED');
  }
  if (!review.reviewerName) throw new Error('REVIEWER_REQUIRED');
  if (
    String(review.reviewerName).toLowerCase() ===
    String(review.preparedBy).toLowerCase()
  ) {
    throw new Error('SELF_REVIEW');
  }

  const evidence = await all<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperEvidenceIndex WHERE reviewId=? ORDER BY createdAt',
    [reviewId]
  );
  if (evidence.length === 0) throw new Error('EVIDENCE_INDEX_REQUIRED');

  const now = nowIso();
  await run(
    db,
    `UPDATE ICOFRWorkpaperReview SET
      status='Under Review',reviewerDecision='Pending',submittedAt=COALESCE(submittedAt,?),
      updatedAt=?
     WHERE id=? AND institutionId=?`,
    [now, now, reviewId, institution.id]
  );

  if (review.workpaperType === 'ToD') {
    await run(
      db,
      `UPDATE ICOFRDesignAssessment SET
        reviewerName=?,conclusion=?,status='Under Review',updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        review.reviewerName,
        review.preparerConclusion,
        now,
        review.workpaperId,
        institution.id
      ]
    );
  } else {
    await run(
      db,
      `UPDATE ToETest SET
        reviewerName=?,testerConclusion=?,finalConclusion='Not Assessed',status='Under Review'
       WHERE id=?`,
      [
        review.reviewerName,
        review.preparerConclusion,
        review.workpaperId
      ]
    );
  }

  const result = {
    id: reviewId,
    status: 'Under Review',
    submittedAt: review.submittedAt || now
  };
  await audit(db, String(institution.id), 'SUBMIT_WORKPAPER_REVIEW', reviewId, result, review);
  return result;
}

async function qualityGate(
  db: D1DatabaseLike,
  institutionId: string,
  review: Record<string, unknown>
) {
  const [evidence, notes] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRWorkpaperEvidenceIndex WHERE reviewId=? ORDER BY createdAt',
      [review.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRWorkpaperReviewNote WHERE reviewId=? ORDER BY createdAt',
      [review.id]
    )
  ]);

  const pendingNotes = notes.filter(item => !['Cleared', 'Waived'].includes(String(item.status)));
  const rejectedEvidence = evidence.filter(item => String(item.reviewerDecision) === 'Rejected');
  const pendingEvidence = evidence.filter(item => String(item.reviewerDecision) !== 'Accepted');

  let sampleCount = 0;
  let notTestedCount = 0;
  let failedCount = 0;
  let failedWithoutException = 0;

  if (review.workpaperType === 'ToE') {
    const samples = await all<Record<string, unknown>>(
      db,
      'SELECT * FROM TestSample WHERE toeTestId=? ORDER BY sampleNumber',
      [review.workpaperId]
    );
    const exceptions = await all<Record<string, unknown>>(
      db,
      'SELECT * FROM TestingException WHERE toeTestId=?',
      [review.workpaperId]
    );
    const exceptionRefs = new Set(exceptions.map(item => String(item.sampleRef || '')));

    sampleCount = samples.length;
    notTestedCount = samples.filter(item => String(item.result) === 'Not Tested').length;
    failedCount = samples.filter(item => String(item.result) === 'Fail').length;
    failedWithoutException = samples.filter(
      item =>
        String(item.result) === 'Fail' &&
        !exceptionRefs.has(String(item.transactionRef || ''))
    ).length;
  }

  const gates = [
    {
      key: 'PREPARER_CHECKLIST',
      label: 'Preparer completeness checklist',
      passed: checklistComplete(review),
      detail: checklistComplete(review)
        ? 'All workpaper completeness declarations are confirmed.'
        : 'One or more workpaper completeness declarations are not confirmed.'
    },
    {
      key: 'PREPARER_CONCLUSION',
      label: 'Preparer conclusion recorded',
      passed: CONCLUSIONS.includes(String(review.preparerConclusion) as typeof CONCLUSIONS[number]),
      detail: 'Preparer conclusion: ' + String(review.preparerConclusion || 'Not Assessed')
    },
    {
      key: 'EVIDENCE_INDEX',
      label: 'Evidence index independently reviewed',
      passed: evidence.length > 0 && pendingEvidence.length === 0,
      detail:
        evidence.length +
        ' evidence item(s); ' +
        pendingEvidence.length +
        ' not accepted; ' +
        rejectedEvidence.length +
        ' rejected.'
    },
    {
      key: 'REVIEW_NOTES',
      label: 'All review notes cleared or waived',
      passed: pendingNotes.length === 0,
      detail: pendingNotes.length + ' unresolved review note(s).'
    },
    {
      key: 'SEGREGATION_OF_DUTIES',
      label: 'Preparer and reviewer are different',
      passed:
        Boolean(review.reviewerName) &&
        String(review.preparedBy).toLowerCase() !== String(review.reviewerName).toLowerCase(),
      detail:
        'Prepared by ' +
        String(review.preparedBy || '—') +
        '; reviewer ' +
        String(review.reviewerName || 'not assigned') +
        '.'
    }
  ];

  if (review.workpaperType === 'ToE') {
    gates.push({
      key: 'TOE_SAMPLES_TESTED',
      label: 'All registered ToE samples tested',
      passed: sampleCount > 0 && notTestedCount === 0,
      detail:
        sampleCount +
        ' sample(s); ' +
        notTestedCount +
        ' Not Tested; ' +
        failedCount +
        ' failed.'
    });
    gates.push({
      key: 'FAILED_SAMPLE_EVALUATION',
      label: 'Failed samples evaluated for exception handling',
      passed: failedWithoutException === 0 || bool(review.exceptionsEvaluated),
      detail:
        failedWithoutException +
        ' failed sample(s) have no persisted Testing Exception; preparer exceptions-evaluated declaration=' +
        (bool(review.exceptionsEvaluated) ? 'Yes' : 'No') +
        '.'
    });
  }

  return {
    passed: gates.every(item => item.passed),
    gates,
    counts: {
      evidence: evidence.length,
      pendingEvidence: pendingEvidence.length,
      rejectedEvidence: rejectedEvidence.length,
      notes: notes.length,
      unresolvedNotes: pendingNotes.length,
      sampleCount,
      notTestedCount,
      failedCount,
      failedWithoutException
    }
  };
}

export async function decideWorkpaperReview(input: Record<string, unknown>) {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const reviewId = String(input.reviewId || '').trim();
  const reviewerName = String(input.reviewerName || '').trim();
  const decision = String(input.decision || '').trim();
  const reviewerConclusion = String(input.reviewerConclusion || 'Not Assessed').trim();
  const reviewerComments = String(input.reviewerComments || '').trim();

  if (!reviewId || !reviewerName || !['Approve', 'Return'].includes(decision)) {
    throw new Error('REVIEW_DECISION_REQUIRED');
  }

  const review = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRWorkpaperReview WHERE id=? AND institutionId=? LIMIT 1',
    [reviewId, institution.id]
  );
  if (!review) throw new Error('REVIEW_NOT_FOUND');
  if (String(review.status) === 'Approved') throw new Error('REVIEW_LOCKED');
  if (!['Under Review', 'Returned', 'Submitted'].includes(String(review.status))) {
    throw new Error('REVIEW_NOT_SUBMITTED');
  }
  if (
    review.reviewerName &&
    reviewerName.toLowerCase() !== String(review.reviewerName).toLowerCase()
  ) {
    throw new Error('UNASSIGNED_REVIEWER');
  }
  if (reviewerName.toLowerCase() === String(review.preparedBy).toLowerCase()) {
    throw new Error('SELF_REVIEW');
  }

  await assertReviewPeriodWritable(db, String(institution.id), review);

  const now = nowIso();

  if (decision === 'Return') {
    if (!reviewerComments) throw new Error('RETURN_COMMENTS_REQUIRED');

    await run(
      db,
      `UPDATE ICOFRWorkpaperReview SET
        reviewerDecision='Returned',reviewerComments=?,reviewerConclusion='Not Assessed',
        status='Returned',reviewedAt=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [reviewerComments, now, now, reviewId, institution.id]
    );

    const result = {
      id: reviewId,
      status: 'Returned',
      reviewerDecision: 'Returned',
      reviewerName,
      reviewerComments,
      reviewedAt: now
    };
    await audit(db, String(institution.id), 'RETURN_WORKPAPER_REVIEW', reviewId, result, review);
    return result;
  }

  if (!CONCLUSIONS.includes(reviewerConclusion as typeof CONCLUSIONS[number])) {
    throw new Error('REVIEWER_CONCLUSION_REQUIRED');
  }

  const gate = await qualityGate(db, String(institution.id), review);
  if (!gate.passed) throw new Error('QUALITY_GATE_NOT_MET');

  await run(
    db,
    `UPDATE ICOFRWorkpaperReview SET
      reviewerDecision='Approved',reviewerConclusion=?,reviewerComments=?,
      status='Approved',reviewedAt=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      reviewerConclusion,
      reviewerComments || null,
      now,
      now,
      reviewId,
      institution.id
    ]
  );

  if (review.workpaperType === 'ToD') {
    await run(
      db,
      `UPDATE ICOFRDesignAssessment SET
        reviewerName=?,conclusion=?,status='Approved',updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        reviewerName,
        reviewerConclusion,
        now,
        review.workpaperId,
        institution.id
      ]
    );
  } else {
    await run(
      db,
      `UPDATE ToETest SET
        reviewerName=?,testerConclusion=?,finalConclusion=?,status='Approved'
       WHERE id=?`,
      [
        reviewerName,
        review.preparerConclusion,
        reviewerConclusion,
        review.workpaperId
      ]
    );
  }

  const result = {
    id: reviewId,
    status: 'Approved',
    reviewerDecision: 'Approved',
    reviewerName,
    reviewerConclusion,
    reviewerComments: reviewerComments || null,
    reviewedAt: now,
    qualityGate: gate
  };
  await audit(db, String(institution.id), 'APPROVE_WORKPAPER_REVIEW', reviewId, result, review);
  return result;
}

export async function getWorkpaperReviewData() {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      cycles: [],
      workpapers: [],
      reviews: [],
      openReviewNotes: [],
      metrics: {}
    };
  }

  const [
    cycles,
    planItems,
    todRows,
    toeRows,
    reviews,
    evidenceRows,
    noteRows
  ] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRTestingCycle WHERE institutionId=? ORDER BY fiscalYear DESC,startDate DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.*
         FROM ICOFRTestingPlanItem p
         JOIN ICOFRTestingCycle c ON c.id=p.cycleId
        WHERE c.institutionId=?
        ORDER BY c.fiscalYear DESC,p.dueDate,p.createdAt`,
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
      'SELECT * FROM ICOFRWorkpaperReview WHERE institutionId=? ORDER BY updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRWorkpaperEvidenceIndex WHERE institutionId=? ORDER BY createdAt',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRWorkpaperReviewNote WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    )
  ]);

  const [controlDomains, controlMasters, samples, exceptions] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT * FROM ICOFRControlDomain
        WHERE institutionId=? AND status<>'Retired'
        ORDER BY controlCode`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ControlMaster WHERE institutionId=? ORDER BY controlId',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT s.*
         FROM TestSample s
         JOIN ToETest t ON t.id=s.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE c.institutionId=?
        ORDER BY s.toeTestId,s.sampleNumber`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT e.*
         FROM TestingException e
         JOIN ToETest t ON t.id=e.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE c.institutionId=?
        ORDER BY e.createdAt`,
      [institution.id]
    )
  ]);

  const cycleById = new Map(cycles.map(item => [String(item.id), item]));
  const planByTodId = new Map(
    planItems
      .filter(item => item.todAssessmentId)
      .map(item => [String(item.todAssessmentId), item])
  );
  const planByToeId = new Map(
    planItems
      .filter(item => item.toeTestId)
      .map(item => [String(item.toeTestId), item])
  );
  const domainById = new Map(controlDomains.map(item => [String(item.id), item]));
  const masterById = new Map(controlMasters.map(item => [String(item.id), item]));
  const reviewByKey = new Map(
    reviews.map(item => [String(item.workpaperType) + ':' + String(item.workpaperId), item])
  );

  const workpapers: Array<Record<string, unknown>> = [];

  for (const tod of todRows) {
    const plan = planByTodId.get(String(tod.id)) || null;
    const control = domainById.get(String(tod.controlDomainId)) || null;
    const review = reviewByKey.get('ToD:' + String(tod.id)) || null;
    workpapers.push({
      workpaperType: 'ToD',
      workpaperId: tod.id,
      workpaperRef: tod.testId,
      period: tod.period,
      testerName: tod.testerName,
      sourceReviewerName: tod.reviewerName,
      sourceConclusion: tod.conclusion,
      sourceStatus: tod.status,
      control,
      planItem: plan,
      cycle: plan ? cycleById.get(String(plan.cycleId)) || null : null,
      review
    });
  }

  for (const toe of toeRows) {
    const plan = planByToeId.get(String(toe.id)) || null;
    const control = masterById.get(String(toe.controlId)) || null;
    const review = reviewByKey.get('ToE:' + String(toe.id)) || null;
    const toeSamples = samples.filter(item => String(item.toeTestId) === String(toe.id));
    const toeExceptions = exceptions.filter(item => String(item.toeTestId) === String(toe.id));
    workpapers.push({
      workpaperType: 'ToE',
      workpaperId: toe.id,
      workpaperRef: toe.testId,
      period: toe.period,
      testerName: toe.testerName,
      sourceReviewerName: toe.reviewerName,
      sourceConclusion: toe.finalConclusion,
      sourceStatus: toe.status,
      control,
      planItem: plan,
      cycle: plan ? cycleById.get(String(plan.cycleId)) || null : null,
      samples: toeSamples,
      exceptions: toeExceptions,
      review
    });
  }

  const enrichedReviews: Array<Record<string, any>> = [];
  for (const review of reviews) {
    const evidence = evidenceRows.filter(item => String(item.reviewId) === String(review.id));
    const notes = noteRows.filter(item => String(item.reviewId) === String(review.id));
    const source =
      workpapers.find(
        item =>
          String(item.workpaperType) === String(review.workpaperType) &&
          String(item.workpaperId) === String(review.workpaperId)
      ) || null;
    const gate = await qualityGate(db, String(institution.id), review);

    enrichedReviews.push({
      ...review,
      scopeObjectiveComplete: bool(review.scopeObjectiveComplete),
      proceduresComplete: bool(review.proceduresComplete),
      evidenceIndexed: bool(review.evidenceIndexed),
      exceptionsEvaluated: bool(review.exceptionsEvaluated),
      crossReferencesComplete: bool(review.crossReferencesComplete),
      conclusionSupported: bool(review.conclusionSupported),
      evidence,
      notes,
      source,
      qualityGate: gate
    });
  }

  const openReviewNotes = noteRows
    .filter(item => !['Cleared', 'Waived'].includes(String(item.status)))
    .map(note => {
      const review = reviews.find(item => String(item.id) === String(note.reviewId)) || null;
      const source = review
        ? workpapers.find(
            item =>
              String(item.workpaperType) === String(review.workpaperType) &&
              String(item.workpaperId) === String(review.workpaperId)
          ) || null
        : null;
      return {
        ...note,
        review,
        source
      };
    });

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    cycles,
    workpapers,
    reviews: enrichedReviews,
    openReviewNotes,
    conclusions: CONCLUSIONS,
    evidenceDecisions: EVIDENCE_DECISIONS,
    noteSeverities: NOTE_SEVERITIES,
    metrics: {
      workpapers: workpapers.length,
      reviews: enrichedReviews.length,
      draft: enrichedReviews.filter(item => item.status === 'Draft').length,
      underReview: enrichedReviews.filter(item => item.status === 'Under Review').length,
      returned: enrichedReviews.filter(item => item.status === 'Returned').length,
      approved: enrichedReviews.filter(item => item.status === 'Approved').length,
      unresolvedReviewNotes: openReviewNotes.length,
      rejectedEvidence: evidenceRows.filter(item => item.reviewerDecision === 'Rejected').length,
      readyForApproval: enrichedReviews.filter(
        item => item.status === 'Under Review' && item.qualityGate?.passed
      ).length
    }
  };
}


export async function listWorkpaperReviewTasks() {
  const db = await ensureIcofrWorkpaperReviewSchema();
  const institution = await primaryInstitution(db);
  if (!institution) return [];

  const [reviews, notes] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT * FROM ICOFRWorkpaperReview
        WHERE institutionId=? AND status IN ('Under Review','Returned')
        ORDER BY updatedAt DESC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT n.*,r.workpaperType,r.workpaperId,r.reviewerName
         FROM ICOFRWorkpaperReviewNote n
         JOIN ICOFRWorkpaperReview r ON r.id=n.reviewId
        WHERE n.institutionId=? AND n.status NOT IN ('Cleared','Waived')
        ORDER BY n.dueDate,n.createdAt`,
      [institution.id]
    )
  ]);

  const reviewTasks = reviews.map(item => ({
    id: 'workpaper-review-' + String(item.id),
    type: 'ICOFR Workpaper Review',
    title:
      String(item.workpaperType) +
      ' · ' +
      String(item.workpaperId) +
      ' · ' +
      (String(item.status) === 'Returned' ? 'Rework required' : 'Supervisory review required'),
    dueDate: null,
    priority: String(item.status) === 'Returned' ? 'High' : 'Medium',
    status: item.status,
    link: '/icofr/workpaper-review',
    user: {
      name:
        String(item.status) === 'Returned'
          ? String(item.preparedBy || 'Unassigned')
          : String(item.reviewerName || 'Unassigned')
    },
    sourceId: item.id
  }));

  const noteTasks = notes.map(item => ({
    id: 'review-note-' + String(item.id),
    type: 'ICOFR Review Note',
    title: String(item.noteNo) + ' · ' + String(item.title),
    dueDate: item.dueDate,
    priority: ['Critical', 'High'].includes(String(item.severity)) ? 'High' : 'Medium',
    status: item.status,
    link: '/icofr/workpaper-review',
    user: { name: item.owner || 'Unassigned' },
    sourceId: item.id
  }));

  return [...noteTasks, ...reviewTasks];
}
