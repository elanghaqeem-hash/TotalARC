import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

type RateLimitBinding = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

type AiLimiterName = 'AI_CHAT_RATE_LIMIT' | 'AI_ANALYZE_RATE_LIMIT';

type GuardResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; response: NextResponse };

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

function errorResponse(status: number, error: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json(
    { error },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        ...extraHeaders
      }
    }
  );
}

function requestHost(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('host') || new URL(request.url).host;
}

function isExplicitCrossOrigin(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true;

  const origin = request.headers.get('origin');
  if (!origin) return false;

  try {
    return new URL(origin).host !== requestHost(request);
  } catch {
    return true;
  }
}

async function actorKey(request: Request): Promise<string> {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const data = new TextEncoder().encode(ip + '|' + userAgent);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
}

async function enforceRateLimit(
  request: Request,
  limiterName: AiLimiterName
): Promise<NextResponse | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const limiter = (env as unknown as Record<string, unknown>)[limiterName] as
      | RateLimitBinding
      | undefined;

    if (!limiter) {
      if (process.env.NODE_ENV === 'development') return null;
      console.error('AI rate limiter binding is unavailable:', limiterName);
      return errorResponse(503, 'Perlindungan permintaan AI sedang tidak tersedia.');
    }

    const { success } = await limiter.limit({ key: await actorKey(request) });
    if (!success) {
      return errorResponse(429, 'Batas permintaan AI tercapai. Silakan coba kembali beberapa saat lagi.', {
        'Retry-After': '60'
      });
    }

    return null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') return null;
    console.error('AI rate limiter check failed:', limiterName, error);
    return errorResponse(503, 'Perlindungan permintaan AI sedang tidak tersedia.');
  }
}

export async function guardAiPost(
  request: Request,
  limiterName: AiLimiterName,
  maxBodyBytes = DEFAULT_MAX_BODY_BYTES
): Promise<GuardResult> {
  if (isExplicitCrossOrigin(request)) {
    return { ok: false, response: errorResponse(403, 'Permintaan AI lintas-origin tidak diizinkan.') };
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: false, response: errorResponse(415, 'Content-Type harus application/json.') };
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    return { ok: false, response: errorResponse(413, 'Ukuran permintaan AI terlalu besar.') };
  }

  const rateLimited = await enforceRateLimit(request, limiterName);
  if (rateLimited) return { ok: false, response: rateLimited };

  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: errorResponse(400, 'Isi permintaan tidak dapat dibaca.') };
  }

  if (raw.length > maxBodyBytes) {
    return { ok: false, response: errorResponse(413, 'Ukuran permintaan AI terlalu besar.') };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, response: errorResponse(400, 'Isi permintaan harus berupa objek JSON.') };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: errorResponse(400, 'Isi permintaan harus berupa JSON yang valid.') };
  }
}

export async function guardAiMultipart(
  request: Request,
  limiterName: AiLimiterName,
  maxBodyBytes = 9 * 1024 * 1024
): Promise<NextResponse | null> {
  if (isExplicitCrossOrigin(request)) {
    return errorResponse(403, 'Permintaan AI lintas-origin tidak diizinkan.');
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return errorResponse(415, 'Content-Type harus multipart/form-data.');
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    return errorResponse(413, 'Ukuran unggahan AI terlalu besar.');
  }

  return enforceRateLimit(request, limiterName);
}
