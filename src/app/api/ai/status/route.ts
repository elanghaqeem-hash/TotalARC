import { NextResponse } from 'next/server';
import { getAiGatewayStatus } from '@/lib/ai/gateway';

export async function GET() {
  return NextResponse.json({
    service: 'Total ARC AI Gateway',
    status: 'ok',
    ...getAiGatewayStatus()
  });
}
