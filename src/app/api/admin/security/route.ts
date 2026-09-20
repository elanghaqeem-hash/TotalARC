import { NextResponse } from 'next/server';
import {
  getSecurityAdministration,
  revokeAdminSession
} from '@/lib/d1-auth';
import {
  requestMetadata,
  requireAuthenticatedSession
} from '@/lib/auth-request';

export const dynamic = 'force-dynamic';

function apiError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = {
    AUTH_REQUIRED: ['Authentication is required.', 401],
    ADMIN_REQUIRED: ['Institution administration privileges are required.', 403],
    SESSION_NOT_FOUND: ['Selected session was not found.', 404]
  };
  if (known[code]) return NextResponse.json({ error: known[code][0], code }, { status: known[code][1] });
  console.error('Security administration failed:', error);
  return NextResponse.json({ error: 'Security administration action failed.' }, { status: 500 });
}

export async function GET() {
  try {
    const session = await requireAuthenticatedSession();
    const data = await getSecurityAdministration(session);
    return NextResponse.json(
      { ...data, storage: 'cloudflare-d1' },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedSession();
    const body = (await request.json()) as Record<string, unknown>;
    if (String(body.actionType || '') !== 'REVOKE_SESSION') {
      return NextResponse.json({ error: 'Unsupported security action.' }, { status: 400 });
    }
    const result = await revokeAdminSession(
      session,
      String(body.sessionId || ''),
      requestMetadata(request).ipAddress
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
