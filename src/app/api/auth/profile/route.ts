import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  changeOwnPassword,
  updateOwnProfile
} from '@/lib/d1-auth';
import {
  requestMetadata,
  requireAuthenticatedSession
} from '@/lib/auth-request';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

function mappedError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const known: Record<string, [string, number]> = {
    AUTH_REQUIRED: ['Authentication is required.', 401],
    USER_NOT_FOUND: ['Authenticated user could not be found.', 404],
    USER_REQUIRED: ['Name is required.', 400],
    CURRENT_PASSWORD_INVALID: ['Current password is invalid.', 400],
    PASSWORD_POLICY: ['New password must be 12–128 characters and include upper/lowercase letters, a number and a symbol; common/default passwords are rejected.', 400],
    PASSWORD_REUSE: ['The new password matches one of the recent passwords and cannot be reused.', 409]
  };
  if (known[code]) return NextResponse.json({ error: known[code][0], code }, { status: known[code][1] });
  console.error('Profile action failed:', error);
  return NextResponse.json({ error: 'Profile action failed.' }, { status: 500 });
}

export async function PATCH(request: Request) {
  try {
    const session = await requireAuthenticatedSession();
    const body = (await request.json()) as Record<string, unknown>;
    const updated = await updateOwnProfile(session, body, requestMetadata(request).ipAddress);
    return NextResponse.json({ user: updated });
  } catch (error) {
    return mappedError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedSession();
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = String(body.actionType || '');

    if (actionType !== 'CHANGE_PASSWORD') {
      return NextResponse.json({ error: 'Unsupported profile action.' }, { status: 400 });
    }

    const result = await changeOwnPassword(
      session,
      String(body.currentPassword || ''),
      String(body.newPassword || ''),
      requestMetadata(request).ipAddress
    );

    const store = await cookies();
    store.set(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0
    });

    return NextResponse.json(result);
  } catch (error) {
    return mappedError(error);
  }
}
