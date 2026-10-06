import { openAiRequestBody, parseOpenAiResponse } from './openai';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { AiFeature, AiLevel, AiProvider, AiSensitivity } from './types';

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

type WorkersAiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
};

export const AI_LEVELS: Array<{ id: AiLevel; label: string; description: string }> = [
  { id: 'FAST', label: 'Cepat', description: 'Chat, klasifikasi, dan bantuan operasional ringan.' },
  { id: 'STANDARD', label: 'Standar', description: 'Analisis GRC rutin dengan keseimbangan kualitas dan kecepatan.' },
  { id: 'ADVANCED', label: 'Lanjutan', description: 'Analisis kompleks, multi-sumber, dan ringkasan eksekutif.' }
];

export const AI_FEATURE_CATALOG: Array<{
  id: AiFeature;
  page: string;
  pageLabel: string;
  buttonLabel: string;
  description: string;
  recommendedLevel: AiLevel;
}> = [
  {
    id: 'assistant_chat',
    page: 'Global',
    pageLabel: 'ARC AI Assistant',
    buttonLabel: 'ARC AI',
    description: 'Asisten chat lintas modul Total ARC.',
    recommendedLevel: 'FAST'
  },
  {
    id: 'process_analysis',
    page: '/processes',
    pageLabel: 'Arsitektur Proses (BPM)',
    buttonLabel: 'Analisis Proses Berbasis AI',
    description: 'Analisis proses dan bantuan struktur BPM.',
    recommendedLevel: 'STANDARD'
  },
  {
    id: 'process_document',
    page: '/processes',
    pageLabel: 'Supporting Document BPM',
    buttonLabel: 'Upload & Analyze',
    description: 'Ekstraksi SOP/dokumen sumber menjadi draft BPM.',
    recommendedLevel: 'ADVANCED'
  },
  {
    id: 'risk_register',
    page: '/risks',
    pageLabel: 'Semesta Risiko',
    buttonLabel: 'AI Buat Register Risiko',
    description: 'Draft risk register berbasis BPM.',
    recommendedLevel: 'ADVANCED'
  },
  {
    id: 'risk_heatmap',
    page: '/risks',
    pageLabel: 'Risk Heatmap',
    buttonLabel: 'Perbarui Analisis',
    description: 'Interpretasi heatmap dan kualitas data risiko.',
    recommendedLevel: 'STANDARD'
  },
  {
    id: 'materiality',
    page: '/icofr/scoping',
    pageLabel: 'ICOFR Scoping & Materiality',
    buttonLabel: 'Analisis OM/PM dengan AI',
    description: 'Bantuan materialitas dan faktor kualitatif.',
    recommendedLevel: 'ADVANCED'
  },
  {
    id: 'significant_accounts',
    page: '/icofr/accounts',
    pageLabel: 'Akun Signifikan ICOFR',
    buttonLabel: 'Analisis dengan AI',
    description: 'Analisis laporan keuangan dan akun signifikan.',
    recommendedLevel: 'ADVANCED'
  },
  {
    id: 'enterprise_overview',
    page: '/reports',
    pageLabel: 'Analitik / Report Source Center',
    buttonLabel: 'Analisis Total ARC',
    description: 'Analisis menyeluruh ICOFR, risiko, kontrol, dan kepatuhan.',
    recommendedLevel: 'ADVANCED'
  }
];

export const AI_PROVIDER_DEFAULTS: Record<
  AiProvider,
  { label: string; model: string; description: string; requiresApiKey: boolean }
