import { NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { resolveInstitutionAccess } from '@/lib/institution-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + AUTH_COOKIE_NAME + '=([^;]+)'));
  const token = match ? decodeURIComponent(match[1]) : '';

  if (!token) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const profile = await getAuthenticatedProfile(token);
    if (!profile) {
      const response = NextResponse.json(
        { authenticated: false },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: '',
        path: '/',
        maxAge: 0
      });
      return response;
    }

    const institutionContext = await resolveInstitutionAccess(request, profile, { includeInstitutions: true });
    const activeInstitution = institutionContext?.institution || null;
    const user = activeInstitution
      ? {
          ...profile,
          institutionId: activeInstitution.id,
          institutionName: activeInstitution.name
        }
      : profile;

    return NextResponse.json(
      {
        authenticated: true,
        user,
        canSwitchInstitution: institutionContext?.canSwitch || false,
        institutions: (institutionContext?.institutions || []).map(item => ({
          id: item.id,
          name: item.name,
          legalName: item.legalName,
          shortName: item.shortName,
          institutionType: item.institutionType,
          country: item.country
        }))
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Session validation failed:', error);
    return NextResponse.json(
      { authenticated: false, error: 'Session validation unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
