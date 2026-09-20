import { NextResponse } from 'next/server';
import { getAuthRuntimeConfig } from '@/lib/auth-token';
import { readAuthToken } from '@/lib/auth-request';
import { getAuthenticatedSession } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const token = await readAuthToken();
    const runtime = getAuthRuntimeConfig();
    if (!token) {
      return NextResponse.json(
        {
          authenticated: false,
          enforcement: runtime.enforce,
          secretReady: runtime.secretReady
        },
        { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const session = await getAuthenticatedSession(token);
    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
          enforcement: runtime.enforce,
          secretReady: runtime.secretReady
        },
        { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const { user, organizationUnits, session: sessionRecord } = session;
    return NextResponse.json(
      {
        authenticated: true,
        enforcement: runtime.enforce,
        user: {
          id: user.id,
          institutionId: user.institutionId,
          institutionName: user.institutionName,
          institutionLegalName: user.institutionLegalName,
          institutionShortName: user.institutionShortName,
          email: user.email,
          name: user.name,
          employeeId: user.employeeId,
          jobTitle: user.jobTitle,
          phone: user.phone,
          role: user.role,
          primaryOrgUnitId: user.primaryOrgUnitId,
          primaryOrgUnitCode: user.primaryOrgUnitCode,
          primaryOrgUnitName: user.primaryOrgUnitName,
          status: user.status,
          mustChangePassword: user.mustChangePassword,
          lastLoginAt: user.lastLoginAt
        },
        organizationUnits,
        session: {
          id: sessionRecord.id,
          issuedAt: sessionRecord.issuedAt,
          expiresAt: sessionRecord.expiresAt,
          lastSeenAt: sessionRecord.lastSeenAt
        }
      },
      { headers: { 'Cache-Control': 'private, no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Session lookup failed:', error);
    return NextResponse.json({ authenticated: false, error: 'Session could not be verified.' }, { status: 500 });
  }
}
