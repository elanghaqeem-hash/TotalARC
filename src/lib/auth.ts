import { getCloudflareContext } from '@opennextjs/cloudflare';
import { isUserRole, ROLE_TITLES, type UserRole } from '@/lib/access-control';
import {
  AUTH_SESSION_SECONDS,
  isAuthSecretUsable,
  signSessionToken,
  verifySessionToken,
  type SessionPayload
} from '@/lib/auth-token';
import {
  assertPasswordNotReused,
  getSecurityAdministration,
  isAuthSessionActive,
  registerAuthSession,
  revokeSession,
  revokeUserSessions,
  savePasswordHistory,
  validatePasswordPolicy
} from '@/lib/auth-security';

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

type RuntimeEnv = Record<string, unknown>;

type AuthUserRow = {
  id: string;
  institutionId: string | null;
  orgUnitId: string | null;
  name: string;
  email: string;
  emailNormalized: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  role: string;
  department: string | null;
  active: number;
  mustChangePassword: number;
  credentialResetAt: string | null;
  temporaryCredentialExpiresAt: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthUserProfile = {
  id: string;
  institutionId: string | null;
  institutionName: string;
  orgUnitId: string | null;
  name: string;
  email: string;
  role: UserRole;
  roleTitle: string;
  department: string;
  mustChangePassword: boolean;
};

async function runtimeEnv(): Promise<RuntimeEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as RuntimeEnv;
  } catch {
    return process.env as unknown as RuntimeEnv;
  }
}

async function getDb(): Promise<D1DatabaseLike> {
  const env = await runtimeEnv();
  const db = env.DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('AUTH_DATABASE_UNAVAILABLE');
  return db;
}

export async function getRuntimeAuthSecret() {
  const env = await runtimeEnv();
  const secret = String(env.TOTAL_ARC_AUTH_SECRET || process.env.TOTAL_ARC_AUTH_SECRET || '');
  if (!isAuthSecretUsable(secret)) throw new Error('AUTH_NOT_CONFIGURED');
  return secret;
}

