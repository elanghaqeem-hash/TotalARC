import { getCloudflareContext } from '@opennextjs/cloudflare';

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

export type PolicyDocumentRecord = {
  id: string;
  institutionId: string;
  sourceDocumentId: string | null;
  documentCode: string;
  documentType: string;
  title: string;
  ownerUnit: string | null;
  ownerName: string | null;
  status: string;
  version: string;
  issueDate: string | null;
  effectiveDate: string | null;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  reviewCycleMonths: number;
  expiryDate: string | null;
  scope: string | null;
  summary: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ExternalRegulationRecord = {
  id: string;
  institutionId: string;
  regulator: string;
  regulationCode: string;
  title: string;
  category: string | null;
  issueDate: string | null;
  effectiveDate: string | null;
  sourceUrl: string | null;
  status: string;
  summary: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PolicyRegulationImpactRecord = {
  id: string;
  institutionId: string;
  policyDocumentId: string;
  regulationId: string;
  impactLevel: string;
  changeRequired: number;
  impactSummary: string | null;
  actionOwner: string | null;
  dueDate: string | null;
  actionStatus: string;
  completedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PolicyReviewRecord = {
  id: string;
  institutionId: string;
  policyDocumentId: string;
  reviewDate: string;
  reviewerName: string;
  outcome: string;
  notes: string | null;
  resultingVersion: string | null;
  nextReviewDate: string | null;
  createdAt: string;
};

type PolicyInput = {
  sourceDocumentId?: string | null;
  documentCode: string;
  documentType: string;
  title: string;
  ownerUnit?: string | null;
  ownerName?: string | null;
  status?: string | null;
  version?: string | null;
  issueDate?: string | null;
  effectiveDate?: string | null;
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
  reviewCycleMonths?: number | null;
  expiryDate?: string | null;
  scope?: string | null;
  summary?: string | null;
};

type RegulationInput = {
  regulator: string;
  regulationCode: string;
  title: string;
  category?: string | null;
  issueDate?: string | null;
  effectiveDate?: string | null;
  sourceUrl?: string | null;
  status?: string | null;
  summary?: string | null;
};

type ImpactInput = {
  policyDocumentId: string;
  regulationId: string;
  impactLevel?: string | null;
  changeRequired?: boolean | number | null;
  impactSummary?: string | null;
  actionOwner?: string | null;
  dueDate?: string | null;
  actionStatus?: string | null;
};

type ReviewInput = {
  policyDocumentId: string;
  reviewDate?: string | null;
  reviewerName: string;
  outcome: string;
  notes?: string | null;
  resultingVersion?: string | null;
  nextReviewDate?: string | null;
};

function clean(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

function nowIso() {
  return new Date().toISOString();
}

function toDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('POLICY_LIBRARY_DATABASE_UNAVAILABLE');
  return db;
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  const statements = script.split(';').map(statement => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensurePolicyLibrarySchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = await getDb();
    // D1 cold starts previously ran 14 sequential CREATE IF NOT EXISTS statements
    // even on databases already migrated. Verify schema objects in one indexed
    // sqlite_master lookup, and only run the idempotent migration when incomplete.
    const requiredObjects = [
      'PolicyDocument', 'idx_policy_document_code', 'idx_policy_document_review',
      'idx_policy_document_status', 'idx_policy_document_source',
      'ExternalRegulationWatch', 'idx_external_regulation_code',
      'idx_external_regulation_issue', 'idx_external_regulation_status',
      'PolicyRegulationImpact', 'idx_policy_regulation_pair',
      'idx_policy_regulation_action', 'PolicyReviewHistory',
      'idx_policy_review_history'
    ];
    const existing = await db.prepare(
      'SELECT name FROM sqlite_master WHERE name IN (' +
      requiredObjects.map(() => '?').join(',') + ')'
    ).bind(...requiredObjects).all<{ name: string }>();
    const names = new Set((existing.results || []).map(row => row.name));
    if (requiredObjects.every(name => names.has(name))) return db;

    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS PolicyDocument (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceDocumentId TEXT,
        documentCode TEXT NOT NULL,
        documentType TEXT NOT NULL,
        title TEXT NOT NULL,
        ownerUnit TEXT,
        ownerName TEXT,
        status TEXT NOT NULL DEFAULT 'Berlaku',
        version TEXT NOT NULL DEFAULT '1.0',
        issueDate TEXT,
        effectiveDate TEXT,
        lastReviewDate TEXT,
        nextReviewDate TEXT,
        reviewCycleMonths INTEGER NOT NULL DEFAULT 12,
        expiryDate TEXT,
        scope TEXT,
        summary TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_document_code
        ON PolicyDocument(institutionId, documentCode);
      CREATE INDEX IF NOT EXISTS idx_policy_document_review
        ON PolicyDocument(institutionId, nextReviewDate);
      CREATE INDEX IF NOT EXISTS idx_policy_document_status
        ON PolicyDocument(institutionId, status, updatedAt);
      CREATE INDEX IF NOT EXISTS idx_policy_document_source
        ON PolicyDocument(institutionId, sourceDocumentId);

      CREATE TABLE IF NOT EXISTS ExternalRegulationWatch (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        regulator TEXT NOT NULL,
        regulationCode TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT,
        issueDate TEXT,
        effectiveDate TEXT,
        sourceUrl TEXT,
        status TEXT NOT NULL DEFAULT 'Berlaku',
        summary TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_external_regulation_code
        ON ExternalRegulationWatch(institutionId, regulator, regulationCode);
      CREATE INDEX IF NOT EXISTS idx_external_regulation_issue
        ON ExternalRegulationWatch(institutionId, issueDate);
      CREATE INDEX IF NOT EXISTS idx_external_regulation_status
        ON ExternalRegulationWatch(institutionId, status, updatedAt);

      CREATE TABLE IF NOT EXISTS PolicyRegulationImpact (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        policyDocumentId TEXT NOT NULL,
        regulationId TEXT NOT NULL,
        impactLevel TEXT NOT NULL DEFAULT 'Sedang',
        changeRequired INTEGER NOT NULL DEFAULT 1,
        impactSummary TEXT,
        actionOwner TEXT,
        dueDate TEXT,
        actionStatus TEXT NOT NULL DEFAULT 'Belum Ditindaklanjuti',
        completedAt TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_regulation_pair
        ON PolicyRegulationImpact(institutionId, policyDocumentId, regulationId);
      CREATE INDEX IF NOT EXISTS idx_policy_regulation_action
        ON PolicyRegulationImpact(institutionId, actionStatus, dueDate);

      CREATE TABLE IF NOT EXISTS PolicyReviewHistory (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        policyDocumentId TEXT NOT NULL,
        reviewDate TEXT NOT NULL,
        reviewerName TEXT NOT NULL,
        outcome TEXT NOT NULL,
        notes TEXT,
        resultingVersion TEXT,
        nextReviewDate TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_policy_review_history
        ON PolicyReviewHistory(institutionId, policyDocumentId, reviewDate);
    `);
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function required(value: unknown, code: string) {
  const parsed = clean(value);
  if (!parsed) throw new Error(code);
  return parsed;
}

async function assertPolicyInstitution(
  db: D1DatabaseLike,
  institutionId: string,
  policyDocumentId: string
) {
  const record = await db
    .prepare('SELECT id FROM PolicyDocument WHERE id = ? AND institutionId = ? LIMIT 1')
    .bind(policyDocumentId, institutionId)
    .first<{ id: string }>();
  if (!record) throw new Error('POLICY_LIBRARY_POLICY_NOT_FOUND');
}

async function assertRegulationInstitution(
  db: D1DatabaseLike,
  institutionId: string,
  regulationId: string
) {
  const record = await db
    .prepare('SELECT id FROM ExternalRegulationWatch WHERE id = ? AND institutionId = ? LIMIT 1')
    .bind(regulationId, institutionId)
    .first<{ id: string }>();
  if (!record) throw new Error('POLICY_LIBRARY_REGULATION_NOT_FOUND');
}

export async function createPolicyDocument(
  institutionId: string,
  input: PolicyInput,
  actorName: string
) {
  const db = await ensurePolicyLibrarySchema();
  const id = crypto.randomUUID();
  const now = nowIso();
  const documentCode = required(input.documentCode, 'POLICY_LIBRARY_DOCUMENT_CODE_REQUIRED');
  const documentType = required(input.documentType, 'POLICY_LIBRARY_DOCUMENT_TYPE_REQUIRED');
  const title = required(input.title, 'POLICY_LIBRARY_TITLE_REQUIRED');
  const reviewCycleMonths = Math.min(60, Math.max(1, Number(input.reviewCycleMonths || 12) || 12));

  try {
    await db.prepare(`
      INSERT INTO PolicyDocument (
        id, institutionId, sourceDocumentId, documentCode, documentType, title,
        ownerUnit, ownerName, status, version, issueDate, effectiveDate,
        lastReviewDate, nextReviewDate, reviewCycleMonths, expiryDate,
        scope, summary, createdBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      institutionId,
      clean(input.sourceDocumentId),
      documentCode,
      documentType,
      title,
      clean(input.ownerUnit),
      clean(input.ownerName),
      clean(input.status) || 'Berlaku',
      clean(input.version) || '1.0',
      toDateOnly(input.issueDate),
      toDateOnly(input.effectiveDate),
      toDateOnly(input.lastReviewDate),
      toDateOnly(input.nextReviewDate),
      reviewCycleMonths,
      toDateOnly(input.expiryDate),
      clean(input.scope),
      clean(input.summary),
      actorName,
      now,
      now
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('unique')) throw new Error('POLICY_LIBRARY_DUPLICATE_CODE');
    throw error;
  }

  return db
    .prepare('SELECT * FROM PolicyDocument WHERE id = ? AND institutionId = ? LIMIT 1')
    .bind(id, institutionId)
    .first<PolicyDocumentRecord>();
}

export async function createExternalRegulation(
  institutionId: string,
  input: RegulationInput,
  actorName: string
) {
  const db = await ensurePolicyLibrarySchema();
  const id = crypto.randomUUID();
  const now = nowIso();
  const regulator = required(input.regulator, 'POLICY_LIBRARY_REGULATOR_REQUIRED');
  const regulationCode = required(input.regulationCode, 'POLICY_LIBRARY_REGULATION_CODE_REQUIRED');
  const title = required(input.title, 'POLICY_LIBRARY_REGULATION_TITLE_REQUIRED');

  try {
    await db.prepare(`
      INSERT INTO ExternalRegulationWatch (
        id, institutionId, regulator, regulationCode, title, category,
        issueDate, effectiveDate, sourceUrl, status, summary, createdBy,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      institutionId,
      regulator,
      regulationCode,
      title,
      clean(input.category),
      toDateOnly(input.issueDate),
      toDateOnly(input.effectiveDate),
      clean(input.sourceUrl),
      clean(input.status) || 'Berlaku',
      clean(input.summary),
      actorName,
      now,
      now
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('unique')) throw new Error('POLICY_LIBRARY_DUPLICATE_REGULATION');
    throw error;
  }

  return db
    .prepare('SELECT * FROM ExternalRegulationWatch WHERE id = ? AND institutionId = ? LIMIT 1')
    .bind(id, institutionId)
    .first<ExternalRegulationRecord>();
}

export async function upsertPolicyRegulationImpact(
  institutionId: string,
  input: ImpactInput,
  actorName: string
) {
  const db = await ensurePolicyLibrarySchema();
  const policyDocumentId = required(input.policyDocumentId, 'POLICY_LIBRARY_POLICY_REQUIRED');
  const regulationId = required(input.regulationId, 'POLICY_LIBRARY_REGULATION_REQUIRED');
  await Promise.all([
    assertPolicyInstitution(db, institutionId, policyDocumentId),
    assertRegulationInstitution(db, institutionId, regulationId)
  ]);

  const existing = await db.prepare(`
    SELECT id FROM PolicyRegulationImpact
    WHERE institutionId = ? AND policyDocumentId = ? AND regulationId = ?
    LIMIT 1
  `).bind(institutionId, policyDocumentId, regulationId).first<{ id: string }>();

  const now = nowIso();
  const impactLevel = clean(input.impactLevel) || 'Sedang';
  const changeRequired = input.changeRequired === false || input.changeRequired === 0 ? 0 : 1;
  const actionStatus = clean(input.actionStatus) || 'Belum Ditindaklanjuti';

  if (existing) {
    await db.prepare(`
      UPDATE PolicyRegulationImpact
      SET impactLevel = ?, changeRequired = ?, impactSummary = ?, actionOwner = ?,
          dueDate = ?, actionStatus = ?, completedAt = ?, updatedAt = ?
      WHERE id = ? AND institutionId = ?
    `).bind(
      impactLevel,
      changeRequired,
      clean(input.impactSummary),
      clean(input.actionOwner),
      toDateOnly(input.dueDate),
      actionStatus,
      actionStatus === 'Selesai' ? now : null,
      now,
      existing.id,
      institutionId
    ).run();

    return db
      .prepare('SELECT * FROM PolicyRegulationImpact WHERE id = ? AND institutionId = ? LIMIT 1')
      .bind(existing.id, institutionId)
      .first<PolicyRegulationImpactRecord>();
  }

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO PolicyRegulationImpact (
      id, institutionId, policyDocumentId, regulationId, impactLevel,
      changeRequired, impactSummary, actionOwner, dueDate, actionStatus,
      completedAt, createdBy, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    institutionId,
    policyDocumentId,
    regulationId,
    impactLevel,
    changeRequired,
    clean(input.impactSummary),
    clean(input.actionOwner),
    toDateOnly(input.dueDate),
    actionStatus,
    actionStatus === 'Selesai' ? now : null,
    actorName,
    now,
    now
  ).run();

  return db
    .prepare('SELECT * FROM PolicyRegulationImpact WHERE id = ? AND institutionId = ? LIMIT 1')
    .bind(id, institutionId)
    .first<PolicyRegulationImpactRecord>();
}

export async function recordPolicyReview(
  institutionId: string,
  input: ReviewInput
) {
  const db = await ensurePolicyLibrarySchema();
  const policyDocumentId = required(input.policyDocumentId, 'POLICY_LIBRARY_POLICY_REQUIRED');
  await assertPolicyInstitution(db, institutionId, policyDocumentId);

  const reviewerName = required(input.reviewerName, 'POLICY_LIBRARY_REVIEWER_REQUIRED');
  const outcome = required(input.outcome, 'POLICY_LIBRARY_REVIEW_OUTCOME_REQUIRED');
  const reviewDate = toDateOnly(input.reviewDate) || nowIso().slice(0, 10);
  const nextReviewDate = toDateOnly(input.nextReviewDate);
  const id = crypto.randomUUID();
  const now = nowIso();

  await db.prepare(`
    INSERT INTO PolicyReviewHistory (
      id, institutionId, policyDocumentId, reviewDate, reviewerName,
      outcome, notes, resultingVersion, nextReviewDate, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    institutionId,
    policyDocumentId,
    reviewDate,
    reviewerName,
    outcome,
    clean(input.notes),
    clean(input.resultingVersion),
    nextReviewDate,
    now
  ).run();

  await db.prepare(`
    UPDATE PolicyDocument
    SET lastReviewDate = ?,
        nextReviewDate = COALESCE(?, nextReviewDate),
        version = COALESCE(?, version),
        updatedAt = ?
    WHERE id = ? AND institutionId = ?
  `).bind(
    reviewDate,
    nextReviewDate,
    clean(input.resultingVersion),
    now,
    policyDocumentId,
    institutionId
  ).run();

  return db
    .prepare('SELECT * FROM PolicyReviewHistory WHERE id = ? AND institutionId = ? LIMIT 1')
    .bind(id, institutionId)
    .first<PolicyReviewRecord>();
}

export async function listPolicyLibraryOverview(institutionId: string) {
  const db = await ensurePolicyLibrarySchema();

  const [policyResult, policyMetrics, regulationMetrics, impactMetrics] = await Promise.all([
    db.prepare(`
      SELECT id, institutionId, sourceDocumentId, documentCode, documentType, title,
             ownerUnit, ownerName, status, version, issueDate, effectiveDate,
             lastReviewDate, nextReviewDate, reviewCycleMonths, expiryDate,
             scope, summary, createdBy, createdAt, updatedAt
      FROM PolicyDocument
      WHERE institutionId = ?
        AND status != 'Bukan Ketentuan'
        AND NOT (
          documentCode LIKE 'AUTO-%'
          AND (
            lower(replace(title,'_',' ')) LIKE '%kertas kerja%' OR
            lower(replace(title,'_',' ')) LIKE '%walkthrough%' OR
            lower(replace(title,'_',' ')) LIKE '%test of one%' OR
            lower(replace(title,'_',' ')) LIKE '%working paper%' OR
            lower(replace(title,'_',' ')) LIKE '%testing evidence%'
          )
        )
      ORDER BY updatedAt DESC
      LIMIT 1000
    `).bind(institutionId).all<PolicyDocumentRecord>(),
    db.prepare(`
      SELECT
        COUNT(*) AS totalPolicies,
        SUM(CASE WHEN status = 'Berlaku' THEN 1 ELSE 0 END) AS activePolicies,
        SUM(CASE
          WHEN nextReviewDate IS NOT NULL
           AND date(nextReviewDate) >= date('now')
           AND date(nextReviewDate) <= date('now', '+90 day')
          THEN 1 ELSE 0 END) AS dueForReview,
        SUM(CASE
          WHEN nextReviewDate IS NOT NULL
           AND date(nextReviewDate) < date('now')
          THEN 1 ELSE 0 END) AS overdueReview
      FROM PolicyDocument
      WHERE institutionId = ?
        AND status != 'Bukan Ketentuan'
        AND NOT (
          documentCode LIKE 'AUTO-%'
          AND (
            lower(replace(title,'_',' ')) LIKE '%kertas kerja%' OR
            lower(replace(title,'_',' ')) LIKE '%walkthrough%' OR
            lower(replace(title,'_',' ')) LIKE '%test of one%' OR
            lower(replace(title,'_',' ')) LIKE '%working paper%' OR
            lower(replace(title,'_',' ')) LIKE '%testing evidence%'
          )
        )
    `).bind(institutionId).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT COUNT(*) AS totalRegulations
      FROM ExternalRegulationWatch
      WHERE institutionId = ?
    `).bind(institutionId).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT
        SUM(CASE
          WHEN changeRequired = 1 AND actionStatus != 'Selesai'
          THEN 1 ELSE 0 END) AS openRegulatoryActions,
        SUM(CASE
          WHEN changeRequired = 1
           AND actionStatus != 'Selesai'
           AND impactLevel IN ('Tinggi','Kritis')
          THEN 1 ELSE 0 END) AS highImpactOpen
      FROM PolicyRegulationImpact
      WHERE institutionId = ?
    `).bind(institutionId).first<Record<string, unknown>>()
  ]);

  const policies = policyResult.results || [];
  return {
    metrics: {
      totalPolicies: Number(policyMetrics?.totalPolicies || 0),
      activePolicies: Number(policyMetrics?.activePolicies || 0),
      dueForReview: Number(policyMetrics?.dueForReview || 0),
      overdueReview: Number(policyMetrics?.overdueReview || 0),
      totalRegulations: Number(regulationMetrics?.totalRegulations || 0),
      openRegulatoryActions: Number(impactMetrics?.openRegulatoryActions || 0),
      highImpactOpen: Number(impactMetrics?.highImpactOpen || 0)
    },
    policies,
    regulations: [] as ExternalRegulationRecord[],
    impacts: [] as PolicyRegulationImpactRecord[],
    reviews: [] as PolicyReviewRecord[]
  };
}

export async function listExternalRegulationOptions(institutionId: string) {
  const db = await ensurePolicyLibrarySchema();
  const result = await db.prepare(`
    SELECT id,regulator,regulationCode,title,status
    FROM ExternalRegulationWatch
    WHERE institutionId = ?
    ORDER BY regulator ASC, regulationCode ASC
    LIMIT 2000
  `).bind(institutionId).all<{
    id: string;
    regulator: string;
    regulationCode: string;
    title: string;
    status: string;
  }>();
  return result.results || [];
}

export async function listPolicyLibraryRegulatoryData(institutionId: string) {
  const db = await ensurePolicyLibrarySchema();
  const [regulationResult, impactResult, reviewResult] = await Promise.all([
    db.prepare(`
      SELECT id, institutionId, regulator, regulationCode, title, category,
             issueDate, effectiveDate, sourceUrl, status, summary, createdBy,
             createdAt, updatedAt
      FROM ExternalRegulationWatch
      WHERE institutionId = ?
      ORDER BY COALESCE(issueDate, createdAt) DESC, updatedAt DESC
      LIMIT 1000
    `).bind(institutionId).all<ExternalRegulationRecord>(),
    db.prepare(`
      SELECT id, institutionId, policyDocumentId, regulationId, impactLevel,
             changeRequired, impactSummary, actionOwner, dueDate, actionStatus,
             completedAt, createdBy, createdAt, updatedAt
      FROM PolicyRegulationImpact
      WHERE institutionId = ?
      ORDER BY updatedAt DESC
      LIMIT 2000
    `).bind(institutionId).all<PolicyRegulationImpactRecord>(),
    db.prepare(`
      SELECT id, institutionId, policyDocumentId, reviewDate, reviewerName,
             outcome, notes, resultingVersion, nextReviewDate, createdAt
      FROM PolicyReviewHistory
      WHERE institutionId = ?
      ORDER BY reviewDate DESC, createdAt DESC
      LIMIT 1000
    `).bind(institutionId).all<PolicyReviewRecord>()
  ]);

  return {
    regulations: regulationResult.results || [],
    impacts: impactResult.results || [],
    reviews: reviewResult.results || []
  };
}

export async function listPolicyLibraryDashboard(institutionId: string) {
  const db = await ensurePolicyLibrarySchema();

  const [policyResult, regulationResult, impactResult, reviewResult] = await Promise.all([
    db.prepare(`
      SELECT id, institutionId, sourceDocumentId, documentCode, documentType, title,
             ownerUnit, ownerName, status, version, issueDate, effectiveDate,
             lastReviewDate, nextReviewDate, reviewCycleMonths, expiryDate,
             scope, summary, createdBy, createdAt, updatedAt
      FROM PolicyDocument
      WHERE institutionId = ?
        AND status != 'Bukan Ketentuan'
        AND NOT (
          documentCode LIKE 'AUTO-%'
          AND (
            lower(replace(title,'_',' ')) LIKE '%kertas kerja%' OR
            lower(replace(title,'_',' ')) LIKE '%walkthrough%' OR
            lower(replace(title,'_',' ')) LIKE '%test of one%' OR
            lower(replace(title,'_',' ')) LIKE '%working paper%' OR
            lower(replace(title,'_',' ')) LIKE '%testing evidence%'
          )
        )
      ORDER BY updatedAt DESC
      LIMIT 1000
    `).bind(institutionId).all<PolicyDocumentRecord>(),
    db.prepare(`
      SELECT id, institutionId, regulator, regulationCode, title, category,
             issueDate, effectiveDate, sourceUrl, status, summary, createdBy,
             createdAt, updatedAt
      FROM ExternalRegulationWatch
      WHERE institutionId = ?
      ORDER BY COALESCE(issueDate, createdAt) DESC, updatedAt DESC
      LIMIT 1000
    `).bind(institutionId).all<ExternalRegulationRecord>(),
    db.prepare(`
      SELECT id, institutionId, policyDocumentId, regulationId, impactLevel,
             changeRequired, impactSummary, actionOwner, dueDate, actionStatus,
             completedAt, createdBy, createdAt, updatedAt
      FROM PolicyRegulationImpact
      WHERE institutionId = ?
      ORDER BY updatedAt DESC
      LIMIT 2000
    `).bind(institutionId).all<PolicyRegulationImpactRecord>(),
    db.prepare(`
      SELECT id, institutionId, policyDocumentId, reviewDate, reviewerName,
             outcome, notes, resultingVersion, nextReviewDate, createdAt
      FROM PolicyReviewHistory
      WHERE institutionId = ?
      ORDER BY reviewDate DESC, createdAt DESC
      LIMIT 1000
    `).bind(institutionId).all<PolicyReviewRecord>()
  ]);

  const policies = policyResult.results || [];
  const regulations = regulationResult.results || [];
  const impacts = impactResult.results || [];
  const reviews = reviewResult.results || [];
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const dayMs = 24 * 60 * 60 * 1000;

  const daysUntil = (value: string | null) => {
    if (!value) return null;
    const parsed = new Date(value + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.ceil((parsed.getTime() - todayStart.getTime()) / dayMs);
  };

  const dueForReview = policies.filter(item => {
    const days = daysUntil(item.nextReviewDate);
    return days !== null && days >= 0 && days <= 90;
  }).length;
  const overdueReview = policies.filter(item => {
    const days = daysUntil(item.nextReviewDate);
    return days !== null && days < 0;
  }).length;
  const openRegulatoryActions = impacts.filter(
    item => item.changeRequired === 1 && item.actionStatus !== 'Selesai'
  ).length;
  const highImpactOpen = impacts.filter(
    item => item.changeRequired === 1 &&
      item.actionStatus !== 'Selesai' &&
      (item.impactLevel === 'Tinggi' || item.impactLevel === 'Kritis')
  ).length;

  return {
    metrics: {
      totalPolicies: policies.length,
      activePolicies: policies.filter(item => item.status === 'Berlaku').length,
      dueForReview,
      overdueReview,
      totalRegulations: regulations.length,
      openRegulatoryActions,
      highImpactOpen
    },
    policies,
    regulations,
    impacts,
    reviews
  };
}
