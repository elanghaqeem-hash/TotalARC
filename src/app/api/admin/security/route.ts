import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import {
  listAuthReferenceData,
  saveSecurityParameters,
  sessionUser
} from '@/lib/d1-auth';
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
    if (!current.permissions.includes('security.admin')) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }
    const data = await listAuthReferenceData(current.institution.id);
    return NextResponse.json({
      ...data,
      sodConflicts: SOD_CONFLICTS,
      institution: current.institution,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json(
      { error: code === 'AUTH_REQUIRED' ? 'Authentication required.' : 'Unable to load security administration.' },
      { status: code === 'AUTH_REQUIRED' ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const current = await actor();
    const body = (await request.json()) as Record<string, unknown>;
    const values =
      body.values && typeof body.values === 'object' && !Array.isArray(body.values)
        ? Object.fromEntries(
            Object.entries(body.values as Record<string, unknown>).map(([key, value]) => [
              key,
              String(value ?? '')
            ])
          )
        : {};

    const result = await saveSecurityParameters(current.institution.id, values, current);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return NextResponse.json(
      { error: code === 'ACCESS_DENIED' ? 'Access denied.' : 'Unable to save security parameters.' },
      { status: code === 'ACCESS_DENIED' ? 403 : 500 }
    );
  }
}