function envString(env: RuntimeEnv, key: string) {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
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

let authSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureAuthSchema() {
  if (authSchemaReady) return authSchemaReady;

  authSchemaReady = (async () => {
    const db = await getDb();
    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS AuthUser (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT,
        orgUnitId TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        emailNormalized TEXT NOT NULL,
        passwordHash TEXT NOT NULL,
        passwordSalt TEXT NOT NULL,
        passwordIterations INTEGER NOT NULL DEFAULT 100000,
        role TEXT NOT NULL,
        department TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        mustChangePassword INTEGER NOT NULL DEFAULT 0,
        credentialResetAt TEXT,
        temporaryCredentialExpiresAt TEXT,
        failedLoginCount INTEGER NOT NULL DEFAULT 0,
        lockedUntil TEXT,
        lastLoginAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_user_email
        ON AuthUser(emailNormalized);
      CREATE INDEX IF NOT EXISTS idx_auth_user_institution
        ON AuthUser(institutionId);
      CREATE INDEX IF NOT EXISTS idx_auth_user_role
        ON AuthUser(role);

      CREATE TABLE IF NOT EXISTS AuthEvent (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT,
        institutionId TEXT,
        eventType TEXT NOT NULL,
        email TEXT,
        role TEXT,
        ipAddress TEXT,
        userAgent TEXT,
        detail TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_event_created
        ON AuthEvent(createdAt);
      CREATE INDEX IF NOT EXISTS idx_auth_event_user
        ON AuthEvent(userId);
    `);
    const columns = await db.prepare('PRAGMA table_info(AuthUser)').all<{ name?: string }>();
    const names = new Set((columns.results || []).map(column => String(column.name || '')));
    if (!names.has('credentialResetAt')) {
      await executeSchemaScript(db, 'ALTER TABLE AuthUser ADD COLUMN credentialResetAt TEXT;');
    }
    if (!names.has('temporaryCredentialExpiresAt')) {
      await executeSchemaScript(db, 'ALTER TABLE AuthUser ADD COLUMN temporaryCredentialExpiresAt TEXT;');
    }

    return db;
  })().catch(error => {
    authSchemaReady = null;
    throw error;
  });

  return authSchemaReady;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
      salt: new Uint8Array(salt).buffer,
      iterations
    },
    key,
    256
  );
  return encodeBytes(new Uint8Array(bits));
}

const PASSWORD_ITERATIONS = 100000;

async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = PASSWORD_ITERATIONS;
  return {
    hash: await derivePasswordHash(password, salt, iterations),
    salt: encodeBytes(salt),
    iterations
  };
}

async function verifyPassword(password: string, row: AuthUserRow) {
  const iterations = Number(row.passwordIterations || PASSWORD_ITERATIONS);
  if (iterations > PASSWORD_ITERATIONS) {
    throw new Error('PASSWORD_HASH_RUNTIME_UNSUPPORTED');
  }
  const calculated = await derivePasswordHash(
    password,
    decodeBytes(row.passwordSalt),
    iterations
  );
  if (calculated.length !== row.passwordHash.length) return false;
  let difference = 0;
  for (let index = 0; index < calculated.length; index += 1) {
    difference |= calculated.charCodeAt(index) ^ row.passwordHash.charCodeAt(index);
  }
  return difference === 0;
}

async function first<T>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).run() : statement.run();
}

async function writeAuthEvent(
  db: D1DatabaseLike,
  input: {
    userId?: string | null;
    institutionId?: string | null;
    eventType: string;
    email?: string | null;
    role?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    detail?: string | null;
  }
) {
  await run(
    db,
    `INSERT INTO AuthEvent (
      id, userId, institutionId, eventType, email, role,
      ipAddress, userAgent, detail, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.userId || null,
      input.institutionId || null,
      input.eventType,
      input.email || null,
      input.role || null,
      input.ipAddress || null,
      input.userAgent || null,
      input.detail || null,
      new Date().toISOString()
    ]
  );
}

async function findPrimaryInstitution(db: D1DatabaseLike) {
  try {
    return await first<{ id: string; name: string }>(
      db,
      'SELECT id, name FROM Institution ORDER BY createdAt ASC LIMIT 1'
    );
  } catch {
    return null;
  }
}

export async function provisionBootstrapAdministrator(
  options: { reconcilePendingAdmin?: boolean } = { reconcilePendingAdmin: true }
) {
  const db = await ensureAuthSchema();
  const env = await runtimeEnv();
  const bootstrapEmail = normalizeEmail(envString(env, 'TOTAL_ARC_BOOTSTRAP_ADMIN_EMAIL'));
  const bootstrapPassword = envString(env, 'TOTAL_ARC_BOOTSTRAP_ADMIN_PASSWORD');
  const bootstrapName = envString(env, 'TOTAL_ARC_BOOTSTRAP_ADMIN_NAME') || 'Total ARC Administrator';

  if (!bootstrapEmail || !bootstrapPassword) throw new Error('AUTH_BOOTSTRAP_REQUIRED');
  try {
    validatePasswordPolicy(bootstrapPassword, bootstrapEmail);
  } catch {
    throw new Error('AUTH_BOOTSTRAP_WEAK_PASSWORD');
  }

  const institution = await findPrimaryInstitution(db);
  const count = await first<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM AuthUser'
  );
  const password = await createPasswordHash(bootstrapPassword);
  const now = new Date().toISOString();

  if (Number(count?.count || 0) === 0) {
    const id = crypto.randomUUID();

    await run(
      db,
      `INSERT INTO AuthUser (
        id, institutionId, orgUnitId, name, email, emailNormalized,
        passwordHash, passwordSalt, passwordIterations, role, department,
        active, mustChangePassword, failedLoginCount, lockedUntil,
        lastLoginAt, createdAt, updatedAt
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'Admin', NULL, 1, 1, 0, NULL, NULL, ?, ?)`,
      [
        id,
        institution?.id || null,
        bootstrapName,
        bootstrapEmail,
        bootstrapEmail,
        password.hash,
        password.salt,
        password.iterations,
        now,
        now
      ]
    );

    await savePasswordHistory(id, password.hash, password.salt, password.iterations);
    await writeAuthEvent(db, {
      userId: id,
      institutionId: institution?.id || null,
      eventType: 'BOOTSTRAP_ADMIN_CREATED',
      email: bootstrapEmail,
      role: 'Admin',
      detail: 'Initial administrator provisioned from deployment secrets. Password change is required at first sign-in.'
    });

    return { status: 'created' as const, userId: id };
  }

  let candidate = await first<AuthUserRow>(
    db,
    `SELECT * FROM AuthUser
     WHERE role = 'Admin' AND lastLoginAt IS NULL AND emailNormalized = ?
     ORDER BY createdAt ASC
     LIMIT 1`,
    [bootstrapEmail]
  );

  if (!candidate && options.reconcilePendingAdmin) {
    candidate = await first<AuthUserRow>(
      db,
      `SELECT * FROM AuthUser
       WHERE role = 'Admin' AND lastLoginAt IS NULL
       ORDER BY createdAt ASC
       LIMIT 1`
    );
  }

  if (candidate) {
    const emailConflict = await first<{ id: string }>(
      db,
      'SELECT id FROM AuthUser WHERE emailNormalized = ? AND id <> ? LIMIT 1',
      [bootstrapEmail, candidate.id]
    );
    if (emailConflict) throw new Error('USER_EMAIL_CONFLICT');

    await run(
      db,
      `UPDATE AuthUser SET
        institutionId = COALESCE(institutionId, ?),
        name = ?,
        email = ?,
        emailNormalized = ?,
        passwordHash = ?,
        passwordSalt = ?,
        passwordIterations = ?,
        active = 1,
        mustChangePassword = 1,
        failedLoginCount = 0,
        lockedUntil = NULL,
        updatedAt = ?
      WHERE id = ?`,
      [
        institution?.id || null,
        bootstrapName,
        bootstrapEmail,
        bootstrapEmail,
        password.hash,
        password.salt,
        password.iterations,
        now,
        candidate.id
      ]
    );

    await savePasswordHistory(
      candidate.id,
      password.hash,
      password.salt,
      password.iterations
    );
    await revokeUserSessions(
      candidate.id,
      'Bootstrap administrator credentials reconciled',
      candidate.id
    );
    await writeAuthEvent(db, {
      userId: candidate.id,
      institutionId: candidate.institutionId || institution?.id || null,
      eventType: 'BOOTSTRAP_ADMIN_RECONCILED',
      email: bootstrapEmail,
      role: 'Admin',
      detail: 'Pre-login bootstrap administrator credentials reconciled from deployment secrets. Password change is required at first sign-in.'
    });

    return { status: 'reconciled' as const, userId: candidate.id };
  }

  return { status: 'existing' as const, userId: null };
}

async function ensureBootstrapAdministratorForLogin(
  db: D1DatabaseLike,
  requestedEmail: string
) {
  const count = await first<{ count: number }>(
    db,
    'SELECT COUNT(*) AS count FROM AuthUser'
  );

  if (Number(count?.count || 0) === 0) {
    await provisionBootstrapAdministrator({ reconcilePendingAdmin: false });
    return;
  }

  const env = await runtimeEnv();
  const bootstrapEmail = normalizeEmail(envString(env, 'TOTAL_ARC_BOOTSTRAP_ADMIN_EMAIL'));
  if (!bootstrapEmail || requestedEmail !== bootstrapEmail) return;

  const configuredAdmin = await first<{ id: string }>(
    db,
    'SELECT id FROM AuthUser WHERE emailNormalized = ? LIMIT 1',
    [bootstrapEmail]
  );

  if (configuredAdmin) {
    const pendingConfiguredAdmin = await first<{ id: string }>(
      db,
      `SELECT id FROM AuthUser
       WHERE id = ? AND role = 'Admin' AND lastLoginAt IS NULL
       LIMIT 1`,
      [configuredAdmin.id]
    );

    if (pendingConfiguredAdmin) {
      await provisionBootstrapAdministrator({ reconcilePendingAdmin: false });
    }
    return;
  }

  const pendingAdmin = await first<{ id: string }>(
    db,
    `SELECT id FROM AuthUser
     WHERE role = 'Admin' AND lastLoginAt IS NULL
     ORDER BY createdAt ASC
     LIMIT 1`
  );

  if (pendingAdmin) {
    await provisionBootstrapAdministrator({ reconcilePendingAdmin: true });
  }
}

async function institutionNameFor(db: D1DatabaseLike, institutionId: string | null) {
  if (!institutionId) return 'No institution registered';
  try {
    const institution = await first<{ name: string }>(
      db,
      'SELECT name FROM Institution WHERE id = ? LIMIT 1',
      [institutionId]
    );
    return institution?.name || 'Institution';
  } catch {
    return 'Institution';
  }
}

async function profileFromRow(db: D1DatabaseLike, row: AuthUserRow): Promise<AuthUserProfile> {
  if (!isUserRole(row.role)) throw new Error('AUTH_ROLE_INVALID');
  return {
    id: row.id,
    institutionId: row.institutionId,
    institutionName: await institutionNameFor(db, row.institutionId),
    orgUnitId: row.orgUnitId,
    name: row.name,
    email: row.email,
    role: row.role,
    roleTitle: ROLE_TITLES[row.role],
    department: row.department || '',
    mustChangePassword: Boolean(row.mustChangePassword)
  };
}

export async function authenticateUser(input: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const emailNormalized = normalizeEmail(input.email);
  if (!emailNormalized || !input.password) throw new Error('INVALID_CREDENTIALS');

  const db = await ensureAuthSchema();
  await ensureBootstrapAdministratorForLogin(db, emailNormalized);

  let row = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE emailNormalized = ? LIMIT 1',
    [emailNormalized]
  );

  if (!row) {
    await writeAuthEvent(db, {
      eventType: 'LOGIN_FAILED',
      email: emailNormalized,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      detail: 'Unknown user or invalid credentials.'
    });
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!row.active) throw new Error('ACCOUNT_DISABLED');

  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now()) {
    throw new Error('ACCOUNT_LOCKED');
  }

  const passwordValid = await verifyPassword(input.password, row);
  if (!passwordValid) {
    const nextFailed = Number(row.failedLoginCount || 0) + 1;
    const lockedUntil =
      nextFailed >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

    await run(
      db,
      'UPDATE AuthUser SET failedLoginCount = ?, lockedUntil = ?, updatedAt = ? WHERE id = ?',
      [nextFailed, lockedUntil, new Date().toISOString(), row.id]
    );

    await writeAuthEvent(db, {
      userId: row.id,
      institutionId: row.institutionId,
      eventType: lockedUntil ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
      email: row.email,
      role: row.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      detail: lockedUntil
        ? 'Account locked for 15 minutes after repeated failed logins.'
        : 'Invalid credentials.'
    });

    throw new Error(lockedUntil ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS');
  }

  if (
    Boolean(row.mustChangePassword) &&
    row.temporaryCredentialExpiresAt &&
    new Date(row.temporaryCredentialExpiresAt).getTime() <= Date.now()
  ) {
    await writeAuthEvent(db, {
      userId: row.id,
      institutionId: row.institutionId,
      eventType: 'TEMPORARY_CREDENTIAL_EXPIRED',
      email: row.email,
      role: row.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      detail: 'Temporary administrator-issued credential expired before mandatory password change.'
    });
    throw new Error('TEMPORARY_CREDENTIAL_EXPIRED');
  }

  if (!row.institutionId) {
    const institution = await findPrimaryInstitution(db);
    if (institution) {
      await run(
        db,
        'UPDATE AuthUser SET institutionId = ?, updatedAt = ? WHERE id = ?',
        [institution.id, new Date().toISOString(), row.id]
      );
      row = { ...row, institutionId: institution.id };
    }
  }

  const now = new Date().toISOString();
  await run(
    db,
    'UPDATE AuthUser SET failedLoginCount = 0, lockedUntil = NULL, lastLoginAt = ?, updatedAt = ? WHERE id = ?',
    [now, now, row.id]
  );

  await writeAuthEvent(db, {
    userId: row.id,
    institutionId: row.institutionId,
    eventType: 'LOGIN_SUCCESS',
    email: row.email,
    role: row.role,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });

  const profile = await profileFromRow(db, row);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    v: 1,
    sub: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role,
    institutionId: profile.institutionId,
    orgUnitId: profile.orgUnitId,
    department: profile.department || null,
    mustChangePassword: profile.mustChangePassword,
    iat: nowSeconds,
    exp: nowSeconds + AUTH_SESSION_SECONDS,
    jti: crypto.randomUUID()
  };

  const secret = await getRuntimeAuthSecret();
  const token = await signSessionToken(payload, secret);
  await registerAuthSession(payload, {
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });
  return { profile, token };
}

export async function getAuthenticatedProfile(token: string) {
  const secret = await getRuntimeAuthSecret();
  const session = await verifySessionToken(token, secret);
  if (!session) return null;
  if (!(await isAuthSessionActive(session, true))) return null;

  const db = await ensureAuthSchema();
  const row = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [session.sub]
  );
  if (!row || !row.active || !isUserRole(row.role)) return null;

  return profileFromRow(db, row);
}

