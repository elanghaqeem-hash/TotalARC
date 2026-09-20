import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { revokeSession } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE_NAME)?.value || '';
  if (token) {
    try {
      await revokeSession(token);
    } catch (error) {
      console.error('Failed to revoke session during logout:', error);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    expires: new Date(0)
  });
  return response;
}
