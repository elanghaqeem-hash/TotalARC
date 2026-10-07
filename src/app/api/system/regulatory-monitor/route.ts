import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { scanAllRegulatoryInstitutions } from '@/lib/d1-policy-intelligence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function configuredSecret() {
  try {
    const { env } = getCloudflareContext();
    const record = env as unknown as Record<string, unknown>;
    const value = record.REGULATORY_MONITOR_SECRET || record.CRON_SECRET;
    if (typeof value === 'string' && value.trim()) return value.trim();
  } catch {
    // Node/Vercel runtime falls back to process.env.
  }

  return (
    process.env.REGULATORY_MONITOR_SECRET ||
    process.env.CRON_SECRET ||
    ''
  ).trim();
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(hash);
}

async function safeEqual(left: string, right: string) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a[index] ^ b[index];
  }
  return mismatch === 0;
}

async function authorized(request: Request) {
  const secret = configuredSecret();
  if (!secret) return { ok: false as const, status: 503, reason: 'SCHEDULER_SECRET_NOT_CONFIGURED' };

  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!supplied || !(await safeEqual(supplied, secret))) {
    return { ok: false as const, status: 401, reason: 'UNAUTHORIZED' };
  }

  return { ok: true as const };
}

async function run(request: Request) {
  const auth = await authorized(request);
  if (!auth.ok) {
    return NextResponse.json(
      {
        error:
          auth.status === 503
            ? 'Regulatory monitor scheduler belum dikonfigurasi.'
            : 'Unauthorized',
        code: auth.reason
      },
      {
        status: auth.status,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  }

  const startedAt = new Date().toISOString();

  try {
    const results = await scanAllRegulatoryInstitutions();
    const newCandidates = results.reduce(
      (total, item) => total + Number(item.newCandidates || 0),
      0
    );
    const failedSources = results.reduce(
      (total, item) => total + Number(item.failedSources || 0),
      0
    );

    return NextResponse.json(
      {
        ok: true,
        startedAt,
        completedAt: new Date().toISOString(),
        institutionCount: results.length,
        newCandidates,
        failedSources,
        results: results.map(item => ({
          institutionId: item.institutionId,
          sources: item.sources,
          newCandidates: item.newCandidates,
          failedSources: item.failedSources
        }))
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Scheduled regulatory monitor failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Scheduled regulatory monitor gagal dijalankan.',
        code: error instanceof Error ? error.message : 'REGULATORY_MONITOR_ERROR'
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