export async function recordLogout(
  token: string,
  input: { ipAddress?: string | null; userAgent?: string | null }
) {
  try {
    const secret = await getRuntimeAuthSecret();
    const session = await verifySessionToken(token, secret);
    if (!session) return;

    const db = await ensureAuthSchema();
    await revokeSession(session.jti, 'User logout', session.sub);
    await writeAuthEvent(db, {
      userId: session.sub,
      institutionId: session.institutionId,
      eventType: 'LOGOUT',
      email: session.email,
      role: session.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
  } catch {
    // Logout must remain idempotent even if audit storage is temporarily unavailable.
  }
}


export type ManagedUserSummary = {
  id: string;
  institutionId: string | null;
  orgUnitId: string | null;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  active: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  credentialResetAt: string | null;
  temporaryCredentialExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function managedSummary(row: AuthUserRow): ManagedUserSummary {
  if (!isUserRole(row.role)) throw new Error('AUTH_ROLE_INVALID');
  return {
    id: row.id,
    institutionId: row.institutionId,
    orgUnitId: row.orgUnitId,
    name: row.name,
    email: row.email,
    role: row.role,
    department: row.department || '',
    active: Boolean(row.active),
    failedLoginCount: Number(row.failedLoginCount || 0),
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    mustChangePassword: Boolean(row.mustChangePassword),
    credentialResetAt: row.credentialResetAt || null,
    temporaryCredentialExpiresAt: row.temporaryCredentialExpiresAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export async function listManagedUsers(institutionId: string | null) {
  const db = await ensureAuthSchema();
  const statement = institutionId
    ? db.prepare(
        'SELECT * FROM AuthUser WHERE institutionId = ? ORDER BY active DESC, name ASC, email ASC'
      ).bind(institutionId)
    : db.prepare('SELECT * FROM AuthUser ORDER BY active DESC, name ASC, email ASC');
  const result = await statement.all<AuthUserRow>();
  return (result.results || []).map(managedSummary);
}

export async function createManagedUser(input: {
  actorUserId: string;
  actorInstitutionId: string | null;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department?: string | null;
  orgUnitId?: string | null;
}) {
  const db = await ensureAuthSchema();
  const name = input.name.trim();
  const email = input.email.trim();
  const emailNormalized = normalizeEmail(email);
  const password = input.password;

  if (!name || !emailNormalized || !emailNormalized.includes('@')) {
    throw new Error('USER_REQUIRED_FIELDS');
  }
  if (!isUserRole(input.role)) throw new Error('AUTH_ROLE_INVALID');
  validatePasswordPolicy(password, emailNormalized);

  const existing = await first<{ id: string }>(
    db,
    'SELECT id FROM AuthUser WHERE emailNormalized = ? LIMIT 1',
    [emailNormalized]
  );
  if (existing) throw new Error('USER_EMAIL_CONFLICT');

  const institution =
    input.actorInstitutionId
      ? { id: input.actorInstitutionId }
      : await findPrimaryInstitution(db);

  const passwordRecord = await createPasswordHash(password);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await run(
    db,
    `INSERT INTO AuthUser (
      id, institutionId, orgUnitId, name, email, emailNormalized,
      passwordHash, passwordSalt, passwordIterations, role, department,
      active, mustChangePassword, credentialResetAt, temporaryCredentialExpiresAt,
      failedLoginCount, lockedUntil, lastLoginAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, 0, NULL, NULL, ?, ?)`,
    [
      id,
      institution?.id || null,
      input.orgUnitId || null,
      name,
      email,
      emailNormalized,
      passwordRecord.hash,
      passwordRecord.salt,
      passwordRecord.iterations,
      input.role,
      input.department?.trim() || null,
      now,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      now,
      now
    ]
  );

  await savePasswordHistory(
    id,
    passwordRecord.hash,
    passwordRecord.salt,
    passwordRecord.iterations
  );

  await writeAuthEvent(db, {
    userId: id,
    institutionId: institution?.id || null,
    eventType: 'USER_CREATED',
    email,
    role: input.role,
    detail: 'User account created by administrator ' + input.actorUserId + '.'
  });

  const created = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [id]
  );
  if (!created) throw new Error('USER_CREATE_FAILED');
  return managedSummary(created);
}

export async function updateManagedUser(input: {
  actorUserId: string;
  actorInstitutionId: string | null;
  userId: string;
  role?: UserRole;
  department?: string | null;
  active?: boolean;
  password?: string | null;
}) {
  const db = await ensureAuthSchema();
  const existing = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [input.userId]
  );
  if (!existing) throw new Error('USER_NOT_FOUND');

  if (
    input.actorInstitutionId &&
    existing.institutionId &&
    existing.institutionId !== input.actorInstitutionId
  ) {
    throw new Error('USER_NOT_FOUND');
  }

  if (input.userId === input.actorUserId) {
    if (input.active === false) throw new Error('CANNOT_DISABLE_SELF');
    if (input.role && input.role !== existing.role) throw new Error('CANNOT_CHANGE_OWN_ROLE');
  }

  const nextRole = input.role ?? (isUserRole(existing.role) ? existing.role : 'Admin');
  if (!isUserRole(nextRole)) throw new Error('AUTH_ROLE_INVALID');

  const nextDepartment =
    input.department === undefined
      ? existing.department
      : input.department?.trim() || null;
  const nextActive =
    input.active === undefined ? Boolean(existing.active) : Boolean(input.active);
  const now = new Date().toISOString();

  let passwordHash = existing.passwordHash;
  let passwordSalt = existing.passwordSalt;
  let passwordIterations = existing.passwordIterations;

  if (input.password) {
    validatePasswordPolicy(input.password, existing.emailNormalized);
    await assertPasswordNotReused({
      userId: existing.id,
      password: input.password,
      currentHash: existing.passwordHash,
      currentSalt: existing.passwordSalt,
      currentIterations: Number(existing.passwordIterations || 100000)
    });
    const passwordRecord = await createPasswordHash(input.password);
    passwordHash = passwordRecord.hash;
    passwordSalt = passwordRecord.salt;
    passwordIterations = passwordRecord.iterations;
  }

  await run(
    db,
    `UPDATE AuthUser SET
      role = ?,
      department = ?,
      active = ?,
      passwordHash = ?,
      passwordSalt = ?,
      passwordIterations = ?,
      mustChangePassword = CASE WHEN ? = 1 THEN 1 ELSE mustChangePassword END,
      failedLoginCount = CASE WHEN ? = 1 THEN 0 ELSE failedLoginCount END,
      lockedUntil = CASE WHEN ? = 1 THEN NULL ELSE lockedUntil END,
      updatedAt = ?
    WHERE id = ?`,
    [
      nextRole,
      nextDepartment,
      nextActive ? 1 : 0,
      passwordHash,
      passwordSalt,
      passwordIterations,
      input.password ? 1 : 0,
      input.password ? 1 : 0,
      input.password ? 1 : 0,
      now,
      existing.id
    ]
  );

  if (input.password) {
    await savePasswordHistory(existing.id, passwordHash, passwordSalt, passwordIterations);
  }

  if (
    input.password ||
    nextRole !== existing.role ||
    nextActive !== Boolean(existing.active)
  ) {
    await revokeUserSessions(
      existing.id,
      input.password
        ? 'Administrator password reset'
        : nextRole !== existing.role
          ? 'Role changed by administrator'
          : 'Account status changed by administrator',
      input.actorUserId
    );
  }

  const updated = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [existing.id]
  );
  if (!updated) throw new Error('USER_UPDATE_FAILED');

  await writeAuthEvent(db, {
    userId: updated.id,
    institutionId: updated.institutionId,
    eventType: input.password ? 'USER_UPDATED_PASSWORD_RESET' : 'USER_UPDATED',
    email: updated.email,
    role: updated.role,
    detail: 'User account updated by administrator ' + input.actorUserId + '.'
  });

  return managedSummary(updated);
}



function strongTemporaryPassword(length = 20) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*_-';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => {
    const bytes = crypto.getRandomValues(new Uint8Array(1));
    return set[bytes[0] % set.length];
  };
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  const order = crypto.getRandomValues(new Uint8Array(chars.length));
  return chars
    .map((value, index) => ({ value, key: order[index] }))
    .sort((a, b) => a.key - b.key)
    .map(item => item.value)
    .join('');
}

