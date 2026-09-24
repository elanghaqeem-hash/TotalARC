import { cookies } from 'next/headers';
import { getAuthenticatedProfile, type AuthUserProfile } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import { listInstitutions, type InstitutionRecord } from '@/lib/d1';

export const ACTIVE_INSTITUTION_COOKIE_NAME = 'total_arc_active_institution';

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : '';
}

export async function getAuthenticatedRequestProfile(request: Request) {
  const token = cookieValue(request, AUTH_COOKIE_NAME);
  if (!token) return null;
  return getAuthenticatedProfile(token);
}

export type InstitutionAccessContext = {
  profile: AuthUserProfile;
  institution: InstitutionRecord | null;
  institutions: InstitutionRecord[];
  canSwitch: boolean;
};

export async function resolveInstitutionAccess(
  request: Request,
  suppliedProfile?: AuthUserProfile | null
): Promise<InstitutionAccessContext | null> {
  const profile = suppliedProfile ?? await getAuthenticatedRequestProfile(request);
  if (!profile) return null;

  const allInstitutions = await listInstitutions();
  const institutions =
    profile.role === 'Admin'
      ? allInstitutions
      : allInstitutions.filter(item => item.id === profile.institutionId);

  const requestedId = cookieValue(request, ACTIVE_INSTITUTION_COOKIE_NAME);
  const institution =
    institutions.find(item => item.id === requestedId) ||
    institutions.find(item => item.id === profile.institutionId) ||
    institutions[0] ||
    null;

  return {
    profile,
    institution,
    institutions,
    canSwitch: profile.role === 'Admin' && institutions.length > 1
  };
}


export async function resolveServerActiveInstitutionId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value || '';
    if (!token) return null;

    const profile = await getAuthenticatedProfile(token);
    if (!profile) return null;

    const allInstitutions = await listInstitutions();
    const institutions =
      profile.role === 'Admin'
        ? allInstitutions
        : allInstitutions.filter(item => item.id === profile.institutionId);

    const requestedId = cookieStore.get(ACTIVE_INSTITUTION_COOKIE_NAME)?.value || '';
    const active =
      institutions.find(item => item.id === requestedId) ||
      institutions.find(item => item.id === profile.institutionId) ||
      institutions[0] ||
      null;

    return active?.id || null;
  } catch {
    // Background jobs and build-time execution may not have a request cookie context.
    return null;
  }
}
