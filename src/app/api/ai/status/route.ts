import { NextResponse } from 'next/server';
import { apiError, requireApiUser } from '@/lib/api';
import { getAiGatewayStatus } from '@/lib/ai/gateway';

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    return NextResponse.json({
      service: 'Total ARC AI Gateway',
      status: 'ok',
      ...getAiGatewayStatus()
    });
  } catch (error) {
    return apiError(error);
  }
}
