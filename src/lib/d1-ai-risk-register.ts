import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';

type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1Prepared;
};

export const AI_RISK_CATEGORIES = [
  'Operational',
  'Financial Reporting',
  'Compliance',
  'Technology',
  'Cybersecurity',
  'Strategic',
  'Fraud',
  'Third Party'
] as const;

export type AiRiskCategory = (typeof AI_RISK_CATEGORIES)[number];

export type AiRiskSuggestion = {
  id: string;
  category: AiRiskCategory;
  name: string;
  cause: string;
  event: string;
  impact: string;
  rationale: string;
  sourceActivityIds: string[];
  sourceActivityNames: string[];
  confidence: 'High' | 'Medium' | 'Low';
};

export type AiRiskSuggestionBatch = {
  id: string;
  institutionId: string;
  processId: string;
  processEnterpriseId: string;
  processName: string;
  sourceFingerprint: string;
  analysisSummary: string;
  suggestions: AiRiskSuggestion[];
  status: string;
  aiProvider: string | null;
  aiModel: string | null;
  aiRequestId: string | null;
  createdBy: string | null;
  appliedSuggestionIds: string[];
  createdAt: string;
  updatedAt: string;
};

let schemaReady: Promise<D1DatabaseLike> | null = null;

async function getDb() {
  await ensureCoreDomainSchema();
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
) {
  const statement = db.prepare(sql);
  return values.length
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

async function all<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
) {
  const statement = db.prepare(sql);
  const result = values.length
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results || [];
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const statement = db.prepare(sql);
  return values.length ? statement.bind(...values).run() : statement.run();
}

async function ensureAiRiskRegisterSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    const statements = [
      `CREATE TABLE IF NOT EXISTS AIRiskSuggestionBatch (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        processId TEXT NOT NULL,
        processEnterpriseId TEXT NOT NULL,
        processName TEXT NOT NULL,
        sourceFingerprint TEXT NOT NULL,
        analysisSummary TEXT NOT NULL,
        suggestionsJson TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'GENERATED',
        aiProvider TEXT,
        aiModel TEXT,
        aiRequestId TEXT,
        createdBy TEXT,
        appliedSuggestionIds TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ai_risk_batch_process
        ON AIRiskSuggestionBatch(institutionId, processId, createdAt)`,
      `CREATE TABLE IF NOT EXISTS AIRiskSuggestionLink (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        batchId TEXT NOT NULL,
        suggestionId TEXT NOT NULL,
        riskId TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_risk_link_unique
        ON AIRiskSuggestionLink(institutionId, batchId, suggestionId)`,
      `CREATE INDEX IF NOT EXISTS idx_ai_risk_link_risk
        ON AIRiskSuggestionLink(institutionId, riskId)`
    ];

    for (const statement of statements) await db.prepare(statement).run();
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

function parseJsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToBatch(row: Record<string, unknown>): AiRiskSuggestionBatch {
  return {
    id: String(row.id),
    institutionId: String(row.institutionId),
    processId: String(row.processId),
    processEnterpriseId: String(row.processEnterpriseId || ''),
    processName: String(row.processName || ''),
    sourceFingerprint: String(row.sourceFingerprint || ''),
    analysisSummary: String(row.analysisSummary || ''),
    suggestions: parseJsonArray(row.suggestionsJson) as AiRiskSuggestion[],
    status: String(row.status || 'GENERATED'),
    aiProvider: row.aiProvider ? String(row.aiProvider) : null,
    aiModel: row.aiModel ? String(row.aiModel) : null,
    aiRequestId: row.aiRequestId ? String(row.aiRequestId) : null,
    createdBy: row.createdBy ? String(row.createdBy) : null,
    appliedSuggestionIds: parseJsonArray(row.appliedSuggestionIds).map(String),
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  };
}

