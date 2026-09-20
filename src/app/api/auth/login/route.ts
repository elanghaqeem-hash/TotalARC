import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { authenticateUser } from '@/lib/d1-auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { authCookieOptions, requestMetadata } from '@/lib/auth-request';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.', code: 'LOGIN_REQUIRED' },
        { status: 400 }
      );
    }

    const result = await authenticateUser({
      email,
      password,
      ...requestMetadata(request)
    });

    const store = await cookies();
    store.set(AUTH_COOKIE_NAME, result.token, authCookieOptions(result.expiresAt));

    return NextResponse.json({
      authenticated: true,
      user: result.user,
      expiresAt: result.expiresAt,
      mustChangePassword: result.user.mustChangePassword
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      AUTH_SECRET_NOT_CONFIGURED: ['AUTH_SESSION_SECRET must be configured before sign-in can be used.', 503],
      INVALID_CREDENTIALS: ['Invalid email or password.', 401],
      USER_NOT_ACTIVE: ['This account is not active. Contact your institution administrator.', 403],
      ACCOUNT_LOCKED: ['This account is temporarily locked after repeated failed sign-in attempts. Try again later or contact an administrator.', 423],
      INVALID_ROLE: ['This account has an invalid role configuration.', 403]
    };
    if (known[code]) return NextResponse.json({ error: known[code][0], code }, { status: known[code][1] });

    console.error('Login failed:', error);
    return NextResponse.json({ error: 'Sign-in could not be completed.' }, { status: 500 });
  }
}