> = {
  openai: {
    label: 'OpenAI (ChatGPT)',
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    description: 'Analisis BPM, risiko dan ICOFR melalui OpenAI API. Penagihan API terpisah dari ChatGPT.',
    requiresApiKey: true
  },
  cloudflare: {
    label: 'Cloudflare Workers AI',
    model: process.env.CLOUDFLARE_AI_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8',
    description: 'Inference privat melalui binding Cloudflare; cocok untuk data sensitif.',
    requiresApiKey: false
  },
  gemini: {
    label: 'Google Gemini',
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    description: 'Reasoning dan structured analysis untuk kebutuhan GRC kompleks.',
    requiresApiKey: true
  },
  groq: {
    label: 'Groq',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    description: 'Inference cepat untuk chat dan analisis operasional.',
    requiresApiKey: true
  },
  openrouter: {
    label: 'OpenRouter',
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
    description: 'Gateway model alternatif dan fallback.',
    requiresApiKey: true
  }
};

export type AiAdminProviderConfig = {
  provider: AiProvider;
  enabled: boolean;
  model: string;
  aiLevel: AiLevel;
  priority: number;
  allowSensitive: boolean;
  features: AiFeature[];
  apiKeyConfigured: boolean;
  apiKeyHint: string | null;
  lastTestStatus: 'PASS' | 'FAIL' | 'NOT_TESTED';
  lastTestAt: string | null;
  lastTestMessage: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type AiRuntimeProviderConfig = {
  provider: AiProvider;
  model: string;
  aiLevel: AiLevel;
  priority: number;
  allowSensitive: boolean;
  apiKey: string | null;
  source: 'admin';
};

function isProvider(value: unknown): value is AiProvider {
  return ['cloudflare', 'openai', 'gemini', 'groq', 'openrouter'].includes(String(value || ''));
}

function isAiLevel(value: unknown): value is AiLevel {
  return ['FAST', 'STANDARD', 'ADVANCED'].includes(String(value || ''));
}

function isFeature(value: unknown): value is AiFeature {
  return AI_FEATURE_CATALOG.some(item => item.id === value);
}

async function database() {
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as unknown as Record<string, unknown>).DB as D1DatabaseLike | undefined;
  if (!db) throw new Error('Cloudflare D1 binding "DB" is not available.');
  return db;
}

async function ensureSchema() {
  const db = await database();
  const schema = `
    CREATE TABLE IF NOT EXISTS AIProviderAdminConfig (
      id TEXT PRIMARY KEY NOT NULL,
      institutionId TEXT NOT NULL,
      provider TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      model TEXT NOT NULL,
      aiLevel TEXT NOT NULL DEFAULT 'STANDARD',
      priority INTEGER NOT NULL DEFAULT 50,
      allowSensitive INTEGER NOT NULL DEFAULT 0,
      featuresJson TEXT NOT NULL DEFAULT '[]',
      apiKeyCiphertext TEXT,
      apiKeyHint TEXT,
      lastTestStatus TEXT NOT NULL DEFAULT 'NOT_TESTED',
      lastTestAt TEXT,
      lastTestMessage TEXT,
      createdBy TEXT NOT NULL,
      updatedBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_provider_admin_unique
      ON AIProviderAdminConfig(institutionId, provider);
    CREATE INDEX IF NOT EXISTS idx_ai_provider_admin_priority
      ON AIProviderAdminConfig(institutionId, enabled, priority);
  `;
  for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) {
    await db.prepare(statement).run();
  }
  return db;
}

function masterSecret() {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const secret = env.AI_CONFIG_MASTER_KEY || env.AUTH_TOKEN_SECRET;
    if (typeof secret === 'string' && secret) return secret;
  } catch {
    // Local Node runtime uses environment variables.
  }
  return process.env.AI_CONFIG_MASTER_KEY || process.env.AUTH_TOKEN_SECRET || '';
}

export function aiKeyVaultReady() {
  return Boolean(masterSecret());
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptionKey() {
  const secret = masterSecret();
  if (!secret) throw new Error('AI_KEY_VAULT_NOT_CONFIGURED');
  const material = new TextEncoder().encode('total-arc/ai-provider-v1/' + secret);
  const digest = await crypto.subtle.digest('SHA-256', material);
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptApiKey(value: string) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  return 'v1.' + bytesToBase64(iv) + '.' + bytesToBase64(new Uint8Array(ciphertext));
}

async function decryptApiKey(value: string | null | undefined) {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('AI_KEY_VAULT_FORMAT_INVALID');
  const key = await encryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(parts[1]) },
    key,
    base64ToBytes(parts[2])
  );
  return new TextDecoder().decode(plaintext);
}

