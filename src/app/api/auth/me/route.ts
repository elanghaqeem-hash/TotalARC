import { NextResponse } from 'next/server';
import { authenticateRequest, authorizationErrorPayload } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request);

    return NextResponse.json(
      {
        authenticated: true,
        user
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  } catch (error) {
    const failure = authorizationErrorPayload(error);
    if (failure) {
      return NextResponse.json(failure.body, {
        status: failure.status,
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      });
    }

    console.error('Failed to resolve authenticated Total ARC user:', error);
    return NextResponse.json(
      { error: 'Unable to resolve authenticated user.' },
      { status: 500 }
    );
  }
}
