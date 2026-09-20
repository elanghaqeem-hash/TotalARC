import { getControlPlaneDb, type D1DatabaseLike } from '@/lib/cloudflare-db';
import {
  BANK_ROLE_CATALOG,
  PASSWORD_POLICY,
  passwordPolicyErrors,
  permissionsForRoles,
  validateRoleSegregation,
  type PermissionKey
} from '@/lib/security-model';
import {
  signSessionToken,
  verifySessionToken,
  type SessionInstitution,
  type SessionPayload
} from '@/lib/auth-token';

const BOOTSTRAP_PASSWORD_SALT = 'xqxL42GlxTP3wzd2XNJd8A==';
const BOOTSTRAP_PASSWORD_HASH = 'd2KGJVOHsBJN7XZLUMVCPcQuTpcY4/uBcNQcGSfsAhM=';
const BOOTSTRAP_PASSWORD_ITERATIONS = 310000;

type UserRow = {
  id: string;
  homeInstitutionId: string | null;
  employeeId: string | null;
  username: string;
  displayName: string;
  email: string | null;
  mobile: string | null;
  jobTitle: string | null;
  employmentStatus: string;
  status: string;
  authType: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  mustChangePassword: number;
  passwordChangedAt: string | null;
  passwordExpiresAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UserAdminInput = {
  institutionId: string;
  employeeId: string;
  username: string;
  displayName: string;
  email?: string | null;
  mobile?: string | null;
  jobTitle?: string | null;
  employmentStatus?: string;
  roleKeys: string[];
  units?: Array<{ id: string; name: string; accessMode?: 'READ' | 'WRITE' }>;
};

let authSchemaReady: Promise<D1DatabaseLike> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function plusMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function plusDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000).toISOString();
}

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

async function all<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  const result = values.length ? await statement.bind(...values).all<T>() : await statement.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).first<T>() : statement.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).run() : statement.run();
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function derivePassword(password: string, saltBase64: string, iterations: number) {
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
      salt: base64ToBytes(saltBase64),
      iterations,
      hash: 'SHA-256'
    },
    key,
    256
  );
  return bytesToBase64(new Uint8Array(bits));
}

async function hashPassword(password: string, iterations = BOOTSTRAP_PASSWORD_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = bytesToBase64(salt);
  const hash = await derivePassword(password, saltBase64, iterations);
  return { hash, salt: saltBase64, iterations };
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function strongTemporaryPassword(length = 22) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()-_=+';
  const allChars = upper + lower + digits + symbols;
  const result = [
    upper[crypto.getRandomValues(new Uint32Array(1))[0] % upper.length],
    lower[crypto.getRandomValues(new Uint32Array(1))[0] % lower.length],
    digits[crypto.getRandomValues(new Uint32Array(1))[0] % digits.length],
    symbols[crypto.getRandomValues(new Uint32Array(1))[0] % symbols.length]
  ];
  while (result.length < length) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    result.push(allChars[value % allChars.length]);
  }
  for (let i = result.length - 1; i > 0; i -= 1) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0];
    const j = value % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join('');
}

async function audit(
  db: D1DatabaseLike,
  institutionId: string | null,
  userName: string,
  userRole: string,
  action: string,
  entityType: string,
  recordId: string,
  reason: string,
  newValue?: unknown,
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
      userName,
      userRole,
      action,
      entityType,
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
      reason,
      null,
      nowIso()
    ]
  );
}

async function ensureDefaultTenantRegistry(db: D1DatabaseLike) {
  const firstInstitution = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1'
  );
  if (!firstInstitution) return null;

  const institutionId = String(firstInstitution.id);
  const existing = await first(
    db,
    'SELECT institutionId FROM TenantRegistry WHERE institutionId=? LIMIT 1',
    [institutionId]
  );
  if (!existing) {
    const slug = String(firstInstitution.shortName || firstInstitution.name || 'institution')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'institution';
    await run(
      db,
      `INSERT INTO TenantRegistry (
        institutionId, slug, databaseBinding, folderKey, isolationMode, status, createdAt, updatedAt
      ) VALUES (?, ?, 'DB', ?, 'DEDICATED_D1', 'Active', ?, ?)`,
      [institutionId, slug, 'institutions/' + institutionId + '/', nowIso(), nowIso()]
    );
  }
  return firstInstitution;
}