function parseFeatures(value: unknown): AiFeature[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.filter(isFeature)));
  } catch {
    return [];
  }
}

function publicConfig(row: Record<string, unknown>): AiAdminProviderConfig {
  return {
    provider: String(row.provider || '') as AiProvider,
    enabled: Number(row.enabled || 0) === 1,
    model: String(row.model || ''),
    aiLevel: isAiLevel(row.aiLevel) ? row.aiLevel : 'STANDARD',
    priority: Number(row.priority || 50),
    allowSensitive: Number(row.allowSensitive || 0) === 1,
    features: parseFeatures(row.featuresJson),
    apiKeyConfigured: Boolean(row.apiKeyCiphertext),
    apiKeyHint: row.apiKeyHint ? String(row.apiKeyHint) : null,
    lastTestStatus: ['PASS', 'FAIL'].includes(String(row.lastTestStatus || ''))
      ? (String(row.lastTestStatus) as 'PASS' | 'FAIL')
      : 'NOT_TESTED',
    lastTestAt: row.lastTestAt ? String(row.lastTestAt) : null,
    lastTestMessage: row.lastTestMessage ? String(row.lastTestMessage) : null,
    updatedBy: row.updatedBy ? String(row.updatedBy) : null,
    updatedAt: row.updatedAt ? String(row.updatedAt) : null
  };
}

export async function listAiAdminProviderConfigs(institutionId: string) {
  const db = await ensureSchema();
  const result = await db.prepare(
    'SELECT * FROM AIProviderAdminConfig WHERE institutionId=? ORDER BY priority ASC, provider ASC'
  ).bind(institutionId).all<Record<string, unknown>>();
  return (result.results || []).map(publicConfig);
}

export async function saveAiAdminProviderConfig(input: {
  institutionId: string;
  provider: AiProvider;
  enabled: boolean;
  model: string;
  aiLevel: AiLevel;
  priority: number;
  allowSensitive: boolean;
  features: AiFeature[];
  apiKey?: string | null;
  actor: string;
}) {
  if (!isProvider(input.provider)) throw new Error('AI_PROVIDER_INVALID');
  const defaults = AI_PROVIDER_DEFAULTS[input.provider];
  const db = await ensureSchema();
  const existing = await db.prepare(
    'SELECT * FROM AIProviderAdminConfig WHERE institutionId=? AND provider=? LIMIT 1'
  ).bind(input.institutionId, input.provider).first<Record<string, unknown>>();

  let encrypted = existing?.apiKeyCiphertext ? String(existing.apiKeyCiphertext) : null;
  let hint = existing?.apiKeyHint ? String(existing.apiKeyHint) : null;
  const suppliedKey = String(input.apiKey || '').trim();

  if (input.provider === 'cloudflare') {
    encrypted = null;
    hint = null;
  } else if (suppliedKey) {
    encrypted = await encryptApiKey(suppliedKey);
    hint = '••••' + suppliedKey.slice(-4);
  } else if (!encrypted && input.enabled && defaults.requiresApiKey) {
    throw new Error('AI_API_KEY_REQUIRED');
  }

  const now = new Date().toISOString();
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  const model = String(input.model || defaults.model).trim().slice(0, 200) || defaults.model;
  const aiLevel = isAiLevel(input.aiLevel) ? input.aiLevel : 'STANDARD';
  const priority = Math.max(1, Math.min(99, Math.floor(Number(input.priority) || 50)));
  const features = Array.from(new Set(input.features.filter(isFeature)));

  if (existing) {
    await db.prepare(`
      UPDATE AIProviderAdminConfig SET
        enabled=?,model=?,aiLevel=?,priority=?,allowSensitive=?,featuresJson=?,
        apiKeyCiphertext=?,apiKeyHint=?,lastTestStatus='NOT_TESTED',lastTestAt=NULL,
        lastTestMessage=NULL,updatedBy=?,updatedAt=?
      WHERE id=? AND institutionId=?
    `).bind(
      input.enabled ? 1 : 0, model, aiLevel, priority, input.allowSensitive ? 1 : 0,
      JSON.stringify(features), encrypted, hint, input.actor, now, id, input.institutionId
    ).run();
  } else {
    await db.prepare(`
      INSERT INTO AIProviderAdminConfig (
        id,institutionId,provider,enabled,model,aiLevel,priority,allowSensitive,
        featuresJson,apiKeyCiphertext,apiKeyHint,lastTestStatus,lastTestAt,lastTestMessage,
        createdBy,updatedBy,createdAt,updatedAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,'NOT_TESTED',NULL,NULL,?,?,?,?)
    `).bind(
      id, input.institutionId, input.provider, input.enabled ? 1 : 0, model, aiLevel,
      priority, input.allowSensitive ? 1 : 0, JSON.stringify(features), encrypted, hint,
      input.actor, input.actor, now, now
    ).run();
  }

  const row = await db.prepare(
    'SELECT * FROM AIProviderAdminConfig WHERE id=? AND institutionId=? LIMIT 1'
  ).bind(id, input.institutionId).first<Record<string, unknown>>();
  if (!row) throw new Error('AI_PROVIDER_CONFIG_NOT_FOUND');
  return publicConfig(row);
}

