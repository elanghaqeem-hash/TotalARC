import { getCloudflareContext } from '@opennextjs/cloudflare';

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

const RAW_CHUNK_BYTES = 144 * 1024;
const TEXT_CHUNK_CHARS = 24_000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

export type SourceLibraryInput = {
  provider: 'GOOGLE_DRIVE' | 'UPLOAD' | 'MIGRATION';
  externalId: string;
  parentExternalId?: string | null;
  sourceKind?: 'ROOT_FILE' | 'ARCHIVE_MEMBER' | 'DERIVED_TEXT';
  title: string;
  mimeType?: string | null;
  sourceUrl?: string | null;
  sourceCreatedAt?: string | null;
  sourceModifiedAt?: string | null;
  module?: string | null;
  sensitivity?: 'Internal' | 'Confidential' | 'Restricted';
  metadata?: Record<string, unknown> | null;
  rawBytes?: Uint8Array | null;
  extractedText?: string | null;
};

export type SourceLibraryRecord = {
  id: string;
  institutionId: string;
  provider: string;
  externalId: string;
  parentExternalId: string | null;
  sourceKind: string;
  title: string;
  mimeType: string | null;
  sourceUrl: string | null;
  sourceCreatedAt: string | null;
  sourceModifiedAt: string | null;
  module: string | null;
  sensitivity: string;
  rawSizeBytes: number;
  rawSha256: string | null;
  textLength: number;
  textSha256: string | null;
  status: string;
  metadataJson: string | null;
  importedAt: string;
  updatedAt: string;
};

export type SourceLibraryViewRecord = SourceLibraryRecord & {
  sourceAccount: string | null;
  sourceRole: string | null;
  precedencePriority: number;
  duplicateKey: string;
};

