import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { PASSWORD_POLICY } from '@/lib/security-model';
import { switchUserInstitution } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const store = await cookies();
    const token = store.get(AUTH_COOKIE_NAME)?.value || '';
    if (!token) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const body = (await request.json()) as Record<string, unknown>;
    const institutionId =
      typeof body.institutionId === 'string' ? body.institutionId.trim() : '';
    if (!institutionId) {
      return NextResponse.json({ error: 'Institution is required.' }, { status: 400 });
    }

    const result = await switchUserInstitution(token, institutionId);
    const response = NextResponse.json({ success: true, user: result.user });
    response.cookies.set(AUTH_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: PASSWORD_POLICY.sessionMinutes * 60
    });
    return response;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json(
      { error: code === 'INSTITUTION_ACCESS_DENIED' ? 'Institution access denied.' : 'Unable to switch institution.' },
      { status: code === 'INSTITUTION_ACCESS_DENIED' ? 403 : 400 }
    );
  }
}
