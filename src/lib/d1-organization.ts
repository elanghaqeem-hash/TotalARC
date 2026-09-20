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

export type LegalEntityInput = {
  code: string;
  name: string;
  country?: string;
  taxId?: string | null;
};

export type OrganizationUnitInput = {
  code: string;
  name: string;
  type: string;
  legalEntityId?: string | null;
  parentId?: string | null;
  headName?: string | null;
  headEmail?: string | null;
};

async function getDb(): Promise<D1DatabaseLike> {
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

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next ? next : null;
}

async function ensureOrganizationSchema() {
  const db = await getDb();

  await executeSchemaScript(db, `
    CREATE TABLE IF NOT EXISTS LegalEntity (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Indonesia',
      taxId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_entity_institution_code
      ON LegalEntity(institutionId, code);
    CREATE INDEX IF NOT EXISTS idx_legal_entity_institution
      ON LegalEntity(institutionId);

    CREATE TABLE IF NOT EXISTS OrganizationUnit (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      legalEntityId TEXT,
      parentId TEXT,
      type TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      headName TEXT,
      headEmail TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_unit_institution_code
      ON OrganizationUnit(institutionId, code);
    CREATE INDEX IF NOT EXISTS idx_org_unit_institution
      ON OrganizationUnit(institutionId);
    CREATE INDEX IF NOT EXISTS idx_org_unit_parent
      ON OrganizationUnit(parentId);
    CREATE INDEX IF NOT EXISTS idx_org_unit_legal_entity
      ON OrganizationUnit(legalEntityId);

    CREATE TABLE IF NOT EXISTS AuditLog (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT,
      userName TEXT NOT NULL,
      userRole TEXT NOT NULL,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      recordId TEXT NOT NULL,
      oldValue TEXT,
      newValue TEXT,
      reason TEXT,
      ipAddress TEXT,
      timestamp TEXT NOT NULL
    );
  `);

  return db;
}

async function primaryInstitution(db: D1DatabaseLike) {
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1'
  );
}

async function writeAudit(
  db: D1DatabaseLike,
  institutionId: string,
  entityType: string,
  recordId: string,
  newValue: unknown,
  reason: string
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
      'System',
      'System',
      'CREATE',
      entityType,
      recordId,
      null,
      JSON.stringify(newValue),
      reason,
      null,
      nowIso()
    ]
  );
}

export async function getOrganizationStructure() {
  const db = await ensureOrganizationSchema();
  const institution = await primaryInstitution(db);

  if (!institution) {
    return {
      institution: null,
      legalEntities: [],
      organizationUnits: [],
      users: []
    };
  }

  const [legalEntities, organizationUnits] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM LegalEntity WHERE institutionId = ? ORDER BY code ASC, name ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM OrganizationUnit WHERE institutionId = ? ORDER BY createdAt ASC, code ASC',
      [institution.id]
    )
  ]);

  return {
    institution,
    legalEntities,
    organizationUnits,
    users: []
  };
}

export async function createLegalEntity(input: LegalEntityInput) {
  const db = await ensureOrganizationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) throw new Error('LEGAL_ENTITY_REQUIRED_FIELDS');

  const duplicate = await first(
    db,
    'SELECT id FROM LegalEntity WHERE institutionId = ? AND code = ? LIMIT 1',
    [institution.id, code]
  );
  if (duplicate) throw new Error('LEGAL_ENTITY_CODE_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO LegalEntity (
      id, institutionId, code, name, country, taxId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      institution.id,
      code,
      name,
      input.country?.trim() || 'Indonesia',
      clean(input.taxId),
      now,
      now
    ]
  );

  const created = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM LegalEntity WHERE id = ? LIMIT 1',
    [id]
  );
  if (!created) throw new Error('LEGAL_ENTITY_CREATE_FAILED');

  await writeAudit(
    db,
    String(institution.id),
    'LegalEntity',
    id,
    created,
    'Legal entity created through Organization Builder.'
  );

  return created;
}

export async function createOrganizationUnit(input: OrganizationUnitInput) {
  const db = await ensureOrganizationSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  const type = input.type.trim();
  if (!code || !name || !type) throw new Error('ORG_UNIT_REQUIRED_FIELDS');

  const duplicate = await first(
    db,
    'SELECT id FROM OrganizationUnit WHERE institutionId = ? AND code = ? LIMIT 1',
    [institution.id, code]
  );
  if (duplicate) throw new Error('ORG_UNIT_CODE_CONFLICT');

  const legalEntityId = clean(input.legalEntityId);
  if (legalEntityId) {
    const legalEntity = await first(
      db,
      'SELECT id FROM LegalEntity WHERE id = ? AND institutionId = ? LIMIT 1',
      [legalEntityId, institution.id]
    );
    if (!legalEntity) throw new Error('LEGAL_ENTITY_NOT_FOUND');
  }

  const parentId = clean(input.parentId);
  if (parentId) {
    const parent = await first(
      db,
      'SELECT id FROM OrganizationUnit WHERE id = ? AND institutionId = ? LIMIT 1',
      [parentId, institution.id]
    );
    if (!parent) throw new Error('PARENT_UNIT_NOT_FOUND');
  }

  const id = crypto.randomUUID();
  const now = nowIso();
  await run(
    db,
    `INSERT INTO OrganizationUnit (
      id, institutionId, legalEntityId, parentId, type, code, name,
      headName, headEmail, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)`,
    [
      id,
      institution.id,
      legalEntityId,
      parentId,
      type,
      code,
      name,
      clean(input.headName),
      clean(input.headEmail),
      now,
      now
    ]
  );

  const created = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM OrganizationUnit WHERE id = ? LIMIT 1',
    [id]
  );
  if (!created) throw new Error('ORG_UNIT_CREATE_FAILED');

  await writeAudit(
    db,
    String(institution.id),
    'OrganizationUnit',
    id,
    created,
    'Organization unit created through Organization Builder.'
  );

  return created;
}
