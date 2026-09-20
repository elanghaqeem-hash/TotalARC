import { NextRequest, NextResponse } from 'next/server';
import {
  requiredPermissionForApi,
  requiredPermissionForPage,
  type PermissionKey
} from '@/lib/security-model';
import { AUTH_COOKIE_NAME, type SessionPayload } from '@/lib/auth-token';

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function base64UrlToString(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyToken(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const [header, body, signature, extra] = token.split('.');
    if (!header || !body || !signature || extra) return null;
    const expected = await sign(secret, header + '.' + body);
    if (expected.length !== signature.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i += 1) {
      diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    if (diff !== 0) return null;
    const payload = JSON.parse(base64UrlToString(body)) as SessionPayload;
    if (!payload?.sub || !payload?.institution?.id || !payload.exp) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function publicPath(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/system/database' ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/brand/') ||
    pathname.startsWith('/images/') ||
    pathname === '/favicon.ico'
  );
}

function permissionDenied(request: NextRequest, permission: PermissionKey) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Access denied for this role.', requiredPermission: permission },
      { status: 403 }
    );
  }
  const url = request.nextUrl.clone();
  url.pathname = '/';
  url.searchParams.set('accessDenied', permission);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (publicPath(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SESSION_SECRET || '';
  if (secret.length < 24) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication runtime is not configured.' }, { status: 503 });
    }
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('error', 'security-runtime');
    return NextResponse.redirect(login);
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value || '';
  const payload = token ? await verifyToken(token, secret) : null;
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(login);
  }

  const passwordChangeAllowed =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/api/profile') ||
    pathname.startsWith('/api/auth/me') ||
    pathname.startsWith('/api/auth/logout');

  if (payload.mustChangePassword && !passwordChangeAllowed) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Password change is required before using this function.' },
        { status: 403 }
      );
    }
    const profile = request.nextUrl.clone();
    profile.pathname = '/profile';
    profile.searchParams.set('password', 'required');
    return NextResponse.redirect(profile);
  }

  const required = pathname.startsWith('/api/')
    ? requiredPermissionForApi(pathname, request.method)
    : requiredPermissionForPage(pathname);

  if (required && !payload.permissions.includes(required)) {
    return permissionDenied(request, required);
  }

  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
  );
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