function sourceMetadata(record: SourceLibraryRecord) {
  if (!record.metadataJson) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(record.metadataJson);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function sourcePriority(record: SourceLibraryRecord) {
  const value = sourceMetadata(record).precedencePriority;
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSourceTitle(title: string) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^salinan\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sourceDuplicateKey(record: SourceLibraryRecord, metadata: Record<string, unknown>) {
  const explicit = String(metadata.sourceLogicalKey || metadata.canonicalSourceKey || '').trim();
  if (explicit) return 'EXPLICIT:' + explicit.toLowerCase();

  const normalizedTitle = normalizeSourceTitle(record.title);
  if (normalizedTitle) {
    return ['TITLE', record.sourceKind, record.module || '', normalizedTitle].join(':');
  }

  if (record.textSha256) return ['TEXT', record.sourceKind, record.textSha256].join(':');
  if (record.rawSha256) return ['RAW', record.sourceKind, record.rawSha256].join(':');
  return ['ID', record.provider, record.externalId].join(':');
}

function toSourceView(record: SourceLibraryRecord): SourceLibraryViewRecord {
  const metadata = sourceMetadata(record);
  return {
    ...record,
    sourceAccount: typeof metadata.sourceAccount === 'string' ? metadata.sourceAccount : null,
    sourceRole: typeof metadata.sourceRole === 'string' ? metadata.sourceRole : null,
    precedencePriority: sourcePriority(record),
    duplicateKey: sourceDuplicateKey(record, metadata)
  };
}

function compareSourcePrecedence(left: SourceLibraryViewRecord, right: SourceLibraryViewRecord) {
  if (left.precedencePriority !== right.precedencePriority) {
    return right.precedencePriority - left.precedencePriority;
  }
  const leftModified = Date.parse(left.sourceModifiedAt || left.updatedAt) || 0;
  const rightModified = Date.parse(right.sourceModifiedAt || right.updatedAt) || 0;
  if (leftModified !== rightModified) return rightModified - leftModified;
  return right.updatedAt.localeCompare(left.updatedAt);
}

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('SOURCE_LIBRARY_DATABASE_UNAVAILABLE');
  return db;
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  const statements = script.split(';').map(statement => statement.trim()).filter(Boolean);
  for (const statement of statements) await db.prepare(statement).run();
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureSourceLibrarySchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = await getDb();
    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS SourceDocument (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        provider TEXT NOT NULL,
        externalId TEXT NOT NULL,
        parentExternalId TEXT,
        sourceKind TEXT NOT NULL DEFAULT 'ROOT_FILE',
        title TEXT NOT NULL,
        mimeType TEXT,
        sourceUrl TEXT,
        sourceCreatedAt TEXT,
        sourceModifiedAt TEXT,
        module TEXT,
        sensitivity TEXT NOT NULL DEFAULT 'Confidential',
        rawSizeBytes INTEGER NOT NULL DEFAULT 0,
        rawSha256 TEXT,
        textLength INTEGER NOT NULL DEFAULT 0,
        textSha256 TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        metadataJson TEXT,
        importedAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_source_document_external
        ON SourceDocument(institutionId, provider, externalId);
      CREATE INDEX IF NOT EXISTS idx_source_document_institution
        ON SourceDocument(institutionId, updatedAt);
      CREATE INDEX IF NOT EXISTS idx_source_document_parent
        ON SourceDocument(institutionId, parentExternalId);
      CREATE INDEX IF NOT EXISTS idx_source_document_module
        ON SourceDocument(institutionId, module);

      CREATE TABLE IF NOT EXISTS SourceBinaryChunk (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        documentId TEXT NOT NULL,
        chunkIndex INTEGER NOT NULL,
        byteLength INTEGER NOT NULL,
        dataBase64 TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_source_binary_chunk
        ON SourceBinaryChunk(documentId, chunkIndex);
      CREATE INDEX IF NOT EXISTS idx_source_binary_document
        ON SourceBinaryChunk(institutionId, documentId);

      CREATE TABLE IF NOT EXISTS SourceTextChunk (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        documentId TEXT NOT NULL,
        chunkIndex INTEGER NOT NULL,
        charCount INTEGER NOT NULL,
        textContent TEXT NOT NULL,
        textSha256 TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_source_text_chunk
        ON SourceTextChunk(documentId, chunkIndex);
      CREATE INDEX IF NOT EXISTS idx_source_text_document
        ON SourceTextChunk(institutionId, documentId);

      CREATE TABLE IF NOT EXISTS SourceImportRun (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        totalItems INTEGER NOT NULL DEFAULT 0,
        importedItems INTEGER NOT NULL DEFAULT 0,
        skippedItems INTEGER NOT NULL DEFAULT 0,
        failedItems INTEGER NOT NULL DEFAULT 0,
        summaryJson TEXT,
        startedAt TEXT NOT NULL,
        completedAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_source_import_run
        ON SourceImportRun(institutionId, startedAt);

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
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function nowIso() {
  return new Date().toISOString();
}

async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value: string) {
  return sha256Bytes(new TextEncoder().encode(value));
}

function bytesToBase64(bytes: Uint8Array) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    result += String.fromCharCode(bytes[index]);
  }
  return btoa(result);
}

async function audit(
  db: D1DatabaseLike,
  institutionId: string,
  action: string,
  recordId: string,
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
    'System Import',
    'System',
    action,
    'SourceDocument',
    recordId,
    null,
    JSON.stringify(newValue),
    reason,
    null,
    nowIso()
  ).run();
}

export async function resolveSourceInstitution(preferredName = 'Bank Kalbar') {
  const db = await ensureSourceLibrarySchema();
  const preferred = await db.prepare(`
    SELECT id, name, legalName, shortName
    FROM Institution
    WHERE LOWER(name) LIKE ? OR LOWER(legalName) LIKE ? OR LOWER(shortName) LIKE ?
    ORDER BY createdAt ASC LIMIT 1
  `).bind(
    '%' + preferredName.toLowerCase() + '%',
    '%' + preferredName.toLowerCase() + '%',
    '%' + preferredName.toLowerCase() + '%'
  ).first<{ id: string; name: string; legalName: string; shortName: string }>();
  if (preferred) return preferred;

  const all = await db.prepare(`
    SELECT id, name, legalName, shortName FROM Institution ORDER BY createdAt ASC LIMIT 2
  `).all<{ id: string; name: string; legalName: string; shortName: string }>();
  const rows = all.results || [];
  if (rows.length === 1) return rows[0];
  if (!rows.length) throw new Error('SOURCE_LIBRARY_INSTITUTION_NOT_FOUND');
  throw new Error('SOURCE_LIBRARY_INSTITUTION_AMBIGUOUS');
}

export async function upsertSourceDocument(
  institutionId: string,
  input: SourceLibraryInput,
  reason = 'Source material imported into Total ARC source library.'
) {
  const db = await ensureSourceLibrarySchema();
  if (!input.externalId.trim() || !input.title.trim()) throw new Error('SOURCE_LIBRARY_REQUIRED_FIELDS');

  const rawBytes = input.rawBytes || null;
  if (rawBytes && rawBytes.byteLength > MAX_SOURCE_BYTES) throw new Error('SOURCE_LIBRARY_FILE_TOO_LARGE');

  const extractedText = input.extractedText?.trim() || '';
  const rawSha256 = rawBytes ? await sha256Bytes(rawBytes) : null;
  const textSha256 = extractedText ? await sha256Text(extractedText) : null;
  const now = nowIso();

  const existing = await db.prepare(`
    SELECT * FROM SourceDocument
    WHERE institutionId = ? AND provider = ? AND externalId = ?
    LIMIT 1
  `).bind(institutionId, input.provider, input.externalId).first<SourceLibraryRecord>();

  const id = existing?.id || crypto.randomUUID();
  const rawUnchanged = Boolean(existing && rawSha256 && existing.rawSha256 === rawSha256);
  const textUnchanged = Boolean(existing && textSha256 && existing.textSha256 === textSha256);

  if (existing) {
    await db.prepare(`
      UPDATE SourceDocument SET
        parentExternalId = ?, sourceKind = ?, title = ?, mimeType = ?, sourceUrl = ?,
        sourceCreatedAt = ?, sourceModifiedAt = ?, module = ?, sensitivity = ?,
        rawSizeBytes = ?, rawSha256 = ?, textLength = ?, textSha256 = ?,
        status = 'Active', metadataJson = ?, updatedAt = ?
      WHERE id = ?
    `).bind(
      input.parentExternalId || null,
      input.sourceKind || 'ROOT_FILE',
      input.title.trim(),
      input.mimeType || null,
      input.sourceUrl || null,
      input.sourceCreatedAt || null,
      input.sourceModifiedAt || null,
      input.module || null,
      input.sensitivity || 'Confidential',
      rawBytes ? rawBytes.byteLength : existing.rawSizeBytes,
      rawSha256 || existing.rawSha256,
      extractedText ? extractedText.length : existing.textLength,
      textSha256 || existing.textSha256,
      input.metadata ? JSON.stringify(input.metadata) : existing.metadataJson,
      now,
      id
    ).run();
  } else {
    await db.prepare(`
      INSERT INTO SourceDocument (
        id, institutionId, provider, externalId, parentExternalId, sourceKind,
        title, mimeType, sourceUrl, sourceCreatedAt, sourceModifiedAt, module,
        sensitivity, rawSizeBytes, rawSha256, textLength, textSha256, status,
        metadataJson, importedAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)
    `).bind(
      id,
      institutionId,
      input.provider,
      input.externalId,
      input.parentExternalId || null,
      input.sourceKind || 'ROOT_FILE',
      input.title.trim(),
      input.mimeType || null,
      input.sourceUrl || null,
      input.sourceCreatedAt || null,
      input.sourceModifiedAt || null,
      input.module || null,
      input.sensitivity || 'Confidential',
      rawBytes?.byteLength || 0,
      rawSha256,
      extractedText.length,
      textSha256,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now,
      now
    ).run();
  }

  if (rawBytes && !rawUnchanged) {
    await db.prepare('DELETE FROM SourceBinaryChunk WHERE documentId = ?').bind(id).run();
    let chunkIndex = 0;
    for (let offset = 0; offset < rawBytes.byteLength; offset += RAW_CHUNK_BYTES) {
      const chunk = rawBytes.subarray(offset, Math.min(offset + RAW_CHUNK_BYTES, rawBytes.byteLength));
      await db.prepare(`
        INSERT INTO SourceBinaryChunk (
          id, institutionId, documentId, chunkIndex, byteLength, dataBase64, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        institutionId,
        id,
        chunkIndex,
        chunk.byteLength,
        bytesToBase64(chunk),
        now
      ).run();
      chunkIndex += 1;
    }
  }

  if (extractedText && !textUnchanged) {
    await db.prepare('DELETE FROM SourceTextChunk WHERE documentId = ?').bind(id).run();
    let chunkIndex = 0;
    for (let offset = 0; offset < extractedText.length; offset += TEXT_CHUNK_CHARS) {
      const chunk = extractedText.slice(offset, offset + TEXT_CHUNK_CHARS);
      await db.prepare(`
        INSERT INTO SourceTextChunk (
          id, institutionId, documentId, chunkIndex, charCount, textContent, textSha256, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        institutionId,
        id,
        chunkIndex,
        chunk.length,
        chunk,
        await sha256Text(chunk),
        now
      ).run();
      chunkIndex += 1;
    }
  }

  const record = await db.prepare('SELECT * FROM SourceDocument WHERE id = ?')
    .bind(id).first<SourceLibraryRecord>();
  if (!record) throw new Error('SOURCE_LIBRARY_WRITE_NOT_VERIFIED');

  await audit(
    db,
    institutionId,
    existing ? 'UPDATE' : 'IMPORT',
    id,
    {
      provider: input.provider,
      externalId: input.externalId,
      title: input.title,
      rawSha256: record.rawSha256,
      textSha256: record.textSha256,
      module: record.module
    },
    reason
  );

  return {
    record,
    changed: !existing || !rawUnchanged || !textUnchanged,
    rawUnchanged,
    textUnchanged
  };
}

export async function listSourceDocuments(institutionId: string) {
  const db = await ensureSourceLibrarySchema();
  const result = await db.prepare(`
    SELECT id, institutionId, provider, externalId, parentExternalId, sourceKind,
           title, mimeType, sourceUrl, sourceCreatedAt, sourceModifiedAt, module,
           sensitivity, rawSizeBytes, rawSha256, textLength, textSha256, status,
           metadataJson, importedAt, updatedAt
    FROM SourceDocument
    WHERE institutionId = ?
  `).bind(institutionId).all<SourceLibraryRecord>();
  return (result.results || []).map(toSourceView).sort(compareSourcePrecedence);
}

export async function listEffectiveSourceDocuments(institutionId: string) {
  const documents = await listSourceDocuments(institutionId);
  const effective = new Map<string, SourceLibraryViewRecord>();

  for (const document of documents) {
    const existing = effective.get(document.duplicateKey);
    if (!existing || compareSourcePrecedence(document, existing) < 0) {
      effective.set(document.duplicateKey, document);
    }
  }

  return Array.from(effective.values()).sort(compareSourcePrecedence);
}

export async function getSourcePrecedenceSummary(institutionId: string) {
  const documents = await listSourceDocuments(institutionId);
  const effectiveDocuments = await listEffectiveSourceDocuments(institutionId);
  const byRole = documents.reduce<Record<string, number>>((summary, document) => {
    const role = document.sourceRole || 'UNSPECIFIED';
    summary[role] = (summary[role] || 0) + 1;
    return summary;
  }, {});

  return {
    strategy: 'UPDATE_OVER_BASELINE',
    totalDocuments: documents.length,
    effectiveDocuments: effectiveDocuments.length,
    supersededDocuments: documents.length - effectiveDocuments.length,
    byRole,
    rules: {
      higherPrecedencePriorityWins: true,
      newerSourceModifiedAtBreaksTies: true,
      fuzzyMatching: false
    }
  };
}

export async function getSourceLibraryMetrics(institutionId: string) {
  const db = await ensureSourceLibrarySchema();
  const row = await db.prepare(`
    SELECT
      COUNT(*) AS documents,
      COALESCE(SUM(rawSizeBytes), 0) AS rawBytes,
      COALESCE(SUM(textLength), 0) AS indexedCharacters,
      SUM(CASE WHEN sourceKind = 'ARCHIVE_MEMBER' THEN 1 ELSE 0 END) AS archiveMembers,
      SUM(CASE WHEN rawSizeBytes > 0 THEN 1 ELSE 0 END) AS documentsWithRawBytes,
      SUM(CASE WHEN textLength > 0 THEN 1 ELSE 0 END) AS documentsWithIndexedText
    FROM SourceDocument
    WHERE institutionId = ? AND status = 'Active'
  `).bind(institutionId).first<Record<string, unknown>>();
  return row || {};
}

export async function getSourceBinary(documentId: string, institutionId: string) {
  const db = await ensureSourceLibrarySchema();
  const document = await db.prepare(`
    SELECT * FROM SourceDocument WHERE id = ? AND institutionId = ? LIMIT 1
  `).bind(documentId, institutionId).first<SourceLibraryRecord>();
  if (!document) throw new Error('SOURCE_LIBRARY_DOCUMENT_NOT_FOUND');

  const chunks = await db.prepare(`
    SELECT chunkIndex, dataBase64 FROM SourceBinaryChunk
    WHERE documentId = ? AND institutionId = ?
    ORDER BY chunkIndex ASC
  `).bind(documentId, institutionId).all<{ chunkIndex: number; dataBase64: string }>();
  return { document, chunks: chunks.results || [] };
}
