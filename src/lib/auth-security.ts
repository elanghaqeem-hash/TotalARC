import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { SessionPayload } from '@/lib/auth-token';

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
  if (!db) throw new Error('AUTH_DATABASE_UNAVAILABLE');
  return db;
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).first<T>() : statement.first<T>();
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

function nowIso() {
  return new Date().toISOString();
}

export const AUTH_LOGIN_RATE_LIMIT = {
  ipPerMinute: { scope: 'IP_1M', limit: 5, windowMs: 60 * 1000 },
  accountPer15Minutes: { scope: 'ACCOUNT_15M', limit: 20, windowMs: 15 * 60 * 1000 },
  ipPerHour: { scope: 'IP_1H', limit: 100, windowMs: 60 * 60 * 1000 }
} as const;

export type AuthLoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  violatedScopes: string[];
};

async function hashRateLimitKey(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode('totalarc-auth-rate-limit-v1|' + value)
  );
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let index = 0; index < bytes.length; index += 1) {
    hex += bytes[index].toString(16).padStart(2, '0');
  }
  return hex;
}

async function consumeLoginRateLimit(input: {
  db: D1DatabaseLike;
  scope: string;
  rawKey: string;
  limit: number;
  windowMs: number;
  nowMs: number;
}) {
  const keyHash = await hashRateLimitKey(input.rawKey);
  const now = input.nowMs;
  const updatedAt = new Date(now).toISOString();

  await run(
    input.db,
    `INSERT INTO AuthLoginRateLimit (
      scope,keyHash,windowStartedAt,count,updatedAt
    ) VALUES (?,?,?,1,?)
    ON CONFLICT(scope,keyHash) DO UPDATE SET
      windowStartedAt = CASE
        WHEN (? - AuthLoginRateLimit.windowStartedAt) >= ?
          THEN ?
        ELSE AuthLoginRateLimit.windowStartedAt
      END,
      count = CASE
        WHEN (? - AuthLoginRateLimit.windowStartedAt) >= ?
          THEN 1
        ELSE AuthLoginRateLimit.count + 1
      END,
      updatedAt = ?`,
    [
      input.scope,
      keyHash,
      now,
      updatedAt,
      now,
      input.windowMs,
      now,
      now,
      input.windowMs,
      updatedAt
    ]
  );

  const row = await first<{ windowStartedAt?: number; count?: number }>(
    input.db,
    'SELECT windowStartedAt,count FROM AuthLoginRateLimit WHERE scope=? AND keyHash=? LIMIT 1',
    [input.scope, keyHash]
  );

  const count = Number(row?.count || 0);
  const startedAt = Number(row?.windowStartedAt || now);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((startedAt + input.windowMs - now) / 1000)
  );

  return {
    scope: input.scope,
    blocked: count > input.limit,
    retryAfterSeconds
  };
}

export async function enforceAuthLoginRateLimit(input: {
  ipAddress?: string | null;
  email?: string | null;
}): Promise<AuthLoginRateLimitResult> {
  try {
    const db = await ensureAuthSecuritySchema();
    const nowMs = Date.now();
    const checks: Array<Promise<{
      scope: string;
      blocked: boolean;
      retryAfterSeconds: number;
    }>> = [];

    const ipAddress = String(input.ipAddress || '').trim();
    if (ipAddress) {
      checks.push(
        consumeLoginRateLimit({
          db,
          rawKey: ipAddress,
          nowMs,
          ...AUTH_LOGIN_RATE_LIMIT.ipPerMinute
        }),
        consumeLoginRateLimit({
          db,
          rawKey: ipAddress,
          nowMs,
          ...AUTH_LOGIN_RATE_LIMIT.ipPerHour
        })
      );
    }

    const account = String(input.email || '').trim().toLowerCase();
    if (account) {
      checks.push(
        consumeLoginRateLimit({
          db,
          rawKey: account,
          nowMs,
          ...AUTH_LOGIN_RATE_LIMIT.accountPer15Minutes
        })
      );
    }

    const results = await Promise.all(checks);
    const blocked = results.filter(item => item.blocked);
    return {
      allowed: blocked.length === 0,
      retryAfterSeconds: blocked.length
        ? Math.max(...blocked.map(item => item.retryAfterSeconds))
        : 0,
      violatedScopes: blocked.map(item => item.scope)
    };
  } catch (error) {
    console.error('AUTH_LOGIN_RATE_LIMIT unavailable:', error);
    throw new Error('AUTH_LOGIN_RATE_LIMIT_UNAVAILABLE');
  }
}

