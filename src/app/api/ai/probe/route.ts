import { NextResponse } from 'next/server';
import { probeAiProviders } from '@/lib/ai/gateway';

export const dynamic = 'force-dynamic';

async function tokenMatches(provided: string | null, expected: string): Promise<boolean> {
  if (!provided || !expected) return false;
  const prefix = 'Bearer ';
  if (!provided.startsWith(prefix)) return false;

  const candidate = provided.slice(prefix.length);
  const encoder = new TextEncoder();
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);

  const left = new Uint8Array(candidateHash);
  const right = new Uint8Array(expectedHash);
  if (left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  const expectedToken = process.env.AI_PROBE_TOKEN || '';
  if (!expectedToken) {
    return NextResponse.json(
      { ok: false, error: 'AI production probe is not configured.' },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const authorized = await tokenMatches(request.headers.get('authorization'), expectedToken);
  if (!authorized) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  const providers = await probeAiProviders();
  const privateProvider = providers.find(provider => provider.provider === 'cloudflare');
  const privateReady = Boolean(privateProvider?.configured && privateProvider.ok);
  const configuredExternalFailures = providers.filter(
    provider => provider.provider !== 'cloudflare' && provider.configured && !provider.ok
  );

  return NextResponse.json(
    {
      ok: privateReady,
      privateProviderReady: privateReady,
      configuredExternalProvidersHealthy: configuredExternalFailures.length === 0,
      providers
    },
    {
      status: privateReady ? 200 : 503,
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    }
  );
}
