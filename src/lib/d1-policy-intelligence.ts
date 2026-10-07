import { getCloudflareContext } from '@opennextjs/cloudflare';
import { runAiGateway } from '@/lib/ai/gateway';
import { ensurePolicyLibrarySchema } from '@/lib/d1-policy-library';

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

export type RegulatoryWatchSource = {
  id: string;
  institutionId: string;
  regulator: string;
  name: string;
  sourceUrl: string;
  sourceType: string;
  sector: string | null;
  keywordsJson: string | null;
  active: number;
  lastCheckedAt: string | null;
  lastStatus: string | null;
  lastResultCount: number;
  lastError: string | null;
  etag: string | null;
  lastModified: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RegulatoryCandidate = {
  id: string;
  institutionId: string;
  sourceId: string;
  regulator: string;
  title: string;
  sourceUrl: string;
  fingerprint: string;
  status: string;
  discoveredAt: string;
  lastSeenAt: string;
  aiAnalysisJson: string | null;
  aiAnalyzedAt: string | null;
};

export type PolicyRelationship = {
  id: string;
  institutionId: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  rationale: string | null;
  effectiveDate: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const OFFICIAL_REGULATORY_SOURCES = [
  {
    regulator: 'OJK',
    name: 'OJK - Portal Regulasi',
    sourceUrl: 'https://ojk.go.id/id/regulasi/olddefault.aspx',
    sourceType: 'HTML',
    sector: 'Jasa Keuangan',
    keywords: ['POJK', 'SEOJK', 'PADK', 'Perbankan', 'Bank']
  },
  {
    regulator: 'BI',
    name: 'Bank Indonesia - Peraturan',
    sourceUrl: 'https://www.bi.go.id/id/publikasi/peraturan/Default.aspx',
    sourceType: 'HTML',
    sector: 'Perbankan dan Sistem Pembayaran',
    keywords: ['PBI', 'PADG', 'Peraturan Bank Indonesia', 'Bank']
  },
  {
    regulator: 'LPS',
    name: 'LPS - Peraturan',
    sourceUrl: 'https://ppid.lps.go.id/informasi-setiap-saat/peraturan/',
    sourceType: 'HTML',
    sector: 'Penjaminan Simpanan dan Resolusi Bank',
    keywords: ['Peraturan Lembaga Penjamin Simpanan', 'PLPS', 'Bank']
  },
  {
    regulator: 'Kemenkeu',
    name: 'JDIH Kementerian Keuangan',
    sourceUrl: 'https://jdih.kemenkeu.go.id/home',
    sourceType: 'HTML',
    sector: 'Keuangan Negara',
    keywords: ['PMK', 'Peraturan Menteri Keuangan', 'Bank', 'Lembaga Keuangan']
  }
] as const;

function nowIso() {
  return new Date().toISOString();
}

function clean(value: unknown) {
  const result = String(value ?? '').trim();
  return result || null;
}

async function getDb(): Promise<D1DatabaseLike> {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('POLICY_INTELLIGENCE_DATABASE_UNAVAILABLE');
  return db;
}

async function executeSchemaScript(db: D1DatabaseLike, script: string) {
  for (const statement of script.split(';').map(value => value.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
}

let schemaReady: Promise<D1DatabaseLike> | null = null;

export async function ensurePolicyIntelligenceSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await ensurePolicyLibrarySchema();
    const db = await getDb();
    await executeSchemaScript(db, `
      CREATE TABLE IF NOT EXISTS RegulatoryWatchSource (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        regulator TEXT NOT NULL,
        name TEXT NOT NULL,
        sourceUrl TEXT NOT NULL,
        sourceType TEXT NOT NULL DEFAULT 'HTML',
        sector TEXT,
        keywordsJson TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        lastCheckedAt TEXT,
        lastStatus TEXT,
        lastResultCount INTEGER NOT NULL DEFAULT 0,
        lastError TEXT,
        etag TEXT,
        lastModified TEXT,
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_regulatory_watch_source_url
        ON RegulatoryWatchSource(institutionId, sourceUrl);
      CREATE INDEX IF NOT EXISTS idx_regulatory_watch_source_active
        ON RegulatoryWatchSource(institutionId, active, updatedAt);

      CREATE TABLE IF NOT EXISTS RegulatoryCandidate (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        regulator TEXT NOT NULL,
        title TEXT NOT NULL,
        sourceUrl TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'BARU',
        discoveredAt TEXT NOT NULL,
        lastSeenAt TEXT NOT NULL,
        aiAnalysisJson TEXT,
        aiAnalyzedAt TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_regulatory_candidate_fingerprint
        ON RegulatoryCandidate(institutionId, fingerprint);
      CREATE INDEX IF NOT EXISTS idx_regulatory_candidate_status
        ON RegulatoryCandidate(institutionId, status, discoveredAt);
      CREATE INDEX IF NOT EXISTS idx_regulatory_candidate_source
        ON RegulatoryCandidate(institutionId, sourceId, lastSeenAt);

      CREATE TABLE IF NOT EXISTS PolicyRelationship (
        id TEXT PRIMARY KEY NOT NULL,
        institutionId TEXT NOT NULL,
        sourceType TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        targetType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        relationType TEXT NOT NULL,
        rationale TEXT,
        effectiveDate TEXT,
        status TEXT NOT NULL DEFAULT 'Aktif',
        createdBy TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_relationship_unique
        ON PolicyRelationship(
          institutionId, sourceType, sourceId, targetType, targetId, relationType
        );
      CREATE INDEX IF NOT EXISTS idx_policy_relationship_source
        ON PolicyRelationship(institutionId, sourceType, sourceId);
      CREATE INDEX IF NOT EXISTS idx_policy_relationship_target
        ON PolicyRelationship(institutionId, targetType, targetId);
    `);
    return db;
  })().catch(error => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

function safePublicUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('POLICY_INTELLIGENCE_INVALID_SOURCE_URL');
  }
  if (url.protocol !== 'https:') throw new Error('POLICY_INTELLIGENCE_INVALID_SOURCE_URL');
  if (url.username || url.password) throw new Error('POLICY_INTELLIGENCE_INVALID_SOURCE_URL');

  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home') ||
    !host.includes('.') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
    host.includes(':')
  ) {
    throw new Error('POLICY_INTELLIGENCE_INVALID_SOURCE_URL');
  }
  return url;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(item => item.toString(16).padStart(2, '0'))
    .join('');
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code) || 32));
}

