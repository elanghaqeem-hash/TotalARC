import { NextResponse } from 'next/server';
import { logoutSession, sameOrigin, SESSION_COOKIE } from '@/lib/d1-auth';

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  try {
    await logoutSession(request);
  } catch (error) {
    console.error('Session revocation failed:', error);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return response;
}
