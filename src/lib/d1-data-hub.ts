import { getCloudflareContext } from '@opennextjs/cloudflare';

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    run: () => Promise<unknown>;
  };
};

export type DataHubRecordFilter = {
  page?: number;
  pageSize?: number;
  recordType?: string;
  sourceRole?: string;
  batch?: string;
  quality?: string;
  mapping?: string;
  query?: string;
};

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('DATA_HUB_DATABASE_UNAVAILABLE');
  return db;
}

async function ensureDataHubSchema(db: D1DatabaseLike) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS SourceDataQuality (
      recordId TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      completenessStatus TEXT NOT NULL,
      completenessScore INTEGER NOT NULL DEFAULT 0,
      missingFieldsJson TEXT,
      mappingStatus TEXT NOT NULL,
      targetModule TEXT,
      targetHref TEXT,
      issueCode TEXT,
      evaluatedAt TEXT NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_source_quality_institution
    ON SourceDataQuality(institutionId, completenessStatus, mappingStatus)
  `).run();
}

function safeJson(value: string | null | undefined) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function normalizeTitle(title: string) {
  return title.normalize('NFKC').toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^salinan\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
}

export async function getDataHubSummary(institutionId: string) {
  const db = await getDb();
  await ensureDataHubSchema(db);

  const totals = await db.prepare(`
    SELECT
      COUNT(*) AS structuredRecords,
      COUNT(DISTINCT sr.sourceDocumentId) AS normalizedSourceDocuments,
      SUM(CASE WHEN q.completenessStatus='INCOMPLETE' THEN 1 ELSE 0 END) AS incompleteRecords,
      SUM(CASE WHEN q.completenessStatus='PARTIAL' THEN 1 ELSE 0 END) AS partialRecords,
      SUM(CASE WHEN q.completenessStatus='UNIDENTIFIED_FORMAT' THEN 1 ELSE 0 END) AS unidentifiedRecords,
      SUM(CASE WHEN q.mappingStatus IN ('NEEDS_MAPPING','NEEDS_REVIEW','NEEDS_APPROVAL') THEN 1 ELSE 0 END) AS actionRequiredRecords,
      SUM(CASE WHEN q.recordId IS NULL THEN 1 ELSE 0 END) AS unevaluatedRecords
    FROM SourceStructuredRecord sr
    LEFT JOIN SourceDataQuality q ON q.recordId=sr.id
    WHERE sr.institutionId=? AND sr.status='Active'
  `).bind(institutionId).first<Record<string, unknown>>();

  const documents = await db.prepare(`
    SELECT
      COUNT(*) AS sourceDocuments,
      SUM(CASE WHEN json_extract(metadataJson,'$.sourceRole')='BASELINE' THEN 1 ELSE 0 END) AS baselineDocuments,
      SUM(CASE WHEN json_extract(metadataJson,'$.sourceRole')='UPDATE' THEN 1 ELSE 0 END) AS updateDocuments,
      SUM(CASE WHEN rawSizeBytes>0 THEN 1 ELSE 0 END) AS withRaw,
      SUM(CASE WHEN textLength>0 THEN 1 ELSE 0 END) AS withIndexedText
    FROM SourceDocument
    WHERE institutionId=? AND status='Active'
  `).bind(institutionId).first<Record<string, unknown>>();

  const byType = await db.prepare(`
    SELECT
      sr.recordType,
      COUNT(*) AS records,
      SUM(CASE WHEN q.completenessStatus='COMPLETE' THEN 1 ELSE 0 END) AS completeRecords,
      SUM(CASE WHEN q.completenessStatus='PARTIAL' THEN 1 ELSE 0 END) AS partialRecords,
      SUM(CASE WHEN q.completenessStatus='INCOMPLETE' THEN 1 ELSE 0 END) AS incompleteRecords,
      SUM(CASE WHEN q.completenessStatus='UNIDENTIFIED_FORMAT' THEN 1 ELSE 0 END) AS unidentifiedRecords,
      SUM(CASE WHEN q.mappingStatus IN ('NEEDS_MAPPING','NEEDS_REVIEW','NEEDS_APPROVAL') THEN 1 ELSE 0 END) AS actionRequired
    FROM SourceStructuredRecord sr
    LEFT JOIN SourceDataQuality q ON q.recordId=sr.id
    WHERE sr.institutionId=? AND sr.status='Active'
    GROUP BY sr.recordType
    ORDER BY records DESC, sr.recordType ASC
  `).bind(institutionId).all<Record<string, unknown>>();

  const batches = await db.prepare(`
    SELECT batchCode,sourceRole,precedencePriority,totalDocuments,processedDocuments,totalRecords,status,completedAt
    FROM SourceNormalizationRun
    WHERE institutionId=?
    ORDER BY completedAt DESC
  `).bind(institutionId).all<Record<string, unknown>>();

  return {
    totals: { ...(totals || {}), ...(documents || {}) },
    byType: byType.results || [],
    batches: batches.results || []
  };
}

export async function listDataHubRecords(institutionId: string, filter: DataHubRecordFilter) {
  const db = await getDb();
  await ensureDataHubSchema(db);

  const page = Math.max(1, Number(filter.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(filter.pageSize || 50)));
  const conditions = ["sr.institutionId=?", "sr.status='Active'"];
  const params: unknown[] = [institutionId];

  if (filter.recordType) { conditions.push('sr.recordType=?'); params.push(filter.recordType); }
  if (filter.sourceRole) { conditions.push('sr.sourceRole=?'); params.push(filter.sourceRole); }
  if (filter.batch) { conditions.push('sr.normalizationBatch=?'); params.push(filter.batch); }
  if (filter.quality) {
    if (filter.quality === 'NOT_EVALUATED') conditions.push('q.recordId IS NULL');
    else { conditions.push('q.completenessStatus=?'); params.push(filter.quality); }
  }
  if (filter.mapping) { conditions.push('q.mappingStatus=?'); params.push(filter.mapping); }
  if (filter.query) {
    conditions.push("(LOWER(sr.recordKey) LIKE ? OR LOWER(COALESCE(sr.recordTitle,'')) LIKE ? OR LOWER(COALESCE(d.title,'')) LIKE ?)");
    const term = '%' + filter.query.trim().toLowerCase() + '%';
    params.push(term, term, term);
  }

  const where = conditions.join(' AND ');
  const count = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM SourceStructuredRecord sr
    JOIN SourceDocument d ON d.id=sr.sourceDocumentId
    LEFT JOIN SourceDataQuality q ON q.recordId=sr.id
    WHERE ${where}
  `).bind(...params).first<{ total: number }>();

  const records = await db.prepare(`
    SELECT
      sr.id,sr.sourceDocumentId,sr.recordType,sr.recordKey,sr.recordTitle,sr.period,sr.payloadJson,
      sr.sourceRole,sr.precedencePriority,sr.sourceModifiedAt,sr.normalizationBatch,sr.createdAt,sr.updatedAt,
      d.title AS sourceTitle,d.module AS sourceModule,d.sourceKind,d.rawSizeBytes,d.textLength,d.metadataJson,
      q.completenessStatus,q.completenessScore,q.missingFieldsJson,q.mappingStatus,
      q.targetModule,q.targetHref,q.issueCode,q.evaluatedAt
    FROM SourceStructuredRecord sr
    JOIN SourceDocument d ON d.id=sr.sourceDocumentId
    LEFT JOIN SourceDataQuality q ON q.recordId=sr.id
    WHERE ${where}
    ORDER BY sr.recordType ASC,sr.recordKey ASC,sr.updatedAt DESC
    LIMIT ? OFFSET ?
  `).bind(...params, pageSize, (page - 1) * pageSize).all<Record<string, unknown>>();

  return {
    page,
    pageSize,
    total: Number(count?.total || 0),
    records: (records.results || []).map(record => ({
      ...record,
      payload: safeJson(String(record.payloadJson || '')),
      sourceMetadata: safeJson(String(record.metadataJson || '')),
      missingFields: safeJson(String(record.missingFieldsJson || '')) || [],
      payloadJson: undefined,
      metadataJson: undefined,
      missingFieldsJson: undefined,
      completenessStatus: record.completenessStatus || 'NOT_EVALUATED',
      mappingStatus: record.mappingStatus || 'NOT_EVALUATED'
    }))
  };
}

