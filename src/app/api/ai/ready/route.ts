import { NextResponse } from 'next/server';
import { getAiGatewayStatus } from '@/lib/ai/gateway';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gateway = getAiGatewayStatus();
  const privateProvider = gateway.providers.find(provider => provider.provider === 'cloudflare');
  const externalConfigured = gateway.providers.filter(
    provider => provider.provider !== 'cloudflare' && provider.configured
  ).length;
  const ready = Boolean(privateProvider?.configured);

  return NextResponse.json(
    {
      service: 'Total ARC AI Gateway',
      ready,
      privateProviderReady: ready,
      externalProviderCount: externalConfigured,
      policy: 'confidential_requires_private_provider'
    },
    {
      status: ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    }
  );
}