const CLOUDFLARE_PBKDF2_MAX_ITERATIONS = 100000;

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureAuthSecuritySchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    const sessionTable = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'AuthSession' LIMIT 1")
      .first<{ name?: string }>();
    const passwordHistoryTable = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'AuthPasswordHistory' LIMIT 1")
      .first<{ name?: string }>();

    if (!sessionTable || !passwordHistoryTable) {
      await executeSchemaScript(db, `
        CREATE TABLE IF NOT EXISTS AuthSession (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          institutionId TEXT,
          issuedAt TEXT NOT NULL,
          expiresAt TEXT NOT NULL,
          lastSeenAt TEXT NOT NULL,
          revokedAt TEXT,
          revokedReason TEXT,
          revokedBy TEXT,
          ipAddress TEXT,
          userAgent TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_auth_session_user
          ON AuthSession(userId,expiresAt,revokedAt);
        CREATE INDEX IF NOT EXISTS idx_auth_session_institution
          ON AuthSession(institutionId,expiresAt,revokedAt);

        CREATE TABLE IF NOT EXISTS AuthPasswordHistory (
          id TEXT PRIMARY KEY NOT NULL,
          userId TEXT NOT NULL,
          passwordHash TEXT NOT NULL,
          passwordSalt TEXT NOT NULL,
          passwordIterations INTEGER NOT NULL,
          createdAt TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_auth_password_history_user
          ON AuthPasswordHistory(userId,createdAt DESC);
      `);
    }

    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS AuthLoginRateLimit (
        scope TEXT NOT NULL,
        keyHash TEXT NOT NULL,
        windowStartedAt INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (scope,keyHash)
      );
      CREATE INDEX IF NOT EXISTS idx_auth_login_rate_limit_updated
        ON AuthLoginRateLimit(updatedAt);
    `);

    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

function encodeBytes(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const passwordBytes = new TextEncoder().encode(password);
  const passwordBuffer = new ArrayBuffer(passwordBytes.byteLength);
  new Uint8Array(passwordBuffer).set(passwordBytes);
  const saltCopy = new Uint8Array(salt);
  const saltBuffer = new ArrayBuffer(saltCopy.byteLength);
  new Uint8Array(saltBuffer).set(saltCopy);

  const key = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    key,
    256
  );
  return encodeBytes(new Uint8Array(bits));
}

async function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function validatePasswordPolicy(password: string, email?: string | null) {
  if (password.length < 12 || password.length > 128) throw new Error('PASSWORD_POLICY');
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error('PASSWORD_POLICY');
  }

  const lower = password.toLowerCase();
  const prohibited = [
    'password',
    'admin123',
    'qwerty',
    'letmein',
    'welcome123',
    'totalarc123',
    'changeme',
    '123456789'
  ];
  if (prohibited.some(value => lower.includes(value))) throw new Error('PASSWORD_POLICY');

  const localPart = String(email || '').split('@')[0]?.toLowerCase() || '';
  if (localPart.length >= 5 && lower.includes(localPart)) throw new Error('PASSWORD_POLICY');
}

export async function savePasswordHistory(
  userId: string,
  passwordHash: string,
  passwordSalt: string,
  passwordIterations: number
) {
  const db = await ensureAuthSecuritySchema();
  await run(
    db,
    `INSERT INTO AuthPasswordHistory (
      id,userId,passwordHash,passwordSalt,passwordIterations,createdAt
    ) VALUES (?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      userId,
      passwordHash,
      passwordSalt,
      passwordIterations,
      nowIso()
    ]
  );

  const old = await all<{ id: string }>(
    db,
    `SELECT id FROM AuthPasswordHistory
      WHERE userId=?
      ORDER BY createdAt DESC
      LIMIT -1 OFFSET 5`,
    [userId]
  );
  for (const item of old) {
    await run(db, 'DELETE FROM AuthPasswordHistory WHERE id=? AND userId=?', [item.id, userId]);
  }
}

export async function assertPasswordNotReused(input: {
  userId: string;
  password: string;
  currentHash: string;
  currentSalt: string;
  currentIterations: number;
}) {
  if (input.currentIterations <= CLOUDFLARE_PBKDF2_MAX_ITERATIONS) {
    const currentCandidate = await derivePasswordHash(
      input.password,
      decodeBytes(input.currentSalt),
      input.currentIterations
    );
    if (await safeEqual(currentCandidate, input.currentHash)) throw new Error('PASSWORD_REUSE');
  }

  const db = await ensureAuthSecuritySchema();
  const history = await all<{
    passwordHash: string;
    passwordSalt: string;
    passwordIterations: number;
  }>(
    db,
    `SELECT passwordHash,passwordSalt,passwordIterations
       FROM AuthPasswordHistory
      WHERE userId=?
      ORDER BY createdAt DESC
      LIMIT 5`,
    [input.userId]
  );

  for (const item of history) {
    const iterations = Number(item.passwordIterations);
    if (iterations > CLOUDFLARE_PBKDF2_MAX_ITERATIONS) continue;
    const candidate = await derivePasswordHash(
      input.password,
      decodeBytes(item.passwordSalt),
      iterations
    );
    if (await safeEqual(candidate, item.passwordHash)) throw new Error('PASSWORD_REUSE');
  }
}

