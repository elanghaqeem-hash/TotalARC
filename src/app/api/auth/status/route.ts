import { NextResponse } from 'next/server';
import { getAuthStatus } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getAuthStatus(), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('Failed to read authentication status:', error);
    return NextResponse.json(
      { error: 'Authentication storage is unavailable.' },
      { status: 503 }
    );
  }
}