async function seedBootstrapSuperAdmin(db: D1DatabaseLike) {
  const count = await first<{ count?: number }>(db, 'SELECT COUNT(*) AS count FROM AppUser');
  if (Number(count?.count || 0) > 0) return;

  const institution = await ensureDefaultTenantRegistry(db);
  if (!institution) return;

  const now = new Date();
  const id = crypto.randomUUID();
  const institutionId = String(institution.id);
  await run(
    db,
    `INSERT INTO AppUser (
      id, homeInstitutionId, employeeId, username, displayName, email, mobile, jobTitle,
      employmentStatus, status, authType, passwordHash, passwordSalt, passwordIterations,
      mustChangePassword, passwordChangedAt, passwordExpiresAt, failedAttempts, lockedUntil,
      lastLoginAt, lastLoginIp, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 'Permanent', 'Active', 'LOCAL', ?, ?, ?, 1, ?, ?, 0, NULL, NULL, NULL, ?, ?)`,
    [
      id,
      institutionId,
      'SYS-0001',
      'superadmin',
      'Total ARC Super Administrator',
      'Platform Security Administrator',
      BOOTSTRAP_PASSWORD_HASH,
      BOOTSTRAP_PASSWORD_SALT,
      BOOTSTRAP_PASSWORD_ITERATIONS,
      now.toISOString(),
      plusDays(now, PASSWORD_POLICY.expiryDays),
      now.toISOString(),
      now.toISOString()
    ]
  );

  await run(
    db,
    `INSERT INTO UserInstitutionAccess (
      id, userId, institutionId, accessStatus, isDefault, createdAt, updatedAt
    ) VALUES (?, ?, ?, 'Active', 1, ?, ?)`,
    [crypto.randomUUID(), id, institutionId, now.toISOString(), now.toISOString()]
  );

  await run(
    db,
    `INSERT INTO UserRoleAssignment (
      id, userId, institutionId, roleKey, scopeType, orgUnitId, createdAt
    ) VALUES (?, ?, NULL, 'PLATFORM_SUPER_ADMIN', 'ALL_INSTITUTIONS', NULL, ?)`,
    [crypto.randomUUID(), id, now.toISOString()]
  );

  await run(
    db,
    `INSERT INTO PasswordHistory (id, userId, passwordHash, passwordSalt, passwordIterations, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      id,
      BOOTSTRAP_PASSWORD_HASH,
      BOOTSTRAP_PASSWORD_SALT,
      BOOTSTRAP_PASSWORD_ITERATIONS,
      now.toISOString()
    ]
  );

  await audit(
    db,
    institutionId,
    'System',
    'System',
    'CREATE',
    'AppUser',
    id,
    'Initial one-time platform super administrator provisioned. Password change is mandatory.',
    { username: 'superadmin', role: 'PLATFORM_SUPER_ADMIN' }
  );
}

export async function ensureAuthSchema() {
  if (authSchemaReady) return authSchemaReady;
  authSchemaReady = (async () => {
    const db = await getControlPlaneDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS TenantRegistry (
        institutionId TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL,
        databaseBinding TEXT NOT NULL,
        folderKey TEXT NOT NULL,
        isolationMode TEXT NOT NULL DEFAULT 'DEDICATED_D1',
        status TEXT NOT NULL DEFAULT 'Active',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_slug ON TenantRegistry(slug);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_binding ON TenantRegistry(databaseBinding);

      CREATE TABLE IF NOT EXISTS AppUser (
        id TEXT PRIMARY KEY NOT NULL,
        homeInstitutionId TEXT,
        employeeId TEXT,
        username TEXT NOT NULL,
        displayName TEXT NOT NULL,
        email TEXT,
        mobile TEXT,
        jobTitle TEXT,
        employmentStatus TEXT NOT NULL DEFAULT 'Permanent',
        status TEXT NOT NULL DEFAULT 'Active',
        authType TEXT NOT NULL DEFAULT 'LOCAL',
        passwordHash TEXT NOT NULL,
        passwordSalt TEXT NOT NULL,
        passwordIterations INTEGER NOT NULL,
        mustChangePassword INTEGER NOT NULL DEFAULT 1,
        passwordChangedAt TEXT,
        passwordExpiresAt TEXT,
        failedAttempts INTEGER NOT NULL DEFAULT 0,
        lockedUntil TEXT,
        lastLoginAt TEXT,
        lastLoginIp TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_username ON AppUser(lower(username));
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_email ON AppUser(lower(email)) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_employee ON AppUser(employeeId) WHERE employeeId IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_app_user_home_inst ON AppUser(homeInstitutionId);

      CREATE TABLE IF NOT EXISTS UserInstitutionAccess (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        accessStatus TEXT NOT NULL DEFAULT 'Active',
        isDefault INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_institution_access
        ON UserInstitutionAccess(userId, institutionId);
      CREATE INDEX IF NOT EXISTS idx_user_institution_inst
        ON UserInstitutionAccess(institutionId);

      CREATE TABLE IF NOT EXISTS UserRoleAssignment (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        institutionId TEXT,
        roleKey TEXT NOT NULL,
        scopeType TEXT NOT NULL DEFAULT 'INSTITUTION',
        orgUnitId TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_role_assignment
        ON UserRoleAssignment(userId, ifnull(institutionId,''), roleKey, ifnull(orgUnitId,''));

      CREATE TABLE IF NOT EXISTS UserUnitAccess (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        orgUnitId TEXT NOT NULL,
        orgUnitName TEXT NOT NULL,
        accessMode TEXT NOT NULL DEFAULT 'READ',
        includeChildren INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_unit_access
        ON UserUnitAccess(userId, institutionId, orgUnitId);

      CREATE TABLE IF NOT EXISTS PasswordHistory (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        passwordHash TEXT NOT NULL,
        passwordSalt TEXT NOT NULL,
        passwordIterations INTEGER NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_password_history_user
        ON PasswordHistory(userId, createdAt DESC);

      CREATE TABLE IF NOT EXISTS UserSessionAudit (
        id TEXT PRIMARY KEY NOT NULL,
        sessionId TEXT NOT NULL,
        userId TEXT NOT NULL,
        institutionId TEXT NOT NULL,
        issuedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        revokedAt TEXT,
        ipAddress TEXT,
        userAgent TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_session_audit_sid ON UserSessionAudit(sessionId);
      CREATE INDEX IF NOT EXISTS idx_session_audit_user ON UserSessionAudit(userId, issuedAt DESC);

      CREATE TABLE IF NOT EXISTS LoginAudit (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT,
        identifier TEXT,
        institutionId TEXT,
        result TEXT NOT NULL,
        reason TEXT,
        ipAddress TEXT,
        userAgent TEXT,
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_login_audit_time ON LoginAudit(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_login_audit_identifier ON LoginAudit(identifier, timestamp DESC);

      CREATE TABLE IF NOT EXISTS InstitutionSecurityParameter (
        institutionId TEXT NOT NULL,
        parameterKey TEXT NOT NULL,
        parameterValue TEXT NOT NULL,
        updatedBy TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (institutionId, parameterKey)
      );
    `);

    await ensureDefaultTenantRegistry(db);
    await seedBootstrapSuperAdmin(db);
    return db;
  })().catch(error => {
    authSchemaReady = null;
    throw error;
  });
  return authSchemaReady;
}

