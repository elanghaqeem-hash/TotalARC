import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { provisionBootstrapAdministrator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function runtimeValue(name: string) {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as unknown as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function POST(request: Request) {
  try {
    const configuredToken = await runtimeValue('TOTAL_ARC_HEALTHCHECK_TOKEN');
    const suppliedToken = request.headers.get('x-total-arc-health-token') || '';

    if (!configuredToken || !safeEqual(configuredToken, suppliedToken)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // One-time production recovery for the existing bootstrap administrator.
    // This flag is reverted immediately after the recovery deployment succeeds.
    const result = await provisionBootstrapAdministrator({
      reconcilePendingAdmin: true,
      resetExistingConfiguredAdmin: true
    });
    return NextResponse.json(
      { ok: true, status: result.status },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'BOOTSTRAP_ERROR';

    if (code === 'AUTH_BOOTSTRAP_REQUIRED' || code === 'AUTH_BOOTSTRAP_WEAK_PASSWORD') {
      return NextResponse.json(
        { error: 'Bootstrap administrator secrets are incomplete or invalid.', code },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (code === 'USER_EMAIL_CONFLICT') {
      return NextResponse.json(
        { error: 'Bootstrap administrator email conflicts with another user.', code },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    console.error('Bootstrap administrator provisioning failed:', error);
    return NextResponse.json(
      {
        error: 'Bootstrap administrator provisioning failed.',
        code: code.slice(0, 160)
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
