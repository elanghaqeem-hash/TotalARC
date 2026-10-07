import { getCloudflareContext } from '@opennextjs/cloudflare';
import { ensureCoreDomainSchema } from '@/lib/d1-core';
import { ensureSourceLibrarySchema } from '@/lib/d1-source-library';
import { ensureEvidenceRepositorySchema } from '@/lib/d1-evidence-repository';
import { ensurePolicyLibrarySchema } from '@/lib/d1-policy-library';
import { ensureRegulatoryObligationSchema } from '@/lib/d1-regulatory-obligations';
import { ensureRcsaSchema } from '@/lib/d1-rcsa';
import { ensureAssuranceSchema } from '@/lib/d1-assurance';

type Prepared = {
  bind: (...values: unknown[]) => Prepared;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (sql: string) => Prepared;
};

const POLICY_REGISTRY_SYNC_VERSION = '2026-10-07-v3';

export type PolicyEntityLinkRecord = {
  id: string;
  institutionId: string;
  policyDocumentId: string;
  targetType: string;
  targetId: string;
  relationship: string;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
};

type Candidate = {
  sourceType: 'SOURCE_DOCUMENT' | 'EVIDENCE_DOCUMENT';
  sourceId: string;
  sourceVersionId?: string | null;
  contentHash?: string | null;
  title: string;
  textPreview: string;
  category?: string | null;
  module?: string | null;
  ownerName?: string | null;
  ownerUnit?: string | null;
  issueDate?: string | null;
  version?: string | null;
  metadata?: Record<string, unknown>;
  documentType: string;
  confidence: 'HIGH' | 'MEDIUM';
  classificationReason: string;
};

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function safeJson(value: unknown) {
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

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function policyIdentityTitle(value: unknown) {
  return normalize(value)
    .replace(/\b(send new|review\s*\d*|reviewed|final|finalisasi|copy|salinan|draft)\b/g, ' ')
    .replace(/\bv(?:ersi)?\s*\d+(?:\.\d+)*\b/g, ' ')
    .replace(/\brevisi\s*\d*\b/g, ' ')
    .replace(/\brev\s*\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function typeCode(type: string) {
  const mapping: Record<string, string> = {
    'Peraturan Direksi': 'PD',
    'Surat Edaran': 'SE',
    'Keputusan': 'SK',
    'SOP': 'SOP',
    'Kebijakan': 'KBJ',
    'Pedoman': 'PED',
    'Prosedur': 'PRO',
    'Instruksi Kerja': 'IK',
    'Standar': 'STD',
    'Buku Pedoman Perusahaan': 'BPP',
    'Piagam': 'PIG',
    'Petunjuk Teknis': 'JUKNIS',
    'Ketentuan Internal': 'KET'
  };
  return mapping[type] || 'KET';
}

function canonicalDocumentType(value: unknown) {
  const normalized = normalize(value);
  const mapping: Array<[string, string[]]> = [
    ['Peraturan Direksi', ['peraturan direksi', 'peraturan direktur']],
    ['Surat Edaran', ['surat edaran']],
    ['Keputusan', ['keputusan', 'surat keputusan', 'sk']],
    ['SOP', ['sop', 'standar operasional prosedur', 'standard operating procedure']],
    ['Kebijakan', ['kebijakan', 'policy']],
    ['Buku Pedoman Perusahaan', ['buku pedoman perusahaan', 'bpp']],
    ['Piagam', ['piagam', 'charter']],
    ['Petunjuk Teknis', ['petunjuk teknis', 'juknis', 'technical guideline']],
    ['Pedoman', ['pedoman', 'guideline', 'manual kerja', 'manual operasional']],
    ['Instruksi Kerja', ['instruksi kerja', 'work instruction']],
    ['Prosedur', ['prosedur', 'procedure']],
    ['Standar', ['standar', 'standard']],
    ['Ketentuan Internal', ['ketentuan internal', 'peraturan internal', 'aturan internal', 'rulebook']]
  ];
  for (const [type, aliases] of mapping) {
    if (aliases.some(alias => normalized === alias || normalized.startsWith(alias + ' '))) {
      return type;
    }
  }
  return null;
}

function classifyInternalRule(input: {
  title: string;
  textPreview?: string | null;
  category?: string | null;
  module?: string | null;
  explicitType?: string | null;
}) {
  const module = normalize(input.module);
  const category = normalize(input.category);
  if (
    module === 'regulatory source' ||
    module === 'regulatory_source' ||
    category.includes('external regulation') ||
    category.includes('regulasi eksternal')
  ) return null;

  const titleOnly = normalize(input.title);
  const externalTitlePatterns = [
    /\bpojk\b/,
    /\bseojk\b/,
    /\bperaturan otoritas jasa keuangan\b/,
    /\bperaturan bank indonesia\b/,
    /\bpbi\b/,
    /\bpadg\b/,
    /\bplps\b/,
    /\bperaturan lembaga penjamin simpanan\b/,
    /\bperaturan ppatk\b/,
    /\bundang undang\b/,
    /\bperaturan pemerintah\b/
  ];
  if (externalTitlePatterns.some(pattern => pattern.test(titleOnly))) return null;

  const explicitType =
    canonicalDocumentType(input.explicitType) ||
    canonicalDocumentType(input.category) ||
    canonicalDocumentType(input.module);
  if (explicitType) {
    return {
      documentType: explicitType,
      confidence: 'HIGH' as const,
      classificationReason: 'Jenis ketentuan berasal dari metadata/kategori eksplisit pada database TotalARC.'
    };
  }

  const haystack = normalize(
    [input.title, input.category || '', input.textPreview || ''].join(' ')
  ).slice(0, 16000);

  const rules: Array<[string, RegExp, string]> = [
    ['Peraturan Direksi', /\bperaturan (direksi|direktur)\b/, 'Peraturan Direksi terdeteksi pada judul/teks sumber.'],
    ['Surat Edaran', /\bsurat edaran\b|\bse (?:no|nomor)\b/, 'Surat Edaran terdeteksi pada judul/teks sumber.'],
    ['Keputusan', /\bsurat keputusan\b|\bkeputusan direksi\b|\bsk (?:direksi|no|nomor)\b/, 'Keputusan internal terdeteksi pada judul/teks sumber.'],
    ['SOP', /\bstandar operasional prosedur\b|\bstandard operating procedure\b|\bsop\b/, 'SOP terdeteksi pada judul/teks sumber.'],
    ['Kebijakan', /\bkebijakan\b|\bpolicy\b/, 'Kebijakan/Policy terdeteksi pada judul/teks sumber.'],
    ['Buku Pedoman Perusahaan', /\bbuku pedoman perusahaan\b|\bbpp\b/, 'Buku Pedoman Perusahaan terdeteksi pada judul/teks sumber.'],
    ['Piagam', /\bpiagam\b|\bcharter\b/, 'Piagam/charter internal terdeteksi pada judul/teks sumber.'],
    ['Petunjuk Teknis', /\bpetunjuk teknis\b|\bjuknis\b|\btechnical guideline\b/, 'Petunjuk teknis internal terdeteksi pada judul/teks sumber.'],
    ['Pedoman', /\bpedoman\b|\bguideline\b|\bmanual kerja\b|\bmanual operasional\b/, 'Pedoman/manual internal terdeteksi pada judul/teks sumber.'],
    ['Instruksi Kerja', /\binstruksi kerja\b|\bwork instruction\b/, 'Instruksi kerja terdeteksi pada judul/teks sumber.'],
    ['Prosedur', /\bprosedur\b|\bprocedure\b/, 'Prosedur terdeteksi pada judul/teks sumber.'],
    ['Standar', /\bstandar\b|\bstandard\b/, 'Standar internal terdeteksi pada judul/teks sumber.'],
    ['Ketentuan Internal', /\bketentuan\b|\baturan internal\b|\bperaturan internal\b|\brulebook\b/, 'Ketentuan/aturan internal terdeteksi pada judul/teks sumber.']
  ];

  for (const [documentType, pattern, reason] of rules) {
    if (pattern.test(haystack)) {
      const titleHit = pattern.test(normalize(input.title));
      return {
        documentType,
        confidence: titleHit ? 'HIGH' as const : 'MEDIUM' as const,
        classificationReason: reason
      };
    }
  }
  return null;
}

async function getDb() {
  await ensureCoreDomainSchema();
  await ensureSourceLibrarySchema();
  await ensureEvidenceRepositorySchema();
  await ensurePolicyLibrarySchema();
  await ensureRegulatoryObligationSchema();
  await ensureRcsaSchema();
  await ensureAssuranceSchema();

  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('POLICY_REGISTRY_DATABASE_UNAVAILABLE');
  return db;
}

async function all<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  const result = values.length ? await stmt.bind(...values).all<T>() : await stmt.all<T>();
  return result.results || [];
}

async function first<T = Record<string, unknown>>(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).first<T>() : stmt.first<T>();
}

async function run(db: D1DatabaseLike, sql: string, values: unknown[] = []) {
  const stmt = db.prepare(sql);
  return values.length ? stmt.bind(...values).run() : stmt.run();
}

async function tableExists(db: D1DatabaseLike, name: string) {
  const row = await first<{ count?: number }>(
    db,
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?",
    [name]
  );
  return Number(row?.count || 0) > 0;
}

async function executeSchema(db: D1DatabaseLike) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS PolicyRegistrySource (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      policyDocumentId TEXT NOT NULL,
      sourceType TEXT NOT NULL,
      sourceId TEXT NOT NULL,
      sourceVersionId TEXT,
      sourceTitle TEXT NOT NULL,
      classificationReason TEXT,
      confidence TEXT NOT NULL DEFAULT 'MEDIUM',
      discoveredAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_registry_source_unique
      ON PolicyRegistrySource(institutionId,sourceType,sourceId)`,
    `CREATE INDEX IF NOT EXISTS idx_policy_registry_source_policy
      ON PolicyRegistrySource(institutionId,policyDocumentId)`,
    `CREATE TABLE IF NOT EXISTS PolicyEntityLink (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      policyDocumentId TEXT NOT NULL,
      targetType TEXT NOT NULL,
      targetId TEXT NOT NULL,
      relationship TEXT NOT NULL,
      sourceType TEXT NOT NULL DEFAULT 'AUTO_SYNC',
      sourceId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_entity_link_unique
      ON PolicyEntityLink(institutionId,policyDocumentId,targetType,targetId,relationship,sourceType)`,
    `CREATE INDEX IF NOT EXISTS idx_policy_entity_link_policy
      ON PolicyEntityLink(institutionId,policyDocumentId,targetType)`,
    `CREATE INDEX IF NOT EXISTS idx_policy_entity_link_target
      ON PolicyEntityLink(institutionId,targetType,targetId)`,
    `CREATE TABLE IF NOT EXISTS PolicyRegistrySyncRun (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      status TEXT NOT NULL,
      discoveredCandidates INTEGER NOT NULL DEFAULT 0,
      insertedPolicies INTEGER NOT NULL DEFAULT 0,
      mappedSources INTEGER NOT NULL DEFAULT 0,
      generatedLinks INTEGER NOT NULL DEFAULT 0,
      syncVersion TEXT NOT NULL DEFAULT 'legacy',
      actorName TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      completedAt TEXT,
      errorCode TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_policy_registry_sync_run
      ON PolicyRegistrySyncRun(institutionId,startedAt)`
  ];
  for (const statement of statements) await run(db, statement);

  const syncColumns = await all<{ name?: string }>(db, 'PRAGMA table_info(PolicyRegistrySyncRun)');
  const syncColumnNames = new Set(syncColumns.map(column => String(column.name || '')));
  if (!syncColumnNames.has('syncVersion')) {
    try {
      await run(
        db,
        "ALTER TABLE PolicyRegistrySyncRun ADD COLUMN syncVersion TEXT NOT NULL DEFAULT 'legacy'"
      );
    } catch (error) {
      if (!String(error).toLowerCase().includes('duplicate column')) throw error;
    }
  }
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensurePolicyRegistrySchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = await getDb();
    await executeSchema(db);
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

async function discoverCandidates(db: D1DatabaseLike, institutionId: string) {
  const candidates: Candidate[] = [];

  const sources = await all<Record<string, unknown>>(
    db,
    `SELECT s.id,s.title,s.module,s.sourceCreatedAt,s.sourceModifiedAt,s.rawSha256,s.textSha256,s.metadataJson,
            (SELECT t.textContent
               FROM SourceTextChunk t
              WHERE t.documentId=s.id AND t.institutionId=s.institutionId
              ORDER BY t.chunkIndex ASC LIMIT 1) AS textPreview
       FROM SourceDocument s
      WHERE s.institutionId=? AND s.status='Active'
      ORDER BY s.updatedAt DESC
      LIMIT 5000`,
    [institutionId]
  );

  for (const row of sources) {
    const metadata = safeJson(row.metadataJson);
    const classification = classifyInternalRule({
      title: String(row.title || ''),
      textPreview: String(row.textPreview || ''),
      module: row.module ? String(row.module) : null,
      explicitType: clean(
        metadata.documentType ||
        metadata.policyType ||
        metadata.ruleType ||
        metadata.type
      )
    });
    if (!classification) continue;
    candidates.push({
      sourceType: 'SOURCE_DOCUMENT',
      sourceId: String(row.id),
      sourceVersionId: null,
      contentHash: clean(row.rawSha256 || row.textSha256),
      title: String(row.title || '').trim(),
      textPreview: String(row.textPreview || ''),
      module: clean(row.module),
      ownerName: clean(metadata.ownerName || metadata.documentOwner || metadata.processOwner),
      ownerUnit: clean(metadata.ownerUnit || metadata.unitKerja || metadata.organizationUnit),
      issueDate: clean(row.sourceCreatedAt || row.sourceModifiedAt),
      version: clean(metadata.version || metadata.documentVersion),
      metadata,
      ...classification
    });
  }

  const evidence = await all<Record<string, unknown>>(
    db,
    `SELECT e.id,e.title,e.description,e.category,e.ownerName,e.sourceSystem,e.createdAt,e.updatedAt,
            e.currentVersionId,v.fileName,v.versionNo,v.sha256
       FROM EvidenceDocument e
       LEFT JOIN EvidenceVersion v
         ON v.id=e.currentVersionId AND v.institutionId=e.institutionId
      WHERE e.institutionId=? AND e.status='Active'
      ORDER BY e.updatedAt DESC
      LIMIT 5000`,
    [institutionId]
  );

  const hasAnalysis = await tableExists(db, 'ProcessDocumentAnalysis');
  const analysisRows = hasAnalysis
    ? await all<Record<string, unknown>>(
        db,
        `SELECT evidenceDocumentId,processId,fileName,sourceTextPreview,status,updatedAt
           FROM ProcessDocumentAnalysis
          WHERE institutionId=?
          ORDER BY updatedAt DESC
          LIMIT 5000`,
        [institutionId]
      )
    : [];
  const analysisByEvidence = new Map<string, Record<string, unknown>>();
  for (const row of analysisRows) {
    const key = String(row.evidenceDocumentId || '');
    if (key && !analysisByEvidence.has(key)) analysisByEvidence.set(key, row);
  }

  for (const row of evidence) {
    const analysis = analysisByEvidence.get(String(row.id)) || null;
    const title = String(row.fileName || row.title || '').trim();
    const classification = classifyInternalRule({
      title,
      textPreview: String(analysis?.sourceTextPreview || row.description || ''),
      category: row.category ? String(row.category) : null,
      module: row.sourceSystem ? String(row.sourceSystem) : null,
      explicitType: row.category ? String(row.category) : null
    });
    if (!classification) continue;
    candidates.push({
      sourceType: 'EVIDENCE_DOCUMENT',
      sourceId: String(row.id),
      sourceVersionId: clean(row.currentVersionId),
      contentHash: clean(row.sha256),
      title,
      textPreview: String(analysis?.sourceTextPreview || ''),
      category: clean(row.category),
      module: clean(row.sourceSystem),
      ownerName: clean(row.ownerName),
      ownerUnit: null,
      issueDate: clean(row.createdAt),
      version: row.versionNo ? String(row.versionNo) : null,
      metadata: analysis ? { processId: analysis.processId, analysisStatus: analysis.status } : {},
      ...classification
    });
  }

  return candidates;
}

async function policyByNormalizedTitle(db: D1DatabaseLike, institutionId: string) {
  const rows = await all<{
    id: string;
    title: string;
    documentType: string;
    sourceDocumentId: string | null;
  }>(
    db,
    `SELECT id,title,documentType,sourceDocumentId
       FROM PolicyDocument
      WHERE institutionId=?
      LIMIT 5000`,
    [institutionId]
  );
  const map = new Map<string, {
    id: string;
    title: string;
    documentType: string;
    sourceDocumentId: string | null;
  }>();
  for (const row of rows) {
    const key = normalize(row.documentType) + ':' + policyIdentityTitle(row.title);
    if (key !== ':' && !map.has(key)) map.set(key, row);
  }
  return map;
}

async function mapExistingPolicySources(
  db: D1DatabaseLike,
  institutionId: string
) {
  const rows = await all<Record<string, unknown>>(
    db,
    `SELECT p.id AS policyDocumentId,p.sourceDocumentId,s.title
       FROM PolicyDocument p
       JOIN SourceDocument s
         ON s.id=p.sourceDocumentId AND s.institutionId=p.institutionId
      WHERE p.institutionId=? AND p.sourceDocumentId IS NOT NULL
      LIMIT 5000`,
    [institutionId]
  );
  let mapped = 0;
  const now = nowIso();
  for (const row of rows) {
    const existing = await first<{ id: string }>(
      db,
      `SELECT id FROM PolicyRegistrySource
        WHERE institutionId=? AND sourceType='SOURCE_DOCUMENT' AND sourceId=?
        LIMIT 1`,
      [institutionId, String(row.sourceDocumentId || '')]
    );
    if (existing) continue;
    await run(
      db,
      `INSERT INTO PolicyRegistrySource (
        id,institutionId,policyDocumentId,sourceType,sourceId,sourceVersionId,
        sourceTitle,classificationReason,confidence,discoveredAt,updatedAt
      ) VALUES (?,?,?,'SOURCE_DOCUMENT',?,NULL,?,'Existing PolicyDocument source mapping.','HIGH',?,?)`,
      [
        crypto.randomUUID(),
        institutionId,
        String(row.policyDocumentId || ''),
        String(row.sourceDocumentId || ''),
        String(row.title || ''),
        now,
        now
      ]
    );
    mapped += 1;
  }
  return mapped;
}

async function ensureCandidateRegistration(
  db: D1DatabaseLike,
  institutionId: string,
  candidate: Candidate,
  actorName: string,
  titleMap: Map<string, {
    id: string;
    title: string;
    documentType: string;
    sourceDocumentId: string | null;
  }>,
  hashMap: Map<string, string>
) {
  const existingRegistry = await first<{ policyDocumentId: string }>(
    db,
    `SELECT policyDocumentId
       FROM PolicyRegistrySource
      WHERE institutionId=? AND sourceType=? AND sourceId=?
      LIMIT 1`,
    [institutionId, candidate.sourceType, candidate.sourceId]
  );
  if (existingRegistry) {
    if (candidate.contentHash) hashMap.set(candidate.contentHash, existingRegistry.policyDocumentId);
    return { policyDocumentId: existingRegistry.policyDocumentId, inserted: false, mapped: false };
  }

  let policyId: string | null = candidate.contentHash
    ? hashMap.get(candidate.contentHash) || null
    : null;
  if (candidate.sourceType === 'SOURCE_DOCUMENT') {
    const existing = await first<{ id: string }>(
      db,
      `SELECT id
         FROM PolicyDocument
        WHERE institutionId=? AND sourceDocumentId=?
        LIMIT 1`,
      [institutionId, candidate.sourceId]
    );
    policyId = existing?.id || null;
  }

  if (!policyId) {
    const identityKey = normalize(candidate.documentType) + ':' + policyIdentityTitle(candidate.title);
    policyId = titleMap.get(identityKey)?.id || null;
  }

  let inserted = false;
  if (!policyId) {
    policyId = crypto.randomUUID();
    const now = nowIso();
    const documentCode =
      'AUTO-' + typeCode(candidate.documentType) + '-' +
      shortHash(candidate.sourceType + ':' + candidate.sourceId);

    await run(
      db,
      `INSERT INTO PolicyDocument (
        id,institutionId,sourceDocumentId,documentCode,documentType,title,
        ownerUnit,ownerName,status,version,issueDate,effectiveDate,lastReviewDate,
        nextReviewDate,reviewCycleMonths,expiryDate,scope,summary,createdBy,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        policyId,
        institutionId,
        candidate.sourceType === 'SOURCE_DOCUMENT' ? candidate.sourceId : null,
        documentCode,
        candidate.documentType,
        candidate.title,
        candidate.ownerUnit || null,
        candidate.ownerName || null,
        'Perlu Validasi',
        candidate.version || 'Terdeteksi',
        candidate.issueDate || null,
        null,
        null,
        null,
        12,
        null,
        null,
        'Terdaftar otomatis dari database TotalARC. Metadata keberlakuan, versi, pemilik, dan jadwal review harus divalidasi Tim Kepatuhan.',
        actorName,
        now,
        now
      ]
    );
    inserted = true;
    titleMap.set(normalize(candidate.documentType) + ':' + policyIdentityTitle(candidate.title), {
      id: policyId,
      title: candidate.title,
      documentType: candidate.documentType,
      sourceDocumentId: candidate.sourceType === 'SOURCE_DOCUMENT' ? candidate.sourceId : null
    });
  }

  const now = nowIso();
  await run(
    db,
    `INSERT INTO PolicyRegistrySource (
      id,institutionId,policyDocumentId,sourceType,sourceId,sourceVersionId,
      sourceTitle,classificationReason,confidence,discoveredAt,updatedAt
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      crypto.randomUUID(),
      institutionId,
      policyId,
      candidate.sourceType,
      candidate.sourceId,
      candidate.sourceVersionId || null,
      candidate.title,
      candidate.classificationReason,
      candidate.confidence,
      now,
      now
    ]
  );

  return { policyDocumentId: policyId, inserted, mapped: true };
}

async function insertLink(
  db: D1DatabaseLike,
  institutionId: string,
  policyDocumentId: string,
  targetType: string,
  targetId: string,
  relationship: string,
  sourceId?: string | null
) {
  if (!policyDocumentId || !targetType || !targetId) return false;
  const now = nowIso();
  await run(
    db,
    `INSERT OR IGNORE INTO PolicyEntityLink (
      id,institutionId,policyDocumentId,targetType,targetId,relationship,
      sourceType,sourceId,createdAt,updatedAt
    ) VALUES (?,?,?,?,?,?, 'AUTO_SYNC', ?,?,?)`,
    [
      crypto.randomUUID(),
      institutionId,
      policyDocumentId,
      targetType,
      targetId,
      relationship,
      sourceId || null,
      now,
      now
    ]
  );
  return true;
}

function normalizeEvidenceTargetType(entityType: unknown) {
  const value = String(entityType || '').trim().toUpperCase();
  const mapping: Record<string, string> = {
    PROCESS: 'PROCESS',
    RISK: 'RISK',
    CONTROL: 'CONTROL',
    TOD: 'TOD_TEST',
    TOE: 'TOE_TEST',
    DEFICIENCY: 'DEFICIENCY',
    MAP: 'REMEDIATION_MAP',
    SCOPE: 'ICOFR_SCOPE',
    WORKPAPER_REVIEW: 'ICOFR_WORKPAPER',
    WORKPAPER_EVIDENCE: 'ICOFR_WORKPAPER_EVIDENCE',
    TOE_SAMPLE: 'TOE_SAMPLE',
    SAMPLING_PLAN: 'ICOFR_SAMPLING_PLAN',
    PBC_REQUEST: 'ICOFR_PBC_REQUEST',
    SUB_CERTIFICATION: 'ICOFR_SUB_CERTIFICATION',
    ATTESTATION: 'ICOFR_ATTESTATION',
    EVIDENCE_PACK: 'ICOFR_EVIDENCE_PACK',
    TESTING_PLAN_ITEM: 'ICOFR_TESTING_PLAN_ITEM'
  };
  return mapping[value] || value;
}

async function rebuildPolicyLinks(db: D1DatabaseLike, institutionId: string) {
  await run(
    db,
    "DELETE FROM PolicyEntityLink WHERE institutionId=? AND sourceType='AUTO_SYNC'",
    [institutionId]
  );

  let generated = 0;
  const registry = await all<Record<string, unknown>>(
    db,
    `SELECT policyDocumentId,sourceType,sourceId
       FROM PolicyRegistrySource
      WHERE institutionId=?`,
    [institutionId]
  );

  const policyByEvidence = new Map<string, string[]>();
  const policyBySource = new Map<string, string[]>();
  for (const item of registry) {
    const policyId = String(item.policyDocumentId || '');
    const sourceId = String(item.sourceId || '');
    if (!policyId || !sourceId) continue;
    const sourceType = String(item.sourceType || '');
    const map = sourceType === 'EVIDENCE_DOCUMENT' ? policyByEvidence : policyBySource;
    const list = map.get(sourceId) || [];
    list.push(policyId);
    map.set(sourceId, list);

    generated += await insertLink(
      db,
      institutionId,
      policyId,
      sourceType === 'EVIDENCE_DOCUMENT' ? 'EVIDENCE_DOCUMENT' : 'SOURCE_DOCUMENT',
      sourceId,
      'REGISTERED_FROM',
      sourceId
    ) ? 1 : 0;
  }

  const evidenceLinks = await all<Record<string, unknown>>(
    db,
    `SELECT documentId,entityType,entityId,relationship
       FROM EvidenceLink
      WHERE institutionId=?
      LIMIT 20000`,
    [institutionId]
  );
  for (const link of evidenceLinks) {
    const policies = policyByEvidence.get(String(link.documentId || '')) || [];
    for (const policyId of policies) {
      generated += await insertLink(
        db,
        institutionId,
        policyId,
        normalizeEvidenceTargetType(link.entityType),
        String(link.entityId || ''),
        String(link.relationship || 'SUPPORTS'),
        String(link.documentId || '')
      ) ? 1 : 0;
    }
  }

  if (await tableExists(db, 'ProcessDocumentAnalysis')) {
    const analyses = await all<Record<string, unknown>>(
      db,
      `SELECT evidenceDocumentId,processId
         FROM ProcessDocumentAnalysis
        WHERE institutionId=? AND status!='REJECTED'
        LIMIT 10000`,
      [institutionId]
    );
    for (const analysis of analyses) {
      const policies = policyByEvidence.get(String(analysis.evidenceDocumentId || '')) || [];
      for (const policyId of policies) {
        generated += await insertLink(
          db,
          institutionId,
          policyId,
          'PROCESS',
          String(analysis.processId || ''),
          'GOVERNS_OR_SUPPORTS',
          String(analysis.evidenceDocumentId || '')
        ) ? 1 : 0;
      }
    }
  }

  const sourceTargetCache = new Map<string, boolean>();
  const sourceTargetExists = async (type: string, id: string) => {
    const normalizedType = type.toUpperCase();
    if (!['PROCESS', 'RISK', 'CONTROL'].includes(normalizedType) || !id) return false;
    const cacheKey = normalizedType + ':' + id;
    if (sourceTargetCache.has(cacheKey)) return Boolean(sourceTargetCache.get(cacheKey));

    const sql =
      normalizedType === 'PROCESS'
        ? 'SELECT id FROM BusinessProcess WHERE id=? AND institutionId=? LIMIT 1'
        : normalizedType === 'RISK'
          ? 'SELECT id FROM RiskMaster WHERE id=? AND institutionId=? LIMIT 1'
          : 'SELECT id FROM ControlMaster WHERE id=? AND institutionId=? LIMIT 1';
    const exists = Boolean(await first(db, sql, [id, institutionId]));
    sourceTargetCache.set(cacheKey, exists);
    return exists;
  };

  const sourceRows = await all<Record<string, unknown>>(
    db,
    `SELECT id,metadataJson
       FROM SourceDocument
      WHERE institutionId=? AND status='Active'
      LIMIT 5000`,
    [institutionId]
  );
  for (const source of sourceRows) {
    const policies = policyBySource.get(String(source.id || '')) || [];
    if (!policies.length) continue;
    const metadata = safeJson(source.metadataJson);
    const metadataEntityType = String(metadata.entityType || '').toUpperCase();
    const directTargets = [
      ['PROCESS', metadata.processId || metadata.businessProcessId],
      ['RISK', metadata.riskId],
      ['CONTROL', metadata.controlId],
      [
        ['PROCESS', 'RISK', 'CONTROL'].includes(metadataEntityType) ? metadataEntityType : '',
        metadata.entityId
      ]
    ] as Array<[string, unknown]>;
    for (const [type, id] of directTargets) {
      const targetId = clean(id);
      if (!type || !targetId || !(await sourceTargetExists(type, targetId))) continue;
      for (const policyId of policies) {
        generated += await insertLink(
          db,
          institutionId,
          policyId,
          type,
          targetId,
          'SOURCE_METADATA',
          String(source.id || '')
        ) ? 1 : 0;
      }
    }
  }

  const operationalRiskSources = await all<Record<string, unknown>>(
    db,
    `SELECT riskId,sourceDocumentId
       FROM OperationalRiskMetadata
      WHERE institutionId=? AND sourceDocumentId IS NOT NULL
      LIMIT 10000`,
    [institutionId]
  );
  for (const row of operationalRiskSources) {
    const sourceId = String(row.sourceDocumentId || '');
    const riskId = String(row.riskId || '');
    for (const policyId of policyBySource.get(sourceId) || []) {
      generated += await insertLink(
        db, institutionId, policyId, 'RISK', riskId, 'SOURCE_RISK_MAPPING', sourceId
      ) ? 1 : 0;
    }
  }

  const rcmControlSources = await all<Record<string, unknown>>(
    db,
    `SELECT controlId,sourceDocumentId
       FROM RCMControlSourceMetadata
      WHERE institutionId=? AND sourceDocumentId IS NOT NULL
      LIMIT 10000`,
    [institutionId]
  );
  for (const row of rcmControlSources) {
    const sourceId = String(row.sourceDocumentId || '');
    const controlId = String(row.controlId || '');
    for (const policyId of policyBySource.get(sourceId) || []) {
      generated += await insertLink(
        db, institutionId, policyId, 'CONTROL', controlId, 'SOURCE_CONTROL_MAPPING', sourceId
      ) ? 1 : 0;
      generated += await insertLink(
        db, institutionId, policyId, 'RCM', controlId, 'SOURCE_RCM_MAPPING', sourceId
      ) ? 1 : 0;
    }
  }

  const rcmDraftSources = await all<Record<string, unknown>>(
    db,
    `SELECT id,sourceDocumentId,operationalControlId
       FROM RCMDraftReference
      WHERE institutionId=? AND sourceDocumentId IS NOT NULL
      LIMIT 10000`,
    [institutionId]
  );
  for (const row of rcmDraftSources) {
    const sourceId = String(row.sourceDocumentId || '');
    const draftId = String(row.id || '');
    const controlId = String(row.operationalControlId || '');
    for (const policyId of policyBySource.get(sourceId) || []) {
      generated += await insertLink(
        db, institutionId, policyId, 'RCM', draftId, 'SOURCE_RCM_REFERENCE', sourceId
      ) ? 1 : 0;
      if (controlId) {
        generated += await insertLink(
          db, institutionId, policyId, 'CONTROL', controlId, 'RCM_OPERATIONAL_CONTROL', draftId
        ) ? 1 : 0;
      }
    }
  }

  if (await tableExists(db, 'PolicyRelationship')) {
    const relationships = await all<Record<string, unknown>>(
      db,
      `SELECT sourceType,sourceId,targetType,targetId,relationType
         FROM PolicyRelationship
        WHERE institutionId=? AND status='Aktif'
        LIMIT 10000`,
      [institutionId]
    );
    for (const row of relationships) {
      const sourceType = String(row.sourceType || '').toUpperCase();
      const targetType = String(row.targetType || '').toUpperCase();
      const sourceId = String(row.sourceId || '');
      const targetId = String(row.targetId || '');
      const relationType = String(row.relationType || 'RELATED_TO');

      if (sourceType === 'INTERNAL' && sourceId) {
        generated += await insertLink(
          db,
          institutionId,
          sourceId,
          targetType === 'INTERNAL' ? 'INTERNAL_POLICY' : 'EXTERNAL_REGULATION',
          targetId,
          relationType,
          String(row.sourceId || '')
        ) ? 1 : 0;
      }

      if (targetType === 'INTERNAL' && targetId) {
        generated += await insertLink(
          db,
          institutionId,
          targetId,
          sourceType === 'INTERNAL' ? 'INTERNAL_POLICY' : 'EXTERNAL_REGULATION',
          sourceId,
          'REVERSE_' + relationType,
          String(row.targetId || '')
        ) ? 1 : 0;
      }
    }
  }

  const policyImpacts = await all<Record<string, unknown>>(
    db,
    `SELECT policyDocumentId,regulationId
       FROM PolicyRegulationImpact
      WHERE institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  for (const impact of policyImpacts) {
    generated += await insertLink(
      db,
      institutionId,
      String(impact.policyDocumentId || ''),
      'EXTERNAL_REGULATION',
      String(impact.regulationId || ''),
      'IMPACTED_BY',
      String(impact.regulationId || '')
    ) ? 1 : 0;
  }

  const obligationPolicyLinks = await all<Record<string, unknown>>(
    db,
    `SELECT l.obligationId,l.targetId AS policyDocumentId,o.regulationId
       FROM RegulatoryObligationLink l
       JOIN RegulatoryObligation o
         ON o.id=l.obligationId AND o.institutionId=l.institutionId
      WHERE l.institutionId=? AND l.targetType='INTERNAL_POLICY'
      LIMIT 10000`,
    [institutionId]
  );
  const obligationLinks = await all<Record<string, unknown>>(
    db,
    `SELECT obligationId,targetType,targetId,relationship
       FROM RegulatoryObligationLink
      WHERE institutionId=?
      LIMIT 20000`,
    [institutionId]
  );
  const byObligation = new Map<string, Record<string, unknown>[]>();
  for (const link of obligationLinks) {
    const key = String(link.obligationId || '');
    const rows = byObligation.get(key) || [];
    rows.push(link);
    byObligation.set(key, rows);
  }
  for (const item of obligationPolicyLinks) {
    const policyId = String(item.policyDocumentId || '');
    const obligationId = String(item.obligationId || '');
    generated += await insertLink(
      db, institutionId, policyId, 'REGULATORY_OBLIGATION', obligationId, 'IMPLEMENTS', obligationId
    ) ? 1 : 0;
    generated += await insertLink(
      db, institutionId, policyId, 'EXTERNAL_REGULATION', String(item.regulationId || ''), 'DERIVED_FROM', obligationId
    ) ? 1 : 0;
    for (const link of byObligation.get(obligationId) || []) {
      const targetType = String(link.targetType || '');
      const targetId = String(link.targetId || '');
      if (targetType === 'INTERNAL_POLICY' || !targetId) continue;
      generated += await insertLink(
        db,
        institutionId,
        policyId,
        targetType,
        targetId,
        'REGULATORY_TRACEABILITY',
        obligationId
      ) ? 1 : 0;
    }
  }

  const currentLinks = await all<PolicyEntityLinkRecord>(
    db,
    `SELECT id,institutionId,policyDocumentId,targetType,targetId,relationship,sourceType,sourceId,createdAt,updatedAt
       FROM PolicyEntityLink
      WHERE institutionId=? AND sourceType='AUTO_SYNC'
      LIMIT 30000`,
    [institutionId]
  );

  const processIdsByPolicy = new Map<string, Set<string>>();
  const riskIdsByPolicy = new Map<string, Set<string>>();
  const controlIdsByPolicy = new Map<string, Set<string>>();
  const addSet = (map: Map<string, Set<string>>, policyId: string, targetId: string) => {
    const set = map.get(policyId) || new Set<string>();
    set.add(targetId);
    map.set(policyId, set);
  };
  for (const link of currentLinks) {
    if (link.targetType === 'PROCESS') addSet(processIdsByPolicy, link.policyDocumentId, link.targetId);
    if (link.targetType === 'RISK') addSet(riskIdsByPolicy, link.policyDocumentId, link.targetId);
    if (link.targetType === 'CONTROL') addSet(controlIdsByPolicy, link.policyDocumentId, link.targetId);
  }

  const processes = await all<Record<string, unknown>>(
    db,
    `SELECT id,isIcofrRelevant
       FROM BusinessProcess
      WHERE institutionId=?
      LIMIT 5000`,
    [institutionId]
  );
  const risks = await all<Record<string, unknown>>(
    db,
    `SELECT id,processId
       FROM RiskMaster
      WHERE institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  const controls = await all<Record<string, unknown>>(
    db,
    `SELECT id,processId,isKeyControl,isIcofrKey,isItgc
       FROM ControlMaster
      WHERE institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  const processIcofr = new Map(processes.map(row => [String(row.id), Number(row.isIcofrRelevant || 0) === 1]));
  const risksByProcess = new Map<string, string[]>();
  const controlsByProcess = new Map<string, string[]>();
  const controlProcess = new Map<string, string>();
  const controlIcofr = new Map<string, boolean>();
  for (const row of risks) {
    const key = String(row.processId || '');
    const list = risksByProcess.get(key) || [];
    list.push(String(row.id));
    risksByProcess.set(key, list);
  }
  for (const row of controls) {
    const key = String(row.processId || '');
    const controlId = String(row.id || '');
    const list = controlsByProcess.get(key) || [];
    list.push(controlId);
    controlsByProcess.set(key, list);
    controlProcess.set(controlId, key);
    controlIcofr.set(
      controlId,
      Number(row.isIcofrKey || 0) === 1 || Number(row.isItgc || 0) === 1
    );
  }

  const policyIds = new Set([
    ...Array.from(processIdsByPolicy.keys()),
    ...Array.from(riskIdsByPolicy.keys()),
    ...Array.from(controlIdsByPolicy.keys())
  ]);

  for (const policyId of Array.from(policyIds)) {
    const processesForPolicy = processIdsByPolicy.get(policyId) || new Set<string>();
    for (const processId of Array.from(processesForPolicy)) {
      for (const riskId of risksByProcess.get(processId) || []) {
        generated += await insertLink(db, institutionId, policyId, 'RISK', riskId, 'PROCESS_CHAIN', processId) ? 1 : 0;
        addSet(riskIdsByPolicy, policyId, riskId);
      }
      for (const controlId of controlsByProcess.get(processId) || []) {
        generated += await insertLink(db, institutionId, policyId, 'CONTROL', controlId, 'PROCESS_CHAIN', processId) ? 1 : 0;
        addSet(controlIdsByPolicy, policyId, controlId);
      }
      if (processIcofr.get(processId)) {
        generated += await insertLink(db, institutionId, policyId, 'ICOFR_PROCESS', processId, 'ICOFR_RELEVANT', processId) ? 1 : 0;
      }
    }

    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();
    for (const controlId of Array.from(controlSet)) {
      const processId = controlProcess.get(controlId) || '';
      if (controlIcofr.get(controlId) || (processId && processIcofr.get(processId))) {
        generated += await insertLink(
          db,
          institutionId,
          policyId,
          'ICOFR_CONTROL',
          controlId,
          'ICOFR_CONTROL_RELEVANT',
          processId || controlId
        ) ? 1 : 0;
      }
    }
  }

  const controlRiskMappings = await all<Record<string, unknown>>(
    db,
    `SELECT m.controlId,m.riskId
       FROM ControlRiskMapping m
       JOIN ControlMaster c ON c.id=m.controlId
       JOIN RiskMaster r ON r.id=m.riskId
      WHERE c.institutionId=? AND r.institutionId=?
      LIMIT 20000`,
    [institutionId, institutionId]
  );
  for (const policyId of Array.from(policyIds)) {
    const riskSet = riskIdsByPolicy.get(policyId) || new Set<string>();
    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();
    for (const mapping of controlRiskMappings) {
      const controlId = String(mapping.controlId || '');
      const riskId = String(mapping.riskId || '');
      if (controlSet.has(controlId) && riskSet.has(riskId)) {
        generated += await insertLink(
          db, institutionId, policyId, 'RCM', controlId + ':' + riskId, 'GOVERNS_RCM', controlId
        ) ? 1 : 0;
      }
    }
  }

  for (const policyId of Array.from(policyIds)) {
    const processSet = processIdsByPolicy.get(policyId) || new Set<string>();
    const riskSet = riskIdsByPolicy.get(policyId) || new Set<string>();
    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();

    for (const link of evidenceLinks) {
      const targetType = normalizeEvidenceTargetType(link.entityType);
      const targetId = String(link.entityId || '');
      const isRelated =
        (targetType === 'PROCESS' && processSet.has(targetId)) ||
        (targetType === 'RISK' && riskSet.has(targetId)) ||
        (targetType === 'CONTROL' && controlSet.has(targetId));
      if (!isRelated) continue;

      generated += await insertLink(
        db,
        institutionId,
        policyId,
        'EVIDENCE',
        String(link.documentId || ''),
        'SUPPORTING_EVIDENCE',
        targetId
      ) ? 1 : 0;
    }
  }

  const rcsaScopes = await all<Record<string, unknown>>(
    db,
    `SELECT s.id,s.processId,s.riskId,s.controlId,c.campaignCode
       FROM AssessmentScope s
       JOIN AssessmentCampaign c ON c.id=s.campaignId
      WHERE c.institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  for (const policyId of Array.from(policyIds)) {
    const processSet = processIdsByPolicy.get(policyId) || new Set<string>();
    const riskSet = riskIdsByPolicy.get(policyId) || new Set<string>();
    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();
    for (const scope of rcsaScopes) {
      if (
        processSet.has(String(scope.processId || '')) ||
        riskSet.has(String(scope.riskId || '')) ||
        controlSet.has(String(scope.controlId || ''))
      ) {
        generated += await insertLink(
          db, institutionId, policyId, 'RCSA_SCOPE', String(scope.id || ''), 'ASSESSMENT_SCOPE', String(scope.campaignCode || '')
        ) ? 1 : 0;
      }
    }
  }

  const todTests =
    await tableExists(db, 'ICOFRDesignAssessment') && await tableExists(db, 'ICOFRControlDomain')
      ? await all<Record<string, unknown>>(
          db,
          `SELECT d.id,cd.sourceControlId
             FROM ICOFRDesignAssessment d
             JOIN ICOFRControlDomain cd
               ON cd.id=d.controlDomainId AND cd.institutionId=d.institutionId
            WHERE d.institutionId=? AND cd.sourceControlId IS NOT NULL
            LIMIT 10000`,
          [institutionId]
        )
      : [];
  for (const policyId of Array.from(policyIds)) {
    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();
    for (const test of todTests) {
      if (controlSet.has(String(test.sourceControlId || ''))) {
        generated += await insertLink(
          db,
          institutionId,
          policyId,
          'TOD_TEST',
          String(test.id || ''),
          'DESIGN_TESTED_BY',
          String(test.sourceControlId || '')
        ) ? 1 : 0;
      }
    }
  }

  const toeTests = await all<Record<string, unknown>>(
    db,
    `SELECT t.id,t.processId,t.riskId,t.controlId
       FROM ToETest t
       JOIN BusinessProcess p ON p.id=t.processId
      WHERE p.institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  for (const policyId of Array.from(policyIds)) {
    const processSet = processIdsByPolicy.get(policyId) || new Set<string>();
    const riskSet = riskIdsByPolicy.get(policyId) || new Set<string>();
    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();
    for (const test of toeTests) {
      if (
        processSet.has(String(test.processId || '')) ||
        riskSet.has(String(test.riskId || '')) ||
        controlSet.has(String(test.controlId || ''))
      ) {
        generated += await insertLink(
          db, institutionId, policyId, 'TOE_TEST', String(test.id || ''), 'TESTED_BY', String(test.controlId || '')
        ) ? 1 : 0;
      }
    }
  }

  const monitoringRules = await all<Record<string, unknown>>(
    db,
    `SELECT mr.id,mr.ruleId,mr.controlId
       FROM MonitoringRule mr
       JOIN ControlMaster c ON c.id=mr.controlId
      WHERE c.institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  const monitoringRuleIdsByPolicy = new Map<string, Set<string>>();
  for (const policyId of Array.from(policyIds)) {
    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();
    for (const rule of monitoringRules) {
      const controlId = String(rule.controlId || '');
      if (!controlSet.has(controlId)) continue;
      const monitoringRuleId = String(rule.id || '');
      generated += await insertLink(
        db,
        institutionId,
        policyId,
        'CCM_RULE',
        monitoringRuleId,
        'MONITORED_BY',
        controlId
      ) ? 1 : 0;
      const set = monitoringRuleIdsByPolicy.get(policyId) || new Set<string>();
      set.add(monitoringRuleId);
      monitoringRuleIdsByPolicy.set(policyId, set);
    }
  }

  const ccmExceptions = await all<Record<string, unknown>>(
    db,
    `SELECT ce.id,mr.id AS monitoringRuleId,mr.controlId
       FROM CCMException ce
       JOIN MonitoringRun run ON run.id=ce.runId
       JOIN MonitoringRule mr ON mr.ruleId=run.ruleId
       JOIN ControlMaster c ON c.id=mr.controlId
      WHERE c.institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  for (const policyId of Array.from(policyIds)) {
    const ruleSet = monitoringRuleIdsByPolicy.get(policyId) || new Set<string>();
    for (const exception of ccmExceptions) {
      if (!ruleSet.has(String(exception.monitoringRuleId || ''))) continue;
      generated += await insertLink(
        db,
        institutionId,
        policyId,
        'CCM_EXCEPTION',
        String(exception.id || ''),
        'CCM_EXCEPTION',
        String(exception.controlId || '')
      ) ? 1 : 0;
    }
  }

  const issues = await all<Record<string, unknown>>(
    db,
    `SELECT id,processId,riskId,controlId
       FROM Issue
      WHERE institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  const maps = await all<Record<string, unknown>>(
    db,
    `SELECT m.id,m.issueId
       FROM ManagementActionPlan m
       JOIN Issue i ON i.id=m.issueId
      WHERE i.institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  const mapsByIssue = new Map<string, string[]>();
  for (const item of maps) {
    const key = String(item.issueId || '');
    const list = mapsByIssue.get(key) || [];
    list.push(String(item.id));
    mapsByIssue.set(key, list);
  }
  for (const policyId of Array.from(policyIds)) {
    const processSet = processIdsByPolicy.get(policyId) || new Set<string>();
    const riskSet = riskIdsByPolicy.get(policyId) || new Set<string>();
    const controlSet = controlIdsByPolicy.get(policyId) || new Set<string>();
    for (const issue of issues) {
      if (
        processSet.has(String(issue.processId || '')) ||
        riskSet.has(String(issue.riskId || '')) ||
        controlSet.has(String(issue.controlId || ''))
      ) {
        const issueId = String(issue.id || '');
        generated += await insertLink(
          db, institutionId, policyId, 'REMEDIATION_ISSUE', issueId, 'REMEDIATION_TRACE', issueId
        ) ? 1 : 0;
        for (const mapId of mapsByIssue.get(issueId) || []) {
          generated += await insertLink(
            db, institutionId, policyId, 'REMEDIATION_MAP', mapId, 'ACTION_PLAN', issueId
          ) ? 1 : 0;
        }
      }
    }
  }

  const total = await first<{ count?: number }>(
    db,
    "SELECT COUNT(*) AS count FROM PolicyEntityLink WHERE institutionId=? AND sourceType='AUTO_SYNC'",
    [institutionId]
  );
  return Number(total?.count || 0);
}

export async function getPolicyRegistrySummary(institutionId: string) {
  const db = await ensurePolicyRegistrySchema();

  const [
    registered,
    unmappedRow,
    linkAggregates,
    lastSync,
    sourceFreshness,
    evidenceFreshness
  ] = await Promise.all([
    all<Record<string, unknown>>(
      db,
      `SELECT r.policyDocumentId,r.sourceType,r.sourceId
         FROM PolicyRegistrySource r
         JOIN PolicyDocument p ON p.id=r.policyDocumentId AND p.institutionId=r.institutionId
        WHERE r.institutionId=?
        LIMIT 10000`,
      [institutionId]
    ),
    first<{ count?: number }>(
      db,
      `SELECT COUNT(*) AS count
         FROM PolicyDocument p
         LEFT JOIN PolicyRegistrySource r
           ON r.institutionId=p.institutionId
          AND r.policyDocumentId=p.id
          AND r.sourceType='SOURCE_DOCUMENT'
          AND r.sourceId=p.sourceDocumentId
        WHERE p.institutionId=?
          AND p.sourceDocumentId IS NOT NULL
          AND r.id IS NULL`,
      [institutionId]
    ),
    all<{ policyDocumentId: string; targetType: string; count: number }>(
      db,
      `SELECT policyDocumentId,targetType,COUNT(*) AS count
         FROM PolicyEntityLink
        WHERE institutionId=?
        GROUP BY policyDocumentId,targetType
        ORDER BY policyDocumentId,targetType
        LIMIT 10000`,
      [institutionId]
    ),
    first<Record<string, unknown>>(
      db,
      `SELECT id,status,discoveredCandidates,insertedPolicies,mappedSources,generatedLinks,
              syncVersion,actorName,startedAt,completedAt,errorCode
         FROM PolicyRegistrySyncRun
        WHERE institutionId=?
        ORDER BY startedAt DESC
        LIMIT 1`,
      [institutionId]
    ),
    first<{ updatedAt?: string | null }>(
      db,
      `SELECT MAX(updatedAt) AS updatedAt
         FROM SourceDocument
        WHERE institutionId=? AND status='Active'`,
      [institutionId]
    ),
    first<{ updatedAt?: string | null }>(
      db,
      `SELECT MAX(updatedAt) AS updatedAt
         FROM EvidenceDocument
        WHERE institutionId=? AND status='Active'`,
      [institutionId]
    )
  ]);

  const sourcesByPolicy: Record<string, Array<{ sourceType: string; sourceId: string }>> = {};
  for (const row of registered) {
    const policyId = String(row.policyDocumentId || '');
    if (!policyId) continue;
    sourcesByPolicy[policyId] ||= [];
    sourcesByPolicy[policyId].push({
      sourceType: String(row.sourceType || ''),
      sourceId: String(row.sourceId || '')
    });
  }

  const byPolicy: Record<string, Record<string, number>> = {};
  const byTargetType: Record<string, number> = {};
  let totalLinks = 0;
  for (const row of linkAggregates) {
    const policyId = String(row.policyDocumentId || '');
    const targetType = String(row.targetType || '');
    const count = Number(row.count || 0);
    if (!policyId || !targetType || count <= 0) continue;
    byPolicy[policyId] ||= {};
    byPolicy[policyId][targetType] = count;
    byTargetType[targetType] = (byTargetType[targetType] || 0) + count;
    totalLinks += count;
  }

  const lastCompletedAt = clean(lastSync?.completedAt);
  const newestSourceAt = [sourceFreshness?.updatedAt, evidenceFreshness?.updatedAt]
    .filter(Boolean)
    .map(value => String(value))
    .sort()
    .at(-1) || null;
  const unmappedPolicySources = Number(unmappedRow?.count || 0);
  const syncRequired =
    !lastSync ||
    String(lastSync.status || '') !== 'PASS' ||
    String(lastSync.syncVersion || 'legacy') !== POLICY_REGISTRY_SYNC_VERSION ||
    unmappedPolicySources > 0 ||
    Boolean(newestSourceAt && (!lastCompletedAt || newestSourceAt > lastCompletedAt));

  const discoveredCandidates = Number(lastSync?.discoveredCandidates || registered.length || 0);
  const registeredCandidates = registered.length;

  return {
    metrics: {
      discoveredCandidates,
      registeredCandidates,
      missingCandidates: syncRequired
        ? Math.max(discoveredCandidates - registeredCandidates, 0)
        : 0,
      unmappedPolicySources,
      totalLinks,
      policiesWithLinks: Object.keys(byPolicy).length
    },
    byPolicy,
    byTargetType,
    sourcesByPolicy,
    candidates: [],
    syncRequired,
    syncVersion: POLICY_REGISTRY_SYNC_VERSION,
    lastSync: lastSync || null,
    coverageMode: 'SUMMARY'
  };
}

export async function getPolicyRegistryCoverage(institutionId: string) {
  const db = await ensurePolicyRegistrySchema();
  const candidates = await discoverCandidates(db, institutionId);
  const registered = await all<Record<string, unknown>>(
    db,
    `SELECT r.policyDocumentId,r.sourceType,r.sourceId
       FROM PolicyRegistrySource r
       JOIN PolicyDocument p ON p.id=r.policyDocumentId AND p.institutionId=r.institutionId
      WHERE r.institutionId=?
      LIMIT 10000`,
    [institutionId]
  );
  const registeredKeys = new Set(registered.map(row => String(row.sourceType) + ':' + String(row.sourceId)));
  const existingPolicySources = await all<{ sourceDocumentId: string }>(
    db,
    `SELECT sourceDocumentId
       FROM PolicyDocument
      WHERE institutionId=? AND sourceDocumentId IS NOT NULL
      LIMIT 5000`,
    [institutionId]
  );
  const unmappedPolicySources = existingPolicySources.filter(row =>
    !registeredKeys.has('SOURCE_DOCUMENT:' + String(row.sourceDocumentId || ''))
  ).length;
  const sourcesByPolicy: Record<string, Array<{ sourceType: string; sourceId: string }>> = {};
  for (const row of registered) {
    const policyId = String(row.policyDocumentId || '');
    if (!policyId) continue;
    sourcesByPolicy[policyId] ||= [];
    sourcesByPolicy[policyId].push({
      sourceType: String(row.sourceType || ''),
      sourceId: String(row.sourceId || '')
    });
  }
  const linkAggregates = await all<{ policyDocumentId: string; targetType: string; count: number }>(
    db,
    `SELECT policyDocumentId,targetType,COUNT(*) AS count
       FROM PolicyEntityLink
      WHERE institutionId=?
      GROUP BY policyDocumentId,targetType
      ORDER BY policyDocumentId,targetType
      LIMIT 10000`,
    [institutionId]
  );

  const byPolicy: Record<string, Record<string, number>> = {};
  const byTargetType: Record<string, number> = {};
  let totalLinks = 0;
  for (const row of linkAggregates) {
    const policyId = String(row.policyDocumentId || '');
    const targetType = String(row.targetType || '');
    const count = Number(row.count || 0);
    if (!policyId || !targetType || count <= 0) continue;
    byPolicy[policyId] ||= {};
    byPolicy[policyId][targetType] = count;
    byTargetType[targetType] = (byTargetType[targetType] || 0) + count;
    totalLinks += count;
  }

  const lastSync = await first<Record<string, unknown>>(
    db,
    `SELECT id,status,discoveredCandidates,insertedPolicies,mappedSources,generatedLinks,
            syncVersion,actorName,startedAt,completedAt,errorCode
       FROM PolicyRegistrySyncRun
      WHERE institutionId=?
      ORDER BY startedAt DESC
      LIMIT 1`,
    [institutionId]
  );

  return {
    metrics: {
      discoveredCandidates: candidates.length,
      registeredCandidates: candidates.filter(item =>
        registeredKeys.has(item.sourceType + ':' + item.sourceId)
      ).length,
      missingCandidates: candidates.filter(item =>
        !registeredKeys.has(item.sourceType + ':' + item.sourceId)
      ).length,
      unmappedPolicySources,
      totalLinks,
      policiesWithLinks: Object.keys(byPolicy).length
    },
    byPolicy,
    byTargetType,
    sourcesByPolicy,
    candidates: candidates.map(item => ({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      title: item.title,
      documentType: item.documentType,
      confidence: item.confidence,
      classificationReason: item.classificationReason,
      registered: registeredKeys.has(item.sourceType + ':' + item.sourceId)
    })),
    syncRequired:
      !lastSync ||
      String(lastSync.status || '') !== 'PASS' ||
      String(lastSync.syncVersion || 'legacy') !== POLICY_REGISTRY_SYNC_VERSION,
    syncVersion: POLICY_REGISTRY_SYNC_VERSION,
    lastSync: lastSync || null
  };
}

export async function syncPolicyRegistryFromDatabase(
  institutionId: string,
  actorName: string
) {
  const db = await ensurePolicyRegistrySchema();
  const runId = crypto.randomUUID();
  const startedAt = nowIso();
  await run(
    db,
    `INSERT INTO PolicyRegistrySyncRun (
      id,institutionId,status,discoveredCandidates,insertedPolicies,mappedSources,
      generatedLinks,syncVersion,actorName,startedAt,completedAt,errorCode
    ) VALUES (?,?,'RUNNING',0,0,0,0,?,?,?,NULL,NULL)`,
    [runId, institutionId, POLICY_REGISTRY_SYNC_VERSION, actorName, startedAt]
  );

  try {
    const candidates = await discoverCandidates(db, institutionId);
    const titleMap = await policyByNormalizedTitle(db, institutionId);
    const hashMap = new Map<string, string>();
    let insertedPolicies = 0;
    let mappedSources = await mapExistingPolicySources(db, institutionId);

    for (const candidate of candidates) {
      const result = await ensureCandidateRegistration(
        db,
        institutionId,
        candidate,
        actorName,
        titleMap,
        hashMap
      );
      if (candidate.contentHash) hashMap.set(candidate.contentHash, result.policyDocumentId);
      if (result.inserted) insertedPolicies += 1;
      if (result.mapped) mappedSources += 1;
    }

    const generatedLinks = await rebuildPolicyLinks(db, institutionId);
    const completedAt = nowIso();
    await run(
      db,
      `UPDATE PolicyRegistrySyncRun
          SET status='PASS',discoveredCandidates=?,insertedPolicies=?,mappedSources=?,
              generatedLinks=?,completedAt=?
        WHERE id=? AND institutionId=?`,
      [
        candidates.length,
        insertedPolicies,
        mappedSources,
        generatedLinks,
        completedAt,
        runId,
        institutionId
      ]
    );

    return {
      runId,
      status: 'PASS',
      discoveredCandidates: candidates.length,
      insertedPolicies,
      mappedSources,
      generatedLinks,
      completedAt
    };
  } catch (error) {
    await run(
      db,
      `UPDATE PolicyRegistrySyncRun
          SET status='FAIL',errorCode=?,completedAt=?
        WHERE id=? AND institutionId=?`,
      [
        (error instanceof Error ? error.message : 'UNKNOWN').slice(0, 200),
        nowIso(),
        runId,
        institutionId
      ]
    );
    throw error;
  }
}
