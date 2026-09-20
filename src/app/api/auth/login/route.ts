import { NextResponse } from 'next/server';
import { authenticateUser, ensureAuthSchema } from '@/lib/d1-auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { PASSWORD_POLICY } from '@/lib/security-model';

export const dynamic = 'force-dynamic';

function clientIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

export async function GET() {
  try {
    await ensureAuthSchema();
    return NextResponse.json({
      ready: true,
      credentialMode: 'LOCAL',
      passwordPolicy: {
        minLength: PASSWORD_POLICY.minLength,
        expiryDays: PASSWORD_POLICY.expiryDays,
        maxFailedAttempts: PASSWORD_POLICY.maxFailedAttempts,
        lockoutMinutes: PASSWORD_POLICY.lockoutMinutes,
        sessionMinutes: PASSWORD_POLICY.sessionMinutes
      }
    });
  } catch (error) {
    console.error('Auth initialization failed:', error);
    return NextResponse.json({ ready: false, error: 'Authentication service unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const institutionId =
      typeof body.institutionId === 'string' && body.institutionId.trim()
        ? body.institutionId.trim()
        : null;

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Username/email and password are required.' }, { status: 400 });
    }

    const result = await authenticateUser({
      identifier,
      password,
      institutionId,
      ipAddress: clientIp(request),
      userAgent: request.headers.get('user-agent')
    });

    const response = NextResponse.json({
      success: true,
      user: result.user,
      mustChangePassword: result.user.mustChangePassword
    });

    response.cookies.set(AUTH_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: PASSWORD_POLICY.sessionMinutes * 60
    });

    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCOUNT_LOCKED') {
      return NextResponse.json(
        { error: 'Account is temporarily locked after repeated failed sign-in attempts.' },
        { status: 423 }
      );
    }
    if (code === 'LOGIN_RATE_LIMITED') {
      return NextResponse.json(
        { error: 'Too many failed sign-in attempts. Try again later.' },
        { status: 429 }
      );
    }
    if (code.includes('AUTH_SESSION_SECRET')) {
      return NextResponse.json(
        { error: 'Authentication runtime is not configured.' },
        { status: 503 }
      );
    }
    if (code === 'TEMPORARY_CREDENTIAL_EXPIRED') {
      return NextResponse.json(
        { error: 'Temporary credential has expired. Contact an authorized user administrator for a new credential reset.' },
        { status: 401 }
      );
    }
    if (code === 'NO_ACTIVE_INSTITUTION_ACCESS') {
      return NextResponse.json(
        { error: 'No active institution access is assigned to this user.' },
        { status: 403 }
      );
    }
    console.error('Login failed:', code || error);
    return NextResponse.json(
      { error: 'Invalid username/email or password.' },
      { status: 401 }
    );
  }
}
