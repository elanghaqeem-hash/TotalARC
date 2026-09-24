import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import {
  getProcessFlowSource,
  saveGeneratedProcessFlow,
  type ProcessFlowDefinition
} from '@/lib/d1-process-flow';

type D1Prepared = {
  bind: (...values: unknown[]) => D1Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => D1Prepared;
};

export type ProcessDocumentDraft = {
  master: {
    name: string | null;
    description: string | null;
    ownerName: string | null;
    categorySuggestion: string | null;
    criticality: 'Critical' | 'High' | 'Medium' | 'Low' | 'Not Assessed' | null;
    classification: 'Core' | 'Finance' | 'Technology' | 'Governance' | 'Support' | 'Management' | null;
    isIcofrRelevant: boolean | null;
  };
  objective: {
    objective: string;
    strategicGoal: string | null;
    expectedOutcome: string | null;
    kpi: string | null;
    kri: string | null;
    sla: string | null;
  } | null;
  sipoc: {
    suppliers: string | null;
    inputs: string | null;
    processSteps: string | null;
    outputs: string | null;
    customers: string | null;
  } | null;
  activities: Array<{
    activityId: string;
    name: string;
    description: string | null;
    performer: string | null;
    nature: string;
    frequency: string;
    inputData: string | null;
    outputData: string | null;
    systemUsed: string | null;
    sla: string | null;
    orderIndex: number;
    kind: 'task' | 'decision';
    flowNote: string | null;
  }>;
  sourceSummary: string;
  confidence: 'High' | 'Medium' | 'Low';
  assumptions: string[];
  gaps: string[];
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

async function ensureProcessDocumentAnalysisSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = await getDb();
    const statements = [
      `CREATE TABLE IF NOT EXISTS ProcessDocumentAnalysis (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        processId TEXT NOT NULL,
        evidenceDocumentId TEXT NOT NULL,
        evidenceVersionId TEXT NOT NULL,
        fileName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        extractionMethod TEXT NOT NULL,
        sourceTextPreview TEXT,
        sourceTextTruncated INTEGER NOT NULL DEFAULT 0,
        draftJson TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_USER_VALIDATION',
        aiProvider TEXT,
        aiModel TEXT,
        aiRequestId TEXT,
        createdBy TEXT,
        appliedBy TEXT,
        appliedAt TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_process_doc_analysis_process
        ON ProcessDocumentAnalysis(institutionId, processId, createdAt)`,
      `CREATE INDEX IF NOT EXISTS idx_process_doc_analysis_status
        ON ProcessDocumentAnalysis(institutionId, status, createdAt)`
    ];
    for (const statement of statements) await db.prepare(statement).run();
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function parseDraft(value: unknown): ProcessDocumentDraft | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value) as ProcessDocumentDraft;
  } catch {
    return null;
  }
}

function rowToAnalysis(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    institutionId: String(row.institutionId),
    processId: String(row.processId),
    evidenceDocumentId: String(row.evidenceDocumentId),
    evidenceVersionId: String(row.evidenceVersionId),
    fileName: String(row.fileName || ''),
    mimeType: String(row.mimeType || ''),
    extractionMethod: String(row.extractionMethod || ''),
    sourceTextPreview: String(row.sourceTextPreview || ''),
    sourceTextTruncated: Number(row.sourceTextTruncated || 0) === 1,
    draft: parseDraft(row.draftJson),
    status: String(row.status || ''),
    aiProvider: row.aiProvider ? String(row.aiProvider) : null,
    aiModel: row.aiModel ? String(row.aiModel) : null,
    aiRequestId: row.aiRequestId ? String(row.aiRequestId) : null,
    createdBy: row.createdBy ? String(row.createdBy) : null,
    appliedBy: row.appliedBy ? String(row.appliedBy) : null,
    appliedAt: row.appliedAt ? String(row.appliedAt) : null,
    createdAt: String(row.createdAt || ''),
    updatedAt: String(row.updatedAt || '')
  };
}

