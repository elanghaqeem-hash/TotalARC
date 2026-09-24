import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  getAuthenticatedProfile,
  loadSecurityAdministration,
  revokeManagedSession
} from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context || context.profile.role !== 'Admin' || !context.institution) return null;
  return {
    ...context.profile,
    institutionId: context.institution.id,
    institutionName: context.institution.name
  };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'SECURITY_ADMIN_ERROR';
  if (code === 'SESSION_NOT_FOUND') {
    return NextResponse.json(
      { error: 'Session tidak ditemukan.', code },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  console.error('Security administration failed:', error);
  return NextResponse.json(
    { error: 'Security administration tidak dapat diproses.', code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const data = await loadSecurityAdministration(admin.institutionId);
    return NextResponse.json(
      {
        ...data,
        passwordPolicy: {
          minimumLength: 12,
          maximumLength: 128,
          historyDepth: 5,
          complexityRequired: true
        },
        sessionPolicy: {
          absoluteMinutes: 60,
          serverSideRevocation: true,
          activityTouchMinutes: 5
        },
        storage: 'cloudflare-d1'
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json();
    if (body.actionType !== 'REVOKE_SESSION' || !body.sessionId) {
      return NextResponse.json(
        { error: 'Unsupported security action.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const result = await revokeManagedSession({
      actorUserId: admin.id,
      actorInstitutionId: admin.institutionId,
      sessionId: String(body.sessionId)
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
