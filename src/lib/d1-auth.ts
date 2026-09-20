import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import {
  AUTH_ROLES,
  type AuthRole,
  type AuthSessionClaims,
  getAuthRuntimeConfig,
  roleCanAdministerUsers,
  signSessionToken,
  verifySessionToken
} from '@/lib/auth-token';

type Prepared = {
  bind: (...values: unknown[]) => {
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
};

type D1DatabaseLike = {
  exec: (sql: string) => Promise<unknown>;
  prepare: (sql: string) => Prepared;
};

export type AuthenticatedSession = {
  claims: AuthSessionClaims;
  session: Record<string, unknown>;
  user: Record<string, unknown> & {
    id: string;
    institutionId: string;
    email: string;
    name: string;
    role: AuthRole;
    status: string;
    primaryOrgUnitId: string | null;
    mustChangePassword: boolean;
  };
  organizationUnits: Array<Record<string, unknown>>;
};

const PASSWORD_ITERATIONS = 310_000;
const FAILED_LOGIN_LIMIT = 5;
const LOCK_MINUTES = 15;
const PASSWORD_HISTORY_LIMIT = 5;

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x4000) {
    const chunk = bytes.subarray(i, Math.min(bytes.length, i + 0x4000));
    for (let j = 0; j < chunk.length; j += 1) binary += String.fromCharCode(chunk[j]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256String(value: string) {
  const input = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(input.byteLength);
  new Uint8Array(buffer).set(input);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePasswordHash(password: string, saltValue: string, iterations: number) {
  const passwordBytes = new TextEncoder().encode(password);
  const salt = base64UrlToBytes(saltValue);
  const passwordBuffer = new ArrayBuffer(passwordBytes.byteLength);
  new Uint8Array(passwordBuffer).set(passwordBytes);
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);

  const key = await crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBuffer, iterations },
    key,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

async function constantTimeEqual(left: string, right: string) {
  const leftHash = await sha256String(left);
  const rightHash = await sha256String(right);
  if (leftHash.length !== rightHash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < leftHash.length; i += 1) mismatch |= leftHash.charCodeAt(i) ^ rightHash.charCodeAt(i);
  return mismatch === 0;
}

function validatePassword(password: string, email?: string) {
  if (password.length < 12 || password.length > 128) throw new Error('PASSWORD_POLICY');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('PASSWORD_POLICY');
  }
  const lower = password.toLowerCase();
  const blocked = ['password', 'admin123', 'qwerty', 'letmein', 'welcome123', 'totalarc123'];
  if (blocked.some(item => lower.includes(item))) throw new Error('PASSWORD_POLICY');
  const local = email ? email.split('@')[0]?.toLowerCase() : '';
  if (local && local.length >= 5 && lower.includes(local)) throw new Error('PASSWORD_POLICY');
}

let authSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureAuthSchema() {
  if (authSchemaReady) return authSchemaReady;

  authSchemaReady = (async () => {
    const db = await getDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS AuthUser (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        employeeId TEXT,
        jobTitle TEXT,
        phone TEXT,
        role TEXT NOT NULL,
        primaryOrgUnitId TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        passwordHash TEXT NOT NULL,
        passwordSalt TEXT NOT NULL,
        passwordIterations INTEGER NOT NULL,
        mustChangePassword INTEGER NOT NULL DEFAULT 1,
        failedLoginCount INTEGER NOT NULL DEFAULT 0,
        lockedUntil TEXT,
        lastLoginAt TEXT,
        passwordChangedAt TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_email
        ON AuthUser(lower(email));
      CREATE INDEX IF NOT EXISTS idx_auth_user_institution
        ON AuthUser(institutionId,status,role);

      CREATE TABLE IF NOT EXISTS AuthUserUnitAccess (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        userId TEXT NOT NULL,
        orgUnitId TEXT NOT NULL,
        accessLevel TEXT NOT NULL DEFAULT 'Assigned',
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_unit_unique
        ON AuthUserUnitAccess(userId,orgUnitId);
      CREATE INDEX IF NOT EXISTS idx_auth_user_unit_institution
        ON AuthUserUnitAccess(institutionId,userId);

      CREATE TABLE IF NOT EXISTS AuthSession (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        userId TEXT NOT NULL,
        tokenHash TEXT NOT NULL,
        issuedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        lastSeenAt TEXT NOT NULL,
        revokedAt TEXT,
        ipAddress TEXT,
        userAgent TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_session_token
        ON AuthSession(tokenHash);
      CREATE INDEX IF NOT EXISTS idx_auth_session_user
        ON AuthSession(userId,expiresAt,revokedAt);

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

      CREATE TABLE IF NOT EXISTS AuthSecurityEvent (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT,
        userId TEXT,
        email TEXT,
        eventType TEXT NOT NULL,
        outcome TEXT NOT NULL,
        ipAddress TEXT,
        userAgent TEXT,
        details TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_security_event
        ON AuthSecurityEvent(institutionId,createdAt DESC);
    `);
    return db;
  })().catch(error => {
    authSchemaReady = null;
    throw error;
  });

  return authSchemaReady;
}

async function securityEvent(
  db: D1DatabaseLike,
  input: {
    institutionId?: string | null;
    userId?: string | null;
    email?: string | null;
    eventType: string;
    outcome: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: unknown;
  }
) {
  await run(
    db,
    `INSERT INTO AuthSecurityEvent (
      id,institutionId,userId,email,eventType,outcome,ipAddress,userAgent,details,createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      input.institutionId || null,
      input.userId || null,
      input.email || null,
      input.eventType,
      input.outcome,
      input.ipAddress || null,
      input.userAgent || null,
      input.details === undefined ? null : JSON.stringify(input.details),
      nowIso()
    ]
  );
}

async function writeAudit(
  db: D1DatabaseLike,
  institutionId: string,
  actorName: string,
  actorRole: string,
  action: string,
  recordId: string,
  oldValue: unknown,
  newValue: unknown,
  reason: string,
  ipAddress?: string | null
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
      actorName,
      actorRole,
      action,
      'AuthUser',
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
      reason,
      ipAddress || null,
      nowIso()
    ]
  );
}

async function savePasswordHistory(
  db: D1DatabaseLike,
  userId: string,
  passwordHash: string,
  passwordSalt: string,
  passwordIterations: number
) {
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
}

async function ensurePasswordNotReused(
  db: D1DatabaseLike,
  userId: string,
  newPassword: string
) {
  const history = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM AuthPasswordHistory
      WHERE userId=?
      ORDER BY createdAt DESC
      LIMIT ${PASSWORD_HISTORY_LIMIT}`,
    [userId]
  );

  for (const item of history) {
    const candidate = await derivePasswordHash(
      newPassword,
      String(item.passwordSalt),
      Number(item.passwordIterations)
    );
    if (await constantTimeEqual(candidate, String(item.passwordHash))) {
      throw new Error('PASSWORD_REUSE');
    }
  }
}

async function getUserUnits(db: D1DatabaseLike, userId: string, institutionId: string) {
  const table = await first<{ name?: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='OrganizationUnit' LIMIT 1"
  );
  if (!table) return [];

  return all<Record<string, unknown>>(
    db,
    `SELECT a.*,u.code,u.name,u.type,u.parentId,u.legalEntityId,u.status AS unitStatus
       FROM AuthUserUnitAccess a
       JOIN OrganizationUnit u ON u.id=a.orgUnitId
      WHERE a.userId=? AND a.institutionId=? AND u.institutionId=?
      ORDER BY u.code,u.name`,
    [userId, institutionId, institutionId]
  );
}

export async function getAuthStatus() {
  const db = await ensureAuthSchema();
  const config = getAuthRuntimeConfig();

  const [count, active, institutions, sessions] = await Promise.all([
    first<{ count?: number }>(db, 'SELECT COUNT(*) AS count FROM AuthUser'),
    first<{ count?: number }>(db, "SELECT COUNT(*) AS count FROM AuthUser WHERE status='Active'"),
    all<Record<string, unknown>>(
      db,
      'SELECT id,name,legalName,shortName FROM Institution ORDER BY createdAt'
    ),
    first<{ count?: number }>(
      db,
      "SELECT COUNT(*) AS count FROM AuthSession WHERE revokedAt IS NULL AND expiresAt>?",
      [nowIso()]
    )
  ]);

  const userCount = Number(count?.count || 0);
  return {
    enforce: config.enforce,
    secretReady: config.secretReady,
    bootstrapReady: config.bootstrapReady,
    sessionTtlMinutes: config.ttlMinutes,
    userCount,
    activeUsers: Number(active?.count || 0),
    activeSessions: Number(sessions?.count || 0),
    bootstrapAllowed: userCount === 0 && config.bootstrapReady,
    institutions:
      userCount === 0
        ? institutions.map(item => ({
            id: item.id,
            name: item.name,
            legalName: item.legalName,
            shortName: item.shortName
          }))
        : [],
    readiness: {
      sessionSecret: config.secretReady,
      bootstrapSecret: config.bootstrapReady,
      firstAdmin: userCount > 0,
      enforcement: config.enforce
    }
  };
}

export async function bootstrapFirstAdmin(input: {
  bootstrapToken: string;
  institutionId: string;
  email: string;
  name: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const db = await ensureAuthSchema();
  const config = getAuthRuntimeConfig();
  if (!config.bootstrapReady) throw new Error('BOOTSTRAP_NOT_CONFIGURED');
  if (!(await constantTimeEqual(input.bootstrapToken, config.bootstrapSecret))) {
    await securityEvent(db, {
      email: normalizeEmail(input.email),
      eventType: 'BOOTSTRAP',
      outcome: 'DENIED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      details: { reason: 'Invalid bootstrap token' }
    });
    throw new Error('BOOTSTRAP_DENIED');
  }

  const count = await first<{ count?: number }>(db, 'SELECT COUNT(*) AS count FROM AuthUser');
  if (Number(count?.count || 0) > 0) throw new Error('BOOTSTRAP_CLOSED');

  const institution = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution WHERE id=? LIMIT 1',
    [input.institutionId]
  );
  if (!institution) throw new Error('INSTITUTION_NOT_FOUND');

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !email.includes('@') || !name) throw new Error('USER_REQUIRED');
  validatePassword(input.password, email);

  const salt = bytesToBase64Url(randomBytes(18));
  const passwordHash = await derivePasswordHash(input.password, salt, PASSWORD_ITERATIONS);
  const id = crypto.randomUUID();
  const now = nowIso();

  await run(
    db,
    `INSERT INTO AuthUser (
      id,institutionId,email,name,employeeId,jobTitle,phone,role,primaryOrgUnitId,status,
      passwordHash,passwordSalt,passwordIterations,mustChangePassword,failedLoginCount,lockedUntil,
      lastLoginAt,passwordChangedAt,createdBy,createdAt,updatedAt
    ) VALUES (?,?,?,?,NULL,NULL,NULL,'InstitutionAdmin',NULL,'Active',?,?,?,0,0,NULL,NULL,?,'BOOTSTRAP',?,?)`,
    [
      id,
      institution.id,
      email,
      name,
      passwordHash,
      salt,
      PASSWORD_ITERATIONS,
      now,
      now,
      now
    ]
  );
  await savePasswordHistory(db, id, passwordHash, salt, PASSWORD_ITERATIONS);
  await securityEvent(db, {
    institutionId: String(institution.id),
    userId: id,
    email,
    eventType: 'BOOTSTRAP',
    outcome: 'SUCCESS',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });
  await writeAudit(
    db,
    String(institution.id),
    name,
    'InstitutionAdmin',
    'CREATE',
    id,
    undefined,
    { email, name, role: 'InstitutionAdmin', status: 'Active' },
    'First institution administrator bootstrapped using one-time environment secret.',
    input.ipAddress
  );

  return {
    id,
    institutionId: String(institution.id),
    email,
    name,
    role: 'InstitutionAdmin',
    status: 'Active'
  };
}

export async function authenticateUser(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const db = await ensureAuthSchema();
  const config = getAuthRuntimeConfig();
  if (!config.secretReady) throw new Error('AUTH_SECRET_NOT_CONFIGURED');

  const email = normalizeEmail(input.email);
  const user = await first<Record<string, any>>(
    db,
    'SELECT * FROM AuthUser WHERE lower(email)=? LIMIT 1',
    [email]
  );

  if (!user) {
    await securityEvent(db, {
      email,
      eventType: 'LOGIN',
      outcome: 'FAILED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      details: { reason: 'Invalid credentials' }
    });
    throw new Error('INVALID_CREDENTIALS');
  }

  if (String(user.status) !== 'Active') {
    await securityEvent(db, {
      institutionId: String(user.institutionId),
      userId: String(user.id),
      email,
      eventType: 'LOGIN',
      outcome: 'DENIED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      details: { reason: 'User not active' }
    });
    throw new Error('USER_NOT_ACTIVE');
  }

  if (user.lockedUntil && String(user.lockedUntil) > nowIso()) {
    throw new Error('ACCOUNT_LOCKED');
  }

  const candidate = await derivePasswordHash(
    input.password,
    String(user.passwordSalt),
    Number(user.passwordIterations)
  );
  const valid = await constantTimeEqual(candidate, String(user.passwordHash));

  if (!valid) {
    const failed = Number(user.failedLoginCount || 0) + 1;
    const lockedUntil =
      failed >= FAILED_LOGIN_LIMIT
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null;
    await run(
      db,
      'UPDATE AuthUser SET failedLoginCount=?,lockedUntil=?,updatedAt=? WHERE id=?',
      [failed, lockedUntil, nowIso(), user.id]
    );
    await securityEvent(db, {
      institutionId: String(user.institutionId),
      userId: String(user.id),
      email,
      eventType: 'LOGIN',
      outcome: 'FAILED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      details: { failedLoginCount: failed, lockedUntil }
    });
    throw new Error(lockedUntil ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS');
  }

  if (!AUTH_ROLES.includes(String(user.role) as AuthRole)) throw new Error('INVALID_ROLE');

  const sid = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const exp = issuedAt + config.ttlMinutes * 60;
  const claims: AuthSessionClaims = {
    sid,
    uid: String(user.id),
    institutionId: String(user.institutionId),
    role: String(user.role) as AuthRole,
    primaryOrgUnitId: clean(user.primaryOrgUnitId),
    mustChangePassword: bool(user.mustChangePassword),
    iat: issuedAt,
    exp
  };
  const token = await signSessionToken(claims, config.secret);
  const tokenHash = await sha256String(token);
  const expiresAt = new Date(exp * 1000).toISOString();
  const now = nowIso();

  await run(
    db,
    `INSERT INTO AuthSession (
      id,institutionId,userId,tokenHash,issuedAt,expiresAt,lastSeenAt,revokedAt,ipAddress,userAgent
    ) VALUES (?,?,?,?,?,?,?,NULL,?,?)`,
    [
      sid,
      user.institutionId,
      user.id,
      tokenHash,
      now,
      expiresAt,
      now,
      input.ipAddress || null,
      input.userAgent || null
    ]
  );

  await run(
    db,
    'UPDATE AuthUser SET failedLoginCount=0,lockedUntil=NULL,lastLoginAt=?,updatedAt=? WHERE id=?',
    [now, now, user.id]
  );

  await securityEvent(db, {
    institutionId: String(user.institutionId),
    userId: String(user.id),
    email,
    eventType: 'LOGIN',
    outcome: 'SUCCESS',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });

  return {
    token,
    expiresAt,
    claims,
    user: {
      id: String(user.id),
      institutionId: String(user.institutionId),
      email,
      name: String(user.name),
      role: String(user.role),
      mustChangePassword: bool(user.mustChangePassword)
    }
  };
}

export async function getAuthenticatedSession(token: string): Promise<AuthenticatedSession | null> {
  const config = getAuthRuntimeConfig();
  if (!config.secretReady) return null;

  const claims = await verifySessionToken(token, config.secret);
  if (!claims) return null;

  const db = await ensureAuthSchema();
  const tokenHash = await sha256String(token);
  const session = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM AuthSession
      WHERE id=? AND userId=? AND institutionId=? AND tokenHash=?
        AND revokedAt IS NULL AND expiresAt>?
      LIMIT 1`,
    [claims.sid, claims.uid, claims.institutionId, tokenHash, nowIso()]
  );
  if (!session) return null;

  const user = await first<Record<string, any>>(
    db,
    `SELECT u.*,ou.code AS primaryOrgUnitCode,ou.name AS primaryOrgUnitName
       FROM AuthUser u
       LEFT JOIN OrganizationUnit ou
         ON ou.id=u.primaryOrgUnitId AND ou.institutionId=u.institutionId
      WHERE u.id=? AND u.institutionId=? AND u.status='Active'
      LIMIT 1`,
    [claims.uid, claims.institutionId]
  );
  if (!user || String(user.role) !== claims.role) return null;

  const organizationUnits = await getUserUnits(db, claims.uid, claims.institutionId);

  const lastSeen = String(session.lastSeenAt || '');
  if (!lastSeen || Date.now() - new Date(lastSeen).getTime() > 5 * 60_000) {
    await run(db, 'UPDATE AuthSession SET lastSeenAt=? WHERE id=?', [nowIso(), claims.sid]);
  }

  return {
    claims,
    session,
    user: {
      ...user,
      id: String(user.id),
      institutionId: String(user.institutionId),
      email: String(user.email),
      name: String(user.name),
      role: String(user.role) as AuthRole,
      status: String(user.status),
      primaryOrgUnitId: clean(user.primaryOrgUnitId),
      mustChangePassword: bool(user.mustChangePassword)
    },
    organizationUnits
  };
}

export async function revokeSession(token: string, reason = 'Logout') {
  const config = getAuthRuntimeConfig();
  if (!config.secretReady) return { success: true };
  const claims = await verifySessionToken(token, config.secret);
  if (!claims) return { success: true };

  const db = await ensureAuthSchema();
  await run(
    db,
    'UPDATE AuthSession SET revokedAt=? WHERE id=? AND userId=? AND institutionId=? AND revokedAt IS NULL',
    [nowIso(), claims.sid, claims.uid, claims.institutionId]
  );
  await securityEvent(db, {
    institutionId: claims.institutionId,
    userId: claims.uid,
    eventType: 'LOGOUT',
    outcome: 'SUCCESS',
    details: { reason }
  });
  return { success: true };
}

export async function listUsersForAdmin(session: AuthenticatedSession) {
  if (!roleCanAdministerUsers(session.user.role)) throw new Error('ADMIN_REQUIRED');
  const db = await ensureAuthSchema();

  const userSql =
    session.user.role === 'SuperAdmin'
      ? `SELECT u.*,i.name AS institutionName,i.shortName AS institutionShortName,
          ou.code AS primaryOrgUnitCode,ou.name AS primaryOrgUnitName
           FROM AuthUser u
           JOIN Institution i ON i.id=u.institutionId
           LEFT JOIN OrganizationUnit ou ON ou.id=u.primaryOrgUnitId
          ORDER BY i.name,u.name,u.email`
      : `SELECT u.*,i.name AS institutionName,i.shortName AS institutionShortName,
          ou.code AS primaryOrgUnitCode,ou.name AS primaryOrgUnitName
           FROM AuthUser u
           JOIN Institution i ON i.id=u.institutionId
           LEFT JOIN OrganizationUnit ou ON ou.id=u.primaryOrgUnitId
          WHERE u.institutionId=?
          ORDER BY u.name,u.email`;

  const users = await all<Record<string, any>>(
    db,
    userSql,
    session.user.role === 'SuperAdmin' ? [] : [session.user.institutionId]
  );
  const institutions = await all<Record<string, unknown>>(
    db,
    'SELECT id,name,legalName,shortName FROM Institution ORDER BY name'
  );
  const orgUnits = await all<Record<string, unknown>>(
    db,
    session.user.role === 'SuperAdmin'
      ? 'SELECT * FROM OrganizationUnit ORDER BY institutionId,code,name'
      : 'SELECT * FROM OrganizationUnit WHERE institutionId=? ORDER BY code,name',
    session.user.role === 'SuperAdmin' ? [] : [session.user.institutionId]
  );
  const access = await all<Record<string, unknown>>(
    db,
    session.user.role === 'SuperAdmin'
      ? 'SELECT * FROM AuthUserUnitAccess ORDER BY userId,orgUnitId'
      : 'SELECT * FROM AuthUserUnitAccess WHERE institutionId=? ORDER BY userId,orgUnitId',
    session.user.role === 'SuperAdmin' ? [] : [session.user.institutionId]
  );

  return {
    users: users.map(user => ({
      ...user,
      passwordHash: undefined,
      passwordSalt: undefined,
      mustChangePassword: bool(user.mustChangePassword),
      unitAccess: access.filter(item => String(item.userId) === String(user.id))
    })),
    institutions,
    organizationUnits: orgUnits,
    roles: AUTH_ROLES
  };
}

async function replaceUserUnitAccess(
  db: D1DatabaseLike,
  institutionId: string,
  userId: string,
  orgUnitIds: string[]
) {
  const uniqueIds = Array.from(new Set(orgUnitIds.filter(Boolean)));
  for (const orgUnitId of uniqueIds) {
    const unit = await first(
      db,
      'SELECT id FROM OrganizationUnit WHERE id=? AND institutionId=? AND status=? LIMIT 1',
      [orgUnitId, institutionId, 'Active']
    );
    if (!unit) throw new Error('ORG_UNIT_NOT_FOUND');
  }

  await run(db, 'DELETE FROM AuthUserUnitAccess WHERE userId=? AND institutionId=?', [userId, institutionId]);
  for (const orgUnitId of uniqueIds) {
    await run(
      db,
      `INSERT INTO AuthUserUnitAccess (
        id,institutionId,userId,orgUnitId,accessLevel,createdAt
      ) VALUES (?,?,?,?,?,?)`,
      [crypto.randomUUID(), institutionId, userId, orgUnitId, 'Assigned', nowIso()]
    );
  }
}

export async function createAuthUser(
  session: AuthenticatedSession,
  input: {
    institutionId?: string | null;
    email: string;
    name: string;
    employeeId?: string | null;
    jobTitle?: string | null;
    phone?: string | null;
    role: string;
    primaryOrgUnitId?: string | null;
    orgUnitIds?: string[];
    temporaryPassword: string;
  },
  ipAddress?: string | null
) {
  if (!roleCanAdministerUsers(session.user.role)) throw new Error('ADMIN_REQUIRED');
  const db = await ensureAuthSchema();

  const institutionId =
    session.user.role === 'SuperAdmin' && input.institutionId
      ? input.institutionId
      : session.user.institutionId;

  const institution = await first(
    db,
    'SELECT id FROM Institution WHERE id=? LIMIT 1',
    [institutionId]
  );
  if (!institution) throw new Error('INSTITUTION_NOT_FOUND');

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const role = input.role as AuthRole;
  if (!email || !email.includes('@') || !name || !AUTH_ROLES.includes(role)) throw new Error('USER_REQUIRED');
  if (role === 'SuperAdmin' && session.user.role !== 'SuperAdmin') throw new Error('ROLE_NOT_ALLOWED');

  const duplicate = await first(db, 'SELECT id FROM AuthUser WHERE lower(email)=? LIMIT 1', [email]);
  if (duplicate) throw new Error('EMAIL_CONFLICT');

  validatePassword(input.temporaryPassword, email);
  const salt = bytesToBase64Url(randomBytes(18));
  const hash = await derivePasswordHash(input.temporaryPassword, salt, PASSWORD_ITERATIONS);
  const primaryOrgUnitId = clean(input.primaryOrgUnitId);

  if (primaryOrgUnitId) {
    const unit = await first(
      db,
      'SELECT id FROM OrganizationUnit WHERE id=? AND institutionId=? AND status=? LIMIT 1',
      [primaryOrgUnitId, institutionId, 'Active']
    );
    if (!unit) throw new Error('ORG_UNIT_NOT_FOUND');
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO AuthUser (
      id,institutionId,email,name,employeeId,jobTitle,phone,role,primaryOrgUnitId,status,
      passwordHash,passwordSalt,passwordIterations,mustChangePassword,failedLoginCount,lockedUntil,
      lastLoginAt,passwordChangedAt,createdBy,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,'Active',?,?,?,1,0,NULL,NULL,?,?,?,?,?)`,
    [
      id,
      institutionId,
      email,
      name,
      clean(input.employeeId),
      clean(input.jobTitle),
      clean(input.phone),
      role,
      primaryOrgUnitId,
      hash,
      salt,
      PASSWORD_ITERATIONS,
      now,
      session.user.email,
      now,
      now
    ]
  );
  await savePasswordHistory(db, id, hash, salt, PASSWORD_ITERATIONS);
  await replaceUserUnitAccess(db, institutionId, id, input.orgUnitIds || []);

  const created = {
    id,
    institutionId,
    email,
    name,
    role,
    primaryOrgUnitId,
    status: 'Active',
    mustChangePassword: true
  };
  await writeAudit(
    db,
    institutionId,
    session.user.name,
    session.user.role,
    'CREATE',
    id,
    undefined,
    created,
    'User account created by institution administration. Temporary password is never stored in plaintext.',
    ipAddress
  );
  await securityEvent(db, {
    institutionId,
    userId: id,
    email,
    eventType: 'USER_CREATED',
    outcome: 'SUCCESS',
    ipAddress,
    details: { actorUserId: session.user.id, role }
  });

  return created;
}

export async function updateAuthUser(
  session: AuthenticatedSession,
  input: Record<string, unknown>,
  ipAddress?: string | null
) {
  if (!roleCanAdministerUsers(session.user.role)) throw new Error('ADMIN_REQUIRED');
  const db = await ensureAuthSchema();
  const id = String(input.id || '').trim();
  if (!id) throw new Error('USER_REQUIRED');

  const existing = await first<Record<string, any>>(
    db,
    'SELECT * FROM AuthUser WHERE id=? LIMIT 1',
    [id]
  );
  if (!existing) throw new Error('USER_NOT_FOUND');
  if (session.user.role !== 'SuperAdmin' && String(existing.institutionId) !== session.user.institutionId) {
    throw new Error('ADMIN_REQUIRED');
  }

  const role = String(input.role || existing.role) as AuthRole;
  if (!AUTH_ROLES.includes(role)) throw new Error('INVALID_ROLE');
  if (role === 'SuperAdmin' && session.user.role !== 'SuperAdmin') throw new Error('ROLE_NOT_ALLOWED');

  const status = String(input.status || existing.status);
  if (!['Active', 'Suspended', 'Disabled'].includes(status)) throw new Error('INVALID_STATUS');
  if (id === session.user.id && status !== 'Active') throw new Error('SELF_DISABLE_BLOCKED');

  const primaryOrgUnitId = clean(input.primaryOrgUnitId);
  if (primaryOrgUnitId) {
    const unit = await first(
      db,
      'SELECT id FROM OrganizationUnit WHERE id=? AND institutionId=? AND status=? LIMIT 1',
      [primaryOrgUnitId, existing.institutionId, 'Active']
    );
    if (!unit) throw new Error('ORG_UNIT_NOT_FOUND');
  }

  const name = String(input.name || existing.name).trim();
  if (!name) throw new Error('USER_REQUIRED');
  const now = nowIso();

  await run(
    db,
    `UPDATE AuthUser SET
      name=?,employeeId=?,jobTitle=?,phone=?,role=?,primaryOrgUnitId=?,status=?,
      failedLoginCount=CASE WHEN ?='Active' THEN 0 ELSE failedLoginCount END,
      lockedUntil=CASE WHEN ?='Active' THEN NULL ELSE lockedUntil END,
      updatedAt=?
     WHERE id=?`,
    [
      name,
      clean(input.employeeId),
      clean(input.jobTitle),
      clean(input.phone),
      role,
      primaryOrgUnitId,
      status,
      status,
      status,
      now,
      id
    ]
  );

  if (Array.isArray(input.orgUnitIds)) {
    await replaceUserUnitAccess(
      db,
      String(existing.institutionId),
      id,
      input.orgUnitIds.map(item => String(item))
    );
  }

  if (status !== 'Active' || role !== String(existing.role)) {
    await run(
      db,
      'UPDATE AuthSession SET revokedAt=? WHERE userId=? AND revokedAt IS NULL',
      [now, id]
    );
  }

  const updated = await first<Record<string, any>>(db, 'SELECT * FROM AuthUser WHERE id=?', [id]);
  await writeAudit(
    db,
    String(existing.institutionId),
    session.user.name,
    session.user.role,
    'UPDATE',
    id,
    { ...existing, passwordHash: undefined, passwordSalt: undefined },
    { ...updated, passwordHash: undefined, passwordSalt: undefined },
    'User role, status, profile or organizational access updated by administrator.',
    ipAddress
  );

  return {
    ...updated,
    passwordHash: undefined,
    passwordSalt: undefined,
    mustChangePassword: bool(updated?.mustChangePassword)
  };
}

export async function setTemporaryPassword(
  session: AuthenticatedSession,
  userId: string,
  temporaryPassword: string,
  ipAddress?: string | null
) {
  if (!roleCanAdministerUsers(session.user.role)) throw new Error('ADMIN_REQUIRED');
  const db = await ensureAuthSchema();
  const user = await first<Record<string, any>>(db, 'SELECT * FROM AuthUser WHERE id=? LIMIT 1', [userId]);
  if (!user) throw new Error('USER_NOT_FOUND');
  if (session.user.role !== 'SuperAdmin' && String(user.institutionId) !== session.user.institutionId) {
    throw new Error('ADMIN_REQUIRED');
  }

  validatePassword(temporaryPassword, String(user.email));
  await ensurePasswordNotReused(db, userId, temporaryPassword);

  const salt = bytesToBase64Url(randomBytes(18));
  const hash = await derivePasswordHash(temporaryPassword, salt, PASSWORD_ITERATIONS);
  const now = nowIso();

  await run(
    db,
    `UPDATE AuthUser SET
      passwordHash=?,passwordSalt=?,passwordIterations=?,mustChangePassword=1,
      failedLoginCount=0,lockedUntil=NULL,passwordChangedAt=?,updatedAt=?
     WHERE id=?`,
    [hash, salt, PASSWORD_ITERATIONS, now, now, userId]
  );
  await savePasswordHistory(db, userId, hash, salt, PASSWORD_ITERATIONS);
  await run(db, 'UPDATE AuthSession SET revokedAt=? WHERE userId=? AND revokedAt IS NULL', [now, userId]);

  await securityEvent(db, {
    institutionId: String(user.institutionId),
    userId,
    email: String(user.email),
    eventType: 'PASSWORD_RESET',
    outcome: 'SUCCESS',
    ipAddress,
    details: { actorUserId: session.user.id }
  });
  return { id: userId, mustChangePassword: true, sessionsRevoked: true };
}

export async function updateOwnProfile(
  session: AuthenticatedSession,
  input: Record<string, unknown>,
  ipAddress?: string | null
) {
  const db = await ensureAuthSchema();
  const name = String(input.name || '').trim();
  if (!name) throw new Error('USER_REQUIRED');

  const existing = await first<Record<string, any>>(
    db,
    'SELECT * FROM AuthUser WHERE id=? AND institutionId=? LIMIT 1',
    [session.user.id, session.user.institutionId]
  );
  if (!existing) throw new Error('USER_NOT_FOUND');

  const now = nowIso();
  await run(
    db,
    'UPDATE AuthUser SET name=?,jobTitle=?,phone=?,updatedAt=? WHERE id=? AND institutionId=?',
    [
      name,
      clean(input.jobTitle),
      clean(input.phone),
      now,
      session.user.id,
      session.user.institutionId
    ]
  );
  const updated = await first<Record<string, any>>(db, 'SELECT * FROM AuthUser WHERE id=?', [session.user.id]);
  await writeAudit(
    db,
    session.user.institutionId,
    session.user.name,
    session.user.role,
    'UPDATE_PROFILE',
    session.user.id,
    { name: existing.name, jobTitle: existing.jobTitle, phone: existing.phone },
    { name: updated?.name, jobTitle: updated?.jobTitle, phone: updated?.phone },
    'User updated their own profile.',
    ipAddress
  );
  return {
    ...updated,
    passwordHash: undefined,
    passwordSalt: undefined,
    mustChangePassword: bool(updated?.mustChangePassword)
  };
}

export async function changeOwnPassword(
  session: AuthenticatedSession,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string | null
) {
  const db = await ensureAuthSchema();
  const user = await first<Record<string, any>>(db, 'SELECT * FROM AuthUser WHERE id=? LIMIT 1', [session.user.id]);
  if (!user) throw new Error('USER_NOT_FOUND');

  const candidate = await derivePasswordHash(
    currentPassword,
    String(user.passwordSalt),
    Number(user.passwordIterations)
  );
  if (!(await constantTimeEqual(candidate, String(user.passwordHash)))) {
    await securityEvent(db, {
      institutionId: session.user.institutionId,
      userId: session.user.id,
      email: session.user.email,
      eventType: 'PASSWORD_CHANGE',
      outcome: 'FAILED',
      ipAddress,
      details: { reason: 'Current password mismatch' }
    });
    throw new Error('CURRENT_PASSWORD_INVALID');
  }

  validatePassword(newPassword, session.user.email);
  await ensurePasswordNotReused(db, session.user.id, newPassword);

  const salt = bytesToBase64Url(randomBytes(18));
  const hash = await derivePasswordHash(newPassword, salt, PASSWORD_ITERATIONS);
  const now = nowIso();

  await run(
    db,
    `UPDATE AuthUser SET
      passwordHash=?,passwordSalt=?,passwordIterations=?,mustChangePassword=0,
      passwordChangedAt=?,failedLoginCount=0,lockedUntil=NULL,updatedAt=?
     WHERE id=?`,
    [hash, salt, PASSWORD_ITERATIONS, now, now, session.user.id]
  );
  await savePasswordHistory(db, session.user.id, hash, salt, PASSWORD_ITERATIONS);
  await run(
    db,
    'UPDATE AuthSession SET revokedAt=? WHERE userId=? AND revokedAt IS NULL',
    [now, session.user.id]
  );
  await securityEvent(db, {
    institutionId: session.user.institutionId,
    userId: session.user.id,
    email: session.user.email,
    eventType: 'PASSWORD_CHANGE',
    outcome: 'SUCCESS',
    ipAddress,
    details: { allSessionsRevoked: true }
  });

  return { success: true, requiresLogin: true };
}

export async function getSecurityAdministration(session: AuthenticatedSession) {
  if (!roleCanAdministerUsers(session.user.role)) throw new Error('ADMIN_REQUIRED');
  const db = await ensureAuthSchema();
  const institutionFilter = session.user.role === 'SuperAdmin' ? '' : 'WHERE institutionId=?';
  const values = session.user.role === 'SuperAdmin' ? [] : [session.user.institutionId];

  const [events, sessions, locked, suspended] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT * FROM AuthSecurityEvent ${institutionFilter}
        ORDER BY createdAt DESC LIMIT 200`,
      values
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT s.id,s.institutionId,s.userId,s.issuedAt,s.expiresAt,s.lastSeenAt,s.ipAddress,s.userAgent,
              u.email,u.name,u.role,i.shortName AS institutionShortName
         FROM AuthSession s
         JOIN AuthUser u ON u.id=s.userId
         JOIN Institution i ON i.id=s.institutionId
        WHERE s.revokedAt IS NULL AND s.expiresAt>?
        ${session.user.role === 'SuperAdmin' ? '' : 'AND s.institutionId=?'}
        ORDER BY s.lastSeenAt DESC LIMIT 200`,
      session.user.role === 'SuperAdmin' ? [nowIso()] : [nowIso(), session.user.institutionId]
    ),
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count FROM AuthUser
        WHERE lockedUntil>?
        ${session.user.role === 'SuperAdmin' ? '' : 'AND institutionId=?'}`,
      session.user.role === 'SuperAdmin' ? [nowIso()] : [nowIso(), session.user.institutionId]
    ),
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count FROM AuthUser
        WHERE status<>'Active'
        ${session.user.role === 'SuperAdmin' ? '' : 'AND institutionId=?'}`,
      session.user.role === 'SuperAdmin' ? [] : [session.user.institutionId]
    )
  ]);

  return {
    runtime: await getAuthStatus(),
    events,
    activeSessions: sessions,
    metrics: {
      activeSessions: sessions.length,
      lockedUsers: Number(locked?.count || 0),
      suspendedUsers: Number(suspended?.count || 0),
      recentFailedLogins: events.filter(
        item => item.eventType === 'LOGIN' && item.outcome === 'FAILED'
      ).length
    }
  };
}

export async function revokeAdminSession(
  actor: AuthenticatedSession,
  sessionId: string,
  ipAddress?: string | null
) {
  if (!roleCanAdministerUsers(actor.user.role)) throw new Error('ADMIN_REQUIRED');
  const db = await ensureAuthSchema();
  const target = await first<Record<string, any>>(
    db,
    `SELECT s.*,u.email,u.name
       FROM AuthSession s JOIN AuthUser u ON u.id=s.userId
      WHERE s.id=? LIMIT 1`,
    [sessionId]
  );
  if (!target) throw new Error('SESSION_NOT_FOUND');
  if (actor.user.role !== 'SuperAdmin' && String(target.institutionId) !== actor.user.institutionId) {
    throw new Error('ADMIN_REQUIRED');
  }

  await run(db, 'UPDATE AuthSession SET revokedAt=? WHERE id=?', [nowIso(), sessionId]);
  await securityEvent(db, {
    institutionId: String(target.institutionId),
    userId: String(target.userId),
    email: String(target.email),
    eventType: 'SESSION_REVOKED',
    outcome: 'SUCCESS',
    ipAddress,
    details: { actorUserId: actor.user.id, sessionId }
  });
  return { success: true };
}