export async function deleteAiAdminProviderConfig(institutionId: string, provider: AiProvider) {
  const db = await ensureSchema();
  await db.prepare(
    'DELETE FROM AIProviderAdminConfig WHERE institutionId=? AND provider=?'
  ).bind(institutionId, provider).run();
  return { provider, deleted: true };
}

export async function getAiRuntimeRouting(input: {
  institutionId?: string | null;
  feature?: AiFeature | null;
  sensitivity?: AiSensitivity;
}) {
  const institutionId = String(input.institutionId || '').trim();
  if (!institutionId) return { managed: false, providers: [] as AiRuntimeProviderConfig[] };

  const db = await ensureSchema();
  const result = await db.prepare(
    'SELECT * FROM AIProviderAdminConfig WHERE institutionId=? ORDER BY priority ASC, provider ASC'
  ).bind(institutionId).all<Record<string, unknown>>();
  const rows = result.results || [];
  if (!rows.length) return { managed: false, providers: [] as AiRuntimeProviderConfig[] };

  const feature = input.feature || null;
  const sensitive = input.sensitivity === 'confidential' || input.sensitivity === 'restricted';
  const providers: AiRuntimeProviderConfig[] = [];

  for (const row of rows) {
    const provider = String(row.provider || '') as AiProvider;
    if (!isProvider(provider) || Number(row.enabled || 0) !== 1) continue;
    const features = parseFeatures(row.featuresJson);
    if (feature && !features.includes(feature)) continue;

    const allowSensitive = provider === 'cloudflare' || Number(row.allowSensitive || 0) === 1;
    if (sensitive && provider !== 'cloudflare' && !allowSensitive) continue;

    let apiKey: string | null = null;
    if (provider !== 'cloudflare') {
      try {
        apiKey = await decryptApiKey(row.apiKeyCiphertext ? String(row.apiKeyCiphertext) : null);
      } catch {
        apiKey = null;
      }
    }

    providers.push({
      provider,
      model: String(row.model || AI_PROVIDER_DEFAULTS[provider].model),
      aiLevel: isAiLevel(row.aiLevel) ? row.aiLevel : 'STANDARD',
      priority: Number(row.priority || 50),
      allowSensitive,
      apiKey,
      source: 'admin'
    });
  }

  return { managed: true, providers };
}

