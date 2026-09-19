import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { recordMutationAudit } from '@/lib/d1-core';
import { mutationActorFromRequest } from '@/lib/mutation-security';

export const USER_ROLES = [
  'Admin',
  'ProcessOwner',
  'ControlOwner',
  'Tester',
  'Reviewer',
  'Executive',
  'Auditor'
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ORGANIZATION_ACCESS_SCOPES = [
  'Institution',
  'Unit',
  'UnitAndDescendants'
] as const;

export type OrganizationAccessScope = (typeof ORGANIZATION_ACCESS_SCOPES)[number];

export type AuthenticatedUser = {
  id: string;
  institutionId: string | null;
  email: string;
  name: string;
  role: UserRole;
  department: string | null;
  orgUnitId: string | null;
  accessScope: OrganizationAccessScope;
};

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

type AuthEnvironment = {
  DB?: D1DatabaseLike;
  TOTALARC_ACCESS_TEAM_DOMAIN?: string;
  TOTALARC_ACCESS_AUD?: string;
  TOTALARC_ADMIN_EMAIL?: string;
};

type AccessUserRow = {
  id: string;
  institutionId: string | null;
  email: string;
  name: string;
  role: string;
  department: string | null;
  orgUnitId: string | null;
  accessScope: string;
  active: number;
  createdAt: string;
  updatedAt: string;
  lastAuthenticatedAt: string | null;
};

export class AuthorizationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
    this.code = code;
  }
}

const remoteJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function normalizeTeamDomain(value: string) {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!/^https:\/\/[^/]+\.cloudflareaccess\.com$/i.test(trimmed)) {
    throw new AuthorizationError(
      503,
      'AUTH_CONFIGURATION_INVALID',
      'Cloudflare Access team domain is not configured correctly.'
    );
  }
  return trimmed;
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

export function isOrganizationAccessScope(value: unknown): value is OrganizationAccessScope {
  return typeof value === 'string'
    && (ORGANIZATION_ACCESS_SCOPES as readonly string[]).includes(value);
}

function displayName(payload: JWTPayload, email: string) {
  const candidates = [payload.name, payload.common_name, payload.given_name];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return email;
}

async function getAuthEnvironment() {
  const { env } = await getCloudflareContext({ async: true });
  const authEnv = env as unknown as AuthEnvironment;
  const db = authEnv.DB;

  if (!db) {
    throw new AuthorizationError(
      503,
      'AUTH_DATABASE_UNAVAILABLE',
      'Authentication database binding is unavailable.'
    );
  }

  const rawTeamDomain = authEnv.TOTALARC_ACCESS_TEAM_DOMAIN || '';
  const audience = (authEnv.TOTALARC_ACCESS_AUD || '').trim();
  const adminEmail = normalizeEmail(authEnv.TOTALARC_ADMIN_EMAIL);

  if (!rawTeamDomain || !audience || !adminEmail) {
    throw new AuthorizationError(
      503,
      'AUTH_NOT_CONFIGURED',
      'Cloudflare Access authentication has not been fully configured.'
    );
  }

  return {
    db,
    teamDomain: normalizeTeamDomain(rawTeamDomain),
    audience,
    adminEmail
  };
}

