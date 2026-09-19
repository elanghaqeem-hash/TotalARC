import { NextResponse } from 'next/server';
import { getAiGatewayStatus } from '@/lib/ai/gateway';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  return NextResponse.json({
    service: 'Total ARC AI Gateway',
    status: 'ok',
    ...getAiGatewayStatus()
  });
}
