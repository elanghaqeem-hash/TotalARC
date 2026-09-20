import {
  TENANT_DATABASE_BINDINGS,
  getControlPlaneDb,
  getDatabaseBinding,
  type D1DatabaseLike
} from '@/lib/cloudflare-db';
import { ensureAuthSchema } from '@/lib/d1-auth';
import type { SessionPayload } from '@/lib/auth-token';

export type TenantInstitutionInput = {
  name: string;
  legalName: string;
  shortName: string;
  institutionType: string;
  country?: string;
  provinceState?: string | null;
  city?: string | null;
  registeredAddress?: string | null;
  operationalAddress?: string | null;
  website?: string | null;
  generalEmail?: string | null;
  telephone?: string | null;
  registrationNumber?: string | null;
  taxId?: string | null;
  parentCompany?: string | null;
  holdingCompany?: string | null;
  stockExchange?: string | null;
  ticker?: string | null;
  employeeCount?: string | null;
  revenueRange?: string | null;
  businessModel?: string | null;
  operatingModel?: string | null;
};

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function nowIso() {
  return new Date().toISOString();
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

async function ensureInstitutionSchema(db: D1DatabaseLike) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS Institution (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      legalName TEXT NOT NULL,
      shortName TEXT NOT NULL,
      institutionType TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'Indonesia',
      provinceState TEXT,
      city TEXT,
      registeredAddress TEXT,
      operationalAddress TEXT,
      website TEXT,
      generalEmail TEXT,
      telephone TEXT,
      yearEstablished INTEGER,
      registrationNumber TEXT,
      taxId TEXT,
      parentCompany TEXT,
      holdingCompany TEXT,
      stockExchange TEXT,
      ticker TEXT,
      logo TEXT,
      employeeCount TEXT,
      revenueRange TEXT,
      businessModel TEXT,
      operatingModel TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_legal_name ON Institution(legalName);
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
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'institution';
}

async function insertInstitution(db: D1DatabaseLike, id: string, input: TenantInstitutionInput) {
  const now = nowIso();
  await ensureInstitutionSchema(db);
  await run(
    db,
    `INSERT INTO Institution (
      id,name,legalName,shortName,institutionType,country,provinceState,city,
      registeredAddress,operationalAddress,website,generalEmail,telephone,
      yearEstablished,registrationNumber,taxId,parentCompany,holdingCompany,
      stockExchange,ticker,logo,employeeCount,revenueRange,businessModel,
      operatingModel,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,NULL,?,?,?,?,?,?)`,
    [
      id,
      input.name.trim(),
      input.legalName.trim(),
      input.shortName.trim(),
      input.institutionType.trim(),
      input.country?.trim() || 'Indonesia',
      clean(input.provinceState),
      clean(input.city),
      clean(input.registeredAddress),
      clean(input.operationalAddress),
      clean(input.website),
      clean(input.generalEmail),
      clean(input.telephone),
      clean(input.registrationNumber),
      clean(input.taxId),
      clean(input.parentCompany),
      clean(input.holdingCompany),
      clean(input.stockExchange),
      clean(input.ticker),
      clean(input.employeeCount),
      clean(input.revenueRange),
      clean(input.businessModel),
      clean(input.operatingModel),
      now,
      now
    ]
  );
}

export async function provisionInstitution(
  input: TenantInstitutionInput,
  actor: SessionPayload
) {
  if (!actor.permissions.includes('tenant.manage') || !actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
    throw new Error('ACCESS_DENIED');
  }

  const name = input.name.trim();
  const legalName = input.legalName.trim();
  const shortName = input.shortName.trim();
  const institutionType = input.institutionType.trim();
  if (!name || !legalName || !shortName || !institutionType) {
    throw new Error('INSTITUTION_REQUIRED_FIELDS');
  }

  const controlDb = await ensureAuthSchema();
  const duplicate = await first(
    controlDb,
    'SELECT id FROM Institution WHERE lower(legalName)=lower(?) LIMIT 1',
    [legalName]
  );
  if (duplicate) throw new Error('INSTITUTION_CONFLICT');

  const used = await all<{ databaseBinding?: string }>(
    controlDb,
    'SELECT databaseBinding FROM TenantRegistry'
  );
  const usedBindings = new Set(used.map(item => String(item.databaseBinding || '')));
  const binding = TENANT_DATABASE_BINDINGS
    .filter(item => item !== 'DB')
    .find(item => !usedBindings.has(item));
  if (!binding) throw new Error('NO_TENANT_DATABASE_SLOT');

  const tenantDb = await getDatabaseBinding(binding);
  const existingTenantData = await first<{ count?: number }>(
    tenantDb,
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='Institution'"
  ).catch(() => null);
  if (Number(existingTenantData?.count || 0) > 0) {
    await ensureInstitutionSchema(tenantDb);
    const existingInstitution = await first<{ count?: number }>(
      tenantDb,
      'SELECT COUNT(*) AS count FROM Institution'
    );
    if (Number(existingInstitution?.count || 0) > 0) throw new Error('TENANT_DATABASE_SLOT_NOT_EMPTY');
  }

  const id = crypto.randomUUID();
  const slugBase = slugify(shortName || name);
  let slug = slugBase;
  let counter = 1;
  while (await first(controlDb, 'SELECT institutionId FROM TenantRegistry WHERE slug=? LIMIT 1', [slug])) {
    counter += 1;
    slug = slugBase + '-' + counter;
  }
  const folderKey = 'institutions/' + id + '/';
  const now = nowIso();

  await insertInstitution(controlDb, id, input);
  await insertInstitution(tenantDb, id, input);

  await run(
    controlDb,
    `INSERT INTO TenantRegistry (
      institutionId,slug,databaseBinding,folderKey,isolationMode,status,createdAt,updatedAt
    ) VALUES (?,?,?,?, 'DEDICATED_D1', 'Active', ?, ?)`,
    [id, slug, binding, folderKey, now, now]
  );

  await run(
    controlDb,
    `INSERT INTO AuditLog (
      id,institutionId,userName,userRole,action,entityType,recordId,
      oldValue,newValue,reason,ipAddress,timestamp
    ) VALUES (?,?,?,?, 'CREATE','TenantRegistry',?,NULL,?,?,NULL,?)`,
    [
      crypto.randomUUID(),
      id,
      actor.username,
      actor.roles.join(','),
      id,
      JSON.stringify({ binding, folderKey, isolationMode: 'DEDICATED_D1' }),
      'Dedicated tenant database and institution folder namespace provisioned by platform administrator.',
      now
    ]
  );

  return {
    id,
    name,
    legalName,
    shortName,
    institutionType,
    slug,
    databaseBinding: binding,
    folderKey,
    isolationMode: 'DEDICATED_D1',
    status: 'Active'
  };
}

export async function updateTenantStatus(
  institutionId: string,
  status: 'Active' | 'Suspended',
  actor: SessionPayload
) {
  if (!actor.permissions.includes('tenant.manage') || !actor.roles.includes('PLATFORM_SUPER_ADMIN')) {
    throw new Error('ACCESS_DENIED');
  }
  const db = await ensureAuthSchema();
  const tenant = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM TenantRegistry WHERE institutionId=? LIMIT 1',
    [institutionId]
  );
  if (!tenant) throw new Error('TENANT_NOT_FOUND');
  if (String(tenant.databaseBinding) === 'DB' && status === 'Suspended') {
    throw new Error('PRIMARY_TENANT_CANNOT_BE_SUSPENDED');
  }
  await run(
    db,
    'UPDATE TenantRegistry SET status=?,updatedAt=? WHERE institutionId=?',
    [status, nowIso(), institutionId]
  );
  return { success: true };
}

export async function listTenantDatabaseSlots() {
  const db = await ensureAuthSchema();
  const used = await all<Record<string, unknown>>(db, 'SELECT institutionId,databaseBinding FROM TenantRegistry');
  const usedMap = new Map(used.map(item => [String(item.databaseBinding), String(item.institutionId)]));
  return TENANT_DATABASE_BINDINGS.map(binding => ({
    binding,
    assignedInstitutionId: usedMap.get(binding) || null,
    available: !usedMap.has(binding)
  }));
}
