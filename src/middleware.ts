import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/auth/login'
]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const isStaticOrPublicPage =
    pathname === '/login' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico';

  if (isStaticOrPublicPage || PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const payload = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (payload) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Authentication required', code: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
};
