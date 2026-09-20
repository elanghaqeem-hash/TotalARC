import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME, getAuthRuntimeConfig } from '@/lib/auth-token';
import { getAuthenticatedSession } from '@/lib/d1-auth';

export async function readAuthToken() {
  const store = await cookies();
  return store.get(AUTH_COOKIE_NAME)?.value || '';
}

export async function requireAuthenticatedSession() {
  const token = await readAuthToken();
  if (!token) throw new Error('AUTH_REQUIRED');
  const session = await getAuthenticatedSession(token);
  if (!session) throw new Error('AUTH_REQUIRED');
  return session;
}

export function requestMetadata(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const ipAddress =
    request.headers.get('cf-connecting-ip') ||
    forwarded.split(',')[0]?.trim() ||
    null;
  const userAgent = request.headers.get('user-agent') || null;
  return { ipAddress, userAgent };
}

export function authCookieOptions(expiresAt?: string) {
  const config = getAuthRuntimeConfig();
  const expires = expiresAt ? new Date(expiresAt) : undefined;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: config.ttlMinutes * 60,
    ...(expires ? { expires } : {})
  };
}
