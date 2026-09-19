import { NextResponse } from 'next/server';
import { getCurrentAuthUser, getAuthStatus } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const [status, user] = await Promise.all([
      getAuthStatus(),
      getCurrentAuthUser(request)
    ]);

    return NextResponse.json(
      {
        enforced: status.enforced,
        user
      },
      {
        status: status.enforced && !user ? 401 : 200,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  } catch (error) {
    console.error('Failed to resolve current session:', error);
    return NextResponse.json(
      { error: 'Authentication service unavailable.' },
      { status: 503 }
    );
  }
}