async function managedUserForCredentialAction(input: {
  actorUserId: string;
  actorInstitutionId: string | null;
  userId: string;
}) {
  const db = await ensureAuthSchema();
  const existing = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [input.userId]
  );
  if (!existing) throw new Error('USER_NOT_FOUND');
  if (
    input.actorInstitutionId &&
    existing.institutionId &&
    existing.institutionId !== input.actorInstitutionId
  ) {
    throw new Error('USER_NOT_FOUND');
  }
  if (existing.id === input.actorUserId) throw new Error('CANNOT_RESET_SELF_CREDENTIAL');
  return { db, existing };
}

export async function resetManagedUserCredential(input: {
  actorUserId: string;
  actorInstitutionId: string | null;
  userId: string;
}) {
  const { db, existing } = await managedUserForCredentialAction(input);
  const temporaryPassword = strongTemporaryPassword();
  const password = await createPasswordHash(temporaryPassword);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  await run(
    db,
    `UPDATE AuthUser SET
      passwordHash = ?,
      passwordSalt = ?,
      passwordIterations = ?,
      mustChangePassword = 1,
      credentialResetAt = ?,
      temporaryCredentialExpiresAt = ?,
      failedLoginCount = 0,
      lockedUntil = NULL,
      updatedAt = ?
    WHERE id = ?`,
    [
      password.hash,
      password.salt,
      password.iterations,
      now.toISOString(),
      expiresAt,
      now.toISOString(),
      existing.id
    ]
  );

  await savePasswordHistory(existing.id, password.hash, password.salt, password.iterations);
  await revokeUserSessions(existing.id, 'Administrator credential reset', input.actorUserId);
  await writeAuthEvent(db, {
    userId: existing.id,
    institutionId: existing.institutionId,
    eventType: 'USER_CREDENTIAL_RESET',
    email: existing.email,
    role: existing.role,
    detail:
      'Administrator reset credential; active sessions revoked, mandatory password change enabled, and temporary credential expires after 24 hours.'
  });

  return {
    success: true,
    userId: existing.id,
    temporaryPassword,
    mustChangePassword: true,
    temporaryCredentialExpiresAt: expiresAt
  };
}

