import { NextResponse } from 'next/server';
import {
  authenticateUser,
  guardAuthLoginRate,
  sameOrigin,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS
} from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    }
    if (!(await guardAuthLoginRate(request))) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    const length = Number(request.headers.get('content-length') || 0);
    if (length > 16_384) {
      return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const { user, token } = await authenticateUser(request, email, password);
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS
    });
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCOUNT_LOCKED') {
      return NextResponse.json(
        { error: 'Account temporarily locked after repeated failed sign-in attempts.' },
        { status: 429 }
      );
    }
    if (code === 'INVALID_CREDENTIALS') {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    console.error('Authentication failed:', error);
    return NextResponse.json({ error: 'Authentication service unavailable.' }, { status: 503 });
  }
}
