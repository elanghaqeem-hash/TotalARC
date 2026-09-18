import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname === '/login' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/api/');

  if (isPublic) return NextResponse.next();

  const payload = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (payload) return NextResponse.next();

  const login = new URL('/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
};