export async function forceManagedUserPasswordChange(input: {
  actorUserId: string;
  actorInstitutionId: string | null;
  userId: string;
}) {
  const { db, existing } = await managedUserForCredentialAction(input);
  const now = new Date().toISOString();

  await run(
    db,
    'UPDATE AuthUser SET mustChangePassword = 1, updatedAt = ? WHERE id = ?',
    [now, existing.id]
  );
  await revokeUserSessions(existing.id, 'Administrator required password change', input.actorUserId);
  await writeAuthEvent(db, {
    userId: existing.id,
    institutionId: existing.institutionId,
    eventType: 'USER_PASSWORD_CHANGE_FORCED',
    email: existing.email,
    role: existing.role,
    detail: 'Administrator required password change at next sign-in and revoked active sessions.'
  });

  return { success: true, userId: existing.id, mustChangePassword: true };
}

export async function unlockManagedUser(input: {
  actorUserId: string;
  actorInstitutionId: string | null;
  userId: string;
}) {
  const { db, existing } = await managedUserForCredentialAction(input);
  const now = new Date().toISOString();

  await run(
    db,
    'UPDATE AuthUser SET failedLoginCount = 0, lockedUntil = NULL, updatedAt = ? WHERE id = ?',
    [now, existing.id]
  );
  await writeAuthEvent(db, {
    userId: existing.id,
    institutionId: existing.institutionId,
    eventType: 'USER_UNLOCKED',
    email: existing.email,
    role: existing.role,
    detail: 'Administrator cleared account lockout and failed login counter.'
  });

  return { success: true, userId: existing.id };
}

