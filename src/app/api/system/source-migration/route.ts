import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  getSourceLibraryMetrics,
  resolveSourceInstitution,
  upsertSourceDocument
} from '@/lib/d1-source-library';

export const dynamic = 'force-dynamic';

const MIGRATION_ID = 'gdrive-seraya-20260920';
const KEY_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

type D1DatabaseLike = {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T = Record<string, unknown>>() => Promise<T | null>;
      run: () => Promise<unknown>;
      all: <T = Record<string, unknown>>() => Promise<{ results?: T[] }>;
    };
    first: <T = Record<string, unknown>>() => Promise<T | null>;
    run: () => Promise<unknown>;
  };
};

type MigrationKeyRow = {
  id: string;
  privateKeyPkcs8Base64: string;
  publicKeySpkiBase64: string;
  createdAt: string;
  expiresAt: string;
  status: string;
};

type EncryptedEnvelope = {
  migrationId: string;
  encryptedKeyBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
};

type MigrationPayload = {
  provider?: 'GOOGLE_DRIVE' | 'MIGRATION';
  externalId: string;
  parentExternalId?: string | null;
  sourceKind?: 'ROOT_FILE' | 'ARCHIVE_MEMBER' | 'DERIVED_TEXT';
  title: string;
  mimeType?: string | null;
  sourceUrl?: string | null;
  sourceCreatedAt?: string | null;
  sourceModifiedAt?: string | null;
  module?: string | null;
  metadata?: Record<string, unknown> | null;
  downloadUrl?: string | null;
};

async function runtimeEnv() {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as Record<string, unknown>;
}

async function getDb() {
  const env = await runtimeEnv();
  const db = env.DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('MIGRATION_DATABASE_UNAVAILABLE');
  return db;
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function authorize(request: Request) {
  const env = await runtimeEnv();
  const configured = typeof env.TOTAL_ARC_HEALTHCHECK_TOKEN === 'string'
    ? env.TOTAL_ARC_HEALTHCHECK_TOKEN
    : process.env.TOTAL_ARC_HEALTHCHECK_TOKEN || '';
  const supplied = request.headers.get('x-total-arc-health-token') || '';
  return configured.length >= 24 && safeEqual(configured, supplied);
}

function bytesToBase64(bytes: Uint8Array) {
  let result = '';
  for (let index = 0; index < bytes.length; index += 1) {
    result += String.fromCharCode(bytes[index]);
  }
  return btoa(result);
}

function base64ToBytes(value: string) {
  const raw = atob(value);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function ensureMigrationSchema(db: D1DatabaseLike) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS SourceMigrationKey (
      id TEXT PRIMARY KEY NOT NULL,
      privateKeyPkcs8Base64 TEXT NOT NULL,
      publicKeySpkiBase64 TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      status TEXT NOT NULL
    )
  `).run();
}

async function getActiveKey(db: D1DatabaseLike) {
  await ensureMigrationSchema(db);
  const row = await db.prepare(`
    SELECT * FROM SourceMigrationKey WHERE id = ? LIMIT 1
  `).bind(MIGRATION_ID).first<MigrationKeyRow>();
  if (!row || row.status !== 'Active') return null;
  if (Date.parse(row.expiresAt) <= Date.now()) {
    await db.prepare('UPDATE SourceMigrationKey SET status = ? WHERE id = ?')
      .bind('Expired', MIGRATION_ID).run();
    return null;
  }
  return row;
}

async function ensureMigrationKey(db: D1DatabaseLike) {
  const existing = await getActiveKey(db);
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKey = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  const privateKey = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + KEY_TTL_MS).toISOString();

  await db.prepare('DELETE FROM SourceMigrationKey WHERE id = ?').bind(MIGRATION_ID).run();
  await db.prepare(`
    INSERT INTO SourceMigrationKey (
      id, privateKeyPkcs8Base64, publicKeySpkiBase64, createdAt, expiresAt, status
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    MIGRATION_ID,
    bytesToBase64(privateKey),
    bytesToBase64(publicKey),
    createdAt,
    expiresAt,
    'Active'
  ).run();

  return {
    id: MIGRATION_ID,
    privateKeyPkcs8Base64: bytesToBase64(privateKey),
    publicKeySpkiBase64: bytesToBase64(publicKey),
    createdAt,
    expiresAt,
    status: 'Active'
  } satisfies MigrationKeyRow;
}

async function decryptEnvelope(envelope: EncryptedEnvelope, keyRow: MigrationKeyRow) {
  if (envelope.migrationId !== MIGRATION_ID) throw new Error('MIGRATION_ID_MISMATCH');
  const privateKeyBytes = base64ToBytes(keyRow.privateKeyPkcs8Base64);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );

  const aesRaw = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToBytes(envelope.encryptedKeyBase64).buffer
  );
  const aesKey = await crypto.subtle.importKey(
    'raw',
    aesRaw,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  const clear = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.ivBase64) },
    aesKey,
    base64ToBytes(envelope.ciphertextBase64).buffer
  );
  return JSON.parse(new TextDecoder().decode(clear)) as MigrationPayload;
}

