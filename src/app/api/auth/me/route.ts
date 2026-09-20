import { NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + AUTH_COOKIE_NAME + '=([^;]+)'));
  const token = match ? decodeURIComponent(match[1]) : '';

  if (!token) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const profile = await getAuthenticatedProfile(token);
    if (!profile) {
      const response = NextResponse.json(
        { authenticated: false },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: '',
        path: '/',
        maxAge: 0
      });
      return response;
    }

    return NextResponse.json(
      { authenticated: true, user: profile },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Session validation failed:', error);
    return NextResponse.json(
      { authenticated: false, error: 'Session validation unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
