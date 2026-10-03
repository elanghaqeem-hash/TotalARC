import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  getAuthenticatedProfile,
  loadSecurityAdministration,
  revokeManagedSession
} from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { AUTH_LOGIN_RATE_LIMIT } from '@/lib/auth-security';
import { canAdministerTenantUsers } from '@/lib/access-control';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context || !canAdministerTenantUsers(context.profile.role) || !context.institution) return null;
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
  if (code === 'PRIVILEGED_SESSION_PROTECTED') {
    return NextResponse.json(
      { error: 'Administrator institusi tidak dapat mencabut sesi administrator SystemAdmin/Admin.', code },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
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
    const effectiveData =
      admin.role === 'Admin'
        ? (() => {
            const activeSessions = (data.activeSessions || []).filter(
              item => !['SystemAdmin', 'Admin'].includes(String(item.role || ''))
            );
            const events = (data.events || []).filter(
              item => !['SystemAdmin', 'Admin'].includes(String(item.role || ''))
            );
            return {
              ...data,
              activeSessions,
              events,
              metrics: {
                ...data.metrics,
                activeSessions: activeSessions.length,
                failedLoginEvents: events.filter(item =>
                  ['LOGIN_FAILED', 'ACCOUNT_LOCKED'].includes(String(item.eventType))
                ).length
              }
            };
          })()
        : data;
    return NextResponse.json(
      {
        ...effectiveData,
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
        loginRateLimitPolicy: {
          ipPerMinute: {
            requests: AUTH_LOGIN_RATE_LIMIT.ipPerMinute.limit,
            windowSeconds: AUTH_LOGIN_RATE_LIMIT.ipPerMinute.windowMs / 1000
          },
          accountPer15Minutes: {
            requests: AUTH_LOGIN_RATE_LIMIT.accountPer15Minutes.limit,
            windowSeconds: AUTH_LOGIN_RATE_LIMIT.accountPer15Minutes.windowMs / 1000
          },
          ipPerHour: {
            requests: AUTH_LOGIN_RATE_LIMIT.ipPerHour.limit,
            windowSeconds: AUTH_LOGIN_RATE_LIMIT.ipPerHour.windowMs / 1000
          }
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
      actorRole: admin.role,
      sessionId: String(body.sessionId)
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
