import { getCloudflareContext } from '@opennextjs/cloudflare';
import { recordMutationAudit } from '@/lib/d1-core';
import type { MutationActor } from '@/lib/mutation-security';

type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1StatementLike;
  batch?: (statements: D1StatementLike[]) => Promise<unknown[]>;
};

export const ORGANIZATION_UNIT_TYPES = [
  'Directorate',
  'Division',
  'Department',
  'Section',
  'Unit',
  'Team',
  'Regional Office',
  'Branch',
  'Sub Branch',
  'Committee',
  'Function',
  'Other'
] as const;

export type OrganizationUnitType = (typeof ORGANIZATION_UNIT_TYPES)[number];

export type LegalEntityRecord = {
  id: string;
  institutionId: string;
  parentEntityId: string | null;
  code: string;
  name: string;
  shortName: string | null;
  entityType: string;
  country: string;
  currency: string;
  registrationNumber: string | null;
  taxId: string | null;
  status: string;
  effectiveDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationUnitRecord = {
  id: string;
  institutionId: string;
  legalEntityId: string | null;
  parentId: string | null;
  type: string;
  code: string;
  name: string;
  headUserId: string | null;
  headName: string | null;
  headEmail: string | null;
  costCenter: string | null;
  location: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationPositionRecord = {
  id: string;
  institutionId: string;
  orgUnitId: string;
  code: string;
  title: string;
  positionLevel: string | null;
  assignedUserId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AccessUserRow = {
  id: string;
  institutionId: string | null;
  email: string;
  name: string;
  role: string;
  department: string | null;
  orgUnitId: string | null;
  orgAccessScope: string | null;
  active: number;
};

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('ORGANIZATION_DATABASE_UNAVAILABLE');
  return db;
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

function requiredText(value: unknown, code: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(code);
  return value.trim();
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizedCode(value: unknown, errorCode: string) {
  return requiredText(value, errorCode).toUpperCase().replace(/\s+/g, '-');
}

function normalizedStatus(value: unknown) {
  const status = optionalText(value) || 'Active';
  if (!['Active', 'Inactive'].includes(status)) throw new Error('ORGANIZATION_STATUS_INVALID');
  return status;
}

function normalizedUnitType(value: unknown): OrganizationUnitType {
  const type = requiredText(value, 'ORGANIZATION_UNIT_TYPE_REQUIRED');
  if (!(ORGANIZATION_UNIT_TYPES as readonly string[]).includes(type)) {
    throw new Error('ORGANIZATION_UNIT_TYPE_INVALID');
  }
  return type as OrganizationUnitType;
}

async function ensureColumn(
  db: D1DatabaseLike,
  table: string,
  column: string,
  definition: string
) {
  const columns = await all<{ name?: string }>(db, `PRAGMA table_info(${table})`);
  if (!columns.some(item => item.name === column)) {
    await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

export async function ensureOrganizationSchema() {
  const db = await getDb();

  for (const statement of [
    `CREATE TABLE IF NOT EXISTS LegalEntity (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      parentEntityId TEXT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      shortName TEXT,
      entityType TEXT NOT NULL DEFAULT 'Legal Entity',
      country TEXT NOT NULL DEFAULT 'Indonesia',
      currency TEXT NOT NULL DEFAULT 'IDR',
      registrationNumber TEXT,
      taxId TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      effectiveDate TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS OrganizationUnit (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      parentId TEXT,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      headUserId TEXT,
      headName TEXT,
      headEmail TEXT,
      costCenter TEXT,
      location TEXT,
      effectiveFrom TEXT,
      effectiveUntil TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS OrganizationPosition (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      orgUnitId TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      positionLevel TEXT,
      assignedUserId TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`
  ]) {
    await db.prepare(statement).run();
  }

  await ensureColumn(db, 'LegalEntity', 'parentEntityId', 'TEXT');
  await ensureColumn(db, 'LegalEntity', 'shortName', 'TEXT');
  await ensureColumn(db, 'LegalEntity', 'entityType', "TEXT NOT NULL DEFAULT 'Legal Entity'");
  await ensureColumn(db, 'LegalEntity', 'currency', "TEXT NOT NULL DEFAULT 'IDR'");
  await ensureColumn(db, 'LegalEntity', 'registrationNumber', 'TEXT');
  await ensureColumn(db, 'LegalEntity', 'status', "TEXT NOT NULL DEFAULT 'Active'");
  await ensureColumn(db, 'LegalEntity', 'effectiveDate', 'TEXT');
  await ensureColumn(db, 'LegalEntity', 'updatedAt', "TEXT NOT NULL DEFAULT ''");

  await ensureColumn(db, 'OrganizationUnit', 'headUserId', 'TEXT');
  await ensureColumn(db, 'OrganizationUnit', 'costCenter', 'TEXT');
  await ensureColumn(db, 'OrganizationUnit', 'location', 'TEXT');
  await ensureColumn(db, 'OrganizationUnit', 'effectiveFrom', 'TEXT');
  await ensureColumn(db, 'OrganizationUnit', 'effectiveUntil', 'TEXT');
  await ensureColumn(db, 'OrganizationUnit', 'status', "TEXT NOT NULL DEFAULT 'Active'");

  for (const statement of [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_entity_institution_code ON LegalEntity(institutionId, code)',
    'CREATE INDEX IF NOT EXISTS idx_legal_entity_institution ON LegalEntity(institutionId)',
    'CREATE INDEX IF NOT EXISTS idx_legal_entity_parent ON LegalEntity(parentEntityId)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_org_unit_institution_code ON OrganizationUnit(institutionId, code)',
    'CREATE INDEX IF NOT EXISTS idx_org_unit_institution ON OrganizationUnit(institutionId)',
    'CREATE INDEX IF NOT EXISTS idx_org_unit_parent ON OrganizationUnit(parentId)',
    'CREATE INDEX IF NOT EXISTS idx_org_unit_legal_entity ON OrganizationUnit(legalEntityId)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_org_position_institution_code ON OrganizationPosition(institutionId, code)',
    'CREATE INDEX IF NOT EXISTS idx_org_position_unit ON OrganizationPosition(orgUnitId)',
    'CREATE INDEX IF NOT EXISTS idx_org_position_user ON OrganizationPosition(assignedUserId)'
  ]) {
    await db.prepare(statement).run();
  }

  return db;
}

async function assertInstitutionExists(db: D1DatabaseLike, institutionId: string) {
  const institution = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution WHERE id = ? LIMIT 1',
    [institutionId]
  );
  if (!institution) throw new Error('INSTITUTION_NOT_FOUND');
  return institution;
}

async function tenantEntity(db: D1DatabaseLike, institutionId: string, id: string) {
  const entity = await first<LegalEntityRecord>(
    db,
    'SELECT * FROM LegalEntity WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
  if (!entity) throw new Error('LEGAL_ENTITY_NOT_FOUND');
  return entity;
}

async function tenantUnit(db: D1DatabaseLike, institutionId: string, id: string) {
  const unit = await first<OrganizationUnitRecord>(
    db,
    'SELECT * FROM OrganizationUnit WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
  if (!unit) throw new Error('ORGANIZATION_UNIT_NOT_FOUND');
  return unit;
}

async function tenantUser(db: D1DatabaseLike, institutionId: string, id: string) {
  const user = await first<AccessUserRow>(
    db,
    `SELECT id, institutionId, email, name, role, department, orgUnitId, orgAccessScope, active
       FROM AccessUser
      WHERE id = ? AND institutionId = ? LIMIT 1`,
    [id, institutionId]
  );
  if (!user) throw new Error('ORGANIZATION_USER_NOT_FOUND');
  return user;
}

async function tableExists(db: D1DatabaseLike, tableName: string) {
  const row = await first<{ name?: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    [tableName]
  );
  return Boolean(row?.name);
}

async function assertEntityParentSafe(
  db: D1DatabaseLike,
  institutionId: string,
  entityId: string,
  parentEntityId: string | null
) {
  let current = parentEntityId;
  const seen = new Set<string>();
  while (current) {
    if (current === entityId || seen.has(current)) throw new Error('LEGAL_ENTITY_HIERARCHY_CYCLE');
    seen.add(current);
    const row = await tenantEntity(db, institutionId, current);
    current = row.parentEntityId;
  }
}

async function assertUnitParentSafe(
  db: D1DatabaseLike,
  institutionId: string,
  unitId: string,
  parentId: string | null
) {
  let current = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === unitId || seen.has(current)) throw new Error('ORGANIZATION_UNIT_HIERARCHY_CYCLE');
    seen.add(current);
    const row = await tenantUnit(db, institutionId, current);
    current = row.parentId;
  }
}

export async function getOrganizationData(institutionId: string) {
  const db = await ensureOrganizationSchema();
  const institution = await assertInstitutionExists(db, institutionId);

  const [legalEntities, organizationUnits, positions, users] = await Promise.all([
    all<LegalEntityRecord>(
      db,
      'SELECT * FROM LegalEntity WHERE institutionId = ? ORDER BY name ASC, code ASC',
      [institutionId]
    ),
    all<OrganizationUnitRecord>(
      db,
      'SELECT * FROM OrganizationUnit WHERE institutionId = ? ORDER BY name ASC, code ASC',
      [institutionId]
    ),
    all<OrganizationPositionRecord>(
      db,
      'SELECT * FROM OrganizationPosition WHERE institutionId = ? ORDER BY title ASC, code ASC',
      [institutionId]
    ),
    all<AccessUserRow>(
      db,
      `SELECT id, institutionId, email, name, role, department, orgUnitId, orgAccessScope, active
         FROM AccessUser
        WHERE institutionId = ?
        ORDER BY name ASC, email ASC`,
      [institutionId]
    )
  ]);

  const businessProcessReady = await tableExists(db, 'BusinessProcess');
  const [unitProcessRows, entityProcessRows] = businessProcessReady
    ? await Promise.all([
        all<{ orgUnitId?: string; processCount?: number }>(
          db,
          `SELECT orgUnitId, COUNT(*) AS processCount
             FROM BusinessProcess
            WHERE institutionId = ? AND orgUnitId IS NOT NULL
            GROUP BY orgUnitId`,
          [institutionId]
        ),
        all<{ legalEntityId?: string; processCount?: number }>(
          db,
          `SELECT legalEntityId, COUNT(*) AS processCount
             FROM BusinessProcess
            WHERE institutionId = ? AND legalEntityId IS NOT NULL
            GROUP BY legalEntityId`,
          [institutionId]
        )
      ])
    : [[], []];

  const entityById = new Map(legalEntities.map(item => [item.id, item]));
  const unitById = new Map(organizationUnits.map(item => [item.id, item]));
  const userById = new Map(users.map(item => [item.id, item]));
  const processCountByUnit = new Map(
    unitProcessRows.map(item => [String(item.orgUnitId || ''), Number(item.processCount || 0)])
  );
  const processCountByEntity = new Map(
    entityProcessRows.map(item => [String(item.legalEntityId || ''), Number(item.processCount || 0)])
  );
  const positionCountByUnit = new Map<string, number>();
  const childUnitCountByUnit = new Map<string, number>();

  for (const position of positions) {
    positionCountByUnit.set(
      position.orgUnitId,
      (positionCountByUnit.get(position.orgUnitId) || 0) + 1
    );
  }

  for (const unit of organizationUnits) {
    if (!unit.parentId) continue;
    childUnitCountByUnit.set(
      unit.parentId,
      (childUnitCountByUnit.get(unit.parentId) || 0) + 1
    );
  }

  return {
    institution,
    legalEntities: legalEntities.map(entity => ({
      ...entity,
      parentEntityName: entity.parentEntityId
        ? entityById.get(entity.parentEntityId)?.name || null
        : null,
      processCount: processCountByEntity.get(entity.id) || 0
    })),
    organizationUnits: organizationUnits.map(unit => ({
      ...unit,
      legalEntityName: unit.legalEntityId
        ? entityById.get(unit.legalEntityId)?.name || null
        : null,
      parentName: unit.parentId ? unitById.get(unit.parentId)?.name || null : null,
      headUserName: unit.headUserId
        ? userById.get(unit.headUserId)?.name || unit.headName
        : unit.headName,
      headUserEmail: unit.headUserId
        ? userById.get(unit.headUserId)?.email || unit.headEmail
        : unit.headEmail,
      processCount: processCountByUnit.get(unit.id) || 0,
      positionCount: positionCountByUnit.get(unit.id) || 0,
      childUnitCount: childUnitCountByUnit.get(unit.id) || 0
    })),
    positions: positions.map(position => ({
      ...position,
      unitName: unitById.get(position.orgUnitId)?.name || null,
      assignedUserName: position.assignedUserId
        ? userById.get(position.assignedUserId)?.name || null
        : null,
      assignedUserEmail: position.assignedUserId
        ? userById.get(position.assignedUserId)?.email || null
        : null
    })),
    users: users.map(user => ({
      ...user,
      orgUnitName: user.orgUnitId ? unitById.get(user.orgUnitId)?.name || null : null,
      active: Number(user.active) === 1
    })),
    storage: 'cloudflare-d1'
  };
}

export async function createLegalEntity(
  institutionId: string,
  input: Record<string, unknown>,
  actor: MutationActor
) {
  const db = await ensureOrganizationSchema();
  await assertInstitutionExists(db, institutionId);

  const code = normalizedCode(input.code, 'LEGAL_ENTITY_CODE_REQUIRED');
  const name = requiredText(input.name, 'LEGAL_ENTITY_NAME_REQUIRED');
  const parentEntityId = optionalText(input.parentEntityId);
  if (parentEntityId) await tenantEntity(db, institutionId, parentEntityId);

  const duplicate = await first<{ id?: string }>(
    db,
    'SELECT id FROM LegalEntity WHERE institutionId = ? AND code = ? LIMIT 1',
    [institutionId, code]
  );
  if (duplicate?.id) throw new Error('LEGAL_ENTITY_CODE_CONFLICT');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: LegalEntityRecord = {
    id,
    institutionId,
    parentEntityId,
    code,
    name,
    shortName: optionalText(input.shortName),
    entityType: optionalText(input.entityType) || 'Legal Entity',
    country: optionalText(input.country) || 'Indonesia',
    currency: optionalText(input.currency) || 'IDR',
    registrationNumber: optionalText(input.registrationNumber),
    taxId: optionalText(input.taxId),
    status: normalizedStatus(input.status),
    effectiveDate: optionalText(input.effectiveDate),
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO LegalEntity (
      id, institutionId, parentEntityId, code, name, shortName, entityType,
      country, currency, registrationNumber, taxId, status, effectiveDate,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.institutionId, record.parentEntityId, record.code, record.name,
      record.shortName, record.entityType, record.country, record.currency,
      record.registrationNumber, record.taxId, record.status, record.effectiveDate,
      record.createdAt, record.updatedAt
    ]
  );

  await recordMutationAudit({
    institutionId,
    action: 'CREATE',
    entityType: 'LegalEntity',
    recordId: id,
    newValue: record,
    reason: 'Legal entity registered in the organization master.'
  }, actor);

  return record;
}

export async function updateLegalEntity(
  institutionId: string,
  input: Record<string, unknown>,
  actor: MutationActor
) {
  const db = await ensureOrganizationSchema();
  const id = requiredText(input.id, 'LEGAL_ENTITY_ID_REQUIRED');
  const existing = await tenantEntity(db, institutionId, id);

  const code = input.code === undefined
    ? existing.code
    : normalizedCode(input.code, 'LEGAL_ENTITY_CODE_REQUIRED');
  const name = input.name === undefined
    ? existing.name
    : requiredText(input.name, 'LEGAL_ENTITY_NAME_REQUIRED');
  const parentEntityId = input.parentEntityId === undefined
    ? existing.parentEntityId
    : optionalText(input.parentEntityId);

  if (parentEntityId) await tenantEntity(db, institutionId, parentEntityId);
  await assertEntityParentSafe(db, institutionId, id, parentEntityId);

  const duplicate = await first<{ id?: string }>(
    db,
    'SELECT id FROM LegalEntity WHERE institutionId = ? AND code = ? AND id <> ? LIMIT 1',
    [institutionId, code, id]
  );
  if (duplicate?.id) throw new Error('LEGAL_ENTITY_CODE_CONFLICT');

  const updatedAt = new Date().toISOString();
  await run(
    db,
    `UPDATE LegalEntity SET
      parentEntityId = ?, code = ?, name = ?, shortName = ?, entityType = ?,
      country = ?, currency = ?, registrationNumber = ?, taxId = ?, status = ?,
      effectiveDate = ?, updatedAt = ?
     WHERE id = ? AND institutionId = ?`,
    [
      parentEntityId,
      code,
      name,
      input.shortName === undefined ? existing.shortName : optionalText(input.shortName),
      input.entityType === undefined ? existing.entityType : optionalText(input.entityType) || 'Legal Entity',
      input.country === undefined ? existing.country : optionalText(input.country) || 'Indonesia',
      input.currency === undefined ? existing.currency : optionalText(input.currency) || 'IDR',
      input.registrationNumber === undefined ? existing.registrationNumber : optionalText(input.registrationNumber),
      input.taxId === undefined ? existing.taxId : optionalText(input.taxId),
      input.status === undefined ? existing.status : normalizedStatus(input.status),
      input.effectiveDate === undefined ? existing.effectiveDate : optionalText(input.effectiveDate),
      updatedAt,
      id,
      institutionId
    ]
  );

  const updated = await tenantEntity(db, institutionId, id);
  await recordMutationAudit({
    institutionId,
    action: 'UPDATE',
    entityType: 'LegalEntity',
    recordId: id,
    oldValue: existing,
    newValue: updated,
    reason: 'Legal entity updated in the organization master.'
  }, actor);
  return updated;
}

export async function createOrganizationUnit(
  institutionId: string,
  input: Record<string, unknown>,
  actor: MutationActor
) {
  const db = await ensureOrganizationSchema();
  await assertInstitutionExists(db, institutionId);

  const code = normalizedCode(input.code, 'ORGANIZATION_UNIT_CODE_REQUIRED');
  const name = requiredText(input.name, 'ORGANIZATION_UNIT_NAME_REQUIRED');
  const type = normalizedUnitType(input.type);
  const legalEntityId = optionalText(input.legalEntityId);
  const parentId = optionalText(input.parentId);
  const headUserId = optionalText(input.headUserId);

  if (legalEntityId) await tenantEntity(db, institutionId, legalEntityId);
  let parent: OrganizationUnitRecord | null = null;
  if (parentId) parent = await tenantUnit(db, institutionId, parentId);

  const resolvedEntityId = legalEntityId || parent?.legalEntityId || null;
  if (parent && legalEntityId && parent.legalEntityId && parent.legalEntityId !== legalEntityId) {
    throw new Error('ORGANIZATION_UNIT_ENTITY_MISMATCH');
  }

  let headUser: AccessUserRow | null = null;
  if (headUserId) headUser = await tenantUser(db, institutionId, headUserId);

  const duplicate = await first<{ id?: string }>(
    db,
    'SELECT id FROM OrganizationUnit WHERE institutionId = ? AND code = ? LIMIT 1',
    [institutionId, code]
  );
  if (duplicate?.id) throw new Error('ORGANIZATION_UNIT_CODE_CONFLICT');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: OrganizationUnitRecord = {
    id,
    institutionId,
    legalEntityId: resolvedEntityId,
    parentId,
    type,
    code,
    name,
    headUserId,
    headName: headUser?.name || optionalText(input.headName),
    headEmail: headUser?.email || optionalText(input.headEmail),
    costCenter: optionalText(input.costCenter),
    location: optionalText(input.location),
    effectiveFrom: optionalText(input.effectiveFrom),
    effectiveUntil: optionalText(input.effectiveUntil),
    status: normalizedStatus(input.status),
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO OrganizationUnit (
      id, institutionId, legalEntityId, parentId, type, code, name,
      headUserId, headName, headEmail, costCenter, location, effectiveFrom,
      effectiveUntil, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.institutionId, record.legalEntityId, record.parentId, record.type,
      record.code, record.name, record.headUserId, record.headName, record.headEmail,
      record.costCenter, record.location, record.effectiveFrom, record.effectiveUntil,
      record.status, record.createdAt, record.updatedAt
    ]
  );

  await recordMutationAudit({
    institutionId,
    action: 'CREATE',
    entityType: 'OrganizationUnit',
    recordId: id,
    newValue: record,
    reason: 'Organization unit registered in the enterprise hierarchy.'
  }, actor);

  return record;
}

export async function updateOrganizationUnit(
  institutionId: string,
  input: Record<string, unknown>,
  actor: MutationActor
) {
  const db = await ensureOrganizationSchema();
  const id = requiredText(input.id, 'ORGANIZATION_UNIT_ID_REQUIRED');
  const existing = await tenantUnit(db, institutionId, id);

  const code = input.code === undefined
    ? existing.code
    : normalizedCode(input.code, 'ORGANIZATION_UNIT_CODE_REQUIRED');
  const name = input.name === undefined
    ? existing.name
    : requiredText(input.name, 'ORGANIZATION_UNIT_NAME_REQUIRED');
  const type = input.type === undefined ? existing.type : normalizedUnitType(input.type);
  const legalEntityId = input.legalEntityId === undefined
    ? existing.legalEntityId
    : optionalText(input.legalEntityId);
  const parentId = input.parentId === undefined ? existing.parentId : optionalText(input.parentId);
  const headUserId = input.headUserId === undefined
    ? existing.headUserId
    : optionalText(input.headUserId);

  if (legalEntityId) await tenantEntity(db, institutionId, legalEntityId);
  let parent: OrganizationUnitRecord | null = null;
  if (parentId) parent = await tenantUnit(db, institutionId, parentId);
  await assertUnitParentSafe(db, institutionId, id, parentId);

  const resolvedEntityId = legalEntityId || parent?.legalEntityId || null;
  if (parent && resolvedEntityId && parent.legalEntityId && parent.legalEntityId !== resolvedEntityId) {
    throw new Error('ORGANIZATION_UNIT_ENTITY_MISMATCH');
  }

  let headUser: AccessUserRow | null = null;
  if (headUserId) headUser = await tenantUser(db, institutionId, headUserId);

  const duplicate = await first<{ id?: string }>(
    db,
    'SELECT id FROM OrganizationUnit WHERE institutionId = ? AND code = ? AND id <> ? LIMIT 1',
    [institutionId, code, id]
  );
  if (duplicate?.id) throw new Error('ORGANIZATION_UNIT_CODE_CONFLICT');

  const updatedAt = new Date().toISOString();
  await run(
    db,
    `UPDATE OrganizationUnit SET
      legalEntityId = ?, parentId = ?, type = ?, code = ?, name = ?,
      headUserId = ?, headName = ?, headEmail = ?, costCenter = ?, location = ?,
      effectiveFrom = ?, effectiveUntil = ?, status = ?, updatedAt = ?
     WHERE id = ? AND institutionId = ?`,
    [
      resolvedEntityId,
      parentId,
      type,
      code,
      name,
      headUserId,
      headUser?.name || (input.headName === undefined ? existing.headName : optionalText(input.headName)),
      headUser?.email || (input.headEmail === undefined ? existing.headEmail : optionalText(input.headEmail)),
      input.costCenter === undefined ? existing.costCenter : optionalText(input.costCenter),
      input.location === undefined ? existing.location : optionalText(input.location),
      input.effectiveFrom === undefined ? existing.effectiveFrom : optionalText(input.effectiveFrom),
      input.effectiveUntil === undefined ? existing.effectiveUntil : optionalText(input.effectiveUntil),
      input.status === undefined ? existing.status : normalizedStatus(input.status),
      updatedAt,
      id,
      institutionId
    ]
  );

  const updated = await tenantUnit(db, institutionId, id);
  await recordMutationAudit({
    institutionId,
    action: 'UPDATE',
    entityType: 'OrganizationUnit',
    recordId: id,
    oldValue: existing,
    newValue: updated,
    reason: 'Organization unit updated in the enterprise hierarchy.'
  }, actor);
  return updated;
}

export async function createOrganizationPosition(
  institutionId: string,
  input: Record<string, unknown>,
  actor: MutationActor
) {
  const db = await ensureOrganizationSchema();
  const orgUnitId = requiredText(input.orgUnitId, 'ORGANIZATION_POSITION_UNIT_REQUIRED');
  await tenantUnit(db, institutionId, orgUnitId);

  const code = normalizedCode(input.code, 'ORGANIZATION_POSITION_CODE_REQUIRED');
  const title = requiredText(input.title, 'ORGANIZATION_POSITION_TITLE_REQUIRED');
  const assignedUserId = optionalText(input.assignedUserId);
  if (assignedUserId) await tenantUser(db, institutionId, assignedUserId);

  const duplicate = await first<{ id?: string }>(
    db,
    'SELECT id FROM OrganizationPosition WHERE institutionId = ? AND code = ? LIMIT 1',
    [institutionId, code]
  );
  if (duplicate?.id) throw new Error('ORGANIZATION_POSITION_CODE_CONFLICT');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: OrganizationPositionRecord = {
    id,
    institutionId,
    orgUnitId,
    code,
    title,
    positionLevel: optionalText(input.positionLevel),
    assignedUserId,
    status: normalizedStatus(input.status),
    createdAt: now,
    updatedAt: now
  };

  await run(
    db,
    `INSERT INTO OrganizationPosition (
      id, institutionId, orgUnitId, code, title, positionLevel,
      assignedUserId, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id, record.institutionId, record.orgUnitId, record.code, record.title,
      record.positionLevel, record.assignedUserId, record.status, record.createdAt, record.updatedAt
    ]
  );

  await recordMutationAudit({
    institutionId,
    action: 'CREATE',
    entityType: 'OrganizationPosition',
    recordId: id,
    newValue: record,
    reason: 'Organization position registered and optionally assigned to a provisioned user.'
  }, actor);

  return record;
}

export async function updateOrganizationPosition(
  institutionId: string,
  input: Record<string, unknown>,
  actor: MutationActor
) {
  const db = await ensureOrganizationSchema();
  const id = requiredText(input.id, 'ORGANIZATION_POSITION_ID_REQUIRED');
  const existing = await first<OrganizationPositionRecord>(
    db,
    'SELECT * FROM OrganizationPosition WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
  if (!existing) throw new Error('ORGANIZATION_POSITION_NOT_FOUND');

  const orgUnitId = input.orgUnitId === undefined
    ? existing.orgUnitId
    : requiredText(input.orgUnitId, 'ORGANIZATION_POSITION_UNIT_REQUIRED');
  await tenantUnit(db, institutionId, orgUnitId);

  const code = input.code === undefined
    ? existing.code
    : normalizedCode(input.code, 'ORGANIZATION_POSITION_CODE_REQUIRED');
  const title = input.title === undefined
    ? existing.title
    : requiredText(input.title, 'ORGANIZATION_POSITION_TITLE_REQUIRED');
  const assignedUserId = input.assignedUserId === undefined
    ? existing.assignedUserId
    : optionalText(input.assignedUserId);
  if (assignedUserId) await tenantUser(db, institutionId, assignedUserId);

  const duplicate = await first<{ id?: string }>(
    db,
    'SELECT id FROM OrganizationPosition WHERE institutionId = ? AND code = ? AND id <> ? LIMIT 1',
    [institutionId, code, id]
  );
  if (duplicate?.id) throw new Error('ORGANIZATION_POSITION_CODE_CONFLICT');

  const updatedAt = new Date().toISOString();
  await run(
    db,
    `UPDATE OrganizationPosition SET
      orgUnitId = ?, code = ?, title = ?, positionLevel = ?, assignedUserId = ?,
      status = ?, updatedAt = ?
     WHERE id = ? AND institutionId = ?`,
    [
      orgUnitId,
      code,
      title,
      input.positionLevel === undefined ? existing.positionLevel : optionalText(input.positionLevel),
      assignedUserId,
      input.status === undefined ? existing.status : normalizedStatus(input.status),
      updatedAt,
      id,
      institutionId
    ]
  );

  const updated = await first<OrganizationPositionRecord>(
    db,
    'SELECT * FROM OrganizationPosition WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, institutionId]
  );
  if (!updated) throw new Error('ORGANIZATION_POSITION_NOT_FOUND');

  await recordMutationAudit({
    institutionId,
    action: 'UPDATE',
    entityType: 'OrganizationPosition',
    recordId: id,
    oldValue: existing,
    newValue: updated,
    reason: 'Organization position updated in the organization master.'
  }, actor);

  return updated;
}

type ImportUnitInput = {
  unitCode?: unknown;
  unitName?: unknown;
  unitType?: unknown;
  parentUnitCode?: unknown;
  entityCode?: unknown;
  headName?: unknown;
  costCenter?: unknown;
  location?: unknown;
  effectiveFrom?: unknown;
  status?: unknown;
};

export async function importOrganizationUnits(
  institutionId: string,
  rawRows: unknown,
  actor: MutationActor
) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) throw new Error('ORGANIZATION_IMPORT_EMPTY');
  if (rawRows.length > 500) throw new Error('ORGANIZATION_IMPORT_TOO_LARGE');

  const db = await ensureOrganizationSchema();
  await assertInstitutionExists(db, institutionId);

  const [entities, existingUnits] = await Promise.all([
    all<LegalEntityRecord>(db, 'SELECT * FROM LegalEntity WHERE institutionId = ?', [institutionId]),
    all<OrganizationUnitRecord>(db, 'SELECT * FROM OrganizationUnit WHERE institutionId = ?', [institutionId])
  ]);

  const entityByCode = new Map(entities.map(item => [item.code.toUpperCase(), item]));
  const existingByCode = new Map(existingUnits.map(item => [item.code.toUpperCase(), item]));

  const rows = (rawRows as ImportUnitInput[]).map(raw => ({
    code: normalizedCode(raw.unitCode, 'ORGANIZATION_IMPORT_CODE_REQUIRED'),
    name: requiredText(raw.unitName, 'ORGANIZATION_IMPORT_NAME_REQUIRED'),
    type: normalizedUnitType(raw.unitType),
    parentCode: optionalText(raw.parentUnitCode)?.toUpperCase() || null,
    entityCode: optionalText(raw.entityCode)?.toUpperCase() || null,
    headName: optionalText(raw.headName),
    costCenter: optionalText(raw.costCenter),
    location: optionalText(raw.location),
    effectiveFrom: optionalText(raw.effectiveFrom),
    status: normalizedStatus(raw.status)
  }));

  const newCodes = new Set<string>();
  for (const row of rows) {
    if (newCodes.has(row.code)) throw new Error('ORGANIZATION_IMPORT_DUPLICATE_CODE');
    if (existingByCode.has(row.code)) throw new Error('ORGANIZATION_IMPORT_CODE_CONFLICT');
    newCodes.add(row.code);
    if (row.entityCode && !entityByCode.has(row.entityCode)) {
      throw new Error('ORGANIZATION_IMPORT_ENTITY_NOT_FOUND');
    }
  }

  const rowByCode = new Map(rows.map(row => [row.code, row]));
  for (const row of rows) {
    if (row.parentCode && !existingByCode.has(row.parentCode) && !rowByCode.has(row.parentCode)) {
      throw new Error('ORGANIZATION_IMPORT_PARENT_NOT_FOUND');
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (code: string) => {
    if (visiting.has(code)) throw new Error('ORGANIZATION_IMPORT_HIERARCHY_CYCLE');
    if (visited.has(code)) return;
    visiting.add(code);
    const parentCode = rowByCode.get(code)?.parentCode;
    if (parentCode && rowByCode.has(parentCode)) visit(parentCode);
    visiting.delete(code);
    visited.add(code);
  };
  rows.forEach(row => visit(row.code));

  const idByCode = new Map(rows.map(row => [row.code, crypto.randomUUID()]));
  const resolvedEntityByCode = new Map<string, string | null>();
  const resolveEntityId = (code: string): string | null => {
    if (resolvedEntityByCode.has(code)) return resolvedEntityByCode.get(code) || null;

    const row = rowByCode.get(code);
    if (!row) return existingByCode.get(code)?.legalEntityId || null;

    let resolved: string | null = null;
    if (row.entityCode) {
      resolved = entityByCode.get(row.entityCode)?.id || null;
    } else if (row.parentCode) {
      resolved = resolveEntityId(row.parentCode);
    } else if (entities.length === 1) {
      resolved = entities[0].id;
    }

    resolvedEntityByCode.set(code, resolved);
    return resolved;
  };

  for (const row of rows) resolveEntityId(row.code);

  const now = new Date().toISOString();

  const inserts = rows.map(row => {
    const existingParent = row.parentCode ? existingByCode.get(row.parentCode) || null : null;
    const parentId = row.parentCode
      ? existingParent?.id || idByCode.get(row.parentCode) || null
      : null;
    const explicitEntity = row.entityCode ? entityByCode.get(row.entityCode) || null : null;
    const parentEntityId = row.parentCode
      ? (existingParent?.legalEntityId || resolvedEntityByCode.get(row.parentCode) || null)
      : null;
    const legalEntityId = resolvedEntityByCode.get(row.code) || null;

    if (explicitEntity && parentEntityId && explicitEntity.id !== parentEntityId) {
      throw new Error('ORGANIZATION_IMPORT_ENTITY_MISMATCH');
    }

    return {
      id: idByCode.get(row.code) as string,
      institutionId,
      legalEntityId,
      parentId,
      type: row.type,
      code: row.code,
      name: row.name,
      headName: row.headName,
      costCenter: row.costCenter,
      location: row.location,
      effectiveFrom: row.effectiveFrom,
      status: row.status
    };
  });

  const statements = inserts.map(item =>
    db.prepare(
      `INSERT INTO OrganizationUnit (
        id, institutionId, legalEntityId, parentId, type, code, name,
        headUserId, headName, headEmail, costCenter, location, effectiveFrom,
        effectiveUntil, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)`
    ).bind(
      item.id,
      item.institutionId,
      item.legalEntityId,
      item.parentId,
      item.type,
      item.code,
      item.name,
      item.headName,
      item.costCenter,
      item.location,
      item.effectiveFrom,
      item.status,
      now,
      now
    )
  );

  if (db.batch) {
    await db.batch(statements);
  } else {
    for (const statement of statements) await statement.run();
  }

  await recordMutationAudit({
    institutionId,
    action: 'IMPORT',
    entityType: 'OrganizationUnit',
    recordId: `IMPORT-${now}`,
    newValue: {
      importedCount: inserts.length,
      unitCodes: inserts.map(item => item.code)
    },
    reason: 'Organization units imported from an administrator-supplied CSV structure.'
  }, actor);

  return {
    importedCount: inserts.length,
    unitCodes: inserts.map(item => item.code)
  };
}
