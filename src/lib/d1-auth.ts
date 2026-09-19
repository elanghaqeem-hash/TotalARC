import { getCloudflareContext } from '@opennextjs/cloudflare';

import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth-constants';
export { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth-constants';

export type AuthRole =
  | 'Admin'
  | 'ProcessOwner'
  | 'ControlOwner'
  | 'Tester'
  | 'Reviewer'
  | 'Executive'
  | 'Auditor';

export type AuthPermission =
  | 'dashboard:read'
  | 'process:read'
  | 'process:write'
  | 'risk:read'
  | 'risk:write'
  | 'control:read'
  | 'control:write'
  | 'rcm:read'
  | 'assurance:read'
  | 'toe:write'
  | 'remediation:write'
  | 'ccm:write'
  | 'ai:use'
  | 'onboarding:write'
  | 'user:admin';

export type AuthUser = {
  id: string;
  institutionId: string;
  institutionName: string;
  name: string;
  email: string;
  role: AuthRole;
  department: string | null;
  mustChangePassword: boolean;
};

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

const ROLE_PERMISSIONS: Record<AuthRole, Set<AuthPermission | '*'>> = {
  Admin: new Set(['*']),
  ProcessOwner: new Set([
    'dashboard:read','process:read','process:write','risk:read','risk:write',
    'control:read','rcm:read','assurance:read','ai:use'
  ]),
  ControlOwner: new Set([
    'dashboard:read','process:read','risk:read','control:read','control:write',
    'rcm:read','assurance:read','remediation:write','ccm:write','ai:use'
  ]),
  Tester: new Set([
    'dashboard:read','process:read','risk:read','control:read','rcm:read',
    'assurance:read','toe:write','ai:use'
  ]),
  Reviewer: new Set([
    'dashboard:read','process:read','risk:read','control:read','rcm:read',
    'assurance:read','remediation:write','ai:use'
  ]),
  Executive: new Set([
    'dashboard:read','process:read','risk:read','control:read','rcm:read',
    'assurance:read'
  ]),
  Auditor: new Set([
    'dashboard:read','process:read','risk:read','control:read','rcm:read',
    'assurance:read'
  ])
};

const PASSWORD_ITERATIONS = 210_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
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

export async function ensureAuthSchema() {
  const db = await getDb();
  await executeSchemaScript(db, `
    CREATE TABLE IF NOT EXISTS AuthUser (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      department TEXT,
      passwordHash TEXT NOT NULL,
      passwordSalt TEXT NOT NULL,
      passwordIterations INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      mustChangePassword INTEGER NOT NULL DEFAULT 0,
      failedLoginAttempts INTEGER NOT NULL DEFAULT 0,
      lockedUntil TEXT,
      lastLoginAt TEXT,
      lastLoginIp TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_user_institution ON AuthUser(institutionId);
    CREATE INDEX IF NOT EXISTS idx_auth_user_active ON AuthUser(active);

    CREATE TABLE IF NOT EXISTS AuthSession (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      lastSeenAt TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_session_user ON AuthSession(userId);
    CREATE INDEX IF NOT EXISTS idx_auth_session_expiry ON AuthSession(expiresAt);
  `);
  return db;
}

function authEnforced() {
  return (process.env.AUTH_ENFORCE || '').toLowerCase() === 'true';
}

export async function getAuthStatus() {
  const db = await ensureAuthSchema();
  const row = await db.prepare('SELECT COUNT(*) AS count FROM AuthUser').first<{ count?: number }>();
  return {
    storage: 'cloudflare-d1',
    enforced: authEnforced(),
    configured: Boolean(process.env.AUTH_BOOTSTRAP_TOKEN),
    userCount: Number(row?.count || 0)
  };
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function pbkdf2(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function validatePassword(password: string) {
  return (
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function parseCookie(request: Request, name: string) {
  const header = request.headers.get('cookie') || '';
  for (const pair of header.split(';')) {
    const [key, ...value] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function requestIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

function isAuthRole(value: string): value is AuthRole {
  return Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, value);
}

export function hasPermission(role: AuthRole, permission: AuthPermission) {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.has('*') || permissions.has(permission);
}

async function hydrateUser(db: D1DatabaseLike, row: Record<string, unknown>): Promise<AuthUser | null> {
  if (!isAuthRole(String(row.role || ''))) return null;
  const institution = await db.prepare(
    'SELECT id, name FROM Institution WHERE id = ? LIMIT 1'
  ).bind(row.institutionId).first<Record<string, unknown>>();
  if (!institution) return null;

  return {
    id: String(row.id),
    institutionId: String(row.institutionId),
    institutionName: String(institution.name || ''),
    name: String(row.name || ''),
    email: String(row.email || ''),
    role: String(row.role) as AuthRole,
    department: typeof row.department === 'string' ? row.department : null,
    mustChangePassword: row.mustChangePassword === 1
  };
}

export async function getCurrentAuthUser(request: Request): Promise<AuthUser | null> {
  const rawToken = parseCookie(request, SESSION_COOKIE);
  if (!rawToken) return null;

  const db = await ensureAuthSchema();
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date().toISOString();
  const session = await db.prepare(
    `SELECT
       s.id AS sessionId,
       s.userId AS sessionUserId,
       s.expiresAt AS sessionExpiresAt,
       u.id AS id,
       u.institutionId AS institutionId,
       u.name AS name,
       u.email AS email,
       u.role AS role,
       u.department AS department,
       u.mustChangePassword AS mustChangePassword
       FROM AuthSession s
       JOIN AuthUser u ON u.id = s.userId
      WHERE s.tokenHash = ? AND s.expiresAt > ? AND u.active = 1
      LIMIT 1`
  ).bind(tokenHash, now).first<Record<string, unknown>>();

  if (!session) return null;

  await db.prepare(
    'UPDATE AuthSession SET lastSeenAt = ? WHERE tokenHash = ?'
  ).bind(now, tokenHash).run();

  return hydrateUser(db, session);
}

export async function authenticateUser(
  request: Request,
  email: string,
  password: string
): Promise<{ user: AuthUser; token: string }> {
  const db = await ensureAuthSchema();
  const normalizedEmail = email.trim().toLowerCase();
  const row = await db.prepare(
    'SELECT * FROM AuthUser WHERE email = ? LIMIT 1'
  ).bind(normalizedEmail).first<Record<string, unknown>>();

  const dummySalt = '00000000000000000000000000000000';
  const salt = typeof row?.passwordSalt === 'string' ? row.passwordSalt : dummySalt;
  const iterations = Number(row?.passwordIterations || PASSWORD_ITERATIONS);
  const candidateHash = await pbkdf2(password, salt, iterations);
  const validHash =
    typeof row?.passwordHash === 'string' && secureEqual(candidateHash, row.passwordHash);

  if (!row || row.active !== 1) throw new Error('INVALID_CREDENTIALS');

  const now = new Date();
  if (typeof row.lockedUntil === 'string' && new Date(row.lockedUntil) > now) {
    throw new Error('ACCOUNT_LOCKED');
  }

  if (!validHash) {
    const attempts = Number(row.failedLoginAttempts || 0) + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await db.prepare(
      'UPDATE AuthUser SET failedLoginAttempts = ?, lockedUntil = ?, updatedAt = ? WHERE id = ?'
    ).bind(
      shouldLock ? MAX_FAILED_ATTEMPTS : attempts,
      shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null,
      now.toISOString(),
      row.id
    ).run();
    throw new Error('INVALID_CREDENTIALS');
  }

  const user = await hydrateUser(db, row);
  if (!user) throw new Error('INVALID_CREDENTIALS');

  const rawToken = randomHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const sessionId = crypto.randomUUID();
  const createdAt = now.toISOString();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  await db.prepare('DELETE FROM AuthSession WHERE expiresAt <= ?').bind(createdAt).run();
  await db.prepare(
    `INSERT INTO AuthSession (
       id, userId, tokenHash, expiresAt, createdAt, lastSeenAt, ipAddress, userAgent
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    sessionId,
    row.id,
    tokenHash,
    expiresAt,
    createdAt,
    createdAt,
    requestIp(request),
    request.headers.get('user-agent')
  ).run();

  await db.prepare(
    `UPDATE AuthUser
        SET failedLoginAttempts = 0, lockedUntil = NULL, lastLoginAt = ?,
            lastLoginIp = ?, updatedAt = ?
      WHERE id = ?`
  ).bind(createdAt, requestIp(request), createdAt, row.id).run();

  return { user, token: rawToken };
}

export async function logoutSession(request: Request) {
  const rawToken = parseCookie(request, SESSION_COOKIE);
  if (!rawToken) return;
  const db = await ensureAuthSchema();
  const tokenHash = await sha256Hex(rawToken);
  await db.prepare('DELETE FROM AuthSession WHERE tokenHash = ?').bind(tokenHash).run();
}

export async function bootstrapFirstAdmin(input: {
  bootstrapToken: string;
  name: string;
  email: string;
  password: string;
}) {
  const expected = process.env.AUTH_BOOTSTRAP_TOKEN || '';
  if (expected.length < 24 || !secureEqual(input.bootstrapToken, expected)) {
    throw new Error('BOOTSTRAP_FORBIDDEN');
  }
  if (!validatePassword(input.password)) throw new Error('PASSWORD_POLICY');

  const db = await ensureAuthSchema();
  const count = await db.prepare('SELECT COUNT(*) AS count FROM AuthUser').first<{ count?: number }>();
  if (Number(count?.count || 0) > 0) throw new Error('BOOTSTRAP_CLOSED');

  const institution = await db.prepare(
    'SELECT id, name FROM Institution ORDER BY createdAt ASC LIMIT 1'
  ).first<Record<string, unknown>>();
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const salt = randomHex(16);
  const passwordHash = await pbkdf2(input.password, salt, PASSWORD_ITERATIONS);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await db.prepare(
    `INSERT INTO AuthUser (
       id, institutionId, name, email, role, department, passwordHash,
       passwordSalt, passwordIterations, active, mustChangePassword,
       failedLoginAttempts, lockedUntil, lastLoginAt, lastLoginIp,
       createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, 'Admin', NULL, ?, ?, ?, 1, 0, 0, NULL, NULL, NULL, ?, ?)`
  ).bind(
    id,
    institution.id,
    input.name.trim(),
    input.email.trim().toLowerCase(),
    passwordHash,
    salt,
    PASSWORD_ITERATIONS,
    now,
    now
  ).run();

  return {
    id,
    institutionId: String(institution.id),
    institutionName: String(institution.name || ''),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: 'Admin' as const
  };
}

export async function guardApiRequest(
  request: Request,
  permission: AuthPermission
): Promise<{ user: AuthUser | null; response: Response | null }> {
  if (!authEnforced()) return { user: null, response: null };

  const user = await getCurrentAuthUser(request);
  if (!user) {
    return {
      user: null,
      response: Response.json(
        { error: 'Authentication required.', code: 'UNAUTHENTICATED' },
        { status: 401 }
      )
    };
  }

  if (!hasPermission(user.role, permission)) {
    return {
      user,
      response: Response.json(
        { error: 'Permission denied.', code: 'FORBIDDEN' },
        { status: 403 }
      )
    };
  }

  return { user, response: null };
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function guardAuthLoginRate(request: Request) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const limiter = (env as unknown as Record<string, unknown>).AUTH_LOGIN_RATE_LIMIT as
      | { limit: (input: { key: string }) => Promise<{ success: boolean }> }
      | undefined;
    if (!limiter) return true;

    const key = await sha256Hex(
      requestIp(request) || request.headers.get('user-agent') || 'unknown'
    );
    const result = await limiter.limit({ key });
    return result.success;
  } catch {
    return false;
  }
}
