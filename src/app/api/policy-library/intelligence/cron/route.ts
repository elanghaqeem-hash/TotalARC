import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { scanAllRegulatoryInstitutions } from '@/lib/d1-policy-intelligence';

export const dynamic = 'force-dynamic';

function configuredSecret() {
  try {
    const { env } = getCloudflareContext();
    const record = env as unknown as Record<string, unknown>;
    const value = record.REGULATORY_MONITOR_CRON_SECRET || record.CRON_SECRET;
    if (typeof value === 'string' && value.length >= 24) return value;
  } catch {
    // Fallback for Vercel/local Node runtime.
  }
  const value =
    process.env.REGULATORY_MONITOR_CRON_SECRET ||
    process.env.CRON_SECRET ||
    '';
  return value.length >= 24 ? value : '';
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function run(request: Request) {
  const secret = configuredSecret();
  if (!secret) {
    return NextResponse.json(
      { error: 'Regulatory monitor cron secret is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const authorization = request.headers.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
  const supplied = request.headers.get('x-totalarc-cron-secret') || bearer;
  if (!timingSafeEqual(supplied, secret)) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const startedAt = new Date().toISOString();
    const results = await scanAllRegulatoryInstitutions();
    return NextResponse.json({
      ok: true,
      startedAt,
      completedAt: new Date().toISOString(),
      institutions: results.length,
      newCandidates: results.reduce((total, item) => total + item.newCandidates, 0),
      failedSources: results.reduce((total, item) => total + item.failedSources, 0),
      results
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Scheduled regulatory monitor failed:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Scheduled regulatory monitor failed.',
        code: error instanceof Error ? error.message : 'UNKNOWN'
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