function stripHtml(value: string) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function normalizeText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function candidateLooksRegulatory(title: string, keywords: string[]) {
  const value = title.toLowerCase();
  const basePatterns = [
    'peraturan',
    'surat edaran',
    'undang-undang',
    'keputusan',
    'pojk',
    'seojk',
    'padk',
    'pbi',
    'padg',
    'plps',
    'pmk',
    'permen',
    'regulasi'
  ];
  return [...basePatterns, ...keywords.map(item => item.toLowerCase())]
    .some(pattern => pattern.length >= 3 && value.includes(pattern));
}

function extractLinks(html: string, sourceUrl: string, keywords: string[]) {
  const links: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null && links.length < 100) {
    const title = normalizeText(stripHtml(match[2] || ''));
    if (title.length < 8 || title.length > 700) continue;
    if (!candidateLooksRegulatory(title, keywords)) continue;

    let absolute = '';
    try {
      absolute = new URL(match[1], sourceUrl).toString();
      safePublicUrl(absolute);
    } catch {
      continue;
    }

    const key = title.toLowerCase() + '|' + absolute;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ title, url: absolute });
  }

  return links;
}

async function fetchPublicText(inputUrl: string) {
  let url = safePublicUrl(inputUrl);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.1',
          'User-Agent': 'TotalARC-RegulatoryMonitor/1.0'
        }
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error('POLICY_INTELLIGENCE_SOURCE_REDIRECT_INVALID');
        url = safePublicUrl(new URL(location, url).toString());
        continue;
      }

      if (!response.ok) {
        throw new Error('POLICY_INTELLIGENCE_SOURCE_HTTP_' + response.status);
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (
        contentType &&
        !contentType.includes('text/') &&
        !contentType.includes('html') &&
        !contentType.includes('xml')
      ) {
        throw new Error('POLICY_INTELLIGENCE_UNSUPPORTED_SOURCE_CONTENT');
      }

      const reader = response.body?.getReader();
      if (!reader) return { text: await response.text(), response };
      const decoder = new TextDecoder();
      let total = 0;
      let text = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > 1_500_000) throw new Error('POLICY_INTELLIGENCE_SOURCE_TOO_LARGE');
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      return { text, response };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('POLICY_INTELLIGENCE_TOO_MANY_REDIRECTS');
}

