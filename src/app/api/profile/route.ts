import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { PASSWORD_POLICY } from '@/lib/security-model';
import { changeOwnPassword, sessionUser, updateOwnProfile } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = await cookies();
    const token = store.get(AUTH_COOKIE_NAME)?.value || '';
    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const user = await sessionUser(token);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const store = await cookies();
    const token = store.get(AUTH_COOKIE_NAME)?.value || '';
    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'UPDATE_PROFILE') {
      const result = await updateOwnProfile(token, {
        displayName: typeof body.displayName === 'string' ? body.displayName : '',
        email: typeof body.email === 'string' ? body.email : null,
        mobile: typeof body.mobile === 'string' ? body.mobile : null,
        jobTitle: typeof body.jobTitle === 'string' ? body.jobTitle : null
      });
      const response = NextResponse.json({ success: true, user: result.user });
      response.cookies.set(AUTH_COOKIE_NAME, result.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: PASSWORD_POLICY.sessionMinutes * 60
      });
      return response;
    }

    if (actionType === 'CHANGE_PASSWORD') {
      const currentPassword =
        typeof body.currentPassword === 'string' ? body.currentPassword : '';
      const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const result = await changeOwnPassword(token, currentPassword, newPassword);
      const response = NextResponse.json({ success: true, user: result.user });
      response.cookies.set(AUTH_COOKIE_NAME, result.token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        maxAge: PASSWORD_POLICY.sessionMinutes * 60
      });
      return response;
    }

    return NextResponse.json({ error: 'Unsupported profile action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const details = (error as Error & { details?: string[] })?.details;
    const map: Record<string, [string, number]> = {
      PROFILE_REQUIRED_FIELDS: ['Display name is required.', 400],
      EMAIL_CONFLICT: ['Email address is already used by another user.', 409],
      CURRENT_PASSWORD_INVALID: ['Current password is incorrect.', 400],
      PASSWORD_REUSE: ['New password cannot match recent password history.', 400],
      PASSWORD_POLICY: ['New password does not meet the security policy.', 400],
      INVALID_SESSION: ['Session has expired.', 401]
    };
    const known = map[code];
    return NextResponse.json(
      { error: known?.[0] || 'Unable to update profile.', details: details || undefined },
      { status: known?.[1] || 500 }
    );
  }
}