async function recordLogin(
  db: D1DatabaseLike,
  input: {
    userId?: string | null;
    identifier: string;
    institutionId?: string | null;
    result: string;
    reason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
) {
  await run(
    db,
    `INSERT INTO LoginAudit (
      id,userId,identifier,institutionId,result,reason,ipAddress,userAgent,timestamp
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      input.userId || null,
      input.identifier,
      input.institutionId || null,
      input.result,
      input.reason || null,
      input.ipAddress || null,
      input.userAgent || null,
      nowIso()
    ]
  );
}

async function tenantListForUser(db: D1DatabaseLike, userId: string, platformAdmin: boolean) {
  const rows = platformAdmin
    ? await all<Record<string, unknown>>(
        db,
        `SELECT i.id, i.name, i.legalName, t.databaseBinding, t.folderKey
           FROM Institution i
           JOIN TenantRegistry t ON t.institutionId=i.id
          WHERE t.status='Active'
          ORDER BY i.name ASC`
      )
    : await all<Record<string, unknown>>(
        db,
        `SELECT i.id, i.name, i.legalName, t.databaseBinding, t.folderKey
           FROM UserInstitutionAccess a
           JOIN Institution i ON i.id=a.institutionId
           JOIN TenantRegistry t ON t.institutionId=i.id
          WHERE a.userId=? AND a.accessStatus='Active' AND t.status='Active'
          ORDER BY a.isDefault DESC, i.name ASC`,
        [userId]
      );

  return rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    legalName: clean(row.legalName),
    databaseBinding: String(row.databaseBinding),
    folderKey: String(row.folderKey)
  })) satisfies SessionInstitution[];
}

async function rolesForUser(db: D1DatabaseLike, userId: string, institutionId: string) {
  const rows = await all<{ roleKey?: string }>(
    db,
    `SELECT DISTINCT roleKey
       FROM UserRoleAssignment
      WHERE userId=? AND (institutionId=? OR institutionId IS NULL)
      ORDER BY roleKey ASC`,
    [userId, institutionId]
  );
  return rows.map(row => String(row.roleKey || '')).filter(Boolean);
}

async function unitsForUser(db: D1DatabaseLike, userId: string, institutionId: string) {
  const rows = await all<{ orgUnitId?: string }>(
    db,
    'SELECT orgUnitId FROM UserUnitAccess WHERE userId=? AND institutionId=? ORDER BY orgUnitName ASC',
    [userId, institutionId]
  );
  return rows.map(row => String(row.orgUnitId || '')).filter(Boolean);
}

async function buildPayload(
  db: D1DatabaseLike,
  user: UserRow,
  institutionId?: string | null,
  sessionId = crypto.randomUUID()
): Promise<SessionPayload> {
  const allAssignments = await all<{ roleKey?: string }>(
    db,
    'SELECT DISTINCT roleKey FROM UserRoleAssignment WHERE userId=?',
    [user.id]
  );
  const platformAdmin = allAssignments.some(row => row.roleKey === 'PLATFORM_SUPER_ADMIN');
  const institutions = await tenantListForUser(db, user.id, platformAdmin);
  if (institutions.length === 0) throw new Error('NO_ACTIVE_INSTITUTION_ACCESS');

  const preferred =
    institutions.find(item => item.id === institutionId) ||
    institutions.find(item => item.id === user.homeInstitutionId) ||
    institutions[0];

  const roles = await rolesForUser(db, user.id, preferred.id);
  const permissions = permissionsForRoles(roles);
  const unitIds = await unitsForUser(db, user.id, preferred.id);
  const now = Math.floor(Date.now() / 1000);

  return {
    sub: user.id,
    sid: sessionId,
    username: user.username,
    displayName: user.displayName,
    employeeId: user.employeeId,
    email: user.email,
    jobTitle: user.jobTitle,
    institution: preferred,
    institutions,
    roles,
    permissions,
    unitIds,
    mustChangePassword: Boolean(user.mustChangePassword),
    iat: now,
    exp: now + PASSWORD_POLICY.sessionMinutes * 60
  };
}

export async function authenticateUser(input: {
  identifier: string;
  password: string;
  institutionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const db = await ensureAuthSchema();
  const identifier = normalizeUsername(input.identifier || '');
  if (!identifier || !input.password) throw new Error('INVALID_CREDENTIALS');

  const windowStart = new Date(Date.now() - 15 * 60_000).toISOString();
  const recentFailures = await first<{ count?: number }>(
    db,
    `SELECT COUNT(*) AS count
       FROM LoginAudit
      WHERE result='FAILED'
        AND timestamp>=?
        AND (lower(identifier)=? OR (? IS NOT NULL AND ipAddress=?))`,
    [windowStart, identifier, input.ipAddress || null, input.ipAddress || null]
  );
  if (Number(recentFailures?.count || 0) >= 20) {
    await recordLogin(db, {
      identifier,
      result: 'FAILED',
      reason: 'RATE_LIMITED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
    throw new Error('LOGIN_RATE_LIMITED');
  }

  const user = await first<UserRow>(
    db,
    `SELECT * FROM AppUser
      WHERE lower(username)=? OR lower(email)=?
      LIMIT 1`,
    [identifier, identifier]
  );

  if (!user) {
    await recordLogin(db, {
      identifier,
      result: 'FAILED',
      reason: 'INVALID_CREDENTIALS',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
    throw new Error('INVALID_CREDENTIALS');
  }

  if (user.status !== 'Active') {
    await recordLogin(db, {
      userId: user.id,
      identifier,
      institutionId: user.homeInstitutionId,
      result: 'FAILED',
      reason: 'USER_INACTIVE',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
    throw new Error('INVALID_CREDENTIALS');
  }

  const now = new Date();
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > now.getTime()) {
    await recordLogin(db, {
      userId: user.id,
      identifier,
      institutionId: user.homeInstitutionId,
      result: 'FAILED',
      reason: 'ACCOUNT_LOCKED',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
    throw new Error('ACCOUNT_LOCKED');
  }

  const derived = await derivePassword(input.password, user.passwordSalt, Number(user.passwordIterations));
  if (!constantTimeEqual(derived, user.passwordHash)) {
    const failed = Number(user.failedAttempts || 0) + 1;
    const shouldLock = failed >= PASSWORD_POLICY.maxFailedAttempts;
    await run(
      db,
      'UPDATE AppUser SET failedAttempts=?, lockedUntil=?, updatedAt=? WHERE id=?',
      [failed, shouldLock ? plusMinutes(now, PASSWORD_POLICY.lockoutMinutes) : null, now.toISOString(), user.id]
    );
    await recordLogin(db, {
      userId: user.id,
      identifier,
      institutionId: user.homeInstitutionId,
      result: 'FAILED',
      reason: shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    });
    throw new Error(shouldLock ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS');
  }

  const passwordExpired =
    Boolean(user.passwordExpiresAt) && new Date(String(user.passwordExpiresAt)).getTime() <= now.getTime();

  const currentUser: UserRow = {
    ...user,
    mustChangePassword: passwordExpired ? 1 : user.mustChangePassword
  };

  const payload = await buildPayload(db, currentUser, input.institutionId);
  const token = await signSessionToken(payload);

  await run(
    db,
    `UPDATE AppUser
        SET failedAttempts=0, lockedUntil=NULL, lastLoginAt=?, lastLoginIp=?, updatedAt=?
      WHERE id=?`,
    [now.toISOString(), input.ipAddress || null, now.toISOString(), user.id]
  );

  await run(
    db,
    `INSERT INTO UserSessionAudit (
      id,sessionId,userId,institutionId,issuedAt,expiresAt,revokedAt,ipAddress,userAgent
    ) VALUES (?,?,?,?,?,?,NULL,?,?)`,
    [
      crypto.randomUUID(),
      payload.sid,
      user.id,
      payload.institution.id,
      new Date(payload.iat * 1000).toISOString(),
      new Date(payload.exp * 1000).toISOString(),
      input.ipAddress || null,
      input.userAgent || null
    ]
  );

  await recordLogin(db, {
    userId: user.id,
    identifier,
    institutionId: payload.institution.id,
    result: 'SUCCESS',
    reason: passwordExpired ? 'PASSWORD_EXPIRED' : null,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent
  });

  return { token, user: payload };
}

export async function sessionUser(token: string) {
  const payload = await verifySessionToken(token);
  if (!payload) throw new Error('INVALID_SESSION');

  const db = await ensureAuthSchema();
  const user = await first<UserRow>(db, 'SELECT * FROM AppUser WHERE id=? LIMIT 1', [payload.sub]);
  if (!user || user.status !== 'Active') throw new Error('INVALID_SESSION');

  const session = await first<{ revokedAt?: string | null; expiresAt?: string }>(
    db,
    'SELECT revokedAt,expiresAt FROM UserSessionAudit WHERE sessionId=? AND userId=? LIMIT 1',
    [payload.sid, payload.sub]
  );
  if (!session || session.revokedAt || !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new Error('INVALID_SESSION');
  }

  return buildPayload(db, user, payload.institution.id, payload.sid);
}

export async function revokeSession(token: string) {
  const payload = await verifySessionToken(token);
  if (!payload) return;
  const db = await ensureAuthSchema();
  await run(
    db,
    'UPDATE UserSessionAudit SET revokedAt=? WHERE sessionId=? AND userId=? AND revokedAt IS NULL',
    [nowIso(), payload.sid, payload.sub]
  );
}

export async function switchUserInstitution(token: string, institutionId: string) {
  const current = await sessionUser(token);
  const target = current.institutions.find(item => item.id === institutionId);
  if (!target) throw new Error('INSTITUTION_ACCESS_DENIED');

  const db = await ensureAuthSchema();
  const user = await first<UserRow>(db, 'SELECT * FROM AppUser WHERE id=? LIMIT 1', [current.sub]);
  if (!user) throw new Error('INVALID_SESSION');

  await run(db, 'UPDATE UserSessionAudit SET revokedAt=? WHERE sessionId=?', [nowIso(), current.sid]);

  const payload = await buildPayload(db, user, institutionId);
  const newToken = await signSessionToken(payload);
  await run(
    db,
    `INSERT INTO UserSessionAudit (
      id,sessionId,userId,institutionId,issuedAt,expiresAt,revokedAt,ipAddress,userAgent
    ) VALUES (?,?,?,?,?,?,NULL,NULL,NULL)`,
    [
      crypto.randomUUID(),
      payload.sid,
      user.id,
      payload.institution.id,
      new Date(payload.iat * 1000).toISOString(),
      new Date(payload.exp * 1000).toISOString()
    ]
  );
  return { token: newToken, user: payload };
}

export async function listUsers(institutionId: string) {
  const db = await ensureAuthSchema();
  const users = await all<UserRow & { accessStatus?: string; isDefault?: number }>(
    db,
    `SELECT u.*, a.accessStatus, a.isDefault
       FROM AppUser u
       JOIN UserInstitutionAccess a ON a.userId=u.id
      WHERE a.institutionId=?
      ORDER BY u.displayName ASC, u.username ASC`,
    [institutionId]
  );

  return Promise.all(
    users.map(async user => {
      const [roles, units] = await Promise.all([
        rolesForUser(db, user.id, institutionId),
        all<Record<string, unknown>>(
          db,
          `SELECT orgUnitId,orgUnitName,accessMode,includeChildren
             FROM UserUnitAccess
            WHERE userId=? AND institutionId=?
            ORDER BY orgUnitName ASC`,
          [user.id, institutionId]
        )
      ]);
      return {
        id: user.id,
        homeInstitutionId: user.homeInstitutionId,
        employeeId: user.employeeId,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        mobile: user.mobile,
        jobTitle: user.jobTitle,
        employmentStatus: user.employmentStatus,
        status: user.status,
        authType: user.authType,
        mustChangePassword: Boolean(user.mustChangePassword),
        passwordChangedAt: user.passwordChangedAt,
        passwordExpiresAt: user.passwordExpiresAt,
        failedAttempts: Number(user.failedAttempts || 0),
        lockedUntil: user.lockedUntil,
        lastLoginAt: user.lastLoginAt,
        lastLoginIp: user.lastLoginIp,
        roles,
        units: units.map(unit => ({
          orgUnitId: String(unit.orgUnitId),
          orgUnitName: String(unit.orgUnitName),
          accessMode: String(unit.accessMode),
          includeChildren: Boolean(unit.includeChildren)
        }))
      };
    })
  );
}

export async function createUser(input: UserAdminInput, actor: SessionPayload) {
  const db = await ensureAuthSchema();
  const username = normalizeUsername(input.username);
  const employeeId = input.employeeId.trim().toUpperCase();
  const displayName = input.displayName.trim();
  const email = clean(input.email)?.toLowerCase() || null;
  const roleKeys = Array.from(new Set(input.roleKeys.map(item => item.trim()).filter(Boolean)));

  if (!username || !employeeId || !displayName || roleKeys.length === 0) {
    throw new Error('USER_REQUIRED_FIELDS');
  }
  if (!actor.permissions.includes('user.manage')) throw new Error('ACCESS_DENIED');
  if (input.institutionId !== actor.institution.id && !actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
    throw new Error('INSTITUTION_ACCESS_DENIED');
  }

  const unknown = roleKeys.filter(key => !BANK_ROLE_CATALOG.some(role => role.key === key));
  if (unknown.length > 0) throw new Error('INVALID_ROLE');
  if (!actor.roles.includes('PLATFORM_SUPER_ADMIN') && roleKeys.includes('PLATFORM_SUPER_ADMIN')) {
    throw new Error('PRIVILEGED_ROLE_RESTRICTED');
  }

  const conflicts = validateRoleSegregation(roleKeys);
  if (conflicts.length > 0) {
    const error = new Error('SOD_CONFLICT');
    (error as Error & { conflicts?: unknown }).conflicts = conflicts;
    throw error;
  }

  const duplicate = await first(
    db,
    `SELECT id FROM AppUser
      WHERE lower(username)=? OR employeeId=? OR (? IS NOT NULL AND lower(email)=?)
      LIMIT 1`,
    [username, employeeId, email, email]
  );
  if (duplicate) throw new Error('USER_IDENTITY_CONFLICT');

  const temporaryPassword = strongTemporaryPassword();
  const password = await hashPassword(temporaryPassword);
  const now = new Date();
  const id = crypto.randomUUID();

  await run(
    db,
    `INSERT INTO AppUser (
      id,homeInstitutionId,employeeId,username,displayName,email,mobile,jobTitle,
      employmentStatus,status,authType,passwordHash,passwordSalt,passwordIterations,
      mustChangePassword,passwordChangedAt,passwordExpiresAt,failedAttempts,lockedUntil,
      lastLoginAt,lastLoginIp,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,'Active','LOCAL',?,?,?,1,?,?,0,NULL,NULL,NULL,?,?)`,
    [
      id,
      input.institutionId,
      employeeId,
      username,
      displayName,
      email,
      clean(input.mobile),
      clean(input.jobTitle),
      input.employmentStatus || 'Permanent',
      password.hash,
      password.salt,
      password.iterations,
      now.toISOString(),
      plusDays(now, PASSWORD_POLICY.expiryDays),
      now.toISOString(),
      now.toISOString()
    ]
  );

  await run(
    db,
    `INSERT INTO UserInstitutionAccess (
      id,userId,institutionId,accessStatus,isDefault,createdAt,updatedAt
    ) VALUES (?,?,?,'Active',1,?,?)`,
    [crypto.randomUUID(), id, input.institutionId, now.toISOString(), now.toISOString()]
  );

  for (const roleKey of roleKeys) {
    await run(
      db,
      `INSERT INTO UserRoleAssignment (
        id,userId,institutionId,roleKey,scopeType,orgUnitId,createdAt
      ) VALUES (?,?,?,?, 'INSTITUTION', NULL, ?)`,
      [crypto.randomUUID(), id, input.institutionId, roleKey, now.toISOString()]
    );
  }

  for (const unit of input.units || []) {
    await run(
      db,
      `INSERT INTO UserUnitAccess (
        id,userId,institutionId,orgUnitId,orgUnitName,accessMode,includeChildren,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,1,?,?)`,
      [
        crypto.randomUUID(),
        id,
        input.institutionId,
        unit.id,
        unit.name,
        unit.accessMode || 'READ',
        now.toISOString(),
        now.toISOString()
      ]
    );
  }

  await run(
    db,
    `INSERT INTO PasswordHistory (id,userId,passwordHash,passwordSalt,passwordIterations,createdAt)
     VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), id, password.hash, password.salt, password.iterations, now.toISOString()]
  );

  await audit(
    db,
    input.institutionId,
    actor.username,
    actor.roles.join(','),
    'CREATE',
    'AppUser',
    id,
    'User created with mandatory temporary-password change.',
    { employeeId, username, displayName, email, roleKeys, units: input.units || [] }
  );

  return {
    user: {
      id,
      employeeId,
      username,
      displayName,
      email,
      mobile: clean(input.mobile),
      jobTitle: clean(input.jobTitle),
      roleKeys,
      units: input.units || [],
      status: 'Active',
      mustChangePassword: true
    },
    temporaryPassword
  };
}