export async function fingerprintAiRiskContext(value: unknown) {
  const serialized = JSON.stringify(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return Array.from(new Uint8Array(digest))
    .map(item => item.toString(16).padStart(2, '0'))
    .join('');
}

export async function saveAiRiskSuggestionBatch(input: {
  institutionId: string;
  processId: string;
  processEnterpriseId: string;
  processName: string;
  sourceFingerprint: string;
  analysisSummary: string;
  suggestions: AiRiskSuggestion[];
  aiProvider: string;
  aiModel: string;
  aiRequestId: string;
  createdBy: string;
}) {
  const db = await ensureAiRiskRegisterSchema();
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    [input.processId, input.institutionId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await run(
    db,
    `INSERT INTO AIRiskSuggestionBatch (
      id, institutionId, processId, processEnterpriseId, processName,
      sourceFingerprint, analysisSummary, suggestionsJson, status,
      aiProvider, aiModel, aiRequestId, createdBy, appliedSuggestionIds,
      createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'GENERATED', ?, ?, ?, ?, '[]', ?, ?)`,
    [
      id,
      input.institutionId,
      input.processId,
      input.processEnterpriseId,
      input.processName,
      input.sourceFingerprint,
      input.analysisSummary,
      JSON.stringify(input.suggestions),
      input.aiProvider,
      input.aiModel,
      input.aiRequestId,
      input.createdBy,
      now,
      now
    ]
  );

  const row = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM AIRiskSuggestionBatch WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, input.institutionId]
  );
  if (!row) throw new Error('AI_RISK_BATCH_SAVE_FAILED');
  return rowToBatch(row);
}

export async function listAiRiskSuggestionBatches(processId: string, institutionId: string) {
  const db = await ensureAiRiskRegisterSchema();
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    [processId, institutionId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM AIRiskSuggestionBatch
      WHERE processId = ? AND institutionId = ?
      ORDER BY createdAt DESC
      LIMIT 8`,
    [processId, institutionId]
  );
  return rows.map(rowToBatch);
}

export async function getAiRiskSuggestionBatch(
  batchId: string,
  processId: string,
  institutionId: string
) {
  const db = await ensureAiRiskRegisterSchema();
  const row = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM AIRiskSuggestionBatch
      WHERE id = ? AND processId = ? AND institutionId = ?
      LIMIT 1`,
    [batchId, processId, institutionId]
  );
  return row ? rowToBatch(row) : null;
}

async function audit(
  db: D1DatabaseLike,
  input: {
    institutionId: string;
    actor: string;
    action: string;
    entityType: string;
    recordId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason: string;
  }
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id, institutionId, userName, userRole, action, entityType, recordId,
      oldValue, newValue, reason, ipAddress, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    [
      crypto.randomUUID(),
      input.institutionId,
      input.actor,
      'Risk Register User',
      input.action,
      input.entityType,
      input.recordId,
      input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
      input.newValue === undefined ? null : JSON.stringify(input.newValue),
      input.reason,
      new Date().toISOString()
    ]
  );
}

