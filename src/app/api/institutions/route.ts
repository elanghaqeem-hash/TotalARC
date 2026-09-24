import { NextResponse } from 'next/server';
import {
  ACTIVE_INSTITUTION_COOKIE_NAME,
  resolveInstitutionAccess
} from '@/lib/institution-context';

export const dynamic = 'force-dynamic';

function setActiveInstitutionCookie(response: NextResponse, institutionId: string) {
  response.cookies.set({
    name: ACTIVE_INSTITUTION_COOKIE_NAME,
    value: institutionId,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}

export async function GET(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      {
        activeInstitution: context.institution,
        activeInstitutionId: context.institution?.id || null,
        institutions: context.institutions.map(item => ({
          id: item.id,
          name: item.name,
          legalName: item.legalName,
          shortName: item.shortName,
          institutionType: item.institutionType,
          country: item.country
        })),
        canSwitch: context.canSwitch
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Institution selector read failed:', error);
    return NextResponse.json(
      { error: 'Institution selector is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const institutionId = typeof body?.institutionId === 'string' ? body.institutionId.trim() : '';
    if (!institutionId) {
      return NextResponse.json({ error: 'Institution id is required.' }, { status: 400 });
    }

    const institution = context.institutions.find(item => item.id === institutionId);
    if (!institution) {
      return NextResponse.json(
        { error: 'You do not have access to the selected institution.' },
        { status: 403 }
      );
    }

    if (context.profile.role !== 'Admin' && institutionId !== context.profile.institutionId) {
      return NextResponse.json(
        { error: 'Only administrators can switch institution context.' },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      success: true,
      activeInstitution: institution
    });
    return setActiveInstitutionCookie(response, institution.id);
  } catch (error) {
    console.error('Institution switch failed:', error);
    return NextResponse.json(
      { error: 'Institution context could not be changed.' },
      { status: 503 }
    );
  }
}