export async function registerAuthSession(
  session: SessionPayload,
  input: { ipAddress?: string | null; userAgent?: string | null }
) {
  const db = await ensureAuthSecuritySchema();
  await run(
    db,
    `INSERT INTO AuthSession (
      id,userId,institutionId,issuedAt,expiresAt,lastSeenAt,revokedAt,
      revokedReason,revokedBy,ipAddress,userAgent
    ) VALUES (?,?,?,?,?,?,NULL,NULL,NULL,?,?)`,
    [
      session.jti,
      session.sub,
      session.institutionId,
      new Date(session.iat * 1000).toISOString(),
      new Date(session.exp * 1000).toISOString(),
      nowIso(),
      input.ipAddress || null,
      input.userAgent || null
    ]
  );
}

export async function isAuthSessionActive(session: SessionPayload, touch = false) {
  const db = await ensureAuthSecuritySchema();
  const record = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM AuthSession
      WHERE id=? AND userId=? AND revokedAt IS NULL AND expiresAt>?
      LIMIT 1`,
    [session.jti, session.sub, nowIso()]
  );
  if (!record) return false;

  const recordInstitution = record.institutionId ? String(record.institutionId) : null;
  if (recordInstitution !== session.institutionId) return false;

  if (touch) {
    const lastSeen = String(record.lastSeenAt || '');
    const elapsed = lastSeen ? Date.now() - new Date(lastSeen).getTime() : Number.POSITIVE_INFINITY;
    if (elapsed > 5 * 60 * 1000) {
      await run(db, 'UPDATE AuthSession SET lastSeenAt=? WHERE id=? AND revokedAt IS NULL', [
        nowIso(),
        session.jti
      ]);
    }
  }

  return true;
}

export async function revokeSession(
  sessionId: string,
  reason: string,
  revokedBy?: string | null
) {
  const db = await ensureAuthSecuritySchema();
  await run(
    db,
    `UPDATE AuthSession
        SET revokedAt=COALESCE(revokedAt,?),revokedReason=COALESCE(revokedReason,?),revokedBy=COALESCE(revokedBy,?)
      WHERE id=?`,
    [nowIso(), reason, revokedBy || null, sessionId]
  );
}

export async function revokeUserSessions(
  userId: string,
  reason: string,
  revokedBy?: string | null,
  exceptSessionId?: string | null
) {
  const db = await ensureAuthSecuritySchema();
  const now = nowIso();
  if (exceptSessionId) {
    await run(
      db,
      `UPDATE AuthSession SET revokedAt=?,revokedReason=?,revokedBy=?
        WHERE userId=? AND revokedAt IS NULL AND id<>?`,
      [now, reason, revokedBy || null, userId, exceptSessionId]
    );
  } else {
    await run(
      db,
      `UPDATE AuthSession SET revokedAt=?,revokedReason=?,revokedBy=?
        WHERE userId=? AND revokedAt IS NULL`,
      [now, reason, revokedBy || null, userId]
    );
  }
}

export async function getSecurityAdministration(institutionId: string | null) {
  const db = await ensureAuthSecuritySchema();
  const sessionValues: unknown[] = [nowIso()];
  let sessionWhere = 's.revokedAt IS NULL AND s.expiresAt>?';
  if (institutionId) {
    sessionWhere += ' AND s.institutionId=?';
    sessionValues.push(institutionId);
  }

  const activeSessions = await all<Record<string, unknown>>(
    db,
    `SELECT s.*,u.name,u.email,u.role
       FROM AuthSession s
       JOIN AuthUser u ON u.id=s.userId
      WHERE ${sessionWhere}
      ORDER BY s.lastSeenAt DESC
      LIMIT 200`,
    sessionValues
  );

  const eventValues: unknown[] = [];
  let eventWhere = '';
  if (institutionId) {
    eventWhere = 'WHERE institutionId=?';
    eventValues.push(institutionId);
  }

  const events = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM AuthEvent
      ${eventWhere}
      ORDER BY createdAt DESC
      LIMIT 250`,
    eventValues
  );

  const lockedValues: unknown[] = [nowIso()];
  let lockedWhere = 'lockedUntil>?';
  if (institutionId) {
    lockedWhere += ' AND institutionId=?';
    lockedValues.push(institutionId);
  }
  const locked = await first<{ count?: number }>(
    db,
    `SELECT COUNT(*) AS count FROM AuthUser WHERE ${lockedWhere}`,
    lockedValues
  );

  const disabled = await first<{ count?: number }>(
    db,
    institutionId
      ? 'SELECT COUNT(*) AS count FROM AuthUser WHERE active=0 AND institutionId=?'
      : 'SELECT COUNT(*) AS count FROM AuthUser WHERE active=0',
    institutionId ? [institutionId] : []
  );

  return {
    activeSessions,
    events,
    metrics: {
      activeSessions: activeSessions.length,
      lockedUsers: Number(locked?.count || 0),
      disabledUsers: Number(disabled?.count || 0),
      failedLoginEvents: events.filter(item =>
        ['LOGIN_FAILED', 'ACCOUNT_LOCKED'].includes(String(item.eventType))
      ).length
    }
  };
}
