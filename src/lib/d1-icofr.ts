import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { getOrganizationStructure } from '@/lib/d1-organization';
import { assertIcofrPeriodWritable } from '@/lib/d1-icofr-period-lock';

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

export type IcofrScopeItemInput = {
  itemType: 'Legal Entity' | 'Organization Unit' | 'Business Process' | 'Financial Account' | 'Disclosure' | 'IT System' | 'Other';
  sourceId?: string | null;
  code?: string | null;
  name: string;
  amount?: number | null;
  rationale?: string | null;
};

export type IcofrScopeInput = {
  id?: string;
  scopeName: string;
  fiscalYear: number;
  reportingPeriod: string;
  currency: string;
  consolidationBasis: string;
  accountingFramework?: string | null;
  benchmarkType: string;
  benchmarkAmount: number;
  overallMaterialityPercent: number;
  overallMaterialityAmount: number;
  performanceMaterialityPercent: number;
  performanceMaterialityAmount: number;
  clearlyTrivialPercent?: number | null;
  clearlyTrivialAmount?: number | null;
  componentMaterialityAmount?: number | null;
  scopeApproach: string;
  quantitativeCriteria?: string | null;
  qualitativeCriteria?: string | null;
  exclusions?: string | null;
  status: string;
  preparedBy: string;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  notes?: string | null;
  items: IcofrScopeItemInput[];
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
  const trimmed = value.trim();
  return trimmed || null;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

let icofrSchemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureIcofrScopeSchema() {
  if (icofrSchemaReady) return icofrSchemaReady;

  icofrSchemaReady = (async () => {
    await ensureCoreDomainSchema();
    await getOrganizationStructure();
    const db = await getDb();

    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS ICOFRScope (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        scopeName TEXT NOT NULL,
        fiscalYear INTEGER NOT NULL,
        reportingPeriod TEXT NOT NULL,
        currency TEXT NOT NULL,
        consolidationBasis TEXT NOT NULL,
        accountingFramework TEXT,
        benchmarkType TEXT NOT NULL,
        benchmarkAmount REAL NOT NULL,
        overallMaterialityPercent REAL NOT NULL,
        overallMaterialityAmount REAL NOT NULL,
        performanceMaterialityPercent REAL NOT NULL,
        performanceMaterialityAmount REAL NOT NULL,
        clearlyTrivialPercent REAL,
        clearlyTrivialAmount REAL,
        componentMaterialityAmount REAL,
        scopeApproach TEXT NOT NULL,
        quantitativeCriteria TEXT,
        qualitativeCriteria TEXT,
        exclusions TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        preparedBy TEXT NOT NULL,
        reviewedBy TEXT,
        approvedBy TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_icofr_scope_institution
        ON ICOFRScope(institutionId);
      CREATE INDEX IF NOT EXISTS idx_icofr_scope_year_period
        ON ICOFRScope(fiscalYear, reportingPeriod);

      CREATE TABLE IF NOT EXISTS ICOFRScopeItem (
        id TEXT PRIMARY KEY NOT NULL,
        scopeId TEXT NOT NULL,
        itemType TEXT NOT NULL,
        sourceId TEXT,
        code TEXT,
        name TEXT NOT NULL,
        inScope INTEGER NOT NULL DEFAULT 1,
        amount REAL,
        rationale TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_scope
        ON ICOFRScopeItem(scopeId);
      CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_source
        ON ICOFRScopeItem(sourceId);
    `);

    return db;
  })().catch(error => {
    icofrSchemaReady = null;
    throw error;
  });

  return icofrSchemaReady;
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
  action: string,
  recordId: string,
  oldValue: unknown,
  newValue: unknown
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
      action,
      'ICOFRScope',
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      'ICOFR scoping and materiality configuration saved.',
      null,
      nowIso()
    ]
  );
}

function scopeRow(row: Record<string, unknown>) {
  return {
    ...row,
    fiscalYear: Number(row.fiscalYear || 0),
    benchmarkAmount: Number(row.benchmarkAmount || 0),
    overallMaterialityPercent: Number(row.overallMaterialityPercent || 0),
    overallMaterialityAmount: Number(row.overallMaterialityAmount || 0),
    performanceMaterialityPercent: Number(row.performanceMaterialityPercent || 0),
    performanceMaterialityAmount: Number(row.performanceMaterialityAmount || 0),
    clearlyTrivialPercent: numeric(row.clearlyTrivialPercent),
    clearlyTrivialAmount: numeric(row.clearlyTrivialAmount),
    componentMaterialityAmount: numeric(row.componentMaterialityAmount)
  };
}

function itemRow(row: Record<string, unknown>) {
  return {
    ...row,
    inScope: bool(row.inScope),
    amount: numeric(row.amount)
  };
}

export async function getIcofrScopingData() {
  const db = await ensureIcofrScopeSchema();
  const institution = await primaryInstitution(db);

  if (!institution) {
    return {
      institution: null,
      scopes: [],
      candidates: {
        legalEntities: [],
        organizationUnits: [],
        businessProcesses: []
      }
    };
  }

  const [scopeRows, itemRows, legalEntities, organizationUnits, businessProcesses] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      'SELECT * FROM ICOFRScope WHERE institutionId = ? ORDER BY fiscalYear DESC, updatedAt DESC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT i.*
         FROM ICOFRScopeItem i
         JOIN ICOFRScope s ON s.id = i.scopeId
        WHERE s.institutionId = ?
        ORDER BY i.itemType ASC, i.code ASC, i.name ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT id, code, name, country FROM LegalEntity WHERE institutionId = ? ORDER BY code ASC, name ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT id, code, name, type, legalEntityId, parentId FROM OrganizationUnit WHERE institutionId = ? ORDER BY code ASC, name ASC',
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      'SELECT id, processId, name, level, criticality, classification, isIcofrRelevant FROM BusinessProcess WHERE institutionId = ? ORDER BY processId ASC',
      [institution.id]
    )
  ]);

  const itemsByScope = new Map<string, Record<string, unknown>[]>();
  for (const rawItem of itemRows) {
    const item = itemRow(rawItem);
    const scopeId = String(rawItem.scopeId);
    const list = itemsByScope.get(scopeId) || [];
    list.push(item);
    itemsByScope.set(scopeId, list);
  }

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName,
      shortName: institution.shortName
    },
    scopes: scopeRows.map(row => ({
      ...scopeRow(row),
      items: itemsByScope.get(String(row.id)) || []
    })),
    candidates: {
      legalEntities,
      organizationUnits,
      businessProcesses: businessProcesses.map(row => ({
        ...row,
        level: Number(row.level || 0),
        isIcofrRelevant: bool(row.isIcofrRelevant)
      }))
    }
  };
}

export async function saveIcofrScope(input: IcofrScopeInput) {
  const db = await ensureIcofrScopeSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const scopeName = input.scopeName.trim();
  const reportingPeriod = input.reportingPeriod.trim();
  const currency = input.currency.trim().toUpperCase();
  const consolidationBasis = input.consolidationBasis.trim();
  const benchmarkType = input.benchmarkType.trim();
  const scopeApproach = input.scopeApproach.trim();
  const status = input.status.trim();
  const preparedBy = input.preparedBy.trim();

  if (
    !scopeName ||
    !reportingPeriod ||
    !currency ||
    !consolidationBasis ||
    !benchmarkType ||
    !scopeApproach ||
    !status ||
    !preparedBy
  ) {
    throw new Error('REQUIRED_FIELDS');
  }

  if (
    !Number.isInteger(input.fiscalYear) ||
    input.fiscalYear < 2000 ||
    input.fiscalYear > 2200 ||
    !Number.isFinite(input.benchmarkAmount) ||
    input.benchmarkAmount < 0 ||
    !Number.isFinite(input.overallMaterialityPercent) ||
    input.overallMaterialityPercent < 0 ||
    !Number.isFinite(input.overallMaterialityAmount) ||
    input.overallMaterialityAmount < 0 ||
    !Number.isFinite(input.performanceMaterialityPercent) ||
    input.performanceMaterialityPercent < 0 ||
    !Number.isFinite(input.performanceMaterialityAmount) ||
    input.performanceMaterialityAmount < 0
  ) {
    throw new Error('INVALID_NUMERIC_VALUES');
  }

  if (input.performanceMaterialityAmount > input.overallMaterialityAmount) {
    throw new Error('PM_ABOVE_OM');
  }

  if (
    input.clearlyTrivialAmount !== null &&
    input.clearlyTrivialAmount !== undefined &&
    input.clearlyTrivialAmount > input.overallMaterialityAmount
  ) {
    throw new Error('TRIVIAL_ABOVE_OM');
  }

  const id = input.id?.trim() || crypto.randomUUID();
  const now = nowIso();
  const existing = input.id
    ? await first<Record<string, unknown>>(
        db,
        'SELECT * FROM ICOFRScope WHERE id = ? AND institutionId = ? LIMIT 1',
        [id, institution.id]
      )
    : null;

  if (input.id && !existing) throw new Error('SCOPE_NOT_FOUND');

  if (existing) {
    await assertIcofrPeriodWritable({
      institutionId: String(institution.id),
      scopeId: id
    });
  }

  const record = {
    id,
    institutionId: String(institution.id),
    scopeName,
    fiscalYear: input.fiscalYear,
    reportingPeriod,
    currency,
    consolidationBasis,
    accountingFramework: clean(input.accountingFramework),
    benchmarkType,
    benchmarkAmount: input.benchmarkAmount,
    overallMaterialityPercent: input.overallMaterialityPercent,
    overallMaterialityAmount: input.overallMaterialityAmount,
    performanceMaterialityPercent: input.performanceMaterialityPercent,
    performanceMaterialityAmount: input.performanceMaterialityAmount,
    clearlyTrivialPercent: input.clearlyTrivialPercent ?? null,
    clearlyTrivialAmount: input.clearlyTrivialAmount ?? null,
    componentMaterialityAmount: input.componentMaterialityAmount ?? null,
    scopeApproach,
    quantitativeCriteria: clean(input.quantitativeCriteria),
    qualitativeCriteria: clean(input.qualitativeCriteria),
    exclusions: clean(input.exclusions),
    status,
    preparedBy,
    reviewedBy: clean(input.reviewedBy),
    approvedBy: clean(input.approvedBy),
    notes: clean(input.notes),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    await run(
      db,
      `UPDATE ICOFRScope SET
        scopeName = ?, fiscalYear = ?, reportingPeriod = ?, currency = ?,
        consolidationBasis = ?, accountingFramework = ?, benchmarkType = ?,
        benchmarkAmount = ?, overallMaterialityPercent = ?, overallMaterialityAmount = ?,
        performanceMaterialityPercent = ?, performanceMaterialityAmount = ?,
        clearlyTrivialPercent = ?, clearlyTrivialAmount = ?, componentMaterialityAmount = ?,
        scopeApproach = ?, quantitativeCriteria = ?, qualitativeCriteria = ?, exclusions = ?,
        status = ?, preparedBy = ?, reviewedBy = ?, approvedBy = ?, notes = ?, updatedAt = ?
       WHERE id = ? AND institutionId = ?`,
      [
        record.scopeName,
        record.fiscalYear,
        record.reportingPeriod,
        record.currency,
        record.consolidationBasis,
        record.accountingFramework,
        record.benchmarkType,
        record.benchmarkAmount,
        record.overallMaterialityPercent,
        record.overallMaterialityAmount,
        record.performanceMaterialityPercent,
        record.performanceMaterialityAmount,
        record.clearlyTrivialPercent,
        record.clearlyTrivialAmount,
        record.componentMaterialityAmount,
        record.scopeApproach,
        record.quantitativeCriteria,
        record.qualitativeCriteria,
        record.exclusions,
        record.status,
        record.preparedBy,
        record.reviewedBy,
        record.approvedBy,
        record.notes,
        now,
        id,
        institution.id
      ]
    );

    await run(db, 'DELETE FROM ICOFRScopeItem WHERE scopeId = ?', [id]);
  } else {
    await run(
      db,
      `INSERT INTO ICOFRScope (
        id, institutionId, scopeName, fiscalYear, reportingPeriod, currency,
        consolidationBasis, accountingFramework, benchmarkType, benchmarkAmount,
        overallMaterialityPercent, overallMaterialityAmount,
        performanceMaterialityPercent, performanceMaterialityAmount,
        clearlyTrivialPercent, clearlyTrivialAmount, componentMaterialityAmount,
        scopeApproach, quantitativeCriteria, qualitativeCriteria, exclusions,
        status, preparedBy, reviewedBy, approvedBy, notes, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.institutionId,
        record.scopeName,
        record.fiscalYear,
        record.reportingPeriod,
        record.currency,
        record.consolidationBasis,
        record.accountingFramework,
        record.benchmarkType,
        record.benchmarkAmount,
        record.overallMaterialityPercent,
        record.overallMaterialityAmount,
        record.performanceMaterialityPercent,
        record.performanceMaterialityAmount,
        record.clearlyTrivialPercent,
        record.clearlyTrivialAmount,
        record.componentMaterialityAmount,
        record.scopeApproach,
        record.quantitativeCriteria,
        record.qualitativeCriteria,
        record.exclusions,
        record.status,
        record.preparedBy,
        record.reviewedBy,
        record.approvedBy,
        record.notes,
        record.createdAt,
        record.updatedAt
      ]
    );
  }

  const items: Record<string, unknown>[] = [];
  for (const rawItem of input.items || []) {
    const name = rawItem.name.trim();
    if (!name) continue;

    const item = {
      id: crypto.randomUUID(),
      scopeId: id,
      itemType: rawItem.itemType,
      sourceId: clean(rawItem.sourceId),
      code: clean(rawItem.code),
      name,
      inScope: true,
      amount: rawItem.amount ?? null,
      rationale: clean(rawItem.rationale),
      createdAt: now,
      updatedAt: now
    };

    await run(
      db,
      `INSERT INTO ICOFRScopeItem (
        id, scopeId, itemType, sourceId, code, name, inScope, amount, rationale, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        item.id,
        item.scopeId,
        item.itemType,
        item.sourceId,
        item.code,
        item.name,
        item.amount,
        item.rationale,
        item.createdAt,
        item.updatedAt
      ]
    );

    items.push(item);
  }

  await writeAudit(
    db,
    String(institution.id),
    existing ? 'UPDATE' : 'CREATE',
    id,
    existing || undefined,
    { ...record, items }
  );

  return {
    ...record,
    items
  };
}
