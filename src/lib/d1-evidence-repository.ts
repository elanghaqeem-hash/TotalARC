import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureIcofrWorkpaperReviewSchema, saveWorkpaperEvidence } from '@/lib/d1-icofr-workpaper-review';

type Prepared = {
  bind: (...values: unknown[]) => {
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
    all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  };
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: () => Promise<unknown>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
};

type D1DatabaseLike = {
  exec: (sql: string) => Promise<unknown>;
  batch?: (statements: unknown[]) => Promise<unknown>;
  prepare: (sql: string) => Prepared;
};

export const EVIDENCE_SENSITIVITY = ['Internal', 'Confidential', 'Restricted'] as const;
export const EVIDENCE_RETENTION_CLASSES = [
  '3 Years',
  '5 Years',
  '7 Years',
  '10 Years',
  'Permanent',
  'Custom'
] as const;

export const EVIDENCE_LINK_TYPES = [
  'WORKPAPER_REVIEW',
  'WORKPAPER_EVIDENCE',
  'TOD',
  'TOE',
  'TOE_SAMPLE',
  'SAMPLING_PLAN',
  'PBC_REQUEST',
  'SUB_CERTIFICATION',
  'ATTESTATION',
  'EVIDENCE_PACK',
  'DEFICIENCY',
  'MAP',
  'CONTROL',
  'RISK',
  'PROCESS',
  'SCOPE',
  'TESTING_PLAN_ITEM'
] as const;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 192 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'txt',
  'csv',
  'json',
  'docx',
  'xlsx',
  'pptx'
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/octet-stream'
]);

async function getDb(): Promise<D1DatabaseLike> {
  await ensureCoreDomainSchema();
    await ensureIcofrWorkpaperReviewSchema();
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
  const stmt = db.prepare(sql);
  const result = values.length ? await stmt.bind(...values).all<T>() : await stmt.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(
  db: D1DatabaseLike,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).first<T>() : stmt.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).run() : stmt.run();
}

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  return next || null;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function safeFileName(name: string) {
  const sanitized = name
    .replace(/[\\/\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (sanitized || 'evidence-file').slice(0, 180);
}

function extensionOf(name: string) {
  const safe = safeFileName(name);
  const dot = safe.lastIndexOf('.');
  return dot >= 0 ? safe.slice(dot + 1).toLowerCase() : '';
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x4000) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + 0x4000));
    for (let j = 0; j < slice.length; j += 1) {
      binary += String.fromCharCode(slice[j]);
    }
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    result[i] = binary.charCodeAt(i);
  }
  return result;
}

