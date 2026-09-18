import { NextResponse } from 'next/server';
import { getCurrentUser, type AuthUser } from '@/lib/auth';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function requireApiUser(request: Request, roles?: string[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  if (roles && !roles.includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Insufficient permission');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertSameOrigin(request);
  return user;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!forwardedHost) throw new ApiError(403, 'INVALID_ORIGIN', 'Request origin cannot be verified');

  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(v => v.trim())
      .filter(Boolean)
  );

  const originUrl = new URL(origin);
  if (originUrl.host !== forwardedHost && !allowed.has(origin)) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'Cross-origin state change rejected');
  }
}

export async function readJson<T = Record<string, unknown>>(request: Request, maxBytes = 64_000): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Malformed JSON request');
  }
}

export function requireString(value: unknown, field: string, max = 500) {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'VALIDATION_ERROR', `${field} is required`);
  const clean = value.trim();
  if (clean.length > max) throw new ApiError(400, 'VALIDATION_ERROR', `${field} is too long`);
  return clean;
}

export function optionalString(value: unknown, max = 2000) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid text value');
  const clean = value.trim();
  if (clean.length > max) throw new ApiError(400, 'VALIDATION_ERROR', 'Text value is too long');
  return clean;
}

export function clientIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
}
