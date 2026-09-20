import { NextResponse } from 'next/server';
import {
  createAuthUser,
  listUsersForAdmin,
  setTemporaryPassword,
  updateAuthUser
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
    USER_REQUIRED: ['Name, valid email, role and required user fields are missing.', 400],
    USER_NOT_FOUND: ['Selected user was not found.', 404],
    EMAIL_CONFLICT: ['That email address is already registered.', 409],
    PASSWORD_POLICY: ['Temporary password must be 12–128 characters and include upper/lowercase letters, a number and a symbol; common/default passwords are rejected.', 400],
    PASSWORD_REUSE: ['The supplied password matches one of the user’s recent passwords.', 409],
    INVALID_ROLE: ['Select a valid role.', 400],
    ROLE_NOT_ALLOWED: ['Only a SuperAdmin may assign the SuperAdmin role.', 403],
    INVALID_STATUS: ['Status must be Active, Suspended, or Disabled.', 400],
    SELF_DISABLE_BLOCKED: ['You cannot suspend or disable your own account.', 409],
    INSTITUTION_NOT_FOUND: ['Selected institution was not found.', 404],
    ORG_UNIT_NOT_FOUND: ['One of the selected organization units was not found for this institution.', 400]
  };
  if (known[code]) return NextResponse.json({ error: known[code][0], code }, { status: known[code][1] });
  console.error('User administration failed:', error);
  return NextResponse.json({ error: 'User administration action failed.' }, { status: 500 });
}

export async function GET() {
  try {
    const session = await requireAuthenticatedSession();
    const data = await listUsersForAdmin(session);
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
    const actionType = String(body.actionType || 'CREATE');
    const meta = requestMetadata(request);

    if (actionType === 'RESET_PASSWORD') {
      const result = await setTemporaryPassword(
        session,
        String(body.userId || ''),
        String(body.temporaryPassword || ''),
        meta.ipAddress
      );
      return NextResponse.json(result);
    }

    const user = await createAuthUser(
      session,
      {
        institutionId: typeof body.institutionId === 'string' ? body.institutionId : null,
        email: String(body.email || ''),
        name: String(body.name || ''),
        employeeId: typeof body.employeeId === 'string' ? body.employeeId : null,
        jobTitle: typeof body.jobTitle === 'string' ? body.jobTitle : null,
        phone: typeof body.phone === 'string' ? body.phone : null,
        role: String(body.role || ''),
        primaryOrgUnitId: typeof body.primaryOrgUnitId === 'string' ? body.primaryOrgUnitId : null,
        orgUnitIds: Array.isArray(body.orgUnitIds) ? body.orgUnitIds.map(item => String(item)) : [],
        temporaryPassword: String(body.temporaryPassword || '')
      },
      meta.ipAddress
    );
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAuthenticatedSession();
    const body = (await request.json()) as Record<string, unknown>;
    const user = await updateAuthUser(session, body, requestMetadata(request).ipAddress);
    return NextResponse.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
