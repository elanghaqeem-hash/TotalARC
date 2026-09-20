import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { sessionUser } from '@/lib/d1-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = await cookies();
    const token = store.get(AUTH_COOKIE_NAME)?.value || '';
    if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });
    const user = await sessionUser(token);
    return NextResponse.json({ authenticated: true, user });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}
