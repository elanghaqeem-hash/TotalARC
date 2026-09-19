import { NextResponse } from 'next/server';
import type { AuthenticatedUser } from '@/lib/auth';

export type MutationActor = {
  userId: string;
  name: string;
  email: string;
  role: string;
  ipAddress: string | null;
  requestId: string;
};

const MAX_MUTATION_BODY_BYTES = 1024 * 1024;

export function mutationActorFromRequest(
  request: Request,
  user: AuthenticatedUser
): MutationActor {
  const forwarded = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || null;

  return {
    userId: user.id,
    name: user.name || user.email,
    email: user.email,
    role: user.role,
    ipAddress: forwarded,
    requestId:
      request.headers.get('cf-ray')
      || request.headers.get('x-request-id')
      || crypto.randomUUID()
  };
}

export function guardMutationRequest(request: Request): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null;
  }

  if (request.headers.has('x-http-method-override')) {
    return NextResponse.json(
      {
        error: 'HTTP method override is not supported for Total ARC mutations.',
        code: 'METHOD_OVERRIDE_FORBIDDEN'
      },
      { status: 400 }
    );
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return NextResponse.json(
      {
        error: 'Total ARC mutation APIs require application/json.',
        code: 'JSON_CONTENT_TYPE_REQUIRED'
      },
      { status: 415 }
    );
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_MUTATION_BODY_BYTES) {
    return NextResponse.json(
      {
        error: 'Mutation request body exceeds the allowed size.',
        code: 'MUTATION_BODY_TOO_LARGE'
      },
      { status: 413 }
    );
  }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const requestOrigin = new URL(request.url).origin;
      const suppliedOrigin = new URL(origin).origin;
      if (suppliedOrigin !== requestOrigin) {
        return NextResponse.json(
          {
            error: 'Cross-origin mutation requests are not allowed.',
            code: 'CROSS_ORIGIN_MUTATION_BLOCKED'
          },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        {
          error: 'Mutation origin header is invalid.',
          code: 'INVALID_MUTATION_ORIGIN'
        },
        { status: 400 }
      );
    }
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    return NextResponse.json(
      {
        error: 'Cross-site mutation requests are not allowed.',
        code: 'CROSS_SITE_MUTATION_BLOCKED'
      },
      { status: 403 }
    );
  }

  return null;
}

export function auditActorLabel(actor: MutationActor) {
  return actor.email
    ? `${actor.name} <${actor.email}>`
    : actor.name;
}

export function appendRequestAuditContext(reason: string, actor: MutationActor) {
  return `${reason} RequestId=${actor.requestId}; ActorId=${actor.userId}.`;
}
