import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth';
import { AUTH_COOKIE_NAME, AUTH_SESSION_SECONDS } from '@/lib/auth-token';
import { enforceAuthLoginRateLimit } from '@/lib/auth-security';

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
    const ipAddress = requestIp(request);

    const rateLimit = await enforceAuthLoginRateLimit({
      ipAddress,
      email
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Terlalu banyak permintaan login. Coba kembali setelah beberapa saat.',
          code: 'AUTH_LOGIN_RATE_LIMIT'
        },
        {
          status: 429,
          headers: {
            'Cache-Control': 'no-store',
            'Retry-After': String(rateLimit.retryAfterSeconds),
            'X-RateLimit-Policy': '5;w=60;key=ip, 20;w=900;key=account, 100;w=3600;key=ip'
          }
        }
      );
    }

    const result = await authenticateUser({
      email,
      password,
      ipAddress,
      userAgent: request.headers.get('user-agent')
    });

    if (result.mfa?.required || !result.token) {
      return NextResponse.json(
        {
          user: result.profile,
          mfaRequired: true,
          mfa: result.mfa
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const response = NextResponse.json({ user: result.profile, mfaRequired: false });
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: result.token,
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

    if (code === 'TEMPORARY_CREDENTIAL_EXPIRED') {
      return NextResponse.json(
        { error: 'Credential sementara telah kedaluwarsa. Hubungi administrator untuk melakukan reset credential baru.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
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

    if (code === 'PASSWORD_HASH_RUNTIME_UNSUPPORTED') {
      return NextResponse.json(
        { error: 'Hash password akun ini dibuat dengan work factor yang tidak didukung Cloudflare Workers. Administrator harus melakukan reset password akun.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (code === 'AUTH_DATABASE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Database authentication sedang tidak tersedia.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (code === 'AUTH_LOGIN_RATE_LIMIT_UNAVAILABLE') {
      return NextResponse.json(
        {
          error: 'Proteksi rate limit login sedang tidak tersedia. Login dinonaktifkan sementara untuk keamanan.',
          code
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } }
      );
    }

    if (
      code.includes("exceeded D1's free tier daily row write limit") ||
      code.includes("exceeded D1's free tier daily row read limit")
    ) {
      console.error('Total ARC authentication blocked by Cloudflare D1 daily quota:', code);
      return NextResponse.json(
        {
          error:
            'Kapasitas database harian Total ARC sedang mencapai batas layanan Cloudflare D1. Login sementara tidak dapat diproses sampai kuota database tersedia kembali.',
          code: 'AUTH_DATABASE_DAILY_QUOTA_EXCEEDED'
        },
        { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '3600' } }
      );
    }

    return NextResponse.json(
      { error: 'Email atau password tidak sesuai.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