function validateDownloadUrl(value: string) {
  const parsed = new URL(value);
  const allowedHost =
    parsed.protocol === 'https:' &&
    (parsed.hostname === 'oaiusercontent.com' || parsed.hostname.endsWith('.oaiusercontent.com'));
  if (!allowedHost) throw new Error('MIGRATION_DOWNLOAD_HOST_NOT_ALLOWED');
  return parsed.toString();
}

async function downloadSource(url: string) {
  const response = await fetch(validateDownloadUrl(url), {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': 'TotalARC-SourceMigration/1.0' }
  });
  if (!response.ok) throw new Error('MIGRATION_SOURCE_DOWNLOAD_FAILED');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_SOURCE_BYTES) throw new Error('SOURCE_LIBRARY_FILE_TOO_LARGE');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('SOURCE_LIBRARY_FILE_TOO_LARGE');
  return bytes;
}

function classifyModule(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes('itgc')) return 'ICOFR_ITGC';
  if (normalized.includes('csa')) return 'CSA';
  if (normalized.includes('materialitas') || normalized.includes('scoping')) return 'ICOFR_SCOPING';
  if (normalized.includes('gap_analysis') || normalized.includes('gap analysis')) return 'ICOFR_GAP_ANALYSIS';
  if (normalized.includes('register_risiko') || normalized.includes('register risiko')) return 'RISK_REGISTER';
  if (normalized.includes('identifikasi_risiko') || normalized.includes('identifikasi risiko')) return 'ICOFR_RCM';
  if (normalized.includes('bpm') || normalized.includes('rcm')) return 'BPM_RCM';
  if (normalized.includes('walkthrough') || normalized.includes('walktrough')) return 'WALKTHROUGH';
  if (normalized.includes('metodologi')) return 'ICOFR_METHODOLOGY';
  if (normalized.includes('permintaan_data') || normalized.includes('permintaan data')) return 'PBC_DATA_REQUEST';
  if (normalized.includes('rencana_kerja') || normalized.includes('rencana kerja')) return 'PROJECT_PLAN';
  return 'SOURCE_LIBRARY';
}

function responseError(error: unknown) {
  const code = error instanceof Error ? error.message : 'MIGRATION_FAILED';
  console.error('Source migration failed:', code);
  return NextResponse.json(
    { ok: false, code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const operation = url.searchParams.get('op') || 'status';
    const db = await getDb();

    if (operation === 'key') {
      const key = await ensureMigrationKey(db);
      return NextResponse.json({
        ok: true,
        migrationId: MIGRATION_ID,
        publicKeySpkiBase64: key.publicKeySpkiBase64,
        expiresAt: key.expiresAt
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const institution = await resolveSourceInstitution('Bank Kalbar');
    const metrics = await getSourceLibraryMetrics(institution.id);
    const key = await getActiveKey(db);
    return NextResponse.json({
      ok: true,
      migrationId: MIGRATION_ID,
      institutionId: institution.id,
      keyActive: Boolean(key),
      keyExpiresAt: key?.expiresAt || null,
      metrics
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const operation = String(body.op || 'import');
    const db = await getDb();

    if (operation === 'cleanup') {
      await ensureMigrationSchema(db);
      await db.prepare('DELETE FROM SourceMigrationKey WHERE id = ?').bind(MIGRATION_ID).run();
      return NextResponse.json({ ok: true, migrationId: MIGRATION_ID, cleaned: true });
    }

    const envelope = body as unknown as EncryptedEnvelope;
    const key = await getActiveKey(db);
    if (!key) throw new Error('MIGRATION_KEY_UNAVAILABLE');

    const payload = await decryptEnvelope(envelope, key);
    if (!payload.externalId?.trim() || !payload.title?.trim()) {
      throw new Error('SOURCE_LIBRARY_REQUIRED_FIELDS');
    }

    const institution = await resolveSourceInstitution('Bank Kalbar');
    const rawBytes = payload.downloadUrl ? await downloadSource(payload.downloadUrl) : null;
    const result = await upsertSourceDocument(institution.id, {
      provider: payload.provider || 'GOOGLE_DRIVE',
      externalId: payload.externalId,
      parentExternalId: payload.parentExternalId || null,
      sourceKind: payload.sourceKind || 'ROOT_FILE',
      title: payload.title,
      mimeType: payload.mimeType || null,
      sourceUrl: payload.sourceUrl || null,
      sourceCreatedAt: payload.sourceCreatedAt || null,
      sourceModifiedAt: payload.sourceModifiedAt || null,
      module: payload.module || classifyModule(payload.title),
      sensitivity: 'Confidential',
      metadata: {
        ...(payload.metadata || {}),
        migrationId: MIGRATION_ID,
        importedVia: 'encrypted-source-migration'
      },
      rawBytes
    }, 'Encrypted Google Drive migration into Total ARC source library.');

    return NextResponse.json({
      ok: true,
      changed: result.changed,
      documentId: result.record.id,
      rawSizeBytes: result.record.rawSizeBytes,
      rawSha256: result.record.rawSha256
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return responseError(error);
  }
}
