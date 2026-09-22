import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { canAccessApi, canAccessPage } from '@/lib/access-control';
import { AUTH_COOKIE_NAME, isAuthSecretUsable, verifySessionToken } from '@/lib/auth-token';
import { isAuthSessionActive } from '@/lib/auth-security';

async function runtimeValue(name: string) {
  const fromProcess = process.env[name];
  if (fromProcess) return fromProcess;

  try {
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as unknown as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

function safeEqual(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function authorizedHealthProbe(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return false;
  const bootstrapPost =
    request.nextUrl.pathname === '/api/auth/bootstrap' && request.method === 'POST';
  if (
    !bootstrapPost &&
    request.method !== 'GET' &&
    request.method !== 'HEAD'
  ) return false;

  const configured = await runtimeValue('TOTAL_ARC_HEALTHCHECK_TOKEN');
  if (!configured || configured.length < 24) return false;
  const supplied = request.headers.get('x-total-arc-health-token') || '';
  return safeEqual(configured, supplied);
}

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Authentication required.', code: 'AUTH_REQUIRED' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const login = new URL('/login', request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== '/') login.searchParams.set('next', target);
  return NextResponse.redirect(login);
}

function forbidden(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Your role is not authorized for this function.', code: 'FORBIDDEN' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const home = new URL('/', request.url);
  home.searchParams.set('access', 'denied');
  return NextResponse.redirect(home);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/brand/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt'
  ) {
    return NextResponse.next();
  }

  if (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname === '/api/auth/me' ||
    pathname === '/api/auth/bootstrap' ||
    pathname === '/api/ai/ready' ||
    pathname === '/api/ai/status' ||
    pathname === '/api/ai/probe'
  ) {
    return NextResponse.next();
  }

  if (await authorizedHealthProbe(request)) {
    return NextResponse.next();
  }

  const secret = await runtimeValue('TOTAL_ARC_AUTH_SECRET');
  if (!isAuthSecretUsable(secret)) {
    if (pathname === '/login') return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication is not configured.', code: 'AUTH_NOT_CONFIGURED' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.redirect(new URL('/login?configuration=required', request.url));
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value || '';
  const session = token ? await verifySessionToken(token, secret) : null;

  if (pathname === '/login') {
    if (session) {
      try {
        if (await isAuthSessionActive(session, false)) {
          return NextResponse.redirect(new URL('/', request.url));
        }
      } catch {
        // A stale/pre-hardening cookie must never prevent access to the login page.
      }
    }
    return NextResponse.next();
  }

  if (!session) return unauthorized(request);

  let activeSession = false;
  try {
    activeSession = await isAuthSessionActive(session, true);
  } catch (error) {
    console.error('Session registry validation failed:', error);
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Session validation is temporarily unavailable.', code: 'SESSION_VALIDATION_UNAVAILABLE' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return unauthorized(request);
  }
  if (!activeSession) return unauthorized(request);

  const passwordChangePath =
    pathname === '/profile' ||
    pathname === '/api/auth/profile' ||
    pathname === '/api/auth/me' ||
    pathname === '/api/auth/logout';

  if (session.mustChangePassword && !passwordChangePath) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: 'Password change is required before using other protected functions.',
          code: 'PASSWORD_CHANGE_REQUIRED'
        },
        { status: 428, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const profile = new URL('/profile', request.url);
    profile.searchParams.set('password', 'required');
    const target = request.nextUrl.pathname + request.nextUrl.search;
    if (target && target !== '/profile') {
      profile.searchParams.set('next', target);
    }
    return NextResponse.redirect(profile);
  }

  if (pathname.startsWith('/api/')) {
    if (!canAccessApi(session.role, pathname, request.method)) return forbidden(request);
    return NextResponse.next();
  }

  if (!canAccessPage(session.role, pathname)) return forbidden(request);
  return NextResponse.next();
}

export const config = {
  matcher: '/:path*'
};