async function ensureAuthSchema(db: D1DatabaseLike) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS AccessUser (
    id TEXT PRIMARY KEY NOT NULL,
    institutionId TEXT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    department TEXT,
    orgUnitId TEXT,
    accessScope TEXT NOT NULL DEFAULT 'Institution',
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    lastAuthenticatedAt TEXT
  )`).run();

  const columns = await db.prepare('PRAGMA table_info(AccessUser)').all<{ name?: string }>();
  const columnNames = new Set((columns.results || []).map(column => String(column.name || '')));
  if (!columnNames.has('orgUnitId')) {
    await db.prepare('ALTER TABLE AccessUser ADD COLUMN orgUnitId TEXT').run();
  }
  if (!columnNames.has('accessScope')) {
    await db.prepare("ALTER TABLE AccessUser ADD COLUMN accessScope TEXT NOT NULL DEFAULT 'Institution'").run();
  }

  for (const statement of [
    'CREATE INDEX IF NOT EXISTS idx_access_user_institution ON AccessUser(institutionId)',
    'CREATE INDEX IF NOT EXISTS idx_access_user_role ON AccessUser(role)',
    'CREATE INDEX IF NOT EXISTS idx_access_user_org_unit ON AccessUser(orgUnitId)'
  ]) {
    await db.prepare(statement).run();
  }
}

async function first<T = Record<string, unknown>>(
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

function mapUser(row: AccessUserRow): AuthenticatedUser {
  if (!isUserRole(row.role)) {
    throw new AuthorizationError(
      403,
      'USER_ROLE_INVALID',
      'The assigned Total ARC role is invalid.'
    );
  }

  return {
    id: row.id,
    institutionId: row.institutionId || null,
    email: row.email,
    name: row.name,
    role: row.role,
    department: row.department || null,
    orgUnitId: row.orgUnitId || null,
    accessScope: isOrganizationAccessScope(row.accessScope) ? row.accessScope : 'Institution'
  };
}

async function provisionBootstrapAdmin(
  db: D1DatabaseLike,
  email: string,
  name: string,
  configuredAdminEmail: string
) {
  if (email !== configuredAdminEmail) return null;

  const existingCount = await first<{ count?: number }>(
    db,
    'SELECT COUNT(*) AS count FROM AccessUser'
  );
  if (Number(existingCount?.count || 0) !== 0) return null;

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO AccessUser (
      id, institutionId, email, name, role, department, orgUnitId, accessScope, active,
      createdAt, updatedAt, lastAuthenticatedAt
    ) VALUES (?, ?, ?, ?, 'Admin', NULL, NULL, 'Institution', 1, ?, ?, ?)`,
    [id, null, email, name, now, now, now]
  );

  return first<AccessUserRow>(
    db,
    'SELECT * FROM AccessUser WHERE id = ? LIMIT 1',
    [id]
  );
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedUser> {
  const { db, teamDomain, audience, adminEmail } = await getAuthEnvironment();
  await ensureAuthSchema(db);

  const token = request.headers.get('cf-access-jwt-assertion')?.trim();
  if (!token) {
    throw new AuthorizationError(
      401,
      'AUTH_TOKEN_MISSING',
      'Cloudflare Access authentication is required.'
    );
  }

  let payload: JWTPayload;
  try {
    const certsUrl = `${teamDomain}/cdn-cgi/access/certs`;
    let jwks = remoteJwks.get(certsUrl);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(certsUrl));
      remoteJwks.set(certsUrl, jwks);
    }

    const verified = await jwtVerify(token, jwks, {
      issuer: teamDomain,
      audience
    });
    payload = verified.payload;
  } catch {
    throw new AuthorizationError(
      401,
      'AUTH_TOKEN_INVALID',
      'Cloudflare Access token validation failed.'
    );
  }

  const email = normalizeEmail(payload.email);
  if (!email) {
    throw new AuthorizationError(
      403,
      'AUTH_EMAIL_MISSING',
      'Authenticated identity does not contain an email address.'
    );
  }

  let row = await first<AccessUserRow>(
    db,
    'SELECT * FROM AccessUser WHERE lower(email) = ? LIMIT 1',
    [email]
  );

  if (!row) {
    row = await provisionBootstrapAdmin(
      db,
      email,
      displayName(payload, email),
      adminEmail
    );
  }

  if (!row) {
    throw new AuthorizationError(
      403,
      'USER_NOT_PROVISIONED',
      'This authenticated identity is not provisioned in Total ARC.'
    );
  }

  if (!Number(row.active)) {
    throw new AuthorizationError(
      403,
      'USER_DISABLED',
      'This Total ARC user account is disabled.'
    );
  }

  const now = new Date().toISOString();
  await run(
    db,
    'UPDATE AccessUser SET lastAuthenticatedAt = ? WHERE id = ?',
    [now, row.id]
  );

  return mapUser({
    ...row,
    lastAuthenticatedAt: now
  });
}