export async function updateUserAdministration(
  input: {
    userId: string;
    institutionId: string;
    roleKeys: string[];
    units?: Array<{ id: string; name: string; accessMode?: 'READ' | 'WRITE' }>;
    status?: string;
    unlock?: boolean;
  },
  actor: SessionPayload
) {
  const db = await ensureAuthSchema();
  if (!actor.permissions.includes('user.manage') && !actor.permissions.includes('user.approve')) {
    throw new Error('ACCESS_DENIED');
  }
  if (input.institutionId !== actor.institution.id && !actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
    throw new Error('INSTITUTION_ACCESS_DENIED');
  }

  const roleKeys = Array.from(new Set(input.roleKeys.map(item => item.trim()).filter(Boolean)));
  const conflicts = validateRoleSegregation(roleKeys);
  if (conflicts.length > 0) {
    const error = new Error('SOD_CONFLICT');
    (error as Error & { conflicts?: unknown }).conflicts = conflicts;
    throw error;
  }

  const target = await first<UserRow>(db, 'SELECT * FROM AppUser WHERE id=? LIMIT 1', [input.userId]);
  if (!target) throw new Error('USER_NOT_FOUND');

  const oldRoles = await rolesForUser(db, input.userId, input.institutionId);
  await run(
    db,
    'DELETE FROM UserRoleAssignment WHERE userId=? AND institutionId=?',
    [input.userId, input.institutionId]
  );
  for (const roleKey of roleKeys) {
    await run(
      db,
      `INSERT INTO UserRoleAssignment (
        id,userId,institutionId,roleKey,scopeType,orgUnitId,createdAt
      ) VALUES (?,?,?,?, 'INSTITUTION', NULL, ?)`,
      [crypto.randomUUID(), input.userId, input.institutionId, roleKey, nowIso()]
    );
  }

  await run(
    db,
    'DELETE FROM UserUnitAccess WHERE userId=? AND institutionId=?',
    [input.userId, input.institutionId]
  );
  for (const unit of input.units || []) {
    await run(
      db,
      `INSERT INTO UserUnitAccess (
        id,userId,institutionId,orgUnitId,orgUnitName,accessMode,includeChildren,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,1,?,?)`,
      [
        crypto.randomUUID(),
        input.userId,
        input.institutionId,
        unit.id,
        unit.name,
        unit.accessMode || 'READ',
        nowIso(),
        nowIso()
      ]
    );
  }

  const nextStatus = input.status || target.status;
  await run(
    db,
    `UPDATE AppUser
        SET status=?,
            failedAttempts=CASE WHEN ? THEN 0 ELSE failedAttempts END,
            lockedUntil=CASE WHEN ? THEN NULL ELSE lockedUntil END,
            updatedAt=?
      WHERE id=?`,
    [nextStatus, input.unlock ? 1 : 0, input.unlock ? 1 : 0, nowIso(), input.userId]
  );

  await audit(
    db,
    input.institutionId,
    actor.username,
    actor.roles.join(','),
    'UPDATE',
    'AppUserAccess',
    input.userId,
    'User role/unit access updated with segregation-of-duty validation.',
    { roleKeys, units: input.units || [], status: nextStatus, unlock: Boolean(input.unlock) },
    { roleKeys: oldRoles, status: target.status }
  );

  return { success: true };
}