export async function applyAiRiskSuggestionSelection(input: {
  institutionId: string;
  processId: string;
  batchId: string;
  selectedSuggestionIds: string[];
  ownerName: string;
  actor: string;
}) {
  const db = await ensureAiRiskRegisterSchema();
  const ownerName = input.ownerName.trim();
  if (!ownerName) throw new Error('RISK_OWNER_REQUIRED');

  const [batchRow, process] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      `SELECT * FROM AIRiskSuggestionBatch
        WHERE id = ? AND processId = ? AND institutionId = ?
        LIMIT 1`,
      [input.batchId, input.processId, input.institutionId]
    ),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
      [input.processId, input.institutionId]
    )
  ]);

  if (!batchRow) throw new Error('AI_RISK_BATCH_NOT_FOUND');
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const batch = rowToBatch(batchRow);
  const selectedSet = new Set(input.selectedSuggestionIds.map(String).filter(Boolean));
  if (!selectedSet.size) throw new Error('AI_RISK_SELECTION_REQUIRED');

  const selected = batch.suggestions.filter(item => selectedSet.has(item.id));
  if (!selected.length || selected.length !== selectedSet.size) {
    throw new Error('AI_RISK_SELECTION_INVALID');
  }

  const alreadyApplied = new Set(batch.appliedSuggestionIds);
  const created: Array<Record<string, unknown>> = [];
  const duplicates: Array<{ suggestionId: string; existingRiskId: string; existingRiskCode: string }> = [];
  const now = new Date().toISOString();

  for (const suggestion of selected) {
    if (alreadyApplied.has(suggestion.id)) continue;

    const duplicate = await first<Record<string, unknown>>(
      db,
      `SELECT id, riskId
         FROM RiskMaster
        WHERE institutionId = ? AND processId = ? AND lower(name) = lower(?)
        LIMIT 1`,
      [input.institutionId, input.processId, suggestion.name]
    );

    if (duplicate) {
      duplicates.push({
        suggestionId: suggestion.id,
        existingRiskId: String(duplicate.id),
        existingRiskCode: String(duplicate.riskId)
      });
      continue;
    }

    let activityId: string | null = null;
    for (const candidate of suggestion.sourceActivityIds || []) {
      const activity = await first<Record<string, unknown>>(
        db,
        'SELECT id FROM ProcessActivity WHERE id = ? AND processId = ? LIMIT 1',
        [candidate, input.processId]
      );
      if (activity) {
        activityId = String(activity.id);
        break;
      }
    }

    const id = crypto.randomUUID();
    const enterpriseRiskId = 'RSK-AI-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    const description =
      'Due to ' +
      suggestion.cause +
      ', there is a risk that ' +
      suggestion.event +
      ', resulting in ' +
      suggestion.impact +
      '.';

    await run(
      db,
      `INSERT INTO RiskMaster (
        id, institutionId, processId, activityId, riskId, name, description, cause,
        event, impact, category, ownerName, inherentLikelihood, inherentImpact,
        inherentScore, inherentRating, residualLikelihood, residualImpact,
        residualScore, residualRating, riskTreatment, status, version, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'Not Assessed',
                0, 0, 0, 'Not Assessed', 'Not Assessed', 'Draft', '1.0', ?, ?)`,
      [
        id,
        input.institutionId,
        input.processId,
        activityId,
        enterpriseRiskId,
        suggestion.name,
        description,
        suggestion.cause,
        suggestion.event,
        suggestion.impact,
        suggestion.category,
        ownerName,
        now,
        now
      ]
    );

    await run(
      db,
      `INSERT INTO AIRiskSuggestionLink (
        id, institutionId, batchId, suggestionId, riskId, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.institutionId,
        input.batchId,
        suggestion.id,
        id,
        now
      ]
    );

    await audit(db, {
      institutionId: input.institutionId,
      actor: input.actor,
      action: 'CREATE_AI_SELECTED',
      entityType: 'Risk',
      recordId: id,
      newValue: {
        riskId: enterpriseRiskId,
        processId: input.processId,
        activityId,
        category: suggestion.category,
        name: suggestion.name,
        cause: suggestion.cause,
        event: suggestion.event,
        impact: suggestion.impact,
        status: 'Draft',
        inherentRating: 'Not Assessed',
        aiBatchId: input.batchId,
        aiSuggestionId: suggestion.id
      },
      reason:
        'User selected this risk from a Total ARC AI suggestion batch generated from a registered BPM. Human assessment remains required.'
    });

    created.push({
      id,
      riskId: enterpriseRiskId,
      name: suggestion.name,
      category: suggestion.category,
      processId: input.processId,
      activityId,
      ownerName,
      status: 'Draft',
      inherentLikelihood: 0,
      inherentImpact: 0,
      inherentScore: 0,
      inherentRating: 'Not Assessed',
      residualLikelihood: 0,
      residualImpact: 0,
      residualScore: 0,
      residualRating: 'Not Assessed',
      riskTreatment: 'Not Assessed'
    });
    alreadyApplied.add(suggestion.id);
  }

  const appliedSuggestionIds = Array.from(alreadyApplied);
  await run(
    db,
    `UPDATE AIRiskSuggestionBatch
        SET status = ?, appliedSuggestionIds = ?, updatedAt = ?
      WHERE id = ? AND institutionId = ? AND processId = ?`,
    [
      appliedSuggestionIds.length ? 'SELECTION_APPLIED' : batch.status,
      JSON.stringify(appliedSuggestionIds),
      now,
      input.batchId,
      input.institutionId,
      input.processId
    ]
  );

  await audit(db, {
    institutionId: input.institutionId,
    actor: input.actor,
    action: 'APPLY_SELECTION',
    entityType: 'AIRiskSuggestionBatch',
    recordId: input.batchId,
    oldValue: { appliedSuggestionIds: batch.appliedSuggestionIds },
    newValue: {
      selectedSuggestionIds: input.selectedSuggestionIds,
      appliedSuggestionIds,
      createdRiskIds: created.map(item => item.id),
      duplicateSuggestionIds: duplicates.map(item => item.suggestionId)
    },
    reason:
      'User explicitly selected AI-generated BPM risk suggestions for creation as Draft / Not Assessed Risk Register entries.'
  });

  return {
    created,
    duplicates,
    appliedSuggestionIds,
    status: appliedSuggestionIds.length ? 'SELECTION_APPLIED' : batch.status
  };
}
