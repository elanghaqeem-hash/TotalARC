import { NextResponse } from 'next/server';
import {
  USER_ROLES,
  authorizationErrorPayload,
  listProvisionedUsers,
  provisionUser,
  updateProvisionedUser,
  type UserRole
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

function isRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
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
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const role = body.role;
    const department = typeof body.department === 'string' ? body.department.trim() : null;

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
      department
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

    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    }

    if (role !== undefined && !isRole(role)) {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
    }

    const user = await updateProvisionedUser(request, {
      id,
      role: role as UserRole | undefined,
      active,
      name,
      department
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
