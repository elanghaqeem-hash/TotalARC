import { NextResponse } from 'next/server';
import { listRcmRows } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rcm = await listRcmRows();
    return NextResponse.json({
      rcm,
      total: rcm.length,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to generate D1 RCM:', error);
    return NextResponse.json({ error: 'Failed to generate RCM from persistent database.' }, { status: 503 });
  }
}
