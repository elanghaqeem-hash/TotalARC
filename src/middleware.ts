import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth-constants';

const PUBLIC_PATHS = new Set([
  '/login',
  '/setup/admin',
  '/api/auth/status',
  '/api/auth/bootstrap',
  '/api/auth/login',
  '/api/system/database',
  '/api/ai/ready',
  '/api/ai/probe'
]);

export function middleware(request: NextRequest) {
  if ((process.env.AUTH_ENFORCE || '').toLowerCase() !== 'true') {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Authentication required.', code: 'UNAUTHENTICATED' },
      { status: 401 }
    );
  }

  const login = new URL('/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']
};
