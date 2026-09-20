import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeSession } from '@/lib/d1-auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { readAuthToken } from '@/lib/auth-request';

export const dynamic = 'force-dynamic';

export async function POST() {
  const token = await readAuthToken();
  if (token) {
    try {
      await revokeSession(token);
    } catch (error) {
      console.error('Session revocation during logout failed:', error);
    }
  }

  const store = await cookies();
  store.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  });

  return NextResponse.json({ success: true });
}
