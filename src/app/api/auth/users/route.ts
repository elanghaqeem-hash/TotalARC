import { NextResponse } from 'next/server';
import {
  USER_ROLES,
  authorizationErrorPayload,
  listProvisionedUsers,
  provisionUser,
  updateProvisionedUser,
  ORG_ACCESS_SCOPES,
  type OrgAccessScope,
  type UserRole
} from '@/lib/auth';
import { guardMutationRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

function isOrgScope(value: unknown): value is OrgAccessScope {
  return typeof value === 'string' && (ORG_ACCESS_SCOPES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  try {
    const users = await listProvisionedUsers(request);
    return NextResponse.json({ users });
  } catch (error) {
    const failure = authorizationErrorPayload(error);
    if (failure) {
      return NextResponse.json(failure.body, { status: failure.status });
    }

    console.error('Failed to list Total ARC users:', error);
    return NextResponse.json({ error: 'Failed to list users.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role = body.role;
    const department = typeof body.department === 'string' ? body.department.trim() : null;
    const orgUnitId = typeof body.orgUnitId === 'string' ? body.orgUnitId.trim() || null : null;
    const orgAccessScope = isOrgScope(body.orgAccessScope) ? body.orgAccessScope : undefined;

    if (!email || !name || !isRole(role)) {
      return NextResponse.json(
        { error: 'email, name, and a valid role are required.' },
        { status: 400 }
      );
    }

    const user = await provisionUser(request, {
      email,
      name,
      role,
      department,
      orgUnitId,
      orgAccessScope
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const failure = authorizationErrorPayload(error);
    if (failure) {
      return NextResponse.json(failure.body, { status: failure.status });
    }

    console.error('Failed to provision Total ARC user:', error);
    return NextResponse.json({ error: 'Failed to provision user.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const role = body.role;
    const active = typeof body.active === 'boolean' ? body.active : undefined;
    const name = typeof body.name === 'string' ? body.name.trim() : undefined;
    const department =
      body.department === null
        ? null
        : typeof body.department === 'string'
          ? body.department.trim()
          : undefined;
    const orgUnitId =
      body.orgUnitId === null
        ? null
        : typeof body.orgUnitId === 'string'
          ? body.orgUnitId.trim()
          : undefined;
    const orgAccessScope =
      body.orgAccessScope === undefined
        ? undefined
        : isOrgScope(body.orgAccessScope)
          ? body.orgAccessScope
          : null;

    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    }

    if (role !== undefined && !isRole(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }

    if (body.orgAccessScope !== undefined && orgAccessScope === null) {
      return NextResponse.json({ error: 'Invalid organization access scope.' }, { status: 400 });
    }

    const user = await updateProvisionedUser(request, {
      id,
      role: role as UserRole | undefined,
      active,
      name,
      department,
      orgUnitId,
      orgAccessScope: orgAccessScope || undefined
    });

    return NextResponse.json(user);
  } catch (error) {
    const failure = authorizationErrorPayload(error);
    if (failure) {
      return NextResponse.json(failure.body, { status: failure.status });
    }

    console.error('Failed to update Total ARC user:', error);
    return NextResponse.json({ error: 'Failed to update user.' }, { status: 500 });
  }
}
