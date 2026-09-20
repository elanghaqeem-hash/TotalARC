import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import {
  createUser,
  getRoleCatalog,
  listUsers,
  sessionUser,
  updateUserAdministration
} from '@/lib/d1-auth';
import { getOrganizationStructure } from '@/lib/d1-organization';
import { SOD_CONFLICTS } from '@/lib/security-model';

export const dynamic = 'force-dynamic';

async function actor() {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE_NAME)?.value || '';
  if (!token) throw new Error('AUTH_REQUIRED');
  return sessionUser(token);
}

export async function GET() {
  try {
    const current = await actor();
    if (!current.permissions.includes('user.view')) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }

    const [users, roles, organization] = await Promise.all([
      listUsers(current.institution.id),
      getRoleCatalog(),
      getOrganizationStructure()
    ]);

    return NextResponse.json({
      institution: current.institution,
      users,
      roles,
      sodConflicts: SOD_CONFLICTS,
      organizationUnits: organization.organizationUnits || [],
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json(
      { error: code === 'AUTH_REQUIRED' ? 'Authentication required.' : 'Unable to load user administration.' },
      { status: code === 'AUTH_REQUIRED' ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = await actor();
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'CREATE_USER') {
      const record = await createUser(
        {
          institutionId:
            typeof body.institutionId === 'string' && body.institutionId
              ? body.institutionId
              : current.institution.id,
          employeeId: typeof body.employeeId === 'string' ? body.employeeId : '',
          username: typeof body.username === 'string' ? body.username : '',
          displayName: typeof body.displayName === 'string' ? body.displayName : '',
          email: typeof body.email === 'string' ? body.email : null,
          mobile: typeof body.mobile === 'string' ? body.mobile : null,
          jobTitle: typeof body.jobTitle === 'string' ? body.jobTitle : null,
          employmentStatus:
            typeof body.employmentStatus === 'string' ? body.employmentStatus : 'Permanent',
          roleKeys: Array.isArray(body.roleKeys)
            ? body.roleKeys.filter((item): item is string => typeof item === 'string')
            : [],
          units: Array.isArray(body.units)
            ? body.units
                .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
                .map(item => ({
                  id: String(item.id || ''),
                  name: String(item.name || ''),
                  accessMode: item.accessMode === 'WRITE' ? 'WRITE' as const : 'READ' as const
                }))
                .filter(item => item.id && item.name)
            : []
        },
        current
      );
      return NextResponse.json(record, { status: 201 });
    }

    if (actionType === 'UPDATE_ACCESS') {
      const result = await updateUserAdministration(
        {
          userId: typeof body.userId === 'string' ? body.userId : '',
          institutionId:
            typeof body.institutionId === 'string' && body.institutionId
              ? body.institutionId
              : current.institution.id,
          roleKeys: Array.isArray(body.roleKeys)
            ? body.roleKeys.filter((item): item is string => typeof item === 'string')
            : [],
          units: Array.isArray(body.units)
            ? body.units
                .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
                .map(item => ({
                  id: String(item.id || ''),
                  name: String(item.name || ''),
                  accessMode: item.accessMode === 'WRITE' ? 'WRITE' as const : 'READ' as const
                }))
                .filter(item => item.id && item.name)
            : [],
          status: typeof body.status === 'string' ? body.status : undefined,
          unlock: body.unlock === true
        },
        current
      );
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported user administration action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const conflicts = (error as Error & { conflicts?: unknown }).conflicts;
    const map: Record<string, [string, number]> = {
      AUTH_REQUIRED: ['Authentication required.', 401],
      ACCESS_DENIED: ['Access denied.', 403],
      INSTITUTION_ACCESS_DENIED: ['Institution access denied.', 403],
      USER_REQUIRED_FIELDS: ['Employee ID, username, display name and at least one role are required.', 400],
      INVALID_ROLE: ['One or more roles are invalid.', 400],
      PRIVILEGED_ROLE_RESTRICTED: ['Platform super administrator role can only be assigned by a platform super administrator.', 403],
      SOD_CONFLICT: ['Role assignment violates segregation of duty.', 409],
      USER_IDENTITY_CONFLICT: ['Username, employee ID or email is already registered.', 409],
      USER_NOT_FOUND: ['User not found.', 404]
    };
    const known = map[code];
    return NextResponse.json(
      { error: known?.[0] || 'Unable to process user administration.', conflicts: conflicts || undefined },
      { status: known?.[1] || 500 }
    );
  }
}
