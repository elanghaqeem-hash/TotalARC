import { resolveServerActiveInstitutionId } from '@/lib/institution-context';
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

      CREATE TABLE IF NOT EXISTS ICOFRScopeParameter (
        id TEXT PRIMARY KEY NOT NULL,
        scopeId TEXT NOT NULL,
        parameterCode TEXT NOT NULL,
        label TEXT NOT NULL,
        numericValue REAL,
        percentValue REAL,
        formula TEXT,
        basis TEXT,
        status TEXT NOT NULL,
        sourceReference TEXT NOT NULL,
        sourceNote TEXT,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_scope_parameter_code
        ON ICOFRScopeParameter(scopeId, parameterCode);

      CREATE TABLE IF NOT EXISTS ICOFRScopingPopulationSummary (
        id TEXT PRIMARY KEY NOT NULL,
        scopeId TEXT NOT NULL,
        populationType TEXT NOT NULL,
        assessedCount INTEGER,
        significantCount INTEGER,
        quantitativeSignificantCount INTEGER,
        qualitativeOnlyCount INTEGER,
        notSignificantCount INTEGER,
        sourceStatus TEXT NOT NULL,
        sourceReference TEXT NOT NULL,
        sourceNote TEXT,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_population_scope_type
        ON ICOFRScopingPopulationSummary(scopeId, populationType);

      CREATE TABLE IF NOT EXISTS ICOFRScopeItemMetadata (
        scopeItemId TEXT PRIMARY KEY NOT NULL,
        scopeId TEXT NOT NULL,
        sourceKey TEXT,
        sourceConclusion TEXT,
        decisionStatus TEXT NOT NULL,
        sourceReference TEXT NOT NULL,
        payloadJson TEXT,
        updatedAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_meta_scope
        ON ICOFRScopeItemMetadata(scopeId);
      CREATE INDEX IF NOT EXISTS idx_icofr_scope_item_meta_key
        ON ICOFRScopeItemMetadata(scopeId, sourceKey);

      CREATE TABLE IF NOT EXISTS ICOFRScopeLink (
        id TEXT PRIMARY KEY NOT NULL,
        scopeId TEXT NOT NULL,
        fromItemId TEXT NOT NULL,
        toItemId TEXT NOT NULL,
        relationType TEXT NOT NULL,
        sourceReference TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_scope_link_unique
        ON ICOFRScopeLink(scopeId, fromItemId, toItemId, relationType);

      CREATE TABLE IF NOT EXISTS ICOFRScopingIssue (
        id TEXT PRIMARY KEY NOT NULL,
        scopeId TEXT NOT NULL,
        issueCode TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        description TEXT NOT NULL,
        activeDecision TEXT,
        affectedJson TEXT,
        sourceReference TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_icofr_scope_issue_code
        ON ICOFRScopingIssue(scopeId, issueCode);
    `);

    return db;
  })().catch(error => {
    icofrSchemaReady = null;
    throw error;
  });

  return icofrSchemaReady;
}

async function primaryInstitution(db: D1DatabaseLike) {
  const activeInstitutionId = await resolveServerActiveInstitutionId();
  if (activeInstitutionId) {
    const active = await first<Record<string, unknown>>(
      db,
      'SELECT * FROM Institution WHERE id = ? LIMIT 1',
      [activeInstitutionId]
    );
    if (active) return active;
  }
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

  const [
    scopeRows,
    itemRows,
    parameterRows,
    populationRows,
    itemMetadataRows,
    linkRows,
    issueRows,
    legalEntities,
    organizationUnits,
    businessProcesses
  ] = await Promise.all([
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
      `SELECT p.*
         FROM ICOFRScopeParameter p
         JOIN ICOFRScope s ON s.id = p.scopeId
        WHERE s.institutionId = ?
        ORDER BY p.scopeId ASC, p.sortOrder ASC, p.parameterCode ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT p.*
         FROM ICOFRScopingPopulationSummary p
         JOIN ICOFRScope s ON s.id = p.scopeId
        WHERE s.institutionId = ?
        ORDER BY p.scopeId ASC, p.populationType ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT m.*
         FROM ICOFRScopeItemMetadata m
         JOIN ICOFRScope s ON s.id = m.scopeId
        WHERE s.institutionId = ?
        ORDER BY m.scopeId ASC, m.sourceKey ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT l.*
         FROM ICOFRScopeLink l
         JOIN ICOFRScope s ON s.id = l.scopeId
        WHERE s.institutionId = ?
        ORDER BY l.scopeId ASC, l.relationType ASC, l.id ASC`,
      [institution.id]
    ),
    all<Record<string, unknown>>(
      db,
      `SELECT i.*
         FROM ICOFRScopingIssue i
         JOIN ICOFRScope s ON s.id = i.scopeId
        WHERE s.institutionId = ?
        ORDER BY i.scopeId ASC,
                 CASE i.severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
                 i.issueCode ASC`,
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

  const metadataByItem = new Map<string, Record<string, unknown>>();
  for (const row of itemMetadataRows) {
    let payload: unknown = null;
    try {
      payload = row.payloadJson ? JSON.parse(String(row.payloadJson)) : null;
    } catch {
      payload = null;
    }
    metadataByItem.set(String(row.scopeItemId), {
      ...row,
      payload
    });
  }

  const itemsByScope = new Map<string, Record<string, unknown>[]>();
  for (const rawItem of itemRows) {
    const item = itemRow(rawItem);
    const scopeId = String(rawItem.scopeId);
    const list = itemsByScope.get(scopeId) || [];
    list.push({
      ...item,
      sourceMetadata: metadataByItem.get(String(rawItem.id)) || null
    });
    itemsByScope.set(scopeId, list);
  }

  const linksByScope = new Map<string, Record<string, unknown>[]>();
  for (const row of linkRows) {
    const scopeId = String(row.scopeId);
    const list = linksByScope.get(scopeId) || [];
    list.push(row);
    linksByScope.set(scopeId, list);
  }

  const issuesByScope = new Map<string, Record<string, unknown>[]>();
  for (const row of issueRows) {
    const scopeId = String(row.scopeId);
    const list = issuesByScope.get(scopeId) || [];
    let affected: unknown = null;
    try {
      affected = row.affectedJson ? JSON.parse(String(row.affectedJson)) : null;
    } catch {
      affected = null;
    }
    list.push({
      ...row,
      affected
    });
    issuesByScope.set(scopeId, list);
  }

  const parametersByScope = new Map<string, Record<string, unknown>[]>();
  for (const row of parameterRows) {
    const scopeId = String(row.scopeId);
    const list = parametersByScope.get(scopeId) || [];
    list.push({
      ...row,
      numericValue: numeric(row.numericValue),
      percentValue: numeric(row.percentValue)
    });
    parametersByScope.set(scopeId, list);
  }

  const populationsByScope = new Map<string, Record<string, unknown>[]>();
  for (const row of populationRows) {
    const scopeId = String(row.scopeId);
    const list = populationsByScope.get(scopeId) || [];
    list.push({
      ...row,
      assessedCount: numeric(row.assessedCount),
      significantCount: numeric(row.significantCount),
      quantitativeSignificantCount: numeric(row.quantitativeSignificantCount),
      qualitativeOnlyCount: numeric(row.qualitativeOnlyCount),
      notSignificantCount: numeric(row.notSignificantCount)
    });
    populationsByScope.set(scopeId, list);
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
      items: itemsByScope.get(String(row.id)) || [],
      parameters: parametersByScope.get(String(row.id)) || [],
      populationSummaries: populationsByScope.get(String(row.id)) || [],
      links: linksByScope.get(String(row.id)) || [],
      issues: issuesByScope.get(String(row.id)) || []
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


function memoAscii(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function memoEscape(value: unknown) {
  return memoAscii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function memoWrap(value: unknown, width = 88) {
  const text = memoAscii(value);
  if (!text) return [''];

  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function memoFormatAmount(value: unknown, currency: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';

  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: memoAscii(currency) || 'IDR',
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 0
    }).format(amount);
  }
}

function memoFormatPercent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  return (
    new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(number) + '%'
  );
}

function memoFormatDate(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return memoAscii(value);

  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta'
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

type IcofrApprovalMemoPdfInput = {
  institutionName: string;
  officeAddress: string;
  contactLine: string;
  scopeName: string;
  to: string;
  from: string;
  subject: string;
  date: string;
  documentId: string;
  intro: string;
  perimeter: Array<[string, string]>;
  materiality: Array<[string, string]>;
  coverage: Array<[string, string[]]>;
  notes: Array<[string, string]>;
  approvalText: string;
  preparedBy: string;
  reviewedBy: string;
};

function memoBuildPdfDocument(input: IcofrApprovalMemoPdfInput) {
  const pages: string[][] = [];
  let page: string[] = [];
  let y = 0;

  const PAGE_W = 595;
  const PAGE_H = 842;
  const LEFT = 42;
  const RIGHT = 553;
  const BOTTOM = 58;

  const navy = [0.035, 0.18, 0.34] as const;
  const blue = [0.02, 0.48, 0.72] as const;
  const ink = [0.08, 0.12, 0.2] as const;
  const muted = [0.36, 0.42, 0.5] as const;
  const pale = [0.94, 0.97, 0.99] as const;
  const line = [0.82, 0.86, 0.9] as const;
  const white = [1, 1, 1] as const;

  const rgb = (color: readonly number[]) =>
    `${color[0]} ${color[1]} ${color[2]}`;

  const addText = (
    text: unknown,
    x: number,
    textY: number,
    size = 10,
    font = 'F1',
    color: readonly number[] = ink
  ) => {
    page.push(
      `${rgb(color)} rg BT /${font} ${size} Tf ${x} ${textY} Td (${memoEscape(text)}) Tj ET`
    );
  };

  const addLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width = 0.6,
    color: readonly number[] = line
  ) => {
    page.push(`${rgb(color)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  };

  const addRect = (
    x: number,
    rectY: number,
    width: number,
    height: number,
    fill: readonly number[],
    stroke: readonly number[] | null = null,
    strokeWidth = 0.6
  ) => {
    page.push(`${rgb(fill)} rg ${x} ${rectY} ${width} ${height} re f`);
    if (stroke) {
      page.push(
        `${rgb(stroke)} RG ${strokeWidth} w ${x} ${rectY} ${width} ${height} re S`
      );
    }
  };

  const addHeader = (continuation = false) => {
    page = [];
    pages.push(page);

    addRect(0, 758, PAGE_W, 84, navy);
    addRect(0, 754, PAGE_W, 4, blue);

    addText(input.institutionName, LEFT, 816, 14, 'F2', white);
    addText(`KANTOR PUSAT | ${input.officeAddress}`, LEFT, 798, 8.2, 'F1', white);
    if (input.contactLine) {
      addText(input.contactLine, LEFT, 784, 7.8, 'F1', [0.86, 0.93, 0.98]);
    }

    addText(
      continuation
        ? 'MEMO PERSETUJUAN SCOPE ICOFR - LANJUTAN'
        : 'MEMO PERSETUJUAN SCOPE ICOFR',
      LEFT,
      724,
      18,
      'F2',
      navy
    );
    addText(
      `Internal Control over Financial Reporting (ICOFR) | ${input.scopeName}`,
      LEFT,
      707,
      9,
      'F1',
      muted
    );
    addLine(LEFT, 695, RIGHT, 695, 1.2, blue);
    y = 678;
  };

  const ensureSpace = (height: number) => {
    if (y - height < BOTTOM) addHeader(true);
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(34);
    addRect(LEFT, y - 18, RIGHT - LEFT, 24, pale, line);
    addText(title, LEFT + 10, y - 10, 10.5, 'F2', navy);
    y -= 34;
  };

  const addKeyValue = (label: string, value: string) => {
    const lines = memoWrap(value || '-', 63);
    const height = Math.max(22, lines.length * 13 + 8);
    ensureSpace(height);

    addText(label, LEFT, y, 8.5, 'F2', muted);
    lines.forEach((lineText, index) =>
      addText(lineText, 180, y - index * 13, 9.4, 'F1', ink)
    );
    addLine(LEFT, y - height + 7, RIGHT, y - height + 7, 0.4, line);
    y -= height;
  };

  const addParagraph = (text: string) => {
    const lines = memoWrap(text, 92);
    const height = lines.length * 13 + 9;
    ensureSpace(height);
    lines.forEach((lineText, index) =>
      addText(lineText, LEFT, y - index * 13, 9.4, 'F1', ink)
    );
    y -= height;
  };

  const addBullet = (text: string) => {
    const lines = memoWrap(text, 86);
    const height = lines.length * 12 + 7;
    ensureSpace(height);

    addText('-', LEFT + 4, y, 10, 'F2', blue);
    lines.forEach((lineText, index) =>
      addText(lineText, LEFT + 18, y - index * 12, 9.2, 'F1', ink)
    );
    y -= height;
  };

  addHeader(false);

  addRect(LEFT, y - 96, RIGHT - LEFT, 104, [0.985, 0.99, 0.995], line);
  addText('Kepada', LEFT + 12, y - 16, 8.4, 'F2', muted);
  addText(input.to, 150, y - 16, 9.4, 'F1', ink);
  addText('Dari', LEFT + 12, y - 34, 8.4, 'F2', muted);
  addText(input.from, 150, y - 34, 9.4, 'F1', ink);
  addText('Perihal', LEFT + 12, y - 52, 8.4, 'F2', muted);
  addText(input.subject, 150, y - 52, 9.4, 'F1', ink);
  addText('Tanggal', LEFT + 12, y - 70, 8.4, 'F2', muted);
  addText(input.date, 150, y - 70, 9.4, 'F1', ink);
  addText('ID Dokumen', LEFT + 12, y - 88, 8.4, 'F2', muted);
  addText(input.documentId, 150, y - 88, 9.4, 'F2', navy);
  y -= 122;

  addParagraph(input.intro);
  y -= 4;

  addSectionTitle('1. RINGKASAN PERIMETER PELAPORAN');
  input.perimeter.forEach(([label, value]) => addKeyValue(label, value));

  addSectionTitle('2. PENETAPAN MATERIALITAS');
  input.materiality.forEach(([label, value]) => addKeyValue(label, value));

  addSectionTitle('3. CAKUPAN SCOPE ICOFR');
  input.coverage.forEach(([group, items]) => {
    addBullet(`${group}: ${items.length} item`);
    if (items.length === 0) {
      addBullet('(Tidak ada item in-scope tersimpan)');
      return;
    }
    items.forEach(item => addBullet(item));
  });

  addSectionTitle('4. KRITERIA, PENGECUALIAN, DAN CATATAN');
  input.notes.forEach(([label, value]) => {
    ensureSpace(30);
    addText(label, LEFT, y, 8.5, 'F2', muted);
    y -= 15;
    addParagraph(value || '-');
    y -= 4;
  });

  addSectionTitle('5. PERMOHONAN PERSETUJUAN DIREKSI');
  addParagraph(input.approvalText);
  y -= 4;

  ensureSpace(286);
  addRect(LEFT, y - 132, RIGHT - LEFT, 138, [0.985, 0.99, 0.995], line);
  addText('KEPUTUSAN DIREKSI', LEFT + 12, y - 18, 10.5, 'F2', navy);
  addText('[ ] Disetujui sesuai usulan scope ICOFR', LEFT + 12, y - 40, 9.2, 'F1', ink);
  addText('[ ] Disetujui dengan catatan', LEFT + 12, y - 58, 9.2, 'F1', ink);
  addText('[ ] Dikembalikan untuk revisi', LEFT + 12, y - 76, 9.2, 'F1', ink);
  addText(
    'Catatan: ________________________________________________________________',
    LEFT + 12,
    y - 98,
    8.7,
    'F1',
    muted
  );
  addText(
    'Nama/Jabatan: __________________________  Tanggal: _______________',
    LEFT + 12,
    y - 116,
    8.7,
    'F1',
    muted
  );
  y -= 160;

  addText('Diajukan oleh,', LEFT, y, 8.8, 'F2', muted);
  addText('Direviu oleh,', 320, y, 8.8, 'F2', muted);
  y -= 48;
  addLine(LEFT, y, 220, y, 0.7, ink);
  addLine(320, y, 500, y, 0.7, ink);
  addText(input.preparedBy || '-', LEFT, y - 15, 9.2, 'F2', ink);
  addText(input.reviewedBy || '-', 320, y - 15, 9.2, 'F2', ink);
  y -= 46;

  addParagraph(
    'Dokumen ini dihasilkan dari data scope ICOFR yang telah tersimpan di TotalARC. Perubahan atas scope setelah memo diterbitkan harus disimpan kembali dan memo persetujuan diterbitkan ulang agar bukti persetujuan tetap selaras dengan data sistem.'
  );

  pages.forEach((pageCommands, index) => {
    const footer =
      `TotalARC | INTERNAL - Persetujuan Scope ICOFR | Halaman ${index + 1} dari ${pages.length}`;
    pageCommands.push(
      `${rgb(muted)} rg BT /F1 7.5 Tf ${LEFT} 30 Td (${memoEscape(footer)}) Tj ET`
    );
    pageCommands.push(
      `${rgb(line)} RG 0.4 w ${LEFT} 42 m ${RIGHT} 42 l S`
    );
  });

  const objects: string[] = [];
  const fontRegularObject = 3;
  const fontBoldObject = 4;
  const pageRefs: number[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    pageRefs.push(5 + index * 2);
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] =
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs
      .map(ref => ref + ' 0 R')
      .join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  for (let index = 0; index < pages.length; index += 1) {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    const stream = pages[index].join('\n');

    objects[pageObject] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontRegularObject} 0 R /F2 ${fontBoldObject} 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] =
      `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = new TextEncoder().encode(pdf).length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index < objects.length; index += 1) {
    pdf += String(offsets[index]).padStart(10, '0') + ' 00000 n \n';
  }

  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function memoInstitutionAddress(institution: Record<string, unknown>) {
  const primary =
    memoAscii(institution.operationalAddress) ||
    memoAscii(institution.registeredAddress);

  if (!primary) throw new Error('INSTITUTION_ADDRESS_REQUIRED');

  const parts = [primary];
  const normalized = primary.toLowerCase();

  for (const value of [
    institution.city,
    institution.provinceState,
    institution.country
  ]) {
    const text = memoAscii(value);
    if (text && !normalized.includes(text.toLowerCase())) {
      parts.push(text);
    }
  }

  return parts.join(', ');
}

function memoSafeId(value: unknown) {
  return memoAscii(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function buildIcofrScopingApprovalMemoPdf(scopeId: string) {
  const db = await ensureIcofrScopeSchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const scope = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM ICOFRScope WHERE id = ? AND institutionId = ? LIMIT 1',
    [scopeId, institution.id]
  );
  if (!scope) throw new Error('SCOPE_NOT_FOUND');

  const items = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ICOFRScopeItem
      WHERE scopeId = ? AND inScope = 1
      ORDER BY itemType ASC, code ASC, name ASC`,
    [scopeId]
  );

  const legalName =
    memoAscii(institution.legalName) ||
    memoAscii(institution.name) ||
    'Institusi';
  const shortName =
    memoSafeId(institution.shortName) ||
    memoSafeId(institution.name) ||
    'TOTALARC';
  const officeAddress = memoInstitutionAddress(institution);

  const contactParts = [
    institution.telephone ? `Tel. ${memoAscii(institution.telephone)}` : '',
    memoAscii(institution.generalEmail),
    memoAscii(institution.website)
  ].filter(Boolean);

  const groupedItems = new Map<string, string[]>();
  for (const item of items) {
    const type = memoAscii(item.itemType) || 'Lainnya';
    const current = groupedItems.get(type) || [];
    const code = memoAscii(item.code);
    const name = memoAscii(item.name);
    current.push(code ? `${code} - ${name}` : name);
    groupedItems.set(type, current);
  }

  const labelByType: Record<string, string> = {
    'Legal Entity': 'Entitas / Legal Entity',
    'Organization Unit': 'Unit Organisasi',
    'Business Process': 'Proses Bisnis'
  };

  const preferredOrder = ['Legal Entity', 'Organization Unit', 'Business Process'];
  const otherTypes = Array.from(groupedItems.keys()).filter(
    key => !preferredOrder.includes(key)
  );
  const coverage: Array<[string, string[]]> = [...preferredOrder, ...otherTypes].map(
    type => [labelByType[type] || type, groupedItems.get(type) || []]
  );

  const fiscalYear = Number(scope.fiscalYear || 0);
  const currency = memoAscii(scope.currency) || 'IDR';
  const documentId =
    `${shortName}-ICOFR-SCOPE-${fiscalYear || 'FY'}-${memoSafeId(scope.id).slice(0, 8)}`;

  const trivialPercent =
    scope.clearlyTrivialPercent === null ||
    scope.clearlyTrivialPercent === undefined
      ? '-'
      : memoFormatPercent(scope.clearlyTrivialPercent);
  const trivialAmount =
    scope.clearlyTrivialAmount === null ||
    scope.clearlyTrivialAmount === undefined
      ? '-'
      : memoFormatAmount(scope.clearlyTrivialAmount, currency);
  const componentAmount =
    scope.componentMaterialityAmount === null ||
    scope.componentMaterialityAmount === undefined
      ? '-'
      : memoFormatAmount(scope.componentMaterialityAmount, currency);

  const bytes = memoBuildPdfDocument({
    institutionName: legalName,
    officeAddress,
    contactLine: contactParts.join(' | '),
    scopeName: memoAscii(scope.scopeName) || 'Scope ICOFR',
    to: `Direksi ${legalName}`,
    from: memoAscii(scope.preparedBy) || 'Penyusun Scope ICOFR',
    subject: `Permohonan Persetujuan Scope ICOFR Tahun Buku ${fiscalYear || '-'}`,
    date: memoFormatDate(scope.updatedAt || scope.createdAt),
    documentId,
    intro:
      `Sehubungan dengan pelaksanaan Internal Control over Financial Reporting (ICOFR) untuk periode pelaporan ${memoAscii(
        scope.reportingPeriod
      ) || '-'} Tahun Buku ${fiscalYear || '-'}, bersama ini kami menyampaikan hasil scoping dan penetapan materialitas yang telah disusun dan disimpan dalam TotalARC untuk memperoleh persetujuan tertulis Direksi sebelum digunakan sebagai dasar pemetaan akun signifikan, proses bisnis, risiko, kontrol, serta pengujian ICOFR.`,
    perimeter: [
      ['Nama scope', memoAscii(scope.scopeName) || '-'],
      [
        'Tahun fiskal / periode',
        `${fiscalYear || '-'} / ${memoAscii(scope.reportingPeriod) || '-'}`
      ],
      ['Basis konsolidasi', memoAscii(scope.consolidationBasis) || '-'],
      ['Kerangka pelaporan', memoAscii(scope.accountingFramework) || '-'],
      ['Pendekatan scoping', memoAscii(scope.scopeApproach) || '-'],
      ['Status pada sistem', memoAscii(scope.status) || '-']
    ],
    materiality: [
      ['Benchmark', memoAscii(scope.benchmarkType) || '-'],
      ['Nilai benchmark', memoFormatAmount(scope.benchmarkAmount, currency)],
      [
        'Overall Materiality (OM)',
        `${memoFormatPercent(scope.overallMaterialityPercent)} | ${memoFormatAmount(
          scope.overallMaterialityAmount,
          currency
        )}`
      ],
      [
        'Performance Materiality (PM)',
        `${memoFormatPercent(scope.performanceMaterialityPercent)} dari OM | ${memoFormatAmount(
          scope.performanceMaterialityAmount,
          currency
        )}`
      ],
      [
        'Clearly Trivial / SAD',
        trivialPercent === '-' && trivialAmount === '-'
          ? '-'
          : `${trivialPercent} dari PM | ${trivialAmount}`
      ],
      ['Materialitas komponen', componentAmount]
    ],
    coverage,
    notes: [
      ['Kriteria kuantitatif', memoAscii(scope.quantitativeCriteria) || '-'],
      ['Kriteria kualitatif', memoAscii(scope.qualitativeCriteria) || '-'],
      ['Pengecualian / out-of-scope', memoAscii(scope.exclusions) || '-'],
      ['Catatan / rationale materialitas', memoAscii(scope.notes) || '-'],
      [
        'Pejabat persetujuan pada sistem',
        memoAscii(scope.approvedBy) || 'Belum ditetapkan / menunggu persetujuan tertulis'
      ]
    ],
    approvalText:
      'Dengan mempertimbangkan informasi di atas, kami memohon persetujuan Direksi atas scope ICOFR dan ambang materialitas tersebut sebagai dasar pelaksanaan tahapan ICOFR selanjutnya. Setiap perubahan material atas perimeter, benchmark, nilai materialitas, atau cakupan proses setelah persetujuan harus diajukan kembali melalui TotalARC dan memperoleh persetujuan yang memadai.',
    preparedBy: memoAscii(scope.preparedBy) || '-',
    reviewedBy: memoAscii(scope.reviewedBy) || '-'
  });

  return {
    bytes,
    filename:
      `Memo-Persetujuan-Scope-ICOFR-${shortName}-${fiscalYear || 'FY'}-${memoSafeId(
        scope.id
      ).slice(0, 8)}.pdf`
  };
}