function privilegedRole(roleKey: string) {
  return ['PLATFORM_SUPER_ADMIN', 'INSTITUTION_ADMIN', 'USER_ADMIN_MAKER', 'USER_ADMIN_APPROVER'].includes(roleKey);
}

async function assertCredentialAdministrationAllowed(
  db: D1DatabaseLike,
  targetUserId: string,
  institutionId: string,
  actor: SessionPayload
) {
  if (!actor.permissions.includes('user.manage')) throw new Error('ACCESS_DENIED');
  if (targetUserId === actor.sub) throw new Error('SELF_CREDENTIAL_ADMIN_NOT_ALLOWED');
  if (institutionId !== actor.institution.id && !actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
    throw new Error('INSTITUTION_ACCESS_DENIED');
  }

  const access = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM UserInstitutionAccess WHERE userId=? AND institutionId=? AND accessStatus=\'Active\' LIMIT 1',
    [targetUserId, institutionId]
  );
  if (!access) throw new Error('USER_NOT_FOUND');

  const targetRoles = await rolesForUser(db, targetUserId, institutionId);
  const privilegedTarget = targetRoles.some(privilegedRole);
  if (
    privilegedTarget &&
    !actor.roles.includes('PLATFORM_SUPER_ADMIN') &&
    !actor.permissions.includes('user.approve')
  ) {
    throw new Error('PRIVILEGED_CREDENTIAL_RESET_REQUIRES_APPROVER');
  }

  if (
    targetRoles.includes('PLATFORM_SUPER_ADMIN') &&
    !actor.roles.includes('PLATFORM_SUPER_ADMIN')
  ) {
    throw new Error('PRIVILEGED_ROLE_RESTRICTED');
  }

  const target = await first<UserRow>(db, 'SELECT * FROM AppUser WHERE id=? LIMIT 1', [targetUserId]);
  if (!target) throw new Error('USER_NOT_FOUND');

  return { target, targetRoles };
}

