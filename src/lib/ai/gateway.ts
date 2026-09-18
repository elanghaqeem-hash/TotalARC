import { getCloudflareContext } from '@opennextjs/cloudflare';
import type {
  AiGatewayRequest,
  AiGatewayResult,
  AiGatewayStatus,
  AiProvider,
  AiSensitivity,
  AiTask
} from './types';

type WorkersAiBinding = {
  run: (model: string, input: Record<string, unknown>) => Promise<unknown>;
};

type ProviderConfig = {
  model: string;
  role: string;
};

class ProviderError extends Error {
  retryable: boolean;

  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = retryable;
  }
}

const PROVIDER_CONFIG: Record<AiProvider, ProviderConfig> = {
  cloudflare: {
    model: process.env.CLOUDFLARE_AI_MODEL || '@cf/qwen/qwen3-30b-a3b-fp8',
    role: 'Private/sensitive inference and low-cost internal processing'
  },
  gemini: {
    model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    role: 'Primary complex reasoning and structured GRC analysis'
  },
  groq: {
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
    role: 'Fast inference, classification and assistant responses'
  },
  openrouter: {
    model: process.env.OPENROUTER_MODEL || 'openrouter/free',
    role: 'Last-resort free-model fallback'
  }
};

const DEFAULT_SENSITIVITY = normalizeSensitivity(
  process.env.AI_DEFAULT_SENSITIVITY || 'confidential'
);
const EXTERNAL_SENSITIVE_FALLBACK =
  process.env.AI_ALLOW_EXTERNAL_FOR_SENSITIVE === 'true';
const REDACT_EXTERNAL = process.env.AI_REDACT_EXTERNAL !== 'false';
const MAX_INPUT_CHARS = numberFromEnv('AI_MAX_INPUT_CHARS', 60000, 1000, 250000);
const DEFAULT_TIMEOUT_MS = numberFromEnv('AI_TIMEOUT_MS', 25000, 3000, 60000);
const MAX_OUTPUT_TOKENS = numberFromEnv('AI_MAX_OUTPUT_TOKENS', 4096, 256, 16384);

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(raw)));
}

function normalizeSensitivity(value: string): AiSensitivity {
  if (value === 'public' || value === 'internal' || value === 'restricted') {
    return value;
  }
  return 'confidential';
}

function getWorkersAiBinding(): WorkersAiBinding | null {
  try {
    const context = getCloudflareContext();
    const env = context.env as unknown as { AI?: WorkersAiBinding };
    return env.AI || null;
  } catch {
    return null;
  }
}

function configured(provider: AiProvider): boolean {
  if (provider === 'cloudflare') return Boolean(getWorkersAiBinding());
  if (provider === 'gemini') return Boolean(process.env.GEMINI_API_KEY);
  if (provider === 'groq') return Boolean(process.env.GROQ_API_KEY);
  if (provider === 'openrouter') return Boolean(process.env.OPENROUTER_API_KEY);
  return false;
}

function providerOrder(task: AiTask, sensitivity: AiSensitivity): AiProvider[] {
  const sensitive = sensitivity === 'confidential' || sensitivity === 'restricted';

  if (sensitive) {
    return EXTERNAL_SENSITIVE_FALLBACK
      ? ['cloudflare', 'gemini', 'groq', 'openrouter']
      : ['cloudflare'];
  }

  if (task === 'chat') {
    return ['groq', 'gemini', 'cloudflare', 'openrouter'];
  }

  if (
    task === 'classification' ||
    task === 'control_classification' ||
    task === 'summarization' ||
    task === 'evidence_summary'
  ) {
    return ['cloudflare', 'groq', 'gemini', 'openrouter'];
  }

  return ['gemini', 'cloudflare', 'groq', 'openrouter'];
}

function truncateInput(value: string): string {
  if (value.length <= MAX_INPUT_CHARS) return value;
  return value.slice(0, MAX_INPUT_CHARS) + '\n[TRUNCATED BY TOTAL ARC AI GATEWAY]';
}