async function sha256(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function retentionDate(retentionClass: string, customDate?: string | null) {
  if (retentionClass === 'Permanent') return null;
  if (retentionClass === 'Custom') return clean(customDate);
  const years = Number.parseInt(retentionClass, 10);
  if (!Number.isFinite(years) || years <= 0) return clean(customDate);
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
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

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensureEvidenceRepositorySchema() {
  if (schemaReady) return schemaReady;

  schemaReady = (async () => {
    const db = await getDb();
    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS EvidenceDocument (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        evidenceId TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        sensitivity TEXT NOT NULL DEFAULT 'Confidential',
        retentionClass TEXT NOT NULL DEFAULT '7 Years',
        retentionUntil TEXT,
        legalHold INTEGER NOT NULL DEFAULT 0,
        ownerName TEXT NOT NULL,
        sourceSystem TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        currentVersionId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_document_ref
        ON EvidenceDocument(institutionId,evidenceId);
      CREATE INDEX IF NOT EXISTS idx_evidence_document_institution
        ON EvidenceDocument(institutionId,status,updatedAt);

      CREATE TABLE IF NOT EXISTS EvidenceVersion (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        documentId TEXT NOT NULL,
        versionNo INTEGER NOT NULL,
        fileName TEXT NOT NULL,
        mimeType TEXT NOT NULL,
        extension TEXT NOT NULL,
        sizeBytes INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        storageMode TEXT NOT NULL DEFAULT 'D1_CHUNKED',
        uploadedBy TEXT NOT NULL,
        versionNote TEXT,
        isCurrent INTEGER NOT NULL DEFAULT 1,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_version_number
        ON EvidenceVersion(documentId,versionNo);
      CREATE INDEX IF NOT EXISTS idx_evidence_version_hash
        ON EvidenceVersion(institutionId,sha256);

      CREATE TABLE IF NOT EXISTS EvidenceBinaryChunk (
        id TEXT PRIMARY KEY NOT NULL,
        versionId TEXT NOT NULL,
        chunkIndex INTEGER NOT NULL,
        byteLength INTEGER NOT NULL,
        dataBase64 TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_chunk_order
        ON EvidenceBinaryChunk(versionId,chunkIndex);

      CREATE TABLE IF NOT EXISTS EvidenceLink (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        documentId TEXT NOT NULL,
        versionId TEXT NOT NULL,
        entityType TEXT NOT NULL,
        entityId TEXT NOT NULL,
        relationship TEXT NOT NULL DEFAULT 'SUPPORTS',
        notes TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_link_unique
        ON EvidenceLink(documentId,versionId,entityType,entityId,relationship);
      CREATE INDEX IF NOT EXISTS idx_evidence_link_target
        ON EvidenceLink(institutionId,entityType,entityId);

      CREATE TABLE IF NOT EXISTS EvidenceAccessLog (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        documentId TEXT NOT NULL,
        versionId TEXT,
        action TEXT NOT NULL,
        actorName TEXT NOT NULL,
        actorRole TEXT NOT NULL,
        reason TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_access_document
        ON EvidenceAccessLog(institutionId,documentId,createdAt);
    `);
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });

  return schemaReady;
}

async function primaryInstitution(db: D1DatabaseLike) {
  return first<Record<string, unknown>>(
    db,
    'SELECT * FROM Institution ORDER BY createdAt ASC LIMIT 1'
  );
}

async function audit(
  db: D1DatabaseLike,
  institutionId: string,
  action: string,
  entityType: string,
  recordId: string,
  newValue: unknown,
  oldValue?: unknown
) {
  await run(
    db,
    `INSERT INTO AuditLog (
      id,institutionId,userName,userRole,action,entityType,recordId,
      oldValue,newValue,reason,ipAddress,timestamp
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      institutionId,
      'System',
      'System',
      action,
      entityType,
      recordId,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      JSON.stringify(newValue),
      'Enterprise evidence repository, document versioning and integrity governance.',
      null,
      nowIso()
    ]
  );
}

async function accessLog(
  db: D1DatabaseLike,
  institutionId: string,
  documentId: string,
  versionId: string | null,
  action: string,
  actorName: string,
  actorRole: string,
  reason?: string | null
) {
  await run(
    db,
    `INSERT INTO EvidenceAccessLog (
      id,institutionId,documentId,versionId,action,actorName,actorRole,reason,createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      institutionId,
      documentId,
      versionId,
      action,
      actorName || 'Unverified client',
      actorRole || 'Unauthenticated',
      clean(reason),
      nowIso()
    ]
  );
}

function validateFile(name: string, mimeType: string, size: number) {
  const ext = extensionOf(name);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) throw new Error('FILE_TYPE_NOT_ALLOWED');
  if (!ALLOWED_MIME_TYPES.has(mimeType || 'application/octet-stream')) {
    throw new Error('FILE_TYPE_NOT_ALLOWED');
  }
  if (!Number.isFinite(size) || size <= 0) throw new Error('FILE_EMPTY');
  if (size > MAX_FILE_BYTES) throw new Error('FILE_TOO_LARGE');
  return ext;
}

async function insertChunks(
  db: D1DatabaseLike,
  versionId: string,
  bytes: Uint8Array
) {
  const statements: unknown[] = [];
  let chunkIndex = 0;

  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + CHUNK_BYTES));
    const stmt = db.prepare(
      `INSERT INTO EvidenceBinaryChunk (
        id,versionId,chunkIndex,byteLength,dataBase64
      ) VALUES (?,?,?,?,?)`
    ).bind(
      crypto.randomUUID(),
      versionId,
      chunkIndex,
      chunk.length,
      bytesToBase64(chunk)
    );
    statements.push(stmt);
    chunkIndex += 1;
  }

  if (db.batch && statements.length) {
    await db.batch(statements);
    return chunkIndex;
  }

  for (const statement of statements as Array<{ run: () => Promise<unknown> }>) {
    await statement.run();
  }
  return chunkIndex;
}

export async function uploadEvidenceVersion(input: {
  documentId?: string | null;
  title: string;
  description?: string | null;
  category: string;
  sensitivity: string;
  retentionClass: string;
  retentionUntil?: string | null;
  legalHold?: boolean;
  ownerName: string;
  sourceSystem?: string | null;
  uploadedBy: string;
  versionNote?: string | null;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const title = input.title.trim();
  const category = input.category.trim();
  const ownerName = input.ownerName.trim();
  const uploadedBy = input.uploadedBy.trim();
  const sensitivity = input.sensitivity.trim();
  const retentionClass = input.retentionClass.trim();

  if (!title || !category || !ownerName || !uploadedBy) throw new Error('UPLOAD_REQUIRED');
  if (!EVIDENCE_SENSITIVITY.includes(sensitivity as typeof EVIDENCE_SENSITIVITY[number])) {
    throw new Error('INVALID_SENSITIVITY');
  }
  if (!EVIDENCE_RETENTION_CLASSES.includes(retentionClass as typeof EVIDENCE_RETENTION_CLASSES[number])) {
    throw new Error('INVALID_RETENTION_CLASS');
  }
  if (retentionClass === 'Custom' && !clean(input.retentionUntil)) {
    throw new Error('CUSTOM_RETENTION_DATE_REQUIRED');
  }

  const fileName = safeFileName(input.fileName);
  const mimeType = input.mimeType || 'application/octet-stream';
  const extension = validateFile(fileName, mimeType, input.bytes.length);
  const fileHash = await sha256(input.bytes);

  let document: Record<string, any> | null = null;
  if (input.documentId) {
    document = await first<Record<string, any>>(
      db,
      'SELECT * FROM EvidenceDocument WHERE id=? AND institutionId=? LIMIT 1',
      [input.documentId, institution.id]
    );
    if (!document) throw new Error('DOCUMENT_NOT_FOUND');
    if (String(document.status) === 'Archived') throw new Error('DOCUMENT_ARCHIVED');
  }

  const now = nowIso();
  let documentId = document?.id ? String(document.id) : crypto.randomUUID();
  let evidenceId = document?.evidenceId ? String(document.evidenceId) : '';

  if (!document) {
    const next = await first<{ nextNo?: number }>(
      db,
      `SELECT COALESCE(MAX(CAST(SUBSTR(evidenceId,5) AS INTEGER)),0)+1 AS nextNo
         FROM EvidenceDocument
        WHERE institutionId=? AND evidenceId LIKE 'EVD-%'`,
      [institution.id]
    );
    evidenceId = 'EVD-' + String(Number(next?.nextNo || 1)).padStart(7, '0');

    const retentionUntil = retentionDate(retentionClass, input.retentionUntil);
    document = {
      id: documentId,
      institutionId: String(institution.id),
      evidenceId,
      title,
      description: clean(input.description),
      category,
      sensitivity,
      retentionClass,
      retentionUntil,
      legalHold: Boolean(input.legalHold),
      ownerName,
      sourceSystem: clean(input.sourceSystem),
      status: 'Active',
      currentVersionId: null,
      createdAt: now,
      updatedAt: now
    };

    await run(
      db,
      `INSERT INTO EvidenceDocument (
        id,institutionId,evidenceId,title,description,category,sensitivity,
        retentionClass,retentionUntil,legalHold,ownerName,sourceSystem,status,
        currentVersionId,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?)`,
      [
        document.id,
        document.institutionId,
        document.evidenceId,
        document.title,
        document.description,
        document.category,
        document.sensitivity,
        document.retentionClass,
        document.retentionUntil,
        document.legalHold ? 1 : 0,
        document.ownerName,
        document.sourceSystem,
        document.status,
        document.createdAt,
        document.updatedAt
      ]
    );
  } else {
    const duplicateCurrent = await first<Record<string, unknown>>(
      db,
      `SELECT * FROM EvidenceVersion
        WHERE documentId=? AND sha256=? AND isCurrent=1
        LIMIT 1`,
      [documentId, fileHash]
    );
    if (duplicateCurrent) throw new Error('DUPLICATE_FILE_VERSION');
    if (!clean(input.versionNote)) throw new Error('VERSION_NOTE_REQUIRED');

    const retentionUntil = retentionDate(retentionClass, input.retentionUntil);
    await run(
      db,
      `UPDATE EvidenceDocument SET
        title=?,description=?,category=?,sensitivity=?,retentionClass=?,
        retentionUntil=?,legalHold=?,ownerName=?,sourceSystem=?,updatedAt=?
       WHERE id=? AND institutionId=?`,
      [
        title,
        clean(input.description),
        category,
        sensitivity,
        retentionClass,
        retentionUntil,
        input.legalHold ? 1 : 0,
        ownerName,
        clean(input.sourceSystem),
        now,
        documentId,
        institution.id
      ]
    );
  }

  const maxVersion = await first<{ maxVersion?: number }>(
    db,
    'SELECT COALESCE(MAX(versionNo),0) AS maxVersion FROM EvidenceVersion WHERE documentId=?',
    [documentId]
  );
  const versionNo = Number(maxVersion?.maxVersion || 0) + 1;
  const versionId = crypto.randomUUID();

  await run(
    db,
    'UPDATE EvidenceVersion SET isCurrent=0 WHERE documentId=?',
    [documentId]
  );

  await run(
    db,
    `INSERT INTO EvidenceVersion (
      id,institutionId,documentId,versionNo,fileName,mimeType,extension,sizeBytes,
      sha256,storageMode,uploadedBy,versionNote,isCurrent,createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?,'D1_CHUNKED',?,?,1,?)`,
    [
      versionId,
      institution.id,
      documentId,
      versionNo,
      fileName,
      mimeType,
      extension,
      input.bytes.length,
      fileHash,
      uploadedBy,
      clean(input.versionNote),
      now
    ]
  );

  const chunkCount = await insertChunks(db, versionId, input.bytes);

  await run(
    db,
    'UPDATE EvidenceDocument SET currentVersionId=?,updatedAt=? WHERE id=? AND institutionId=?',
    [versionId, now, documentId, institution.id]
  );

  const result = {
    documentId,
    evidenceId,
    versionId,
    versionNo,
    fileName,
    mimeType,
    extension,
    sizeBytes: input.bytes.length,
    sha256: fileHash,
    storageMode: 'D1_CHUNKED',
    chunkCount,
    uploadedBy,
    createdAt: now
  };

  await audit(
    db,
    String(institution.id),
    versionNo === 1 ? 'CREATE_EVIDENCE_DOCUMENT' : 'CREATE_EVIDENCE_VERSION',
    'EvidenceDocument',
    documentId,
    result,
    versionNo === 1 ? undefined : document
  );
  await accessLog(
    db,
    String(institution.id),
    documentId,
    versionId,
    'UPLOAD',
    uploadedBy,
    'Unverified role',
    clean(input.versionNote)
  );

  return result;
}

async function targetExists(
  db: D1DatabaseLike,
  institutionId: string,
  entityType: string,
  entityId: string
) {
  const queries: Record<string, [string, unknown[]]> = {
    WORKPAPER_REVIEW: [
      'SELECT id FROM ICOFRWorkpaperReview WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    WORKPAPER_EVIDENCE: [
      'SELECT id FROM ICOFRWorkpaperEvidenceIndex WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    TOD: [
      'SELECT id FROM ICOFRDesignAssessment WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    TOE: [
      `SELECT t.id FROM ToETest t JOIN ControlMaster c ON c.id=t.controlId
        WHERE t.id=? AND c.institutionId=? LIMIT 1`,
      [entityId, institutionId]
    ],
    TOE_SAMPLE: [
      `SELECT s.id FROM TestSample s
         JOIN ToETest t ON t.id=s.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE s.id=? AND c.institutionId=? LIMIT 1`,
      [entityId, institutionId]
    ],
    SAMPLING_PLAN: [
      'SELECT id FROM ICOFRSamplingPlan WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    PBC_REQUEST: [
      'SELECT id FROM ICOFRPBCRequest WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    SUB_CERTIFICATION: [
      'SELECT id FROM ICOFRSubCertification WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    ATTESTATION: [
      'SELECT id FROM ICOFRManagementAttestation WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    EVIDENCE_PACK: [
      'SELECT id FROM ICOFREvidencePack WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    DEFICIENCY: [
      `SELECT d.id FROM ControlDeficiency d
         JOIN TestingException e ON e.id=d.exceptionId
         JOIN ToETest t ON t.id=e.toeTestId
         JOIN ControlMaster c ON c.id=t.controlId
        WHERE d.id=? AND c.institutionId=? LIMIT 1`,
      [entityId, institutionId]
    ],
    MAP: [
      `SELECT m.id FROM ManagementActionPlan m
         JOIN Issue i ON i.id=m.issueId
        WHERE m.id=? AND i.institutionId=? LIMIT 1`,
      [entityId, institutionId]
    ],
    CONTROL: [
      'SELECT id FROM ControlMaster WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    RISK: [
      'SELECT id FROM RiskMaster WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    PROCESS: [
      'SELECT id FROM BusinessProcess WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    SCOPE: [
      'SELECT id FROM ICOFRScope WHERE id=? AND institutionId=? LIMIT 1',
      [entityId, institutionId]
    ],
    TESTING_PLAN_ITEM: [
      `SELECT p.id FROM ICOFRTestingPlanItem p
         JOIN ICOFRTestingCycle c ON c.id=p.cycleId
        WHERE p.id=? AND c.institutionId=? LIMIT 1`,
      [entityId, institutionId]
    ]
  };

  const query = queries[entityType];
  if (!query) throw new Error('INVALID_LINK_TYPE');

  const tableNameByType: Record<string, string> = {
    WORKPAPER_REVIEW: 'ICOFRWorkpaperReview',
    WORKPAPER_EVIDENCE: 'ICOFRWorkpaperEvidenceIndex',
    TOD: 'ICOFRDesignAssessment',
    TOE: 'ToETest',
    TOE_SAMPLE: 'TestSample',
    SAMPLING_PLAN: 'ICOFRSamplingPlan',
    PBC_REQUEST: 'ICOFRPBCRequest',
    SUB_CERTIFICATION: 'ICOFRSubCertification',
    ATTESTATION: 'ICOFRManagementAttestation',
    EVIDENCE_PACK: 'ICOFREvidencePack',
    DEFICIENCY: 'ControlDeficiency',
    MAP: 'ManagementActionPlan',
    CONTROL: 'ControlMaster',
    RISK: 'RiskMaster',
    PROCESS: 'BusinessProcess',
    SCOPE: 'ICOFRScope',
    TESTING_PLAN_ITEM: 'ICOFRTestingPlanItem'
  };

  const tableName = tableNameByType[entityType];
  const table = await first<{ name?: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
    [tableName]
  );
  if (!table) return false;

  return Boolean(await first(db, query[0], query[1]));
}

export async function linkEvidence(input: {
  documentId: string;
  versionId?: string | null;
  entityType: string;
  entityId: string;
  relationship?: string | null;
  notes?: string | null;
  syncWorkpaperIndex?: boolean;
  evidenceType?: string | null;
  evidenceOwner?: string | null;
}) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const documentId = input.documentId.trim();
  const entityType = input.entityType.trim();
  const entityId = input.entityId.trim();
  const relationship = clean(input.relationship) || 'SUPPORTS';

  if (!documentId || !entityType || !entityId) throw new Error('LINK_REQUIRED');
  if (!EVIDENCE_LINK_TYPES.includes(entityType as typeof EVIDENCE_LINK_TYPES[number])) {
    throw new Error('INVALID_LINK_TYPE');
  }

  const document = await first<Record<string, any>>(
    db,
    'SELECT * FROM EvidenceDocument WHERE id=? AND institutionId=? LIMIT 1',
    [documentId, institution.id]
  );
  if (!document) throw new Error('DOCUMENT_NOT_FOUND');

  const versionId = clean(input.versionId) || clean(document.currentVersionId);
  if (!versionId) throw new Error('VERSION_NOT_FOUND');

  const version = await first<Record<string, any>>(
    db,
    'SELECT * FROM EvidenceVersion WHERE id=? AND documentId=? AND institutionId=? LIMIT 1',
    [versionId, documentId, institution.id]
  );
  if (!version) throw new Error('VERSION_NOT_FOUND');

  if (!(await targetExists(db, String(institution.id), entityType, entityId))) {
    throw new Error('LINK_TARGET_NOT_FOUND');
  }

  const existing = await first<Record<string, unknown>>(
    db,
    `SELECT * FROM EvidenceLink
      WHERE documentId=? AND versionId=? AND entityType=? AND entityId=? AND relationship=?
      LIMIT 1`,
    [documentId, versionId, entityType, entityId, relationship]
  );
  if (existing) throw new Error('LINK_CONFLICT');

  const id = crypto.randomUUID();
  const now = nowIso();

  let workpaperEvidence: Record<string, unknown> | null = null;
  if (entityType === 'WORKPAPER_REVIEW' && input.syncWorkpaperIndex) {
    const evidenceType = String(input.evidenceType || '').trim();
    const evidenceOwner = String(input.evidenceOwner || document.ownerName || '').trim();
    if (!evidenceType || !evidenceOwner) throw new Error('WORKPAPER_SYNC_REQUIRED');

    workpaperEvidence = await saveWorkpaperEvidence({
      reviewId: entityId,
      evidenceRef: String(document.evidenceId) + '@v' + String(version.versionNo),
      evidenceType,
      description: String(document.title),
      source: String(document.sourceSystem || 'Enterprise Evidence Repository'),
      owner: evidenceOwner
    });
  }

  await run(
    db,
    `INSERT INTO EvidenceLink (
      id,institutionId,documentId,versionId,entityType,entityId,relationship,notes,createdAt
    ) VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      id,
      institution.id,
      documentId,
      versionId,
      entityType,
      entityId,
      relationship,
      clean(input.notes),
      now
    ]
  );

  if (workpaperEvidence) {
    await run(
      db,
      `INSERT OR IGNORE INTO EvidenceLink (
        id,institutionId,documentId,versionId,entityType,entityId,relationship,notes,createdAt
      ) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        crypto.randomUUID(),
        institution.id,
        documentId,
        versionId,
        'WORKPAPER_EVIDENCE',
        workpaperEvidence.id,
        'BACKS_INDEX_ITEM',
        'Synchronized from enterprise evidence repository.',
        now
      ]
    );
  }

  const result = {
    id,
    documentId,
    versionId,
    entityType,
    entityId,
    relationship,
    notes: clean(input.notes),
    workpaperEvidence,
    createdAt: now
  };
  await audit(db, String(institution.id), 'LINK_EVIDENCE', 'EvidenceLink', id, result);
  return result;
}

export async function unlinkEvidence(id: string) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const existing = await first<Record<string, unknown>>(
    db,
    'SELECT * FROM EvidenceLink WHERE id=? AND institutionId=? LIMIT 1',
    [id, institution.id]
  );
  if (!existing) throw new Error('LINK_NOT_FOUND');

  await run(db, 'DELETE FROM EvidenceLink WHERE id=? AND institutionId=?', [id, institution.id]);
  await audit(
    db,
    String(institution.id),
    'UNLINK_EVIDENCE',
    'EvidenceLink',
    id,
    { deleted: true },
    existing
  );
  return { success: true };
}

export async function updateEvidenceGovernance(input: Record<string, unknown>) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const documentId = String(input.documentId || '').trim();
  const title = String(input.title || '').trim();
  const category = String(input.category || '').trim();
  const ownerName = String(input.ownerName || '').trim();
  const sensitivity = String(input.sensitivity || '').trim();
  const retentionClass = String(input.retentionClass || '').trim();

  if (!documentId || !title || !category || !ownerName) throw new Error('GOVERNANCE_REQUIRED');
  if (!EVIDENCE_SENSITIVITY.includes(sensitivity as typeof EVIDENCE_SENSITIVITY[number])) {
    throw new Error('INVALID_SENSITIVITY');
  }
  if (!EVIDENCE_RETENTION_CLASSES.includes(retentionClass as typeof EVIDENCE_RETENTION_CLASSES[number])) {
    throw new Error('INVALID_RETENTION_CLASS');
  }
  if (retentionClass === 'Custom' && !clean(input.retentionUntil)) {
    throw new Error('CUSTOM_RETENTION_DATE_REQUIRED');
  }

  const existing = await first<Record<string, any>>(
    db,
    'SELECT * FROM EvidenceDocument WHERE id=? AND institutionId=? LIMIT 1',
    [documentId, institution.id]
  );
  if (!existing) throw new Error('DOCUMENT_NOT_FOUND');

  const now = nowIso();
  const next = {
    title,
    description: clean(input.description),
    category,
    sensitivity,
    retentionClass,
    retentionUntil: retentionDate(retentionClass, clean(input.retentionUntil)),
    legalHold: bool(input.legalHold),
    ownerName,
    sourceSystem: clean(input.sourceSystem),
    updatedAt: now
  };

  await run(
    db,
    `UPDATE EvidenceDocument SET
      title=?,description=?,category=?,sensitivity=?,retentionClass=?,retentionUntil=?,
      legalHold=?,ownerName=?,sourceSystem=?,updatedAt=?
     WHERE id=? AND institutionId=?`,
    [
      next.title,
      next.description,
      next.category,
      next.sensitivity,
      next.retentionClass,
      next.retentionUntil,
      next.legalHold ? 1 : 0,
      next.ownerName,
      next.sourceSystem,
      next.updatedAt,
      documentId,
      institution.id
    ]
  );

  await audit(
    db,
    String(institution.id),
    'UPDATE_EVIDENCE_GOVERNANCE',
    'EvidenceDocument',
    documentId,
    next,
    existing
  );
  return { ...existing, ...next };
}

export async function archiveEvidenceDocument(documentId: string, reason: string) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const existing = await first<Record<string, any>>(
    db,
    'SELECT * FROM EvidenceDocument WHERE id=? AND institutionId=? LIMIT 1',
    [documentId, institution.id]
  );
  if (!existing) throw new Error('DOCUMENT_NOT_FOUND');
  if (bool(existing.legalHold)) throw new Error('LEGAL_HOLD_ACTIVE');
  if (!reason.trim()) throw new Error('ARCHIVE_REASON_REQUIRED');

  const now = nowIso();
  await run(
    db,
    "UPDATE EvidenceDocument SET status='Archived',updatedAt=? WHERE id=? AND institutionId=?",
    [now, documentId, institution.id]
  );

  const result = { id: documentId, status: 'Archived', reason: reason.trim(), updatedAt: now };
  await audit(
    db,
    String(institution.id),
    'ARCHIVE_EVIDENCE',
    'EvidenceDocument',
    documentId,
    result,
    existing
  );
  return result;
}

export async function loadEvidenceVersionBytes(versionId: string) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const version = await first<Record<string, any>>(
    db,
    `SELECT v.*,d.evidenceId,d.title,d.sensitivity,d.status AS documentStatus
       FROM EvidenceVersion v
       JOIN EvidenceDocument d ON d.id=v.documentId
      WHERE v.id=? AND v.institutionId=? AND d.institutionId=?
      LIMIT 1`,
    [versionId, institution.id, institution.id]
  );
  if (!version) throw new Error('VERSION_NOT_FOUND');

  const chunks = await all<Record<string, any>>(
    db,
    'SELECT * FROM EvidenceBinaryChunk WHERE versionId=? ORDER BY chunkIndex',
    [versionId]
  );
  if (chunks.length === 0) throw new Error('FILE_CONTENT_MISSING');

  const size = Number(version.sizeBytes || 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const row of chunks) {
    const chunk = base64ToBytes(String(row.dataBase64 || ''));
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (offset !== size) throw new Error('FILE_SIZE_MISMATCH');

  return { version, bytes };
}

export async function verifyEvidenceVersion(
  versionId: string,
  actorName = 'Unverified client',
  actorRole = 'Unauthenticated'
) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  const loaded = await loadEvidenceVersionBytes(versionId);
  const actual = await sha256(loaded.bytes);
  const expected = String(loaded.version.sha256 || '');
  const matches = actual === expected;

  await accessLog(
    db,
    String(institution.id),
    String(loaded.version.documentId),
    versionId,
    'VERIFY_HASH',
    actorName,
    actorRole,
    matches ? 'SHA-256 verified.' : 'SHA-256 mismatch detected.'
  );

  return {
    versionId,
    documentId: loaded.version.documentId,
    evidenceId: loaded.version.evidenceId,
    expectedSha256: expected,
    actualSha256: actual,
    matches,
    sizeBytes: loaded.bytes.length,
    checkedAt: nowIso()
  };
}

export async function recordEvidenceDownload(
  documentId: string,
  versionId: string,
  reason?: string | null
) {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) throw new Error('INSTITUTION_REQUIRED');

  await accessLog(
    db,
    String(institution.id),
    documentId,
    versionId,
    'DOWNLOAD',
    'Unverified client',
    'Unauthenticated',
    reason || 'Evidence file downloaded before identity-backed authentication is implemented.'
  );
}

async function loadLinkTargets(db: D1DatabaseLike, institutionId: string) {
  const exists = async (table: string) =>
    Boolean(
      await first(
        db,
        "SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        [table]
      )
    );

  const [
    hasReviews,
    hasTod,
    hasToe,
    hasSampling,
    hasPbc,
    hasSubCert,
    hasAttestation,
    hasControls
  ] = await Promise.all([
    exists('ICOFRWorkpaperReview'),
    exists('ICOFRDesignAssessment'),
    exists('ToETest'),
    exists('ICOFRSamplingPlan'),
    exists('ICOFRPBCRequest'),
    exists('ICOFRSubCertification'),
    exists('ICOFRManagementAttestation'),
    exists('ControlMaster')
  ]);

  const [reviews, tod, toe, sampling, pbc, subCerts, attestations, controls] = await Promise.all([
    hasReviews
      ? all<Record<string, any>>(
          db,
          'SELECT id,workpaperType,workpaperId,period,status FROM ICOFRWorkpaperReview WHERE institutionId=? ORDER BY updatedAt DESC LIMIT 200',
          [institutionId]
        )
      : Promise.resolve([]),
    hasTod
      ? all<Record<string, any>>(
          db,
          'SELECT id,testId,period,status,conclusion FROM ICOFRDesignAssessment WHERE institutionId=? ORDER BY updatedAt DESC LIMIT 200',
          [institutionId]
        )
      : Promise.resolve([]),
    hasToe
      ? all<Record<string, any>>(
          db,
          `SELECT t.id,t.testId,t.period,t.status,t.finalConclusion
             FROM ToETest t JOIN ControlMaster c ON c.id=t.controlId
            WHERE c.institutionId=? ORDER BY t.testedAt DESC LIMIT 200`,
          [institutionId]
        )
      : Promise.resolve([]),
    hasSampling
      ? all<Record<string, any>>(
          db,
          'SELECT id,planRef,period,status FROM ICOFRSamplingPlan WHERE institutionId=? ORDER BY updatedAt DESC LIMIT 200',
          [institutionId]
        )
      : Promise.resolve([]),
    hasPbc
      ? all<Record<string, any>>(
          db,
          'SELECT id,requestNo,title,period,status FROM ICOFRPBCRequest WHERE institutionId=? ORDER BY updatedAt DESC LIMIT 200',
          [institutionId]
        )
      : Promise.resolve([]),
    hasSubCert
      ? all<Record<string, any>>(
          db,
          'SELECT id,certificationRef,period,subjectType,status FROM ICOFRSubCertification WHERE institutionId=? ORDER BY updatedAt DESC LIMIT 200',
          [institutionId]
        )
      : Promise.resolve([]),
    hasAttestation
      ? all<Record<string, any>>(
          db,
          'SELECT id,period,overallConclusion,status FROM ICOFRManagementAttestation WHERE institutionId=? ORDER BY updatedAt DESC LIMIT 200',
          [institutionId]
        )
      : Promise.resolve([]),
    hasControls
      ? all<Record<string, any>>(
          db,
          'SELECT id,controlId,name,status FROM ControlMaster WHERE institutionId=? ORDER BY controlId LIMIT 300',
          [institutionId]
        )
      : Promise.resolve([])
  ]);

  return [
    ...reviews.map(item => ({
      entityType: 'WORKPAPER_REVIEW',
      entityId: item.id,
      label:
        String(item.workpaperType) +
        ' review · ' +
        String(item.workpaperId) +
        ' · ' +
        String(item.period) +
        ' · ' +
        String(item.status)
    })),
    ...tod.map(item => ({
      entityType: 'TOD',
      entityId: item.id,
      label: String(item.testId) + ' · ' + String(item.period) + ' · ' + String(item.status)
    })),
    ...toe.map(item => ({
      entityType: 'TOE',
      entityId: item.id,
      label: String(item.testId) + ' · ' + String(item.period) + ' · ' + String(item.status)
    })),
    ...sampling.map(item => ({
      entityType: 'SAMPLING_PLAN',
      entityId: item.id,
      label: String(item.planRef || item.id) + ' · ' + String(item.period) + ' · ' + String(item.status)
    })),
    ...pbc.map(item => ({
      entityType: 'PBC_REQUEST',
      entityId: item.id,
      label: String(item.requestNo || item.id) + ' · ' + String(item.title) + ' · ' + String(item.status)
    })),
    ...subCerts.map(item => ({
      entityType: 'SUB_CERTIFICATION',
      entityId: item.id,
      label: String(item.certificationRef || item.id) + ' · ' + String(item.period) + ' · ' + String(item.status)
    })),
    ...attestations.map(item => ({
      entityType: 'ATTESTATION',
      entityId: item.id,
      label: 'Attestation · ' + String(item.period) + ' · ' + String(item.status)
    })),
    ...controls.map(item => ({
      entityType: 'CONTROL',
      entityId: item.id,
      label: String(item.controlId) + ' · ' + String(item.name)
    }))
  ];
}

export async function getEvidenceRepositoryData() {
  const db = await ensureEvidenceRepositorySchema();
  const institution = await primaryInstitution(db);
  if (!institution) {
    return {
      institution: null,
      documents: [],
      linkTargets: [],
      metrics: {},
      limits: { maxFileBytes: MAX_FILE_BYTES, storageMode: 'D1_CHUNKED' }
    };
  }

  const [documents, versions, links, accessLogs, linkTargets] = await Promise.all([
    all<Record<string, any>>(
      db,
      'SELECT * FROM EvidenceDocument WHERE institutionId=? ORDER BY updatedAt DESC,evidenceId DESC',
      [institution.id]
    ),
    all<Record<string, any>>(
      db,
      'SELECT * FROM EvidenceVersion WHERE institutionId=? ORDER BY documentId,versionNo DESC',
      [institution.id]
    ),
    all<Record<string, any>>(
      db,
      'SELECT * FROM EvidenceLink WHERE institutionId=? ORDER BY createdAt DESC',
      [institution.id]
    ),
    all<Record<string, any>>(
      db,
      'SELECT * FROM EvidenceAccessLog WHERE institutionId=? ORDER BY createdAt DESC LIMIT 250',
      [institution.id]
    ),
    loadLinkTargets(db, String(institution.id))
  ]);

  const enriched = documents.map(document => {
    const documentVersions = versions.filter(item => String(item.documentId) === String(document.id));
    const documentLinks = links.filter(item => String(item.documentId) === String(document.id));
    const documentAccess = accessLogs.filter(item => String(item.documentId) === String(document.id));
    const currentVersion =
      documentVersions.find(item => String(item.id) === String(document.currentVersionId)) ||
      documentVersions.find(item => bool(item.isCurrent)) ||
      null;

    return {
      ...document,
      legalHold: bool(document.legalHold),
      versions: documentVersions.map(item => ({ ...item, isCurrent: bool(item.isCurrent) })),
      links: documentLinks,
      recentAccess: documentAccess.slice(0, 10),
      currentVersion
    };
  });

  const totalBytes = versions.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
  const retentionDue = documents.filter(item => {
    if (!item.retentionUntil || bool(item.legalHold) || String(item.status) !== 'Active') return false;
    return String(item.retentionUntil) <= new Date().toISOString().slice(0, 10);
  }).length;

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      legalName: institution.legalName
    },
    documents: enriched,
    linkTargets,
    sensitivities: EVIDENCE_SENSITIVITY,
    retentionClasses: EVIDENCE_RETENTION_CLASSES,
    linkTypes: EVIDENCE_LINK_TYPES,
    metrics: {
      documents: documents.length,
      active: documents.filter(item => item.status === 'Active').length,
      archived: documents.filter(item => item.status === 'Archived').length,
      versions: versions.length,
      linkedDocuments: new Set(links.map(item => String(item.documentId))).size,
      legalHold: documents.filter(item => bool(item.legalHold)).length,
      retentionDue,
      totalBytes
    },
    limits: {
      maxFileBytes: MAX_FILE_BYTES,
      chunkBytes: CHUNK_BYTES,
      storageMode: 'D1_CHUNKED',
      allowedExtensions: Array.from(ALLOWED_EXTENSIONS)
    },
    security: {
      authenticatedIdentityAvailable: false,
      note:
        'Repository metadata, integrity, versioning and institution scoping are active. Identity-backed RBAC is not yet available in the current application; role-switch UI is not treated as authentication.'
    }
  };
}