export async function resetUserCredential(
  input: { userId: string; institutionId: string },
  actor: SessionPayload
) {
  const db = await ensureAuthSchema();
  const { target, targetRoles } = await assertCredentialAdministrationAllowed(
    db,
    input.userId,
    input.institutionId,
    actor
  );

  const temporaryPassword = strongTemporaryPassword();
  const password = await hashPassword(temporaryPassword);
  const now = new Date();

  await run(
    db,
    `UPDATE AppUser
        SET passwordHash=?,
            passwordSalt=?,
            passwordIterations=?,
            mustChangePassword=1,
            passwordChangedAt=?,
            passwordExpiresAt=?,
            failedAttempts=0,
            lockedUntil=NULL,
            updatedAt=?
      WHERE id=?`,
    [
      password.hash,
      password.salt,
      password.iterations,
      now.toISOString(),
      plusDays(now, 1),
      now.toISOString(),
      target.id
    ]
  );

  await run(
    db,
    `INSERT INTO PasswordHistory (
      id,userId,passwordHash,passwordSalt,passwordIterations,createdAt
    ) VALUES (?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      target.id,
      password.hash,
      password.salt,
      password.iterations,
      now.toISOString()
    ]
  );

  await run(
    db,
    'UPDATE UserSessionAudit SET revokedAt=? WHERE userId=? AND revokedAt IS NULL',
    [now.toISOString(), target.id]
  );

  await audit(
    db,
    input.institutionId,
    actor.username,
    actor.roles.join(','),
    'RESET',
    'Credential',
    target.id,
    'Administrator reset credential; all active sessions revoked and password change required at next sign-in.',
    {
      username: target.username,
      targetRoles,
      mustChangePassword: true,
      temporaryCredentialExpiresAt: plusDays(now, 1)
    }
  );

  return {
    success: true,
    userId: target.id,
    username: target.username,
    displayName: target.displayName,
    temporaryPassword,
    mustChangePassword: true,
    temporaryCredentialExpiresAt: plusDays(now, 1)
  };
}

export async function forceUserPasswordChange(
  input: { userId: string; institutionId: string },
  actor: SessionPayload
) {
  const db = await ensureAuthSchema();
  const { target, targetRoles } = await assertCredentialAdministrationAllowed(
    db,
    input.userId,
    input.institutionId,
    actor
  );

  const now = nowIso();
  await run(
    db,
    'UPDATE AppUser SET mustChangePassword=1, updatedAt=? WHERE id=?',
    [now, target.id]
  );

  await run(
    db,
    'UPDATE UserSessionAudit SET revokedAt=? WHERE userId=? AND revokedAt IS NULL',
    [now, target.id]
  );

  await audit(
    db,
    input.institutionId,
    actor.username,
    actor.roles.join(','),
    'UPDATE',
    'Credential',
    target.id,
    'Administrator required password change at next sign-in and revoked active sessions.',
    { username: target.username, targetRoles, mustChangePassword: true }
  );

  return { success: true, mustChangePassword: true };
}

export async function unlockUserCredential(
  input: { userId: string; institutionId: string },
  actor: SessionPayload
) {
  const db = await ensureAuthSchema();
  const { target, targetRoles } = await assertCredentialAdministrationAllowed(
    db,
    input.userId,
    input.institutionId,
    actor
  );

  await run(
    db,
    'UPDATE AppUser SET failedAttempts=0, lockedUntil=NULL, updatedAt=? WHERE id=?',
    [nowIso(), target.id]
  );

  await audit(
    db,
    input.institutionId,
    actor.username,
    actor.roles.join(','),
    'UNLOCK',
    'Credential',
    target.id,
    'Administrator cleared credential lockout.',
    { username: target.username, targetRoles }
  );

  return { success: true };
}

export async function updateOwnProfile(
  token: string,
  input: { displayName: string; email?: string | null; mobile?: string | null; jobTitle?: string | null }
) {
  const session = await sessionUser(token);
  const db = await ensureAuthSchema();

  const displayName = input.displayName.trim();
  const email = clean(input.email)?.toLowerCase() || null;
  if (!displayName) throw new Error('PROFILE_REQUIRED_FIELDS');

  const duplicate = email
    ? await first(db, 'SELECT id FROM AppUser WHERE lower(email)=? AND id<>? LIMIT 1', [email, session.sub])
    : null;
  if (duplicate) throw new Error('EMAIL_CONFLICT');

  await run(
    db,
    `UPDATE AppUser SET displayName=?,email=?,mobile=?,jobTitle=?,updatedAt=? WHERE id=?`,
    [displayName, email, clean(input.mobile), clean(input.jobTitle), nowIso(), session.sub]
  );

  const user = await first<UserRow>(db, 'SELECT * FROM AppUser WHERE id=? LIMIT 1', [session.sub]);
  if (!user) throw new Error('USER_NOT_FOUND');

  await audit(
    db,
    session.institution.id,
    session.username,
    session.roles.join(','),
    'UPDATE',
    'UserProfile',
    session.sub,
    'User updated own profile.',
    { displayName, email, mobile: clean(input.mobile), jobTitle: clean(input.jobTitle) }
  );

  const refreshedPayload = await buildPayload(db, user, session.institution.id, session.sid);
  await run(
    db,
    'UPDATE UserSessionAudit SET expiresAt=? WHERE sessionId=? AND userId=? AND revokedAt IS NULL',
    [new Date(refreshedPayload.exp * 1000).toISOString(), session.sid, session.sub]
  );
  const refreshedToken = await signSessionToken(refreshedPayload);
  return { token: refreshedToken, user: refreshedPayload };
}

export async function changeOwnPassword(
  token: string,
  currentPassword: string,
  newPassword: string
) {
  const session = await sessionUser(token);
  const db = await ensureAuthSchema();
  const user = await first<UserRow>(db, 'SELECT * FROM AppUser WHERE id=? LIMIT 1', [session.sub]);
  if (!user) throw new Error('USER_NOT_FOUND');

  const currentHash = await derivePassword(currentPassword, user.passwordSalt, Number(user.passwordIterations));
  if (!constantTimeEqual(currentHash, user.passwordHash)) throw new Error('CURRENT_PASSWORD_INVALID');

  const policyErrors = passwordPolicyErrors(newPassword, user.username, user.email || '');
  if (policyErrors.length > 0) {
    const error = new Error('PASSWORD_POLICY');
    (error as Error & { details?: string[] }).details = policyErrors;
    throw error;
  }

  const history = await all<{
    passwordHash?: string;
    passwordSalt?: string;
    passwordIterations?: number;
  }>(
    db,
    `SELECT passwordHash,passwordSalt,passwordIterations
       FROM PasswordHistory
      WHERE userId=?
      ORDER BY createdAt DESC
      LIMIT ${PASSWORD_POLICY.historyDepth}`,
    [user.id]
  );
  for (const item of history) {
    if (!item.passwordHash || !item.passwordSalt || !item.passwordIterations) continue;
    const candidate = await derivePassword(newPassword, item.passwordSalt, Number(item.passwordIterations));
    if (constantTimeEqual(candidate, item.passwordHash)) throw new Error('PASSWORD_REUSE');
  }

  const next = await hashPassword(newPassword);
  const now = new Date();
  await run(
    db,
    `UPDATE AppUser
        SET passwordHash=?,passwordSalt=?,passwordIterations=?,mustChangePassword=0,
            passwordChangedAt=?,passwordExpiresAt=?,failedAttempts=0,lockedUntil=NULL,updatedAt=?
      WHERE id=?`,
    [
      next.hash,
      next.salt,
      next.iterations,
      now.toISOString(),
      plusDays(now, PASSWORD_POLICY.expiryDays),
      now.toISOString(),
      user.id
    ]
  );

  await run(
    db,
    `INSERT INTO PasswordHistory (id,userId,passwordHash,passwordSalt,passwordIterations,createdAt)
     VALUES (?,?,?,?,?,?)`,
    [crypto.randomUUID(), user.id, next.hash, next.salt, next.iterations, now.toISOString()]
  );

  await run(
    db,
    'UPDATE UserSessionAudit SET revokedAt=? WHERE userId=? AND revokedAt IS NULL',
    [now.toISOString(), user.id]
  );

  await audit(
    db,
    session.institution.id,
    session.username,
    session.roles.join(','),
    'UPDATE',
    'Credential',
    user.id,
    'Password changed; all previous sessions revoked.'
  );

  const updated = await first<UserRow>(db, 'SELECT * FROM AppUser WHERE id=? LIMIT 1', [user.id]);
  if (!updated) throw new Error('USER_NOT_FOUND');
  const payload = await buildPayload(db, updated, session.institution.id);
  const newToken = await signSessionToken(payload);

  await run(
    db,
    `INSERT INTO UserSessionAudit (
      id,sessionId,userId,institutionId,issuedAt,expiresAt,revokedAt,ipAddress,userAgent
    ) VALUES (?,?,?,?,?,?,NULL,NULL,NULL)`,
    [
      crypto.randomUUID(),
      payload.sid,
      user.id,
      payload.institution.id,
      new Date(payload.iat * 1000).toISOString(),
      new Date(payload.exp * 1000).toISOString()
    ]
  );

  return { token: newToken, user: payload };
}

export async function listAuthReferenceData(institutionId: string) {
  const db = await ensureAuthSchema();
  const [tenant, parameters, loginSummary] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      `SELECT i.id,i.name,i.legalName,t.slug,t.databaseBinding,t.folderKey,t.isolationMode,t.status
         FROM Institution i
         JOIN TenantRegistry t ON t.institutionId=i.id
        WHERE i.id=? LIMIT 1`,
      [institutionId]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT parameterKey,parameterValue,updatedBy,updatedAt FROM InstitutionSecurityParameter WHERE institutionId=? ORDER BY parameterKey',
      [institutionId]
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT
          SUM(CASE WHEN result='FAILED' THEN 1 ELSE 0 END) AS failed24h,
          SUM(CASE WHEN result='SUCCESS' THEN 1 ELSE 0 END) AS success24h
         FROM LoginAudit
        WHERE timestamp >= datetime('now','-1 day')`
    )
  ]);

  return {
    tenant,
    roles: BANK_ROLE_CATALOG,
    passwordPolicy: PASSWORD_POLICY,
    parameters,
    loginSummary: {
      failed24h: Number(loginSummary?.failed24h || 0),
      success24h: Number(loginSummary?.success24h || 0)
    }
  };
}