async function updateTestResult(input: {
  institutionId: string;
  provider: AiProvider;
  ok: boolean;
  message: string;
}) {
  const db = await ensureSchema();
  const now = new Date().toISOString();
  await db.prepare(`
    UPDATE AIProviderAdminConfig
       SET lastTestStatus=?,lastTestAt=?,lastTestMessage=?,updatedAt=?
     WHERE institutionId=? AND provider=?
  `).bind(
    input.ok ? 'PASS' : 'FAIL', now, input.message.slice(0, 500), now,
    input.institutionId, input.provider
  ).run();
}

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : 'Unknown provider error';
  return raw
    .replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED]')
    .replace(/sk-[0-9A-Za-z_-]+/g, '[REDACTED]')
    .replace(/gsk_[0-9A-Za-z_-]+/g, '[REDACTED]')
    .slice(0, 300);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function testAiAdminProviderConfig(institutionId: string, provider: AiProvider) {
  const db = await ensureSchema();
  const row = await db.prepare(
    'SELECT * FROM AIProviderAdminConfig WHERE institutionId=? AND provider=? LIMIT 1'
  ).bind(institutionId, provider).first<Record<string, unknown>>();
  if (!row) throw new Error('AI_PROVIDER_CONFIG_NOT_FOUND');

  const model = String(row.model || AI_PROVIDER_DEFAULTS[provider].model);
  let ok = false;
  let message = '';

  try {
    if (provider === 'cloudflare') {
      const { env } = await getCloudflareContext({ async: true });
      const ai = (env as unknown as Record<string, unknown>).AI as WorkersAiBinding | undefined;
      if (!ai) throw new Error('Cloudflare Workers AI binding belum tersedia.');
      await ai.run(model, {
        messages: [{ role: 'user', content: 'Reply exactly OK.' }],
        max_tokens: 32,
        temperature: 0
      });
      ok = true;
      message = 'Cloudflare Workers AI terhubung.';
    } else {
      const apiKey = await decryptApiKey(
        row.apiKeyCiphertext ? String(row.apiKeyCiphertext) : null
      );
      if (!apiKey) throw new Error('API key belum tersimpan.');

      let response: Response;
      if (provider === 'openai') {
        response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(openAiRequestBody({ model, systemPrompt: 'Uji koneksi Total ARC.', prompt: 'Reply exactly OK.', maxOutputTokens: 512, requireJson: false }))
        });
      } else if (provider === 'gemini') {
        response = await fetchWithTimeout(
          'https://generativelanguage.googleapis.com/v1beta/models/' +
            encodeURIComponent(model) +
            ':generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Reply exactly OK.' }] }],
              generationConfig: { temperature: 0, maxOutputTokens: 32 }
            })
          }
        );
      } else {
        const url = provider === 'groq'
          ? 'https://api.groq.com/openai/v1/chat/completions'
          : 'https://openrouter.ai/api/v1/chat/completions';
        response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            ...(provider === 'openrouter' ? { 'X-Title': 'Total ARC' } : {})
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: 'Reply exactly OK.' }],
            temperature: 0,
            max_tokens: 32
          })
        });
      }

      if (!response.ok) {
        const raw = await response.text().catch(() => '');
        throw new Error('Provider HTTP ' + response.status + (raw ? ': ' + raw.slice(0, 180) : ''));
      }
      if (provider === 'openai') {
        parseOpenAiResponse(await response.json() as Record<string, unknown>);
      }
      ok = true;
      message = AI_PROVIDER_DEFAULTS[provider].label + ' terhubung.';
    }
  } catch (error) {
    ok = false;
    message = safeError(error);
  }

  await updateTestResult({ institutionId, provider, ok, message });
  return { provider, ok, message, testedAt: new Date().toISOString() };
}

export function environmentProviderConfigured(provider: AiProvider) {
  if (provider === 'cloudflare') return true;
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  if (provider === 'groq') return Boolean(process.env.GROQ_API_KEY);
  if (provider === 'openrouter') return Boolean(process.env.OPENROUTER_API_KEY);
  return false;
}
