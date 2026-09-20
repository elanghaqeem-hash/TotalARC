import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { AUTH_COOKIE_NAME, AUTH_SESSION_SECONDS } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

function requestIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const { profile, token } = await authenticateUser({
      email,
      password,
      ipAddress: requestIp(request),
      userAgent: request.headers.get('user-agent')
    });

    const response = NextResponse.json({ user: profile });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_SESSION_SECONDS
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : 'AUTH_ERROR';

    if (code === 'ACCOUNT_LOCKED') {
      return NextResponse.json(
        { error: 'Akun dikunci sementara setelah beberapa percobaan login gagal. Coba kembali dalam 15 menit.' },
        { status: 423, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (code === 'ACCOUNT_DISABLED') {
      return NextResponse.json(
        { error: 'Akun ini tidak aktif. Hubungi administrator Total ARC.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (code === 'AUTH_NOT_CONFIGURED' || code === 'AUTH_BOOTSTRAP_REQUIRED' || code === 'AUTH_BOOTSTRAP_WEAK_PASSWORD') {
      console.error('Total ARC authentication configuration error:', code);
      return NextResponse.json(
        { error: 'Authentication belum dikonfigurasi pada environment deployment.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (code === 'AUTH_DATABASE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Database authentication sedang tidak tersedia.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { error: 'Email atau password tidak sesuai.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