export async function addRegulatoryWatchSource(
  institutionId: string,
  input: {
    regulator: string;
    name: string;
    sourceUrl: string;
    sourceType?: string | null;
    sector?: string | null;
    keywords?: string[] | null;
  },
  actorName: string
) {
  const db = await ensurePolicyIntelligenceSchema();
  const regulator = clean(input.regulator);
  const name = clean(input.name);
  if (!regulator || !name) throw new Error('POLICY_INTELLIGENCE_SOURCE_REQUIRED');
  const sourceUrl = safePublicUrl(input.sourceUrl).toString();
  const id = crypto.randomUUID();
  const now = nowIso();

  try {
    await db.prepare(`
      INSERT INTO RegulatoryWatchSource (
        id, institutionId, regulator, name, sourceUrl, sourceType, sector,
        keywordsJson, active, lastCheckedAt, lastStatus, lastResultCount,
        lastError, etag, lastModified, createdBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, 0, NULL, NULL, NULL, ?, ?, ?)
    `).bind(
      id,
      institutionId,
      regulator,
      name,
      sourceUrl,
      clean(input.sourceType) || 'HTML',
      clean(input.sector),
      JSON.stringify((input.keywords || []).map(item => String(item).trim()).filter(Boolean)),
      actorName,
      now,
      now
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('unique')) throw new Error('POLICY_INTELLIGENCE_DUPLICATE_SOURCE');
    throw error;
  }

  return db.prepare(
    'SELECT * FROM RegulatoryWatchSource WHERE id = ? AND institutionId = ? LIMIT 1'
  ).bind(id, institutionId).first<RegulatoryWatchSource>();
}

export async function seedOfficialSources(institutionId: string, actorName: string) {
  const db = await ensurePolicyIntelligenceSchema();
  const created: RegulatoryWatchSource[] = [];
  const skipped: string[] = [];

  for (const source of OFFICIAL_REGULATORY_SOURCES) {
    const existing = await db.prepare(`
      SELECT id FROM RegulatoryWatchSource
      WHERE institutionId = ? AND sourceUrl = ?
      LIMIT 1
    `).bind(institutionId, source.sourceUrl).first<{ id: string }>();

    if (existing) {
      skipped.push(source.name);
      continue;
    }

    const record = await addRegulatoryWatchSource(institutionId, source, actorName);
    if (record) created.push(record);
  }

  return { created, skipped };
}

export async function listRegulatoryWatchSources(institutionId: string) {
  const db = await ensurePolicyIntelligenceSchema();
  const result = await db.prepare(`
    SELECT * FROM RegulatoryWatchSource
    WHERE institutionId = ?
    ORDER BY active DESC, regulator ASC, name ASC
    LIMIT 200
  `).bind(institutionId).all<RegulatoryWatchSource>();
  return result.results || [];
}

export async function listRegulatoryCandidates(institutionId: string) {
  const db = await ensurePolicyIntelligenceSchema();
  const result = await db.prepare(`
    SELECT * FROM RegulatoryCandidate
    WHERE institutionId = ?
    ORDER BY CASE status WHEN 'BARU' THEN 0 WHEN 'DITINJAU' THEN 1 ELSE 2 END,
             discoveredAt DESC
    LIMIT 500
  `).bind(institutionId).all<RegulatoryCandidate>();
  return result.results || [];
}

