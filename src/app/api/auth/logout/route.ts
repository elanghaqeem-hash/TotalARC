import { NextResponse } from 'next/server';
import { recordLogout } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { ACTIVE_INSTITUTION_COOKIE_NAME } from '@/lib/institution-context';

export const dynamic = 'force-dynamic';

function requestIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

export async function POST(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + AUTH_COOKIE_NAME + '=([^;]+)'));
  const token = match ? decodeURIComponent(match[1]) : '';

  if (token) {
    await recordLogout(token, {
      ipAddress: requestIp(request),
      userAgent: request.headers.get('user-agent')
    });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  response.cookies.set({
    name: ACTIVE_INSTITUTION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