function redactForExternal(value: string): { text: string; redactions: number } {
  let text = value;
  let redactions = 0;

  const replace = (pattern: RegExp, label: string) => {
    text = text.replace(pattern, () => {
      redactions += 1;
      return '[' + label + '_REDACTED]';
    });
  };

  replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'EMAIL');
  replace(/(?:\+62|62|0)8\d{7,12}\b/g, 'PHONE');
  replace(/\b\d{16}\b/g, 'IDENTIFIER');
  replace(/\b\d{10,15}\b/g, 'ACCOUNT_OR_ID');
  replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, 'API_KEY');
  replace(/\bsk-[0-9A-Za-z_-]{16,}\b/g, 'API_KEY');
  replace(/\bBearer\s+[0-9A-Za-z._~-]{12,}\b/gi, 'BEARER_TOKEN');
  replace(
    /\b(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
    'SECRET'
  );

  return { text, redactions };
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(
        'Provider request failed with HTTP ' + response.status + ': ' + raw.slice(0, 300),
        retryable
      );
    }

    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new ProviderError('Provider returned invalid JSON', false);
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderError('Provider request timed out', true);
    }
    throw new ProviderError(
      error instanceof Error ? error.message : 'Unknown provider network error',
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderError && error.retryable;
      if (!retryable || attempt === 1) break;
      await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw lastError;
}

function parseOpenAiText(data: Record<string, unknown>): string {
  const choices = data.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new ProviderError('Provider returned no choices', false);
  }

  const first = choices[0] as Record<string, unknown>;
  const message = first.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content === 'string' && content.trim()) return content.trim();
  throw new ProviderError('Provider returned no text content', false);
}

async function callGemini(
  systemPrompt: string,
  prompt: string,
  temperature: number,
  maxOutputTokens: number,
  requireJson: boolean
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ProviderError('Gemini API key is not configured');

  const model = PROVIDER_CONFIG.gemini.model;
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent';

  const generationConfig: Record<string, unknown> = {
    temperature,
    maxOutputTokens
  };
  if (requireJson) generationConfig.responseMimeType = 'application/json';

  const data = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig
    })
  });

  const candidates = data.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new ProviderError('Gemini returned no candidates', false);
  }

  const first = candidates[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  const parts = content?.parts;

  if (!Array.isArray(parts)) {
    throw new ProviderError('Gemini returned no content parts', false);
  }

  const text = parts
    .map(part => {
      if (!part || typeof part !== 'object') return '';
      const value = (part as Record<string, unknown>).text;
      return typeof value === 'string' ? value : '';
    })
    .join('')
    .trim();

  if (!text) throw new ProviderError('Gemini returned empty text', false);
  return text;
}

async function callOpenAiCompatible(
  provider: 'groq' | 'openrouter',
  systemPrompt: string,
  prompt: string,
  temperature: number,
  maxOutputTokens: number,
  requireJson: boolean
): Promise<string> {
  const isGroq = provider === 'groq';
  const apiKey = isGroq ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY;

  if (!apiKey) throw new ProviderError(provider + ' API key is not configured');

  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  };

  if (!isGroq) {
    headers['X-Title'] = 'Total ARC';
    if (process.env.OPENROUTER_HTTP_REFERER) {
      headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
    }
  }

  const body: Record<string, unknown> = {
    model: PROVIDER_CONFIG[provider].model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_tokens: maxOutputTokens
  };

  if (requireJson) {
    body.response_format = { type: 'json_object' };
  }

  const data = await fetchJson(
    isGroq
      ? 'https://api.groq.com/openai/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    }
  );

  return parseOpenAiText(data);
}

async function callCloudflare(
  systemPrompt: string,
  prompt: string,
  temperature: number,
  maxOutputTokens: number
): Promise<string> {
  const ai = getWorkersAiBinding();
  if (!ai) {
    throw new ProviderError('Cloudflare Workers AI binding is not available');
  }

  const result = await ai.run(PROVIDER_CONFIG.cloudflare.model, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature,
    max_tokens: maxOutputTokens
  });

  if (typeof result === 'string' && result.trim()) return result.trim();

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    if (typeof record.response === 'string' && record.response.trim()) {
      return record.response.trim();
    }
    if (typeof record.result === 'string' && record.result.trim()) {
      return record.result.trim();
    }
  }

  throw new ProviderError('Cloudflare Workers AI returned no text content', false);
}