export async function getSourceCoverage(institutionId: string) {
  const db = await getDb();
  await ensureDataHubSchema(db);
  const documents = await db.prepare(`
    SELECT
      d.id,d.title,d.module,d.sourceKind,d.rawSizeBytes,d.textLength,d.sourceModifiedAt,d.updatedAt,d.metadataJson,
      COUNT(sr.id) AS structuredRecords,
      SUM(CASE WHEN q.completenessStatus='INCOMPLETE' THEN 1 ELSE 0 END) AS incompleteRecords,
      SUM(CASE WHEN q.completenessStatus='PARTIAL' THEN 1 ELSE 0 END) AS partialRecords,
      SUM(CASE WHEN q.completenessStatus='UNIDENTIFIED_FORMAT' THEN 1 ELSE 0 END) AS unidentifiedRecords
    FROM SourceDocument d
    LEFT JOIN SourceStructuredRecord sr
      ON sr.sourceDocumentId=d.id AND sr.status='Active'
    LEFT JOIN SourceDataQuality q ON q.recordId=sr.id
    WHERE d.institutionId=? AND d.status='Active'
    GROUP BY d.id
    ORDER BY d.updatedAt DESC
  `).bind(institutionId).all<Record<string, unknown>>();

  type SourceCoverageRow = Record<string, unknown> & {
    id: string;
    title: string;
    module?: string | null;
    sourceKind?: string | null;
    rawSizeBytes?: number | null;
    textLength?: number | null;
    structuredRecords?: number | null;
    sourceAccount?: string | null;
    sourceRole?: string | null;
    precedencePriority: number;
    sourceCollection?: string | null;
    logicalKey: string;
  };

  const rows: SourceCoverageRow[] = (documents.results || []).map(row => {
    const metadata = safeJson(String(row.metadataJson || '')) || {};
    return {
      id: String(row.id || ''),
      title: String(row.title || ''),
      module: row.module ? String(row.module) : null,
      sourceKind: row.sourceKind ? String(row.sourceKind) : null,
      rawSizeBytes: Number(row.rawSizeBytes || 0),
      textLength: Number(row.textLength || 0),
      structuredRecords: Number(row.structuredRecords || 0),
      incompleteRecords: Number(row.incompleteRecords || 0),
      partialRecords: Number(row.partialRecords || 0),
      unidentifiedRecords: Number(row.unidentifiedRecords || 0),
      sourceModifiedAt: row.sourceModifiedAt ? String(row.sourceModifiedAt) : null,
      updatedAt: row.updatedAt ? String(row.updatedAt) : null,
      sourceAccount: metadata.sourceAccount ? String(metadata.sourceAccount) : null,
      sourceRole: metadata.sourceRole ? String(metadata.sourceRole) : null,
      precedencePriority: Number(metadata.precedencePriority || 0),
      sourceCollection: metadata.sourceCollection ? String(metadata.sourceCollection) : null,
      logicalKey: [row.sourceKind || '', row.module || '', normalizeTitle(String(row.title || ''))].join(':')
    };
  });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = groups.get(row.logicalKey) || [];
    group.push(row);
    groups.set(row.logicalKey, group);
  }

  return rows.map(row => {
    const peers = groups.get(row.logicalKey) || [];
    const higher = peers
      .filter(peer => peer.id !== row.id && Number(peer.precedencePriority) > Number(row.precedencePriority))
      .sort((a,b) => Number(b.precedencePriority) - Number(a.precedencePriority))[0];
    const richer = peers
      .filter(peer => peer.id !== row.id && (Number(peer.textLength || 0) > Number(row.textLength || 0) || Number(peer.rawSizeBytes || 0) > Number(row.rawSizeBytes || 0)))
      .sort((a,b) => (Number(b.textLength || 0)+Number(b.rawSizeBytes || 0))-(Number(a.textLength || 0)+Number(a.rawSizeBytes || 0)))[0];
    const structured = Number(row.structuredRecords || 0);
    const issues: string[] = [];
    if (!structured) issues.push('NOT_NORMALIZED');
    if (!Number(row.rawSizeBytes || 0)) issues.push('RAW_NOT_STORED');
    if (!Number(row.textLength || 0)) issues.push('TEXT_NOT_INDEXED');
    if (higher) issues.push('HIGHER_PRECEDENCE_SOURCE_AVAILABLE');
    if (richer) issues.push('POTENTIALLY_MORE_COMPLETE_SOURCE');
    return {
      ...row,
      normalizationStatus: structured > 0 ? 'NORMALIZED' : 'NOT_NORMALIZED',
      issues,
      higherPrecedenceSource: higher ? { id: higher.id, title: higher.title, sourceRole: higher.sourceRole, precedencePriority: higher.precedencePriority } : null,
      potentiallyMoreCompleteSource: richer ? { id: richer.id, title: richer.title, textLength: richer.textLength, rawSizeBytes: richer.rawSizeBytes } : null
    };
  });
}