export async function bindBootstrapAdminToInstitution(
  user: AuthenticatedUser,
  institutionId: string
): Promise<AuthenticatedUser> {
  if (user.role !== 'Admin') {
    throw new AuthorizationError(
      403,
      'ROLE_NOT_AUTHORIZED',
      'Only an administrator can bind the initial institution.'
    );
  }

  if (!institutionId.trim()) {
    throw new AuthorizationError(
      400,
      'INSTITUTION_ID_REQUIRED',
      'A valid institution identifier is required.'
    );
  }

  if (user.institutionId) {
    if (user.institutionId !== institutionId) {
      throw new AuthorizationError(
        403,
        'CROSS_TENANT_BIND_BLOCKED',
        'An administrator already bound to an institution cannot be rebound.'
      );
    }
    return user;
  }

  const { db } = await getAuthEnvironment();
  await ensureAuthSchema(db);

  const target = await first<{ id?: string }>(
    db,
    'SELECT id FROM Institution WHERE id = ? LIMIT 1',
    [institutionId]
  );
  if (!target?.id) {
    throw new AuthorizationError(
      404,
      'INSTITUTION_NOT_FOUND',
      'The institution selected for binding does not exist.'
    );
  }

  const current = await first<AccessUserRow>(
    db,
    'SELECT * FROM AccessUser WHERE id = ? LIMIT 1',
    [user.id]
  );
  if (!current || current.role !== 'Admin' || !Number(current.active)) {
    throw new AuthorizationError(
      403,
      'BOOTSTRAP_ADMIN_INVALID',
      'The bootstrap administrator account is not valid for institution binding.'
    );
  }

  if (current.institutionId && current.institutionId !== institutionId) {
    throw new AuthorizationError(
      403,
      'CROSS_TENANT_BIND_BLOCKED',
      'An administrator already bound to an institution cannot be rebound.'
    );
  }

  const now = new Date().toISOString();
  await run(
    db,
    'UPDATE AccessUser SET institutionId = ?, updatedAt = ? WHERE id = ? AND institutionId IS NULL',
    [institutionId, now, user.id]
  );

  const updated = await first<AccessUserRow>(
    db,
    'SELECT * FROM AccessUser WHERE id = ? LIMIT 1',
    [user.id]
  );
  if (!updated || updated.institutionId !== institutionId) {
    throw new AuthorizationError(
      409,
      'INSTITUTION_BIND_FAILED',
      'The administrator could not be bound to the institution.'
    );
  }

  return mapUser(updated);
}

export async function requireRoles(
  request: Request,
  allowedRoles: readonly UserRole[]
): Promise<AuthenticatedUser> {
  const user = await authenticateRequest(request);

  if (!allowedRoles.includes(user.role)) {
    throw new AuthorizationError(
      403,
      'ROLE_NOT_AUTHORIZED',
      'Your Total ARC role is not authorized for this operation.'
    );
  }

  return user;
}

export function authorizationErrorPayload(error: unknown) {
  if (!(error instanceof AuthorizationError)) return null;

  return {
    status: error.status,
    body: {
      error: error.message,
      code: error.code
    }
  };
}

export async function listProvisionedUsers(request: Request) {
  const admin = await requireRoles(request, ['Admin']);
  const { db } = await getAuthEnvironment();
  await ensureAuthSchema(db);

  const statement = admin.institutionId
    ? db.prepare(
        `SELECT id, institutionId, email, name, role, department, orgUnitId, accessScope, active,
                createdAt, updatedAt, lastAuthenticatedAt
           FROM AccessUser
          WHERE institutionId = ?
          ORDER BY name ASC, email ASC`
      ).bind(admin.institutionId)
    : db.prepare(
        `SELECT id, institutionId, email, name, role, department, orgUnitId, accessScope, active,
                createdAt, updatedAt, lastAuthenticatedAt
           FROM AccessUser
          WHERE id = ?
          ORDER BY name ASC, email ASC`
      ).bind(admin.id);

  const result = await statement.all<Record<string, unknown>>();
  return result.results || [];
}

