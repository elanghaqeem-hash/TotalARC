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

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function executeSchema(db: D1DatabaseLike, script: string) {
  await db.exec(script);
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrPeriodLockSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db, `
      CREATE TABLE IF NOT EXISTS ICOFRPeriodClose (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        scopeId TEXT NOT NULL,
        testingCycleId TEXT,
        attestationId TEXT NOT NULL,
        period TEXT NOT NULL,
        testingPeriod TEXT,
        closeName TEXT NOT NULL,
        closeReason TEXT NOT NULL,
        preparedBy TEXT NOT NULL,
        reviewerName TEXT NOT NULL,
        approvedBy TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Closed',
        snapshotVersion INTEGER NOT NULL DEFAULT 0,
        latestSnapshotHash TEXT,
        closedAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_period_close_scope_period
        ON ICOFRPeriodClose(institutionId, scopeId, period);
      CREATE INDEX IF NOT EXISTS idx_icofr_period_close_cycle
        ON ICOFRPeriodClose(institutionId, testingCycleId);
      CREATE INDEX IF NOT EXISTS idx_icofr_period_close_status
        ON ICOFRPeriodClose(institutionId, status, closedAt);

      CREATE TABLE IF NOT EXISTS ICOFRReopenRequest (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        closeId TEXT NOT NULL,
        requestedBy TEXT NOT NULL,
        reason TEXT NOT NULL,
        impactAssessment TEXT NOT NULL,
        requestedUntil TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        approvedBy TEXT,
        approvalDecision TEXT,
        approvalComments TEXT,
        reopenedUntil TEXT,
        reviewedAt TEXT,
        closedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_icofr_reopen_close
        ON ICOFRReopenRequest(closeId, status, reopenedUntil);
      CREATE INDEX IF NOT EXISTS idx_icofr_reopen_institution
        ON ICOFRReopenRequest(institutionId, status, createdAt);
    `);
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).first<T>() : stmt.first<T>();
}

export async function getIcofrPeriodLockState(input: {
  institutionId: string;
  scopeId?: string | null;
  testingCycleId?: string | null;
  period?: string | null;
}) {
  const db = await ensureIcofrPeriodLockSchema();

  let close: Record<string, unknown> | null = null;

  if (input.scopeId) {
    close = await first<Record<string, unknown>>(
      db,
      `SELECT * FROM ICOFRPeriodClose
        WHERE institutionId=? AND status='Closed' AND scopeId=?
        ORDER BY closedAt DESC LIMIT 1`,
      [input.institutionId, input.scopeId]
    );
  } else if (input.testingCycleId) {
    close = await first<Record<string, unknown>>(
      db,
      `SELECT * FROM ICOFRPeriodClose
        WHERE institutionId=? AND status='Closed' AND testingCycleId=?
        ORDER BY closedAt DESC LIMIT 1`,
      [input.institutionId, input.testingCycleId]
    );
  } else if (input.period) {
    close = await first<Record<string, unknown>>(
      db,
      `SELECT *
         FROM ICOFRPeriodClose
        WHERE institutionId=?
          AND status='Closed'
          AND (period=? OR testingPeriod=?)
        ORDER BY closedAt DESC
        LIMIT 1`,
      [input.institutionId, input.period, input.period]
    );
  } else {
    return { locked: false, close: null, reopen: null };
  }

  if (!close) return { locked: false, close: null, reopen: null };

  const now = new Date().toISOString();
  const reopen = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRReopenRequest
      WHERE closeId=?
        AND status='Approved'
        AND reopenedUntil IS NOT NULL
        AND reopenedUntil>=?
      ORDER BY reviewedAt DESC
      LIMIT 1`,
    [close.id, now]
  );

  return {
    locked: !reopen,
    close,
    reopen
  };
}

export async function assertIcofrPeriodWritable(input: {
  institutionId: string;
  scopeId?: string | null;
  testingCycleId?: string | null;
  period?: string | null;
}) {
  const state = await getIcofrPeriodLockState(input);
  if (state.locked) {
    const error = new Error('PERIOD_CLOSED') as Error & {
      closeId?: string;
      period?: string;
      closedAt?: string;
    };
    error.closeId = state.close?.id ? String(state.close.id) : undefined;
    error.period = state.close?.period ? String(state.close.period) : undefined;
    error.closedAt = state.close?.closedAt ? String(state.close.closedAt) : undefined;
    throw error;
  }
  return state;
}
