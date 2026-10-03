import { getCloudflareContext } from '@opennextjs/cloudflare';

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

export type EnterpriseAnalysisReviewStatus = 'PENDING_REVIEW' | 'ACCEPTED' | 'UPDATED';

export type EnterpriseOverviewSnapshot = {
  id: string;
  institutionId: string;
  institutionName: string | null;
  generatedAt: string;
  analysisMode: string;
  readiness: Record<string, unknown>;
  metrics: Record<string, unknown>;
  originalAnalysis: Record<string, unknown>;
  analysis: Record<string, unknown>;
  ai: Record<string, unknown> | null;
  disclaimer: string;
  status: EnterpriseAnalysisReviewStatus;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function db() {
  const { env } = await getCloudflareContext({ async: true });
  const database = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!database) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return database;
}

async function ensureSchema() {
  const database = await db();
  await database.exec(`
    CREATE TABLE IF NOT EXISTS EnterpriseAnalysisSnapshot (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      institutionName TEXT,
      generatedAt TEXT NOT NULL,
      analysisMode TEXT NOT NULL,
      readinessJson TEXT NOT NULL,
      metricsJson TEXT NOT NULL,
      originalAnalysisJson TEXT NOT NULL,
      analysisJson TEXT NOT NULL,
      aiJson TEXT,
      disclaimer TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      createdBy TEXT NOT NULL,
      reviewedBy TEXT,
      reviewedAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_enterprise_analysis_institution_created
      ON EnterpriseAnalysisSnapshot(institutionId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_enterprise_analysis_institution_status
      ON EnterpriseAnalysisSnapshot(institutionId, status, updatedAt DESC);
  `);
  return database;
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseObject(value: unknown) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function rowToSnapshot(row: Record<string, unknown>): EnterpriseOverviewSnapshot {
  return {
    id: String(row.id || ''),
    institutionId: String(row.institutionId || ''),
    institutionName: row.institutionName ? String(row.institutionName) : null,
    generatedAt: String(row.generatedAt || ''),
    analysisMode: String(row.analysisMode || ''),
    readiness: parseObject(row.readinessJson),
    metrics: parseObject(row.metricsJson),
    originalAnalysis: parseObject(row.originalAnalysisJson),
    analysis: parseObject(row.analysisJson),
    ai: row.aiJson ? parseObject(row.aiJson) : null,
    disclaimer: String(row.disclaimer || ''),
    status: String(row.status || 'PENDING_REVIEW') as EnterpriseAnalysisReviewStatus,
    createdBy: String(row.createdBy || ''),
    reviewedBy: row.reviewedBy ? String(row.reviewedBy) : null,
    reviewedAt: row.reviewedAt ? String(row.reviewedAt) : null,
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  };
}

export async function saveEnterpriseAnalysisSnapshot(input: {
  institutionId: string;
  institutionName?: string | null;
  generatedAt: string;
  analysisMode: string;
  readiness: Record<string, unknown>;
  metrics: Record<string, unknown>;
  analysis: Record<string, unknown>;
  ai?: Record<string, unknown> | null;
  disclaimer: string;
  createdBy: string;
}) {
  const database = await ensureSchema();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.prepare(
    `INSERT INTO EnterpriseAnalysisSnapshot (
      id,institutionId,institutionName,generatedAt,analysisMode,readinessJson,metricsJson,
      originalAnalysisJson,analysisJson,aiJson,disclaimer,status,createdBy,
      reviewedBy,reviewedAt,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id,
    input.institutionId,
    input.institutionName || null,
    input.generatedAt,
    input.analysisMode,
    json(input.readiness),
    json(input.metrics),
    json(input.analysis),
    json(input.analysis),
    input.ai ? json(input.ai) : null,
    input.disclaimer,
    'PENDING_REVIEW',
    input.createdBy,
    null,
    null,
    now,
    now
  ).run();

  return getEnterpriseAnalysisSnapshot(id, input.institutionId);
}

export async function getEnterpriseAnalysisSnapshot(id: string, institutionId: string) {
  const database = await ensureSchema();
  const row = await database.prepare(
    'SELECT * FROM EnterpriseAnalysisSnapshot WHERE id=? AND institutionId=? LIMIT 1'
  ).bind(id, institutionId).first<Record<string, unknown>>();

  if (!row) throw new Error('ENTERPRISE_ANALYSIS_NOT_FOUND');
  return rowToSnapshot(row);
}

export async function reviewEnterpriseAnalysisSnapshot(input: {
  id: string;
  institutionId: string;
  actor: string;
  action: 'ACCEPT' | 'UPDATE';
  analysis?: Record<string, unknown>;
}) {
  const database = await ensureSchema();
  const existing = await getEnterpriseAnalysisSnapshot(input.id, input.institutionId);
  const now = new Date().toISOString();
  const status: EnterpriseAnalysisReviewStatus =
    input.action === 'UPDATE' ? 'UPDATED' : 'ACCEPTED';
  const nextAnalysis =
    input.action === 'UPDATE' && input.analysis
      ? input.analysis
      : existing.analysis;

  await database.prepare(
    `UPDATE EnterpriseAnalysisSnapshot
        SET analysisJson=?,status=?,reviewedBy=?,reviewedAt=?,updatedAt=?
      WHERE id=? AND institutionId=?`
  ).bind(
    json(nextAnalysis),
    status,
    input.actor,
    now,
    now,
    input.id,
    input.institutionId
  ).run();

  return getEnterpriseAnalysisSnapshot(input.id, input.institutionId);
}
