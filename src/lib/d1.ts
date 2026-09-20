import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureAuthSchema } from '@/lib/d1-auth';

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

export type InstitutionInput = {
  name: string;
  legalName: string;
  shortName: string;
  institutionType: string;
  country: string;
  provinceState?: string | null;
  city?: string | null;
  registeredAddress?: string | null;
  operationalAddress?: string | null;
  website?: string | null;
  generalEmail?: string | null;
  telephone?: string | null;
  yearEstablished?: number | null;
  registrationNumber?: string | null;
  taxId?: string | null;
  parentCompany?: string | null;
  holdingCompany?: string | null;
  stockExchange?: string | null;
  ticker?: string | null;
  logo?: string | null;
  employeeCount?: string | null;
  revenueRange?: string | null;
  businessModel?: string | null;
  operatingModel?: string | null;
};

export type InstitutionRecord = InstitutionInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

async function getD1(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) {
    throw new Error('Cloudflare D1 binding "DB" is not available.');
  }
  return db;
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  await db.exec(script);
}

let institutionSchemaReady: Promise<void> | null = null;

async function ensureSchema(db: D1DatabaseLike) {
  if (institutionSchemaReady) return institutionSchemaReady;

  institutionSchemaReady = executeSchemaScript(db, `
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
    CREATE INDEX IF NOT EXISTS idx_audit_institution ON AuditLog(institutionId);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON AuditLog(timestamp);
  `).catch(error => {
    institutionSchemaReady = null;
    throw error;
  });

  return institutionSchemaReady;
}

function nullable(value: unknown) {
  return value === undefined || value === '' ? null : value;
}

