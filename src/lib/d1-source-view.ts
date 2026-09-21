import { getCloudflareContext } from '@opennextjs/cloudflare';

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
  };
};

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('SOURCE_VIEW_DATABASE_UNAVAILABLE');
  return db;
}

function safeJson(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function getSourceDocumentDetail(
  institutionId: string,
  documentId: string,
  page = 1,
  pageSize = 8
) {
  const db = await getDb();
  const safePage = Math.max(1, Math.trunc(page || 1));
  const safePageSize = Math.max(1, Math.min(20, Math.trunc(pageSize || 8)));

  const document = await db.prepare(`
    SELECT id,institutionId,provider,externalId,parentExternalId,sourceKind,title,mimeType,
           sourceUrl,sourceCreatedAt,sourceModifiedAt,module,sensitivity,rawSizeBytes,
           rawSha256,textLength,textSha256,status,metadataJson,importedAt,updatedAt
    FROM SourceDocument
    WHERE id=? AND institutionId=? AND status='Active'
    LIMIT 1
  `).bind(documentId, institutionId).first<Record<string, unknown>>();

  if (!document) throw new Error('SOURCE_DOCUMENT_NOT_FOUND');

  const count = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM SourceTextChunk
    WHERE documentId=? AND institutionId=?
  `).bind(documentId, institutionId).first<{ total?: number }>();

  const totalChunks = Number(count?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalChunks / safePageSize));
  const boundedPage = Math.min(safePage, totalPages);

  const chunks = await db.prepare(`
    SELECT chunkIndex,charCount,textContent,textSha256,createdAt
    FROM SourceTextChunk
    WHERE documentId=? AND institutionId=?
    ORDER BY chunkIndex ASC
    LIMIT ? OFFSET ?
  `).bind(
    documentId,
    institutionId,
    safePageSize,
    (boundedPage - 1) * safePageSize
  ).all<Record<string, unknown>>();

  const metadata = safeJson(document.metadataJson) || {};
  const rows = chunks.results || [];

  return {
    document: {
      ...document,
      metadataJson: undefined,
      metadata,
      sourceAccount: typeof metadata.sourceAccount === 'string' ? metadata.sourceAccount : null,
      sourceRole: typeof metadata.sourceRole === 'string' ? metadata.sourceRole : null,
      precedencePriority: Number(metadata.precedencePriority || 0)
    },
    text: rows.map(row => String(row.textContent || '')).join(''),
    chunks: rows.map(row => ({
      chunkIndex: Number(row.chunkIndex || 0),
      charCount: Number(row.charCount || 0),
      textSha256: row.textSha256 || null
    })),
    page: boundedPage,
    pageSize: safePageSize,
    totalChunks,
    totalPages,
    hasIndexedText: totalChunks > 0,
    hasRawBytes: Number(document.rawSizeBytes || 0) > 0
  };
}