function parseTags(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function nullable(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export async function saveProcessDocumentAnalysis(input: {
  institutionId: string;
  processId: string;
  evidenceDocumentId: string;
  evidenceVersionId: string;
  fileName: string;
  mimeType: string;
  extractionMethod: string;
  sourceTextPreview: string;
  sourceTextTruncated: boolean;
  draft: ProcessDocumentDraft;
  aiProvider: string;
  aiModel: string;
  aiRequestId: string;
  createdBy: string;
}) {
  const db = await ensureProcessDocumentAnalysisSchema();
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
    `INSERT INTO ProcessDocumentAnalysis (
      id, institutionId, processId, evidenceDocumentId, evidenceVersionId,
      fileName, mimeType, extractionMethod, sourceTextPreview, sourceTextTruncated,
      draftJson, status, aiProvider, aiModel, aiRequestId, createdBy,
      appliedBy, appliedAt, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_USER_VALIDATION', ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [
      id,
      input.institutionId,
      input.processId,
      input.evidenceDocumentId,
      input.evidenceVersionId,
      input.fileName,
      input.mimeType,
      input.extractionMethod,
      input.sourceTextPreview.slice(0, 5000),
      input.sourceTextTruncated ? 1 : 0,
      JSON.stringify(input.draft),
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
    'SELECT * FROM ProcessDocumentAnalysis WHERE id = ? AND institutionId = ? LIMIT 1',
    [id, input.institutionId]
  );
  if (!row) throw new Error('DOCUMENT_ANALYSIS_SAVE_FAILED');
  return rowToAnalysis(row);
}

export async function listProcessDocumentAnalyses(processId: string, institutionId: string) {
  const db = await ensureProcessDocumentAnalysisSchema();
  const process = await first<Record<string, unknown>>(
    db,
    'SELECT id FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
    [processId, institutionId]
  );
  if (!process) throw new Error('PROCESS_NOT_FOUND');

  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT * FROM ProcessDocumentAnalysis
      WHERE processId = ? AND institutionId = ?
      ORDER BY createdAt DESC
      LIMIT 12`,
    [processId, institutionId]
  );
  return rows.map(rowToAnalysis);
}

export async function rejectProcessDocumentAnalysis(input: {
  analysisId: string;
  processId: string;
  institutionId: string;
  actor: string;
}) {
  const db = await ensureProcessDocumentAnalysisSchema();
  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM ProcessDocumentAnalysis
      WHERE id = ? AND processId = ? AND institutionId = ?
      LIMIT 1`,
    [input.analysisId, input.processId, input.institutionId]
  );
  if (!existing) throw new Error('DOCUMENT_ANALYSIS_NOT_FOUND');
  if (String(existing.status) === 'APPLIED') throw new Error('DOCUMENT_ANALYSIS_ALREADY_APPLIED');

  const now = new Date().toISOString();
  await run(
    db,
    `UPDATE ProcessDocumentAnalysis
        SET status = 'REJECTED', updatedAt = ?
      WHERE id = ? AND processId = ? AND institutionId = ?`,
    [now, input.analysisId, input.processId, input.institutionId]
  );

  return { id: input.analysisId, status: 'REJECTED', reviewedBy: input.actor, updatedAt: now };
}

export async function applyProcessDocumentAnalysis(input: {
  analysisId: string;
  processId: string;
  institutionId: string;
  actor: string;
  replaceActivities: boolean;
}) {
  const db = await ensureProcessDocumentAnalysisSchema();
  const [analysisRow, process] = await Promise.all([
    first<Record<string, unknown>>(
      db,
      `SELECT * FROM ProcessDocumentAnalysis
        WHERE id = ? AND processId = ? AND institutionId = ?
        LIMIT 1`,
      [input.analysisId, input.processId, input.institutionId]
    ),
    first<Record<string, unknown>>(
      db,
      'SELECT * FROM BusinessProcess WHERE id = ? AND institutionId = ? LIMIT 1',
      [input.processId, input.institutionId]
    )
  ]);

  if (!analysisRow) throw new Error('DOCUMENT_ANALYSIS_NOT_FOUND');
  if (!process) throw new Error('PROCESS_NOT_FOUND');
  if (String(analysisRow.status) !== 'PENDING_USER_VALIDATION') {
    throw new Error('DOCUMENT_ANALYSIS_NOT_PENDING');
  }

  const draft = parseDraft(analysisRow.draftJson);
  if (!draft) throw new Error('DOCUMENT_ANALYSIS_INVALID');

  const existingActivityCount = await first<{ count?: number }>(
    db,
    'SELECT COUNT(*) AS count FROM ProcessActivity WHERE processId = ?',
    [input.processId]
  );
  const hasExistingActivities = Number(existingActivityCount?.count || 0) > 0;

  if (input.replaceActivities && hasExistingActivities) {
    const linked = await first<{ count?: number }>(
      db,
      `SELECT
        (SELECT COUNT(*) FROM RiskMaster WHERE processId = ? AND activityId IS NOT NULL) +
        (SELECT COUNT(*) FROM ControlMaster WHERE processId = ? AND activityId IS NOT NULL) AS count`,
      [input.processId, input.processId]
    );
    if (Number(linked?.count || 0) > 0) throw new Error('ACTIVITY_REPLACE_BLOCKED');
  }

  const now = new Date().toISOString();
  const master = draft.master || ({} as ProcessDocumentDraft['master']);
  const name = nullable(master.name) || String(process.name || '');
  const description = nullable(master.description) || nullable(process.description);
  const ownerName = nullable(master.ownerName) || String(process.ownerName || '');
  const criticality = master.criticality || String(process.criticality || 'Not Assessed');
  const classification = master.classification || String(process.classification || 'Core');
  const isIcofrRelevant =
    typeof master.isIcofrRelevant === 'boolean'
      ? master.isIcofrRelevant
      : Number(process.isIcofrRelevant || 0) === 1;

  const tags = parseTags(process.tags);
  tags.supportingDocumentAnalysis = {
    analysisId: input.analysisId,
    evidenceDocumentId: String(analysisRow.evidenceDocumentId),
    evidenceVersionId: String(analysisRow.evidenceVersionId),
    fileName: String(analysisRow.fileName || ''),
    status: 'VALIDATED_APPLIED',
    appliedBy: input.actor,
    appliedAt: now,
    categorySuggestion: master.categorySuggestion || null,
    confidence: draft.confidence
  };

  await run(
    db,
    `UPDATE BusinessProcess
        SET name = ?, description = ?, ownerName = ?, criticality = ?,
            classification = ?, isIcofrRelevant = ?, tags = ?, updatedAt = ?
      WHERE id = ? AND institutionId = ?`,
    [
      name,
      description,
      ownerName,
      criticality,
      classification,
      isIcofrRelevant ? 1 : 0,
      JSON.stringify(tags),
      now,
      input.processId,
      input.institutionId
    ]
  );

  if (draft.objective?.objective) {
    await run(db, 'DELETE FROM ProcessObjective WHERE processId = ?', [input.processId]);
    await run(
      db,
      `INSERT INTO ProcessObjective (
        id, processId, objective, strategicGoal, expectedOutcome, kpi, kri, sla, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.processId,
        draft.objective.objective,
        nullable(draft.objective.strategicGoal),
        nullable(draft.objective.expectedOutcome),
        nullable(draft.objective.kpi),
        nullable(draft.objective.kri),
        nullable(draft.objective.sla),
        now
      ]
    );
  }

  if (draft.sipoc) {
    await run(db, 'DELETE FROM SIPOC WHERE processId = ?', [input.processId]);
    await run(
      db,
      `INSERT INTO SIPOC (
        id, processId, suppliers, inputs, processSteps, outputs, customers, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        input.processId,
        nullable(draft.sipoc.suppliers),
        nullable(draft.sipoc.inputs),
        nullable(draft.sipoc.processSteps),
        nullable(draft.sipoc.outputs),
        nullable(draft.sipoc.customers),
        now,
        now
      ]
    );
  }

  let activitiesApplied = false;
  if (draft.activities.length && (!hasExistingActivities || input.replaceActivities)) {
    if (hasExistingActivities) {
      await run(db, 'DELETE FROM ProcessActivity WHERE processId = ?', [input.processId]);
    }

    for (const activity of draft.activities) {
      await run(
        db,
        `INSERT INTO ProcessActivity (
          id, processId, activityId, name, description, performer, nature,
          frequency, inputData, outputData, systemUsed, sla, orderIndex, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          input.processId,
          activity.activityId,
          activity.name,
          nullable(activity.description),
          nullable(activity.performer),
          activity.nature || 'Manual',
          activity.frequency || 'Per Transaction',
          nullable(activity.inputData),
          nullable(activity.outputData),
          nullable(activity.systemUsed),
          nullable(activity.sla),
          activity.orderIndex,
          now
        ]
      );
    }
    activitiesApplied = true;
  }

  let flow: Record<string, unknown> | null = null;
  if (activitiesApplied) {
    const source = await getProcessFlowSource(input.processId, input.institutionId);
    const definition: ProcessFlowDefinition = {
      title: name + ' Process Flow',
      summary: draft.sourceSummary || null,
      processName: name,
      processCode: source.process.processId,
      steps: source.activities.map((activity, index) => {
        const suggested =
          draft.activities.find(item => item.orderIndex === activity.orderIndex) ||
          draft.activities[index];
        return {
          sourceActivityId: activity.id,
          order: activity.orderIndex || index + 1,
          title: suggested?.name || activity.name,
          sourceTitle: activity.name,
          performer: activity.performer,
          system: activity.systemUsed,
          nature: activity.nature,
          kind: suggested?.kind === 'decision' ? 'decision' : 'task',
          note: suggested?.flowNote || suggested?.description || null
        };
      })
    };

    flow = await saveGeneratedProcessFlow({
      institutionId: input.institutionId,
      processId: input.processId,
      sourceHash: source.sourceHash,
      definition,
      aiProvider: String(analysisRow.aiProvider || 'unknown'),
      aiModel: String(analysisRow.aiModel || 'unknown'),
      aiRequestId: String(analysisRow.aiRequestId || ''),
      generatedBy: input.actor,
      sourceType: 'AI_SUPPORTING_DOCUMENT'
    }) as unknown as Record<string, unknown>;
  }

  await run(
    db,
    `UPDATE ProcessDocumentAnalysis
        SET status = 'APPLIED', appliedBy = ?, appliedAt = ?, updatedAt = ?
      WHERE id = ? AND processId = ? AND institutionId = ?`,
    [input.actor, now, now, input.analysisId, input.processId, input.institutionId]
  );

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
      'Process Owner / Reviewer',
      'VALIDATE_APPLY',
      'ProcessDocumentAnalysis',
      input.analysisId,
      JSON.stringify({
        processName: process.name,
        activityCount: Number(existingActivityCount?.count || 0)
      }),
      JSON.stringify({
        processName: name,
        activitiesApplied,
        activityCount: draft.activities.length,
        objectiveApplied: Boolean(draft.objective?.objective),
        sipocApplied: Boolean(draft.sipoc),
        flowVersionNo: flow?.versionNo || null
      }),
      'User explicitly validated an AI draft derived from a stored supporting business-process document.',
      now
    ]
  );

  return {
    analysisId: input.analysisId,
    status: 'APPLIED',
    appliedAt: now,
    activitiesApplied,
    activityReplacementSkipped: hasExistingActivities && !input.replaceActivities,
    flow,
    warnings:
      hasExistingActivities && !input.replaceActivities
        ? ['Existing Activity Register was preserved. The AI activity draft remains available for comparison.']
        : []
  };
}