async function insertAudit(
  db: D1DatabaseLike,
  institutionId: string,
  action: string,
  oldValue: unknown,
  newValue: unknown,
  reason: string
) {
  await db.prepare(`
    INSERT INTO AuditLog (
      id, institutionId, userName, userRole, action, entityType, recordId,
      oldValue, newValue, reason, ipAddress, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    institutionId,
    'System',
    'System',
    action,
    'Institution',
    institutionId,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null,
    reason,
    null,
    new Date().toISOString()
  ).run();
}

export async function getInstitutionByLegalName(legalName: string): Promise<InstitutionRecord | null> {
  const db = await getD1();
  await ensureSchema(db);
  return db.prepare('SELECT * FROM Institution WHERE legalName = ? LIMIT 1')
    .bind(legalName)
    .first<InstitutionRecord>();
}

export async function getPrimaryInstitution(): Promise<InstitutionRecord | null> {
  const db = await getD1();
  await ensureSchema(db);
  return db.prepare('SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1')
    .first<InstitutionRecord>();
}

export async function upsertInstitution(
  input: InstitutionInput,
  reason = 'Institution saved through Total ARC.'
): Promise<InstitutionRecord> {
  const db = await getD1();
  await ensureSchema(db);

  const existing = await db.prepare('SELECT * FROM Institution WHERE legalName = ? LIMIT 1')
    .bind(input.legalName)
    .first<InstitutionRecord>();

  const now = new Date().toISOString();

  if (existing) {
    await db.prepare(`
      UPDATE Institution SET
        name = ?, shortName = ?, institutionType = ?, country = ?,
        provinceState = ?, city = ?, registeredAddress = ?, operationalAddress = ?,
        website = ?, generalEmail = ?, telephone = ?, yearEstablished = ?,
        registrationNumber = ?, taxId = ?, parentCompany = ?, holdingCompany = ?,
        stockExchange = ?, ticker = ?, logo = ?, employeeCount = ?, revenueRange = ?,
        businessModel = ?, operatingModel = ?, updatedAt = ?
      WHERE id = ?
    `).bind(
      input.name,
      input.shortName,
      input.institutionType,
      input.country,
      nullable(input.provinceState),
      nullable(input.city),
      nullable(input.registeredAddress),
      nullable(input.operationalAddress),
      nullable(input.website),
      nullable(input.generalEmail),
      nullable(input.telephone),
      nullable(input.yearEstablished),
      nullable(input.registrationNumber),
      nullable(input.taxId),
      nullable(input.parentCompany),
      nullable(input.holdingCompany),
      nullable(input.stockExchange),
      nullable(input.ticker),
      nullable(input.logo),
      nullable(input.employeeCount),
      nullable(input.revenueRange),
      nullable(input.businessModel),
      nullable(input.operatingModel),
      now,
      existing.id
    ).run();

    const updated = await db.prepare('SELECT * FROM Institution WHERE id = ?')
      .bind(existing.id)
      .first<InstitutionRecord>();

    if (!updated) throw new Error('Institution update could not be verified.');

    const before = JSON.stringify(existing);
    const after = JSON.stringify(updated);
    if (before !== after) {
      await insertAudit(db, existing.id, 'UPDATE', existing, updated, reason);
    }
    return updated;
  }

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO Institution (
      id, name, legalName, shortName, institutionType, country,
      provinceState, city, registeredAddress, operationalAddress, website,
      generalEmail, telephone, yearEstablished, registrationNumber, taxId,
      parentCompany, holdingCompany, stockExchange, ticker, logo, employeeCount,
      revenueRange, businessModel, operatingModel, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.name,
    input.legalName,
    input.shortName,
    input.institutionType,
    input.country,
    nullable(input.provinceState),
    nullable(input.city),
    nullable(input.registeredAddress),
    nullable(input.operationalAddress),
    nullable(input.website),
    nullable(input.generalEmail),
    nullable(input.telephone),
    nullable(input.yearEstablished),
    nullable(input.registrationNumber),
    nullable(input.taxId),
    nullable(input.parentCompany),
    nullable(input.holdingCompany),
    nullable(input.stockExchange),
    nullable(input.ticker),
    nullable(input.logo),
    nullable(input.employeeCount),
    nullable(input.revenueRange),
    nullable(input.businessModel),
    nullable(input.operatingModel),
    now,
    now
  ).run();

  const created = await db.prepare('SELECT * FROM Institution WHERE id = ?')
    .bind(id)
    .first<InstitutionRecord>();

  if (!created) throw new Error('Institution insert could not be verified.');
  await insertAudit(db, id, 'CREATE', null, created, reason);
  return created;
}

export async function getD1Health() {
  await ensureAuthSchema();
  const db = await getD1();

  const query = await db.prepare('SELECT 1 AS ok').first<{ ok?: number }>();
  if (Number(query?.ok) !== 1) {
    throw new Error('Cloudflare D1 connectivity probe did not return the expected result.');
  }

  const schema = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all<{ name?: string }>();

  const tableNames = (schema.results || [])
    .map(row => String(row.name || ''))
    .filter(Boolean);

  const requiredTables = [
    'Institution',
    'AuditLog',
    'LegalEntity',
    'OrganizationUnit',
    'ProcessCategory',
    'BusinessProcess',
    'ProcessObjective',
    'SIPOC',
    'ProcessActivity',
    'RiskMaster',
    'ControlMaster',
    'ControlRiskMapping',
    'ToETest',
    'TestSample',
    'TestingException',
    'ControlDeficiency',
    'RootCauseAnalysis',
    'Issue',
    'ManagementActionPlan',
    'MAPMilestone',
    'RetestRecord',
    'MonitoringRule',
    'MonitoringRun',
    'CCMException',
    'AuthUser',
    'AuthUserUnitAccess',
    'AuthSession',
    'AuthPasswordHistory',
    'AuthSecurityEvent'
  ];
  const existing = new Set(tableNames);
  const missingRequiredTables = requiredTables.filter(name => !existing.has(name));

  return {
    binding: 'DB',
    queryOk: true,
    tableCount: tableNames.length,
    requiredTableCount: requiredTables.length,
    requiredTablesReady: missingRequiredTables.length === 0,
    missingRequiredTables
  };
}

export async function getRecentInstitutionAuditLogs(limit = 8) {
  const db = await getD1();
  await ensureSchema(db);
  const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)));
  const result = await db.prepare(
    `SELECT * FROM AuditLog WHERE entityType = 'Institution' ORDER BY timestamp DESC LIMIT ${safeLimit}`
  ).all<Record<string, unknown>>();
  return result.results || [];
}
