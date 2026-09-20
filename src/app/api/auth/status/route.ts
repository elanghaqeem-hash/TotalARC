import { NextResponse } from 'next/server';
import { getAuthStatus } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getAuthStatus();
    return NextResponse.json(
      { ...status, storage: 'cloudflare-d1' },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Authentication status failed:', error);
    return NextResponse.json(
      { error: 'Authentication readiness could not be loaded.' },
      { status: 503 }
    );
  }
}