export async function scanRegulatorySource(institutionId: string, sourceId: string) {
  const db = await ensurePolicyIntelligenceSchema();
  const source = await db.prepare(`
    SELECT * FROM RegulatoryWatchSource
    WHERE id = ? AND institutionId = ? AND active = 1
    LIMIT 1
  `).bind(sourceId, institutionId).first<RegulatoryWatchSource>();

  if (!source) throw new Error('POLICY_INTELLIGENCE_SOURCE_NOT_FOUND');

  const now = nowIso();
  try {
    const keywords = (() => {
      try {
        const parsed = JSON.parse(source.keywordsJson || '[]');
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    })();

    const fetched = await fetchPublicText(source.sourceUrl);
    const links = extractLinks(fetched.text, source.sourceUrl, keywords);
    let newCount = 0;
    let seenCount = 0;

    for (const link of links.slice(0, 50)) {
      const fingerprint = await sha256(
        source.regulator.toLowerCase() + '|' +
        normalizeText(link.title).toLowerCase() + '|' +
        link.url.toLowerCase()
      );

      const existing = await db.prepare(`
        SELECT id FROM RegulatoryCandidate
        WHERE institutionId = ? AND fingerprint = ?
        LIMIT 1
      `).bind(institutionId, fingerprint).first<{ id: string }>();

      if (existing) {
        await db.prepare(`
          UPDATE RegulatoryCandidate
          SET lastSeenAt = ?
          WHERE id = ? AND institutionId = ?
        `).bind(now, existing.id, institutionId).run();
        seenCount += 1;
        continue;
      }

      await db.prepare(`
        INSERT INTO RegulatoryCandidate (
          id, institutionId, sourceId, regulator, title, sourceUrl,
          fingerprint, status, discoveredAt, lastSeenAt, aiAnalysisJson, aiAnalyzedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'BARU', ?, ?, NULL, NULL)
      `).bind(
        crypto.randomUUID(),
        institutionId,
        source.id,
        source.regulator,
        link.title,
        link.url,
        fingerprint,
        now,
        now
      ).run();
      newCount += 1;
    }

    await db.prepare(`
      UPDATE RegulatoryWatchSource
      SET lastCheckedAt = ?, lastStatus = 'PASS', lastResultCount = ?,
          lastError = NULL, etag = ?, lastModified = ?, updatedAt = ?
      WHERE id = ? AND institutionId = ?
    `).bind(
      now,
      links.length,
      fetched.response.headers.get('etag'),
      fetched.response.headers.get('last-modified'),
      now,
      source.id,
      institutionId
    ).run();

    return { sourceId: source.id, detected: links.length, newCount, seenCount, checkedAt: now };
  } catch (error) {
    await db.prepare(`
      UPDATE RegulatoryWatchSource
      SET lastCheckedAt = ?, lastStatus = 'FAIL', lastError = ?, updatedAt = ?
      WHERE id = ? AND institutionId = ?
    `).bind(
      now,
      (error instanceof Error ? error.message : 'UNKNOWN').slice(0, 300),
      now,
      source.id,
      institutionId
    ).run();
    throw error;
  }
}

export async function scanAllRegulatorySources(institutionId: string) {
  const sources = await listRegulatoryWatchSources(institutionId);
  const results: Array<Record<string, unknown>> = [];
  for (const source of sources.filter(item => item.active === 1).slice(0, 12)) {
    try {
      results.push({ ok: true, ...(await scanRegulatorySource(institutionId, source.id)) });
    } catch (error) {
      results.push({
        ok: false,
        sourceId: source.id,
        name: source.name,
        error: error instanceof Error ? error.message : 'UNKNOWN'
      });
    }
  }
  return results;
}

async function entityExists(
  db: D1DatabaseLike,
  institutionId: string,
  entityType: string,
  entityId: string
) {
  if (entityType === 'INTERNAL') {
    return Boolean(await db.prepare(
      'SELECT id FROM PolicyDocument WHERE id = ? AND institutionId = ? LIMIT 1'
    ).bind(entityId, institutionId).first<{ id: string }>());
  }
  if (entityType === 'EXTERNAL') {
    return Boolean(await db.prepare(
      'SELECT id FROM ExternalRegulationWatch WHERE id = ? AND institutionId = ? LIMIT 1'
    ).bind(entityId, institutionId).first<{ id: string }>());
  }
  return false;
}

export async function createPolicyRelationship(
  institutionId: string,
  input: {
    sourceType: string;
    sourceId: string;
    targetType: string;
    targetId: string;
    relationType: string;
    rationale?: string | null;
    effectiveDate?: string | null;
    status?: string | null;
  },
  actorName: string
) {
  const db = await ensurePolicyIntelligenceSchema();
  const sourceType = String(input.sourceType || '').toUpperCase();
  const targetType = String(input.targetType || '').toUpperCase();
  const sourceId = String(input.sourceId || '').trim();
  const targetId = String(input.targetId || '').trim();
  const relationType = String(input.relationType || '').trim().toUpperCase();

  if (!['INTERNAL', 'EXTERNAL'].includes(sourceType) ||
      !['INTERNAL', 'EXTERNAL'].includes(targetType) ||
      !sourceId || !targetId || !relationType) {
    throw new Error('POLICY_RELATION_REQUIRED_FIELDS');
  }
  if (sourceType === targetType && sourceId === targetId) {
    throw new Error('POLICY_RELATION_SELF_REFERENCE');
  }

  const [sourceOk, targetOk] = await Promise.all([
    entityExists(db, institutionId, sourceType, sourceId),
    entityExists(db, institutionId, targetType, targetId)
  ]);
  if (!sourceOk || !targetOk) throw new Error('POLICY_RELATION_ENTITY_NOT_FOUND');

  const id = crypto.randomUUID();
  const now = nowIso();
  let effectiveDate: string | null = null;
  if (input.effectiveDate) {
    const date = new Date(input.effectiveDate);
    if (!Number.isNaN(date.getTime())) effectiveDate = date.toISOString().slice(0, 10);
  }

  try {
    await db.prepare(`
      INSERT INTO PolicyRelationship (
        id, institutionId, sourceType, sourceId, targetType, targetId,
        relationType, rationale, effectiveDate, status, createdBy, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      institutionId,
      sourceType,
      sourceId,
      targetType,
      targetId,
      relationType,
      clean(input.rationale),
      effectiveDate,
      clean(input.status) || 'Aktif',
      actorName,
      now,
      now
    ).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('unique')) throw new Error('POLICY_RELATION_DUPLICATE');
    throw error;
  }

  return db.prepare(
    'SELECT * FROM PolicyRelationship WHERE id = ? AND institutionId = ? LIMIT 1'
  ).bind(id, institutionId).first<PolicyRelationship>();
}

export async function listPolicyRelationships(institutionId: string) {
  const db = await ensurePolicyIntelligenceSchema();
  const result = await db.prepare(`
    SELECT * FROM PolicyRelationship
    WHERE institutionId = ?
    ORDER BY updatedAt DESC
    LIMIT 2000
  `).bind(institutionId).all<PolicyRelationship>();
  return result.results || [];
}

function parseJsonObject(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('POLICY_INTELLIGENCE_AI_INVALID_JSON');
  const parsed = JSON.parse(match[0]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('POLICY_INTELLIGENCE_AI_INVALID_JSON');
  }
  return parsed as Record<string, unknown>;
}

export async function analyzeRegulatoryCandidate(
  institutionId: string,
  candidateId: string
) {
  const db = await ensurePolicyIntelligenceSchema();
  const candidate = await db.prepare(`
    SELECT * FROM RegulatoryCandidate
    WHERE id = ? AND institutionId = ?
    LIMIT 1
  `).bind(candidateId, institutionId).first<RegulatoryCandidate>();
  if (!candidate) throw new Error('POLICY_INTELLIGENCE_CANDIDATE_NOT_FOUND');

  const policyResult = await db.prepare(`
    SELECT id, documentCode, documentType, title, ownerUnit, status, version, summary, scope
    FROM PolicyDocument
    WHERE institutionId = ? AND status != 'Dicabut'
    ORDER BY updatedAt DESC
    LIMIT 400
  `).bind(institutionId).all<Record<string, unknown>>();
  const policies = policyResult.results || [];

  const result = await runAiGateway({
    task: 'classification',
    feature: 'regulatory_intelligence',
    sensitivity: 'confidential',
    institutionId,
    requireJson: true,
    temperature: 0.1,
    maxOutputTokens: 3500,
    systemPrompt:
      'Anda adalah Regulatory Change Analyst untuk bank Indonesia. ' +
      'Analisis hanya sebagai screening awal, bukan opini hukum. ' +
      'Jangan menyatakan bank pasti tidak patuh. Kembalikan JSON valid saja.',
    prompt: JSON.stringify({
      instruction:
        'Identifikasi ketentuan internal yang paling mungkin terdampak kandidat regulasi. ' +
        'Gunakan hanya metadata yang diberikan. Bila bukti tidak cukup, confidence harus rendah dan requiresLegalReview=true.',
      candidate: {
        id: candidate.id,
        regulator: candidate.regulator,
        title: candidate.title,
        sourceUrl: candidate.sourceUrl
      },
      internalPolicies: policies,
      outputSchema: {
        summary: 'string',
        recommendedAction: 'string',
        requiresLegalReview: 'boolean',
        potentialImpacts: [
          {
            policyDocumentId: 'string',
            confidence: 'LOW|MEDIUM|HIGH',
            impactLevel: 'Rendah|Sedang|Tinggi|Kritis',
            suggestedRelationType: 'IMPLEMENTS|REFERENCES|AMENDS|SUPERSEDES|REVOKES|RELATED_TO|IMPACTED_BY|DERIVED_FROM',
            rationale: 'string'
          }
        ]
      }
    })
  });

  const analysis = parseJsonObject(result.text);
  const now = nowIso();
  await db.prepare(`
    UPDATE RegulatoryCandidate
    SET aiAnalysisJson = ?, aiAnalyzedAt = ?, status = 'DITINJAU'
    WHERE id = ? AND institutionId = ?
  `).bind(JSON.stringify({
    ...analysis,
    aiMeta: {
      provider: result.provider,
      model: result.model,
      requestId: result.requestId,
      fallbackUsed: result.fallbackUsed,
      redactions: result.redactions
    }
  }), now, candidate.id, institutionId).run();

  return {
    candidateId: candidate.id,
    analysis,
    ai: {
      provider: result.provider,
      model: result.model,
      requestId: result.requestId,
      fallbackUsed: result.fallbackUsed
    }
  };
}

export async function getPolicyIntelligenceDashboard(institutionId: string) {
  const [sources, candidates, relationships] = await Promise.all([
    listRegulatoryWatchSources(institutionId),
    listRegulatoryCandidates(institutionId),
    listPolicyRelationships(institutionId)
  ]);

  return {
    metrics: {
      watchSources: sources.length,
      activeSources: sources.filter(item => item.active === 1).length,
      newCandidates: candidates.filter(item => item.status === 'BARU').length,
      analyzedCandidates: candidates.filter(item => Boolean(item.aiAnalyzedAt)).length,
      internalRelations: relationships.filter(
        item => item.sourceType === 'INTERNAL' && item.targetType === 'INTERNAL'
      ).length,
      externalRelations: relationships.filter(
        item => item.sourceType === 'EXTERNAL' || item.targetType === 'EXTERNAL'
      ).length
    },
    sources,
    candidates,
    relationships
  };
}