export async function provisionUser(
  request: Request,
  input: {
    email: string;
    name: string;
    role: UserRole;
    department?: string | null;
    orgUnitId?: string | null;
    accessScope?: OrganizationAccessScope;
  }
) {
  const admin = await requireRoles(request, ['Admin']);
  const { db } = await getAuthEnvironment();
  await ensureAuthSchema(db);

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !name || !isUserRole(input.role)) {
    throw new AuthorizationError(
      400,
      'USER_INPUT_INVALID',
      'A valid email, name, and Total ARC role are required.'
    );
  }

  if (!admin.institutionId) {
    throw new AuthorizationError(
      409,
      'INSTITUTION_REQUIRED',
      'Register an institution before provisioning additional users.'
    );
  }

  const orgUnitId = input.role === 'Admin' ? null : input.orgUnitId?.trim() || null;
  const accessScope = input.role === 'Admin' ? 'Institution' : input.accessScope || 'Institution';
  if (!isOrganizationAccessScope(accessScope)) {
    throw new AuthorizationError(400, 'ORGANIZATION_SCOPE_INVALID', 'Invalid organization access scope.');
  }
  if (accessScope !== 'Institution' && !orgUnitId) {
    throw new AuthorizationError(
      400,
      'ORGANIZATION_UNIT_REQUIRED',
      'A primary organization unit is required for unit-scoped access.'
    );
  }
  if (orgUnitId) {
    const organizationUnit = await first<{ id?: string }>(
      db,
      'SELECT id FROM OrganizationUnit WHERE id = ? AND institutionId = ? LIMIT 1',
      [orgUnitId, admin.institutionId]
    );
    if (!organizationUnit?.id) {
      throw new AuthorizationError(
        400,
        'ORGANIZATION_UNIT_INVALID',
        'Selected organization unit does not belong to this institution.'
      );
    }
  }

  const duplicate = await first<{ id?: string }>(
    db,
    'SELECT id FROM AccessUser WHERE lower(email) = ? LIMIT 1',
    [email]
  );
  if (duplicate?.id) {
    throw new AuthorizationError(
      409,
      'USER_ALREADY_EXISTS',
      'A Total ARC user with this email already exists.'
    );
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO AccessUser (
      id, institutionId, email, name, role, department, orgUnitId, accessScope, active,
      createdAt, updatedAt, lastAuthenticatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
    [
      id,
      admin.institutionId,
      email,
      name,
      input.role,
      input.department?.trim() || null,
      orgUnitId,
      accessScope,
      now,
      now
    ]
  );

  const created = await first<Record<string, unknown>>(
    db,
    `SELECT id, institutionId, email, name, role, department, orgUnitId, accessScope, active,
            createdAt, updatedAt, lastAuthenticatedAt
       FROM AccessUser WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!created) {
    throw new AuthorizationError(500, 'USER_CREATE_FAILED', 'Provisioned user could not be reloaded.');
  }

  await recordMutationAudit({
    institutionId: admin.institutionId,
    action: 'CREATE',
    entityType: 'AccessUser',
    recordId: id,
    newValue: {
      email,
      name,
      role: input.role,
      department: input.department?.trim() || null,
      orgUnitId,
      accessScope,
      active: true
    },
    reason: 'Total ARC user provisioned by an authenticated administrator.'
  }, mutationActorFromRequest(request, admin));

  return created;
}

export async function updateProvisionedUser(
  request: Request,
  input: {
    id: string;
    role?: UserRole;
    active?: boolean;
    name?: string;
    department?: string | null;
    orgUnitId?: string | null;
    accessScope?: OrganizationAccessScope;
  }
) {
  const admin = await requireRoles(request, ['Admin']);
  const { db } = await getAuthEnvironment();
  await ensureAuthSchema(db);

  const existing = await first<AccessUserRow>(
    db,
    'SELECT * FROM AccessUser WHERE id = ? LIMIT 1',
    [input.id]
  );
  if (!existing) {
    throw new AuthorizationError(404, 'USER_NOT_FOUND', 'Total ARC user was not found.');
  }

  const canManage =
    admin.institutionId
      ? existing.institutionId === admin.institutionId
      : existing.id === admin.id && existing.institutionId === null;

  if (!canManage) {
    throw new AuthorizationError(
      403,
      'CROSS_TENANT_USER_UPDATE',
      'Cross-institution user administration is not allowed.'
    );
  }

  const nextRole = input.role ?? (isUserRole(existing.role) ? existing.role : 'Executive');
  const nextActive = input.active === undefined ? Boolean(existing.active) : input.active;
  const nextName = input.name?.trim() || existing.name;
  const nextDepartment =
    input.department === undefined ? existing.department : input.department?.trim() || null;
  let nextOrgUnitId =
    input.orgUnitId === undefined ? existing.orgUnitId : input.orgUnitId?.trim() || null;
  let nextAccessScope =
    input.accessScope === undefined
      ? (isOrganizationAccessScope(existing.accessScope) ? existing.accessScope : 'Institution')
      : input.accessScope;

  if (!isUserRole(nextRole)) {
    throw new AuthorizationError(400, 'USER_ROLE_INVALID', 'Invalid Total ARC role.');
  }

  if (nextRole === 'Admin') {
    nextOrgUnitId = null;
    nextAccessScope = 'Institution';
  }

  if (!isOrganizationAccessScope(nextAccessScope)) {
    throw new AuthorizationError(400, 'ORGANIZATION_SCOPE_INVALID', 'Invalid organization access scope.');
  }
  if (nextAccessScope !== 'Institution' && !nextOrgUnitId) {
    throw new AuthorizationError(
      400,
      'ORGANIZATION_UNIT_REQUIRED',
      'A primary organization unit is required for unit-scoped access.'
    );
  }
  if (admin.institutionId && nextOrgUnitId) {
    const organizationUnit = await first<{ id?: string }>(
      db,
      'SELECT id FROM OrganizationUnit WHERE id = ? AND institutionId = ? LIMIT 1',
      [nextOrgUnitId, admin.institutionId]
    );
    if (!organizationUnit?.id) {
      throw new AuthorizationError(
        400,
        'ORGANIZATION_UNIT_INVALID',
        'Selected organization unit does not belong to this institution.'
      );
    }
  }

  if (existing.id === admin.id && !nextActive) {
    throw new AuthorizationError(
      409,
      'SELF_DISABLE_BLOCKED',
      'An administrator cannot disable their own account.'
    );
  }

  const now = new Date().toISOString();
  await run(
    db,
    `UPDATE AccessUser
        SET role = ?, active = ?, name = ?, department = ?, orgUnitId = ?, accessScope = ?, updatedAt = ?
      WHERE id = ?`,
    [
      nextRole,
      nextActive ? 1 : 0,
      nextName,
      nextDepartment,
      nextOrgUnitId,
      nextAccessScope,
      now,
      existing.id
    ]
  );

  const updated = await first<Record<string, unknown>>(
    db,
    `SELECT id, institutionId, email, name, role, department, orgUnitId, accessScope, active,
            createdAt, updatedAt, lastAuthenticatedAt
       FROM AccessUser WHERE id = ? LIMIT 1`,
    [existing.id]
  );

  if (!updated) {
    throw new AuthorizationError(500, 'USER_UPDATE_FAILED', 'Updated user could not be reloaded.');
  }

  const auditInstitutionId = admin.institutionId || existing.institutionId;
  if (auditInstitutionId) {
    await recordMutationAudit({
      institutionId: auditInstitutionId,
      action: 'UPDATE',
      entityType: 'AccessUser',
      recordId: existing.id,
      oldValue: {
        name: existing.name,
        role: existing.role,
        department: existing.department,
        orgUnitId: existing.orgUnitId,
        accessScope: isOrganizationAccessScope(existing.accessScope) ? existing.accessScope : 'Institution',
        active: Boolean(existing.active)
      },
      newValue: {
        name: nextName,
        role: nextRole,
        department: nextDepartment,
        orgUnitId: nextOrgUnitId,
        accessScope: nextAccessScope,
        active: nextActive
      },
      reason: 'Total ARC user profile, role, or account status updated by an authenticated administrator.'
    }, mutationActorFromRequest(request, admin));
  }

  return updated;
}