export async function updateOwnProfile(input: {
  userId: string;
  name: string;
}) {
  const db = await ensureAuthSchema();
  const name = input.name.trim();
  if (!name) throw new Error('USER_REQUIRED_FIELDS');

  const existing = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [input.userId]
  );
  if (!existing || !existing.active) throw new Error('USER_NOT_FOUND');

  const now = new Date().toISOString();
  await run(
    db,
    'UPDATE AuthUser SET name = ?, updatedAt = ? WHERE id = ?',
    [name, now, existing.id]
  );

  await writeAuthEvent(db, {
    userId: existing.id,
    institutionId: existing.institutionId,
    eventType: 'PROFILE_UPDATED',
    email: existing.email,
    role: existing.role,
    detail: 'User updated their own display name.'
  });

  const updated = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [existing.id]
  );
  if (!updated) throw new Error('USER_UPDATE_FAILED');
  return profileFromRow(db, updated);
}

export async function changeOwnPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const db = await ensureAuthSchema();
  const existing = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [input.userId]
  );
  if (!existing || !existing.active) throw new Error('USER_NOT_FOUND');

  if (!(await verifyPassword(input.currentPassword, existing))) {
    await writeAuthEvent(db, {
      userId: existing.id,
      institutionId: existing.institutionId,
      eventType: 'PASSWORD_CHANGE_FAILED',
      email: existing.email,
      role: existing.role,
      detail: 'Current password verification failed.'
    });
    throw new Error('CURRENT_PASSWORD_INVALID');
  }

  validatePasswordPolicy(input.newPassword, existing.emailNormalized);
  await assertPasswordNotReused({
    userId: existing.id,
    password: input.newPassword,
    currentHash: existing.passwordHash,
    currentSalt: existing.passwordSalt,
    currentIterations: Number(existing.passwordIterations || 100000)
  });

  const password = await createPasswordHash(input.newPassword);
  const now = new Date().toISOString();
  await run(
    db,
    `UPDATE AuthUser SET
      passwordHash = ?,
      passwordSalt = ?,
      passwordIterations = ?,
      mustChangePassword = 0,
      credentialResetAt = NULL,
      temporaryCredentialExpiresAt = NULL,
      failedLoginCount = 0,
      lockedUntil = NULL,
      updatedAt = ?
    WHERE id = ?`,
    [
      password.hash,
      password.salt,
      password.iterations,
      now,
      existing.id
    ]
  );

  await savePasswordHistory(
    existing.id,
    password.hash,
    password.salt,
    password.iterations
  );
  await revokeUserSessions(existing.id, 'Password changed by user', existing.id);
  await writeAuthEvent(db, {
    userId: existing.id,
    institutionId: existing.institutionId,
    eventType: 'PASSWORD_CHANGED',
    email: existing.email,
    role: existing.role,
    detail: 'Password changed successfully; active sessions revoked.'
  });

  return { success: true, requiresLogin: true };
}

