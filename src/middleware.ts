import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  canAccessPath,
  getAuthRuntimeConfig,
  verifySessionToken
} from '@/lib/auth-token';

const PUBLIC_PATHS = new Set([
  '/login',
  '/security/setup',
  '/unauthorized',
  '/api/auth/login',
  '/api/auth/bootstrap',
  '/api/auth/status',
  '/api/auth/logout',
  '/api/system/database'
]);

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/brand/')) return true;
  if (pathname === '/favicon.ico') return true;
  return false;
}

function apiError(status: number, error: string, code: string) {
  return NextResponse.json({ error, code }, { status });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const config = getAuthRuntimeConfig();

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!config.enforce) {
    const headers = new Headers(request.headers);
    headers.set('x-totalarc-auth-mode', 'staged');
    return NextResponse.next({ request: { headers } });
  }

  if (!config.secretReady) {
    if (pathname.startsWith('/api/')) {
      return apiError(
        503,
        'Authentication enforcement is enabled but AUTH_SESSION_SECRET is not configured.',
        'AUTH_SECRET_NOT_CONFIGURED'
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/security/setup';
    url.searchParams.set('reason', 'auth-secret-required');
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value || '';
  const claims = token ? await verifySessionToken(token, config.secret) : null;

  if (!claims) {
    if (pathname.startsWith('/api/')) {
      return apiError(401, 'Authentication is required.', 'AUTH_REQUIRED');
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('returnTo', pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (claims.mustChangePassword && pathname !== '/profile' && !pathname.startsWith('/api/auth/profile')) {
    if (pathname.startsWith('/api/')) {
      return apiError(
        428,
        'Password change is required before accessing other protected resources.',
        'PASSWORD_CHANGE_REQUIRED'
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = '/profile';
    url.searchParams.set('forcePasswordChange', '1');
    return NextResponse.redirect(url);
  }

  if (!canAccessPath(claims.role, pathname, request.method)) {
    if (pathname.startsWith('/api/')) {
      return apiError(403, 'Your role is not authorized for this resource.', 'FORBIDDEN');
    }
    const url = request.nextUrl.clone();
    url.pathname = '/unauthorized';
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set('x-totalarc-auth-mode', 'enforced');
  headers.set('x-totalarc-user-id', claims.uid);
  headers.set('x-totalarc-institution-id', claims.institutionId);
  headers.set('x-totalarc-role', claims.role);
  headers.set('x-totalarc-session-id', claims.sid);
  if (claims.primaryOrgUnitId) {
    headers.set('x-totalarc-primary-org-unit-id', claims.primaryOrgUnitId);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
};
