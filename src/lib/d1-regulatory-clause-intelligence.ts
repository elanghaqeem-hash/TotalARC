import { ensureSourceLibrarySchema } from '@/lib/d1-source-library';
import { ensureRegulatoryObligationSchema, createRegulatoryObligation, createRegulatoryObligationLink } from '@/lib/d1-regulatory-obligations';
import { runAiGateway } from '@/lib/ai/gateway';

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

export type RegulationSourceVersion = {
  id: string;
  institutionId: string;
  regulationId: string;
  sourceDocumentId: string;
  versionLabel: string;
  sourceDate: string | null;
  effectiveDate: string | null;
  isCurrent: number;
  linkedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RegulatoryClauseSnapshot = {
  id: string;
  institutionId: string;
  sourceVersionId: string;
  clauseKey: string;
  clauseTitle: string;
  clauseText: string;
  textHash: string;
  orderIndex: number;
  createdAt: string;
};

export type RegulatoryClauseDraft = {
  id: string;
  institutionId: string;
  regulationId: string;
  sourceVersionId: string;
  clauseSnapshotId: string;
  draftCode: string;
  requirementText: string;
  requirementType: string;
  applicability: string;
  frequency: string | null;
  criticality: string;
  rationale: string | null;
  confidence: string;
  status: string;
  acceptedObligationId: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiRequestId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RegulatoryClauseImpactDraft = {
  id: string;
  institutionId: string;
  clauseDraftId: string;
  targetType: string;
  targetId: string;
  impactType: string;
  rationale: string | null;
  confidence: string;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

function normalizeDate(value: unknown) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(item => item.toString(16).padStart(2, '0'))
    .join('');
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  for (const statement of script.split(';').map(item => item.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureRegulatoryClauseSchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    await ensureSourceLibrarySchema();
    const db = await ensureRegulatoryObligationSchema() as D1DatabaseLike;

    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS RegulationSourceVersion (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        regulationId TEXT NOT NULL,
        sourceDocumentId TEXT NOT NULL,
        versionLabel TEXT NOT NULL,
        sourceDate TEXT,
        effectiveDate TEXT,
        isCurrent INTEGER NOT NULL DEFAULT 1,
        linkedBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_source_version_unique
        ON RegulationSourceVersion(institutionId, regulationId, sourceDocumentId);
      CREATE INDEX IF NOT EXISTS idx_reg_source_version_regulation
        ON RegulationSourceVersion(institutionId, regulationId, isCurrent, sourceDate);

      CREATE TABLE IF NOT EXISTS RegulatoryClauseSnapshot (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceVersionId TEXT NOT NULL,
        clauseKey TEXT NOT NULL,
        clauseTitle TEXT NOT NULL,
        clauseText TEXT NOT NULL,
        textHash TEXT NOT NULL,
        orderIndex INTEGER NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_clause_snapshot_unique
        ON RegulatoryClauseSnapshot(institutionId, sourceVersionId, clauseKey);
      CREATE INDEX IF NOT EXISTS idx_reg_clause_snapshot_version
        ON RegulatoryClauseSnapshot(institutionId, sourceVersionId, orderIndex);

      CREATE TABLE IF NOT EXISTS RegulatoryClauseAnalysisRun (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        regulationId TEXT NOT NULL,
        sourceVersionId TEXT NOT NULL,
        status TEXT NOT NULL,
        clauseCount INTEGER NOT NULL DEFAULT 0,
        draftCount INTEGER NOT NULL DEFAULT 0,
        impactCount INTEGER NOT NULL DEFAULT 0,
        provider TEXT,
        model TEXT,
        requestId TEXT,
        errorCode TEXT,
        startedBy TEXT NOT NULL,
        startedAt TEXT NOT NULL,
        completedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_reg_clause_run
        ON RegulatoryClauseAnalysisRun(institutionId, regulationId, startedAt);

      CREATE TABLE IF NOT EXISTS RegulatoryClauseDraft (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        regulationId TEXT NOT NULL,
        sourceVersionId TEXT NOT NULL,
        clauseSnapshotId TEXT NOT NULL,
        draftCode TEXT NOT NULL,
        requirementText TEXT NOT NULL,
        requirementType TEXT NOT NULL DEFAULT 'OTHER',
        applicability TEXT NOT NULL DEFAULT 'Berlaku',
        frequency TEXT,
        criticality TEXT NOT NULL DEFAULT 'Sedang',
        rationale TEXT,
        confidence TEXT NOT NULL DEFAULT 'LOW',
        status TEXT NOT NULL DEFAULT 'PENDING',
        acceptedObligationId TEXT,
        aiProvider TEXT,
        aiModel TEXT,
        aiRequestId TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_clause_draft_unique
        ON RegulatoryClauseDraft(institutionId, sourceVersionId, clauseSnapshotId, draftCode);
      CREATE INDEX IF NOT EXISTS idx_reg_clause_draft_status
        ON RegulatoryClauseDraft(institutionId, regulationId, status, updatedAt);

      CREATE TABLE IF NOT EXISTS RegulatoryClauseImpactDraft (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        clauseDraftId TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        impactType TEXT NOT NULL,
        rationale TEXT,
        confidence TEXT NOT NULL DEFAULT 'LOW',
        status TEXT NOT NULL DEFAULT 'PENDING',
        reviewedBy TEXT,
        reviewedAt TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_clause_impact_unique
        ON RegulatoryClauseImpactDraft(institutionId, clauseDraftId, targetType, targetId, impactType);
      CREATE INDEX IF NOT EXISTS idx_reg_clause_impact_status
        ON RegulatoryClauseImpactDraft(institutionId, clauseDraftId, status);
    `);

    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

async function regulationExists(db: D1DatabaseLike, institutionId: string, regulationId: string) {
  return Boolean(await db.prepare(`
    SELECT id FROM ExternalRegulationWatch
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(regulationId, institutionId).first<{ id: string }>());
}

async function sourceDocument(db: D1DatabaseLike, institutionId: string, sourceDocumentId: string) {
  return db.prepare(`
    SELECT id,title,mimeType,textLength,textSha256,sourceUrl,sourceModifiedAt,status
    FROM SourceDocument
    WHERE id = ? AND institutionId = ? AND status = 'Active'
    LIMIT 1
  `).bind(sourceDocumentId, institutionId).first<Record<string, unknown>>();
}

export async function linkRegulationSourceVersion(
  institutionId: string,
  input: {
    regulationId: string;
    sourceDocumentId: string;
    versionLabel: string;
    sourceDate?: string | null;
    effectiveDate?: string | null;
    isCurrent?: boolean;
  },
  actorName: string
) {
  const db = await ensureRegulatoryClauseSchema();
  const regulationId = String(input.regulationId || '').trim();
  const sourceDocumentId = String(input.sourceDocumentId || '').trim();
  const versionLabel = String(input.versionLabel || '').trim();

  if (!regulationId || !sourceDocumentId || !versionLabel) {
    throw new Error('REG_CLAUSE_SOURCE_REQUIRED');
  }
  if (!(await regulationExists(db, institutionId, regulationId))) {
    throw new Error('REG_CLAUSE_REGULATION_NOT_FOUND');
  }

  const source = await sourceDocument(db, institutionId, sourceDocumentId);
  if (!source) throw new Error('REG_CLAUSE_SOURCE_NOT_FOUND');
  if (Number(source.textLength || 0) <= 0) throw new Error('REG_CLAUSE_SOURCE_TEXT_REQUIRED');

  const now = nowIso();
  const existing = await db.prepare(`
    SELECT id FROM RegulationSourceVersion
    WHERE institutionId = ? AND regulationId = ? AND sourceDocumentId = ?
    LIMIT 1
  `).bind(institutionId, regulationId, sourceDocumentId).first<{ id: string }>();
  const id = existing?.id || crypto.randomUUID();
  const isCurrent = input.isCurrent !== false ? 1 : 0;

  if (isCurrent) {
    await db.prepare(`
      UPDATE RegulationSourceVersion
      SET isCurrent = 0, updatedAt = ?
      WHERE institutionId = ? AND regulationId = ?
    `).bind(now, institutionId, regulationId).run();
  }

  if (existing) {
    await db.prepare(`
      UPDATE RegulationSourceVersion
      SET versionLabel = ?, sourceDate = ?, effectiveDate = ?, isCurrent = ?,
          linkedBy = ?, updatedAt = ?
      WHERE id = ? AND institutionId = ?
    `).bind(
      versionLabel,
      normalizeDate(input.sourceDate),
      normalizeDate(input.effectiveDate),
      isCurrent,
      actorName,
      now,
      id,
      institutionId
    ).run();
  } else {
    await db.prepare(`
      INSERT INTO RegulationSourceVersion (
        id,institutionId,regulationId,sourceDocumentId,versionLabel,sourceDate,
        effectiveDate,isCurrent,linkedBy,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      institutionId,
      regulationId,
      sourceDocumentId,
      versionLabel,
      normalizeDate(input.sourceDate),
      normalizeDate(input.effectiveDate),
      isCurrent,
      actorName,
      now,
      now
    ).run();
  }

  return db.prepare(`
    SELECT id,institutionId,regulationId,sourceDocumentId,versionLabel,sourceDate,
           effectiveDate,isCurrent,linkedBy,createdAt,updatedAt
    FROM RegulationSourceVersion
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(id, institutionId).first<RegulationSourceVersion>();
}

function normalizeClauseKey(value: string) {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9 .()/-]/g, '')
    .trim();
}

function splitArticleClauses(text: string) {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

  const matches = Array.from(
    normalized.matchAll(/(?:^|\n)\s*(PASAL\s+\d+[A-Z]?(?:\s*[A-Z]*)?)(?=\s|\n)/gi)
  );

  if (!matches.length) return [];

  const clauses: Array<{ key: string; title: string; text: string; orderIndex: number }> = [];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const start = current.index || 0;
    const end = next?.index ?? normalized.length;
    const block = normalized.slice(start, end).trim();
    const title = String(current[1] || '').replace(/\s+/g, ' ').trim();
    if (!title || block.length < 12) continue;
    clauses.push({
      key: normalizeClauseKey(title),
      title,
      text: block.slice(0, 12000),
      orderIndex: clauses.length
    });
  }
  return clauses;
}

async function readSourceText(
  db: D1DatabaseLike,
  institutionId: string,
  sourceDocumentId: string
) {
  const chunks = await db.prepare(`
    SELECT chunkIndex,textContent
    FROM SourceTextChunk
    WHERE documentId = ? AND institutionId = ?
    ORDER BY chunkIndex ASC
    LIMIT 80
  `).bind(sourceDocumentId, institutionId).all<{ chunkIndex: number; textContent: string }>();

  const rows = chunks.results || [];
  if (!rows.length) throw new Error('REG_CLAUSE_SOURCE_TEXT_REQUIRED');

  let text = '';
  for (const row of rows) {
    if (text.length >= 900000) break;
    text += String(row.textContent || '').slice(0, Math.max(0, 900000 - text.length));
  }
  if (!text.trim()) throw new Error('REG_CLAUSE_SOURCE_TEXT_REQUIRED');
  return text;
}

export async function buildRegulatoryClauseSnapshot(
  institutionId: string,
  sourceVersionId: string
) {
  const db = await ensureRegulatoryClauseSchema();
  const version = await db.prepare(`
    SELECT id,sourceDocumentId
    FROM RegulationSourceVersion
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(sourceVersionId, institutionId).first<{ id: string; sourceDocumentId: string }>();
  if (!version) throw new Error('REG_CLAUSE_SOURCE_VERSION_NOT_FOUND');

  const text = await readSourceText(db, institutionId, version.sourceDocumentId);
  const clauses = splitArticleClauses(text);
  if (!clauses.length) throw new Error('REG_CLAUSE_ARTICLES_NOT_FOUND');

  await db.prepare(`
    DELETE FROM RegulatoryClauseSnapshot
    WHERE sourceVersionId = ? AND institutionId = ?
  `).bind(sourceVersionId, institutionId).run();

  const now = nowIso();
  for (const clause of clauses.slice(0, 500)) {
    await db.prepare(`
      INSERT INTO RegulatoryClauseSnapshot (
        id,institutionId,sourceVersionId,clauseKey,clauseTitle,clauseText,textHash,orderIndex,createdAt
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      crypto.randomUUID(),
      institutionId,
      sourceVersionId,
      clause.key,
      clause.title,
      clause.text,
      await sha256(clause.text.normalize('NFKC').replace(/\s+/g, ' ').trim()),
      clause.orderIndex,
      now
    ).run();
  }

  return listClauseSnapshots(institutionId, sourceVersionId);
}

export async function listClauseSnapshots(institutionId: string, sourceVersionId: string) {
  const db = await ensureRegulatoryClauseSchema();
  const result = await db.prepare(`
    SELECT id,institutionId,sourceVersionId,clauseKey,clauseTitle,clauseText,textHash,orderIndex,createdAt
    FROM RegulatoryClauseSnapshot
    WHERE institutionId = ? AND sourceVersionId = ?
    ORDER BY orderIndex ASC
    LIMIT 500
  `).bind(institutionId, sourceVersionId).all<RegulatoryClauseSnapshot>();
  return result.results || [];
}

export async function compareRegulationSourceVersions(
  institutionId: string,
  olderSourceVersionId: string,
  newerSourceVersionId: string
) {
  const db = await ensureRegulatoryClauseSchema();
  const versions = await db.prepare(`
    SELECT id,regulationId,versionLabel
    FROM RegulationSourceVersion
    WHERE institutionId = ? AND id IN (?, ?)
  `).bind(institutionId, olderSourceVersionId, newerSourceVersionId)
    .all<{ id: string; regulationId: string; versionLabel: string }>();
  const rows = versions.results || [];
  if (rows.length !== 2) throw new Error('REG_CLAUSE_SOURCE_VERSION_NOT_FOUND');
  if (rows[0].regulationId !== rows[1].regulationId) {
    throw new Error('REG_CLAUSE_VERSION_REGULATION_MISMATCH');
  }

  let older = await listClauseSnapshots(institutionId, olderSourceVersionId);
  let newer = await listClauseSnapshots(institutionId, newerSourceVersionId);
  if (!older.length) older = await buildRegulatoryClauseSnapshot(institutionId, olderSourceVersionId);
  if (!newer.length) newer = await buildRegulatoryClauseSnapshot(institutionId, newerSourceVersionId);

  const oldMap = new Map(older.map(item => [item.clauseKey, item]));
  const newMap = new Map(newer.map(item => [item.clauseKey, item]));
  const keys = new Set([...oldMap.keys(), ...newMap.keys()]);

  const changes = Array.from(keys).map(key => {
    const before = oldMap.get(key) || null;
    const after = newMap.get(key) || null;
    const changeType = !before ? 'ADDED' : !after ? 'REMOVED' :
      before.textHash === after.textHash ? 'UNCHANGED' : 'CHANGED';
    return {
      clauseKey: key,
      changeType,
      before,
      after
    };
  });

  return {
    older: rows.find(item => item.id === olderSourceVersionId),
    newer: rows.find(item => item.id === newerSourceVersionId),
    metrics: {
      added: changes.filter(item => item.changeType === 'ADDED').length,
      changed: changes.filter(item => item.changeType === 'CHANGED').length,
      removed: changes.filter(item => item.changeType === 'REMOVED').length,
      unchanged: changes.filter(item => item.changeType === 'UNCHANGED').length
    },
    changes
  };
}

function parseJsonObject(raw: string) {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) throw new Error('REG_CLAUSE_AI_INVALID_JSON');
  const parsed = JSON.parse(match[0]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('REG_CLAUSE_AI_INVALID_JSON');
  }
  return parsed as Record<string, unknown>;
}

function confidence(value: unknown) {
  const normalized = String(value || '').toUpperCase();
  return ['LOW', 'MEDIUM', 'HIGH'].includes(normalized) ? normalized : 'LOW';
}

function targetType(value: unknown) {
  const normalized = String(value || '').toUpperCase();
  return ['INTERNAL_POLICY', 'PROCESS', 'CONTROL'].includes(normalized) ? normalized : null;
}

export async function analyzeRegulatoryClauses(
  institutionId: string,
  input: { regulationId: string; sourceVersionId: string },
  actorName: string
) {
  const db = await ensureRegulatoryClauseSchema();
  const regulationId = String(input.regulationId || '').trim();
  const sourceVersionId = String(input.sourceVersionId || '').trim();

  const version = await db.prepare(`
    SELECT id,regulationId,versionLabel,sourceDocumentId
    FROM RegulationSourceVersion
    WHERE id = ? AND regulationId = ? AND institutionId = ?
    LIMIT 1
  `).bind(sourceVersionId, regulationId, institutionId)
    .first<{ id: string; regulationId: string; versionLabel: string; sourceDocumentId: string }>();
  if (!version) throw new Error('REG_CLAUSE_SOURCE_VERSION_NOT_FOUND');

  let clauses = await listClauseSnapshots(institutionId, sourceVersionId);
  if (!clauses.length) clauses = await buildRegulatoryClauseSnapshot(institutionId, sourceVersionId);
  if (!clauses.length) throw new Error('REG_CLAUSE_ARTICLES_NOT_FOUND');

  const runId = crypto.randomUUID();
  const startedAt = nowIso();
  await db.prepare(`
    INSERT INTO RegulatoryClauseAnalysisRun (
      id,institutionId,regulationId,sourceVersionId,status,clauseCount,draftCount,
      impactCount,provider,model,requestId,errorCode,startedBy,startedAt,completedAt
    ) VALUES (?,?,?,?, 'RUNNING', ?,0,0,NULL,NULL,NULL,NULL,?,?,NULL)
  `).bind(
    runId,
    institutionId,
    regulationId,
    sourceVersionId,
    clauses.length,
    actorName,
    startedAt
  ).run();

  try {
    const [regulation, policies, processes, controls] = await Promise.all([
      db.prepare(`
        SELECT id,regulator,regulationCode,title,category,effectiveDate
        FROM ExternalRegulationWatch
        WHERE id = ? AND institutionId = ?
        LIMIT 1
      `).bind(regulationId, institutionId).first<Record<string, unknown>>(),
      db.prepare(`
        SELECT id,documentCode,documentType,title,ownerUnit,status
        FROM PolicyDocument
        WHERE institutionId = ? AND status != 'Dicabut'
        ORDER BY updatedAt DESC
        LIMIT 160
      `).bind(institutionId).all<Record<string, unknown>>(),
      db.prepare(`
        SELECT id,processId,name,ownerName,criticality,status
        FROM BusinessProcess
        WHERE institutionId = ?
        ORDER BY updatedAt DESC
        LIMIT 160
      `).bind(institutionId).all<Record<string, unknown>>(),
      db.prepare(`
        SELECT id,controlId,name,controlOwner,frequency,isKeyControl,status
        FROM ControlMaster
        WHERE institutionId = ?
        ORDER BY updatedAt DESC
        LIMIT 200
      `).bind(institutionId).all<Record<string, unknown>>()
    ]);

    const clausePayload = clauses.slice(0, 80).map(item => ({
      clauseSnapshotId: item.id,
      clauseKey: item.clauseKey,
      clauseTitle: item.clauseTitle,
      clauseText: item.clauseText.slice(0, 3500)
    }));

    const ai = await runAiGateway({
      task: 'classification',
      feature: 'regulatory_clause_intelligence',
      sensitivity: 'confidential',
      institutionId,
      requireJson: true,
      temperature: 0.1,
      maxOutputTokens: 7000,
      systemPrompt:
        'Anda adalah Regulatory Compliance Analyst bank Indonesia. ' +
        'Gunakan HANYA pasal/klausul yang diberikan. Jangan menciptakan pasal, angka, kewajiban, atau fakta. ' +
        'Jika klausul bukan kewajiban operasional Bank, jangan buat obligation. ' +
        'Impact mapping adalah usulan awal yang wajib divalidasi Tim Kepatuhan. Kembalikan JSON valid saja.',
      prompt: JSON.stringify({
        instruction:
          'Ekstrak draft kewajiban yang benar-benar didukung teks klausul. ' +
          'Setiap draft wajib menunjuk clauseSnapshotId. Buat impact suggestion hanya jika target metadata relevan. ' +
          'Jangan membuat target id yang tidak tersedia.',
        regulation,
        versionLabel: version.versionLabel,
        clauses: clausePayload,
        internalTargets: {
          policies: policies.results || [],
          processes: processes.results || [],
          controls: controls.results || []
        },
        outputSchema: {
          obligations: [{
            clauseSnapshotId: 'string',
            requirementText: 'string',
            requirementType: 'GOVERNANCE|REPORTING|PROCESS|CONTROL|PRUDENTIAL|AML_CFT|CONDUCT|DATA_PRIVACY|IT_CYBER|OTHER',
            applicability: 'string',
            frequency: 'string|null',
            criticality: 'Rendah|Sedang|Tinggi|Kritis',
            rationale: 'string',
            confidence: 'LOW|MEDIUM|HIGH',
            impacts: [{
              targetType: 'INTERNAL_POLICY|PROCESS|CONTROL',
              targetId: 'string',
              impactType: 'REVIEW_REQUIRED|CHANGE_REQUIRED|RELATED|CONTROL_EVIDENCE',
              rationale: 'string',
              confidence: 'LOW|MEDIUM|HIGH'
            }]
          }]
        }
      })
    });

    const parsed = parseJsonObject(ai.text);
    const obligations = Array.isArray(parsed.obligations)
      ? parsed.obligations.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>
      : [];

    const validClauseIds = new Set(clauses.map(item => item.id));
    const validTargets = new Map<string, Set<string>>([
      ['INTERNAL_POLICY', new Set((policies.results || []).map(item => String(item.id)))],
      ['PROCESS', new Set((processes.results || []).map(item => String(item.id)))],
      ['CONTROL', new Set((controls.results || []).map(item => String(item.id)))]
    ]);

    await db.prepare(`
      DELETE FROM RegulatoryClauseImpactDraft
      WHERE institutionId = ? AND clauseDraftId IN (
        SELECT id FROM RegulatoryClauseDraft
        WHERE institutionId = ? AND sourceVersionId = ? AND status = 'PENDING'
      )
    `).bind(institutionId, institutionId, sourceVersionId).run();
    await db.prepare(`
      DELETE FROM RegulatoryClauseDraft
      WHERE institutionId = ? AND sourceVersionId = ? AND status = 'PENDING'
    `).bind(institutionId, sourceVersionId).run();

    let draftCount = 0;
    let impactCount = 0;
    const now = nowIso();

    for (const item of obligations.slice(0, 80)) {
      const clauseSnapshotId = String(item.clauseSnapshotId || '').trim();
      const requirementText = String(item.requirementText || '').trim();
      if (!validClauseIds.has(clauseSnapshotId) || requirementText.length < 8) continue;

      const id = crypto.randomUUID();
      const draftCode = 'DRAFT-' + id.slice(0, 8).toUpperCase();
      await db.prepare(`
        INSERT INTO RegulatoryClauseDraft (
          id,institutionId,regulationId,sourceVersionId,clauseSnapshotId,draftCode,
          requirementText,requirementType,applicability,frequency,criticality,rationale,
          confidence,status,acceptedObligationId,aiProvider,aiModel,aiRequestId,
          createdBy,createdAt,updatedAt
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',NULL,?,?,?,?,?,?,?)
      `).bind(
        id,
        institutionId,
        regulationId,
        sourceVersionId,
        clauseSnapshotId,
        draftCode,
        requirementText,
        clean(item.requirementType) || 'OTHER',
        clean(item.applicability) || 'Berlaku',
        clean(item.frequency),
        clean(item.criticality) || 'Sedang',
        clean(item.rationale),
        confidence(item.confidence),
        ai.provider,
        ai.model,
        ai.requestId,
        actorName,
        now,
        now
      ).run();
      draftCount += 1;

      const impacts = Array.isArray(item.impacts)
        ? item.impacts.filter(value => value && typeof value === 'object') as Array<Record<string, unknown>>
        : [];
      for (const impact of impacts.slice(0, 20)) {
        const type = targetType(impact.targetType);
        const targetId = String(impact.targetId || '').trim();
        if (!type || !targetId || !validTargets.get(type)?.has(targetId)) continue;

        try {
          await db.prepare(`
            INSERT INTO RegulatoryClauseImpactDraft (
              id,institutionId,clauseDraftId,targetType,targetId,impactType,rationale,
              confidence,status,reviewedBy,reviewedAt,createdAt
            ) VALUES (?,?,?,?,?,?,?,?, 'PENDING',NULL,NULL,?)
          `).bind(
            crypto.randomUUID(),
            institutionId,
            id,
            type,
            targetId,
            clean(impact.impactType) || 'RELATED',
            clean(impact.rationale),
            confidence(impact.confidence),
            now
          ).run();
          impactCount += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : '';
          if (!message.includes('unique')) throw error;
        }
      }
    }

    await db.prepare(`
      UPDATE RegulatoryClauseAnalysisRun
      SET status = 'PASS', draftCount = ?, impactCount = ?, provider = ?, model = ?,
          requestId = ?, completedAt = ?
      WHERE id = ? AND institutionId = ?
    `).bind(
      draftCount,
      impactCount,
      ai.provider,
      ai.model,
      ai.requestId,
      nowIso(),
      runId,
      institutionId
    ).run();

    return { runId, draftCount, impactCount, provider: ai.provider, model: ai.model };
  } catch (error) {
    await db.prepare(`
      UPDATE RegulatoryClauseAnalysisRun
      SET status = 'FAIL', errorCode = ?, completedAt = ?
      WHERE id = ? AND institutionId = ?
    `).bind(
      (error instanceof Error ? error.message : 'UNKNOWN').slice(0, 200),
      nowIso(),
      runId,
      institutionId
    ).run();
    throw error;
  }
}

export async function reviewClauseImpactDraft(
  institutionId: string,
  impactId: string,
  decision: 'APPROVE' | 'REJECT',
  actorName: string
) {
  const db = await ensureRegulatoryClauseSchema();
  const record = await db.prepare(`
    SELECT id,status FROM RegulatoryClauseImpactDraft
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(impactId, institutionId).first<{ id: string; status: string }>();
  if (!record) throw new Error('REG_CLAUSE_IMPACT_NOT_FOUND');
  if (record.status !== 'PENDING') throw new Error('REG_CLAUSE_IMPACT_NOT_PENDING');

  await db.prepare(`
    UPDATE RegulatoryClauseImpactDraft
    SET status = ?, reviewedBy = ?, reviewedAt = ?
    WHERE id = ? AND institutionId = ?
  `).bind(
    decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    actorName,
    nowIso(),
    impactId,
    institutionId
  ).run();

  return { id: impactId, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED' };
}

export async function reviewRegulatoryClauseDraft(
  institutionId: string,
  draftId: string,
  decision: 'ACCEPT' | 'REJECT',
  actorName: string
) {
  const db = await ensureRegulatoryClauseSchema();
  const draft = await db.prepare(`
    SELECT id,regulationId,sourceVersionId,clauseSnapshotId,draftCode,requirementText,
           requirementType,applicability,frequency,criticality,rationale,confidence,status
    FROM RegulatoryClauseDraft
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(draftId, institutionId).first<RegulatoryClauseDraft>();
  if (!draft) throw new Error('REG_CLAUSE_DRAFT_NOT_FOUND');
  if (draft.status !== 'PENDING') throw new Error('REG_CLAUSE_DRAFT_NOT_PENDING');

  if (decision === 'REJECT') {
    await db.prepare(`
      UPDATE RegulatoryClauseDraft
      SET status = 'REJECTED', updatedAt = ?
      WHERE id = ? AND institutionId = ?
    `).bind(nowIso(), draftId, institutionId).run();
    return { draftId, status: 'REJECTED', obligation: null };
  }

  const [clause, regulation] = await Promise.all([
    db.prepare(`
      SELECT clauseTitle FROM RegulatoryClauseSnapshot
      WHERE id = ? AND institutionId = ?
      LIMIT 1
    `).bind(draft.clauseSnapshotId, institutionId).first<{ clauseTitle: string }>(),
    db.prepare(`
      SELECT regulationCode FROM ExternalRegulationWatch
      WHERE id = ? AND institutionId = ?
      LIMIT 1
    `).bind(draft.regulationId, institutionId).first<{ regulationCode: string }>()
  ]);
  if (!clause || !regulation) throw new Error('REG_CLAUSE_SOURCE_CONTEXT_MISSING');

  const safeRegCode = String(regulation.regulationCode || 'REG')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  const obligationCode = 'OBL-' + safeRegCode + '-' + draft.id.slice(0, 6).toUpperCase();

  const obligation = await createRegulatoryObligation(
    institutionId,
    {
      regulationId: draft.regulationId,
      obligationCode,
      sourceArticle: clause.clauseTitle,
      requirementText: draft.requirementText,
      requirementType: draft.requirementType,
      applicability: draft.applicability,
      frequency: draft.frequency,
      criticality: draft.criticality,
      status: 'Draft',
      notes: draft.rationale
    },
    actorName
  );

  const approved = await db.prepare(`
    SELECT id,targetType,targetId,impactType,rationale
    FROM RegulatoryClauseImpactDraft
    WHERE clauseDraftId = ? AND institutionId = ? AND status = 'APPROVED'
    ORDER BY createdAt ASC
  `).bind(draftId, institutionId).all<Record<string, unknown>>();

  for (const impact of approved.results || []) {
    const type = String(impact.targetType || '');
    if (!['INTERNAL_POLICY', 'PROCESS', 'CONTROL'].includes(type)) continue;
    try {
      await createRegulatoryObligationLink(
        institutionId,
        {
          obligationId: String(obligation?.id || ''),
          targetType: type,
          targetId: String(impact.targetId || ''),
          relationship:
            type === 'INTERNAL_POLICY' ? 'IMPLEMENTED_BY' :
            type === 'PROCESS' ? 'APPLIES_TO' : 'SATISFIED_BY',
          rationale: String(impact.rationale || impact.impactType || '')
        },
        actorName
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message !== 'REG_OBLIGATION_LINK_DUPLICATE') throw error;
    }
  }

  await db.prepare(`
    UPDATE RegulatoryClauseDraft
    SET status = 'ACCEPTED', acceptedObligationId = ?, updatedAt = ?
    WHERE id = ? AND institutionId = ?
  `).bind(
    String(obligation?.id || ''),
    nowIso(),
    draftId,
    institutionId
  ).run();

  return { draftId, status: 'ACCEPTED', obligation };
}

export async function getRegulatoryClauseWorkspace(institutionId: string) {
  const db = await ensureRegulatoryClauseSchema();
  const [
    regulations,
    sources,
    sourceVersions,
    snapshots,
    drafts,
    impacts,
    runs
  ] = await Promise.all([
    db.prepare(`
      SELECT id,regulator,regulationCode,title,category,issueDate,effectiveDate,status,sourceUrl
      FROM ExternalRegulationWatch
      WHERE institutionId = ?
      ORDER BY COALESCE(issueDate,createdAt) DESC, updatedAt DESC
      LIMIT 1000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,title,mimeType,sourceUrl,sourceModifiedAt,module,textLength,textSha256,updatedAt
      FROM SourceDocument
      WHERE institutionId = ? AND status = 'Active' AND textLength > 0
      ORDER BY updatedAt DESC
      LIMIT 1000
    `).bind(institutionId).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT id,institutionId,regulationId,sourceDocumentId,versionLabel,sourceDate,
             effectiveDate,isCurrent,linkedBy,createdAt,updatedAt
      FROM RegulationSourceVersion
      WHERE institutionId = ?
      ORDER BY regulationId ASC,isCurrent DESC,COALESCE(sourceDate,createdAt) DESC
      LIMIT 3000
    `).bind(institutionId).all<RegulationSourceVersion>(),
    db.prepare(`
      SELECT id,institutionId,sourceVersionId,clauseKey,clauseTitle,clauseText,textHash,orderIndex,createdAt
      FROM RegulatoryClauseSnapshot
      WHERE institutionId = ?
      ORDER BY sourceVersionId ASC,orderIndex ASC
      LIMIT 10000
    `).bind(institutionId).all<RegulatoryClauseSnapshot>(),
    db.prepare(`
      SELECT id,institutionId,regulationId,sourceVersionId,clauseSnapshotId,draftCode,
             requirementText,requirementType,applicability,frequency,criticality,rationale,
             confidence,status,acceptedObligationId,aiProvider,aiModel,aiRequestId,
             createdBy,createdAt,updatedAt
      FROM RegulatoryClauseDraft
      WHERE institutionId = ?
      ORDER BY CASE status WHEN 'PENDING' THEN 0 WHEN 'ACCEPTED' THEN 1 ELSE 2 END,updatedAt DESC
      LIMIT 5000
    `).bind(institutionId).all<RegulatoryClauseDraft>(),
    db.prepare(`
      SELECT id,institutionId,clauseDraftId,targetType,targetId,impactType,rationale,
             confidence,status,reviewedBy,reviewedAt,createdAt
      FROM RegulatoryClauseImpactDraft
      WHERE institutionId = ?
      ORDER BY createdAt DESC
      LIMIT 10000
    `).bind(institutionId).all<RegulatoryClauseImpactDraft>(),
    db.prepare(`
      SELECT id,regulationId,sourceVersionId,status,clauseCount,draftCount,impactCount,
             provider,model,requestId,errorCode,startedBy,startedAt,completedAt
      FROM RegulatoryClauseAnalysisRun
      WHERE institutionId = ?
      ORDER BY startedAt DESC
      LIMIT 200
    `).bind(institutionId).all<Record<string, unknown>>()
  ]);

  const sourceVersionRows = sourceVersions.results || [];
  const draftRows = drafts.results || [];
  const impactRows = impacts.results || [];

  return {
    metrics: {
      linkedVersions: sourceVersionRows.length,
      currentVersions: sourceVersionRows.filter(item => item.isCurrent === 1).length,
      clauses: (snapshots.results || []).length,
      pendingDrafts: draftRows.filter(item => item.status === 'PENDING').length,
      acceptedDrafts: draftRows.filter(item => item.status === 'ACCEPTED').length,
      pendingImpacts: impactRows.filter(item => item.status === 'PENDING').length
    },
    regulations: regulations.results || [],
    sources: sources.results || [],
    sourceVersions: sourceVersionRows,
    snapshots: snapshots.results || [],
    drafts: draftRows,
    impacts: impactRows,
    runs: runs.results || []
  };
}