export async function loadSecurityAdministration(actorInstitutionId: string | null) {
  await ensureAuthSchema();
  return getSecurityAdministration(actorInstitutionId);
}

export async function revokeManagedSession(input: {
  actorUserId: string;
  actorInstitutionId: string | null;
  sessionId: string;
}) {
  const db = await ensureAuthSchema();
  const session = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AuthSession WHERE id = ? LIMIT 1',
    [input.sessionId]
  );
  if (!session) throw new Error('SESSION_NOT_FOUND');

  if (
    input.actorInstitutionId &&
    session.institutionId &&
    String(session.institutionId) !== input.actorInstitutionId
  ) {
    throw new Error('SESSION_NOT_FOUND');
  }

  await revokeSession(
    input.sessionId,
    'Session revoked by administrator',
    input.actorUserId
  );

  const user = await first<AuthUserRow>(
    db,
    'SELECT * FROM AuthUser WHERE id = ? LIMIT 1',
    [String(session.userId)]
  );
  await writeAuthEvent(db, {
    userId: user?.id || String(session.userId || ''),
    institutionId: user?.institutionId || (session.institutionId ? String(session.institutionId) : null),
    eventType: 'SESSION_REVOKED',
    email: user?.email || null,
    role: user?.role || null,
    detail: 'Active session revoked by administrator ' + input.actorUserId + '.'
  });

  return { success: true };
}