export async function saveSecurityParameters(
  institutionId: string,
  values: Record<string, string>,
  actor: SessionPayload
) {
  if (!actor.permissions.includes('security.admin')) throw new Error('ACCESS_DENIED');
  if (institutionId !== actor.institution.id && !actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
    throw new Error('INSTITUTION_ACCESS_DENIED');
  }
  const db = await ensureAuthSchema();
  const allowed = new Set([
    'PASSWORD_EXPIRY_DAYS',
    'SESSION_MINUTES',
    'LOCKOUT_MINUTES',
    'MAX_FAILED_ATTEMPTS',
    'REQUIRE_PRIVILEGED_MFA',
    'ALLOW_LOCAL_AUTH',
    'USER_REVIEW_FREQUENCY_DAYS'
  ]);
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    await run(
      db,
      `INSERT INTO InstitutionSecurityParameter (
        institutionId,parameterKey,parameterValue,updatedBy,updatedAt
      ) VALUES (?,?,?,?,?)
      ON CONFLICT(institutionId,parameterKey)
      DO UPDATE SET parameterValue=excluded.parameterValue,updatedBy=excluded.updatedBy,updatedAt=excluded.updatedAt`,
      [institutionId, key, value, actor.username, nowIso()]
    );
  }
  await audit(
    db,
    institutionId,
    actor.username,
    actor.roles.join(','),
    'UPDATE',
    'SecurityParameter',
    institutionId,
    'Institution security parameters updated by authorized administrator.',
    values
  );
  return { success: true };
}

export async function getTenantRegistry() {
  const db = await ensureAuthSchema();
  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT i.*,t.slug,t.databaseBinding,t.folderKey,t.isolationMode,t.status AS tenantStatus
       FROM Institution i
       JOIN TenantRegistry t ON t.institutionId=i.id
      ORDER BY i.createdAt ASC`
  );
  return rows;
}

export async function getRoleCatalog() {
  return BANK_ROLE_CATALOG;
}