async function callProvider(
  provider: AiProvider,
  systemPrompt: string,
  prompt: string,
  temperature: number,
  maxOutputTokens: number,
  requireJson: boolean
): Promise<string> {
  if (provider === 'cloudflare') {
    return callCloudflare(systemPrompt, prompt, temperature, maxOutputTokens);
  }
  if (provider === 'gemini') {
    return callGemini(systemPrompt, prompt, temperature, maxOutputTokens, requireJson);
  }
  return callOpenAiCompatible(
    provider,
    systemPrompt,
    prompt,
    temperature,
    maxOutputTokens,
    requireJson
  );
}

export function getAiGatewayStatus(): AiGatewayStatus {
  return {
    defaultSensitivity: DEFAULT_SENSITIVITY,
    externalSensitiveFallbackEnabled: EXTERNAL_SENSITIVE_FALLBACK,
    externalRedactionEnabled: REDACT_EXTERNAL,
    providers: (Object.keys(PROVIDER_CONFIG) as AiProvider[]).map(provider => ({
      provider,
      configured: configured(provider),
      model: PROVIDER_CONFIG[provider].model,
      role: PROVIDER_CONFIG[provider].role
    }))
  };
}

export async function runAiGateway(request: AiGatewayRequest): Promise<AiGatewayResult> {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  const sensitivity = request.sensitivity || DEFAULT_SENSITIVITY;
  const providers = providerOrder(request.task, sensitivity);
  const attemptedProviders: AiProvider[] = [];
  const temperature = Math.min(1, Math.max(0, request.temperature ?? 0.2));
  const maxOutputTokens = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(256, request.maxOutputTokens || MAX_OUTPUT_TOKENS)
  );

  const basePrompt = truncateInput(request.prompt);
  const baseSystem = truncateInput(request.systemPrompt);
  let totalRedactions = 0;
  let lastError: unknown;

  for (const provider of providers) {
    if (!configured(provider)) continue;

    attemptedProviders.push(provider);

    const external = provider !== 'cloudflare';
    const shouldRedact = external && REDACT_EXTERNAL;
    const promptResult = shouldRedact
      ? redactForExternal(basePrompt)
      : { text: basePrompt, redactions: 0 };
    const systemResult = shouldRedact
      ? redactForExternal(baseSystem)
      : { text: baseSystem, redactions: 0 };

    const redactions = promptResult.redactions + systemResult.redactions;

    try {
      const text = await withRetry(() =>
        callProvider(
          provider,
          systemResult.text,
          promptResult.text,
          temperature,
          maxOutputTokens,
          Boolean(request.requireJson)
        )
      );

      totalRedactions = redactions;
      const durationMs = Date.now() - start;

      console.info(
        JSON.stringify({
          event: 'totalarc.ai.completed',
          requestId,
          task: request.task,
          sensitivity,
          provider,
          model: PROVIDER_CONFIG[provider].model,
          attemptedProviders,
          fallbackUsed: attemptedProviders.length > 1,
          redactions,
          durationMs
        })
      );

      return {
        requestId,
        text,
        provider,
        model: PROVIDER_CONFIG[provider].model,
        attemptedProviders,
        fallbackUsed: attemptedProviders.length > 1,
        redactions,
        durationMs
      };
    } catch (error) {
      lastError = error;
      console.warn(
        JSON.stringify({
          event: 'totalarc.ai.provider_failed',
          requestId,
          task: request.task,
          sensitivity,
          provider,
          retryable: error instanceof ProviderError ? error.retryable : false
        })
      );
    }
  }

  const configuredProviders = providers.filter(configured);
  const reason =
    configuredProviders.length === 0
      ? 'No eligible AI provider is configured for sensitivity=' + sensitivity
      : lastError instanceof Error
        ? lastError.message
        : 'All eligible AI providers failed';

  console.error(
    JSON.stringify({
      event: 'totalarc.ai.failed',
      requestId,
      task: request.task,
      sensitivity,
      attemptedProviders,
      durationMs: Date.now() - start
    })
  );

  throw new Error(reason);
}
