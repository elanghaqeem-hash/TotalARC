import { NextResponse } from 'next/server';
import { FRAMEWORK_REFERENCES, INDUSTRY_REFERENCES } from '@/lib/reference-data';
import { upsertInstitution } from '@/lib/d1';
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

    return NextResponse.json({
      institution: context.institution,
      institutions: context.institutions,
      canSwitchInstitution: context.canSwitch,
      industries: INDUSTRY_REFERENCES,
      frameworks: FRAMEWORK_REFERENCES,
      regulations: [],
      storage: 'cloudflare-d1'
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Institution master read failed:', error);
    return NextResponse.json(
      { error: 'Institution master could not be read from the production database.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function POST(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (!['SystemAdmin', 'Admin'].includes(context.profile.role)) {
      return NextResponse.json(
        { error: 'Administrator access is required to configure an institution.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name, legalName, shortName, institutionType, country, provinceState, city,
      registeredAddress, operationalAddress, website, generalEmail, telephone,
      yearEstablished, registrationNumber, parentCompany, holdingCompany,
      stockExchange, ticker, logo, employeeCount, revenueRange, businessModel, operatingModel
    } = body;

    if (!name || !legalName || !institutionType || !country) {
      return NextResponse.json(
        { error: 'name, legalName, institutionType, and country are required.' },
        { status: 400 }
      );
    }

    if (context.profile.role === 'Admin') {
      if (!context.institution) {
        return NextResponse.json(
          { error: 'Admin must be assigned to an institution before changing institution configuration.' },
          { status: 409 }
        );
      }
      if (String(legalName).trim() !== String(context.institution.legalName).trim()) {
        return NextResponse.json(
          { error: 'Admin cannot create another institution or change the legal identity of the assigned institution.' },
          { status: 403 }
        );
      }
    }

    const institution = await upsertInstitution({
      name,
      legalName,
      shortName: shortName || name,
      institutionType,
      country,
      provinceState: provinceState || null,
      city: city || null,
      registeredAddress: registeredAddress || null,
      operationalAddress: operationalAddress || null,
      website: website || null,
      generalEmail: generalEmail || null,
      telephone: telephone || null,
      yearEstablished: yearEstablished ? Number(yearEstablished) : null,
      registrationNumber: registrationNumber || null,
      parentCompany: parentCompany || null,
      holdingCompany: holdingCompany || null,
      stockExchange: stockExchange || null,
      ticker: ticker || null,
      logo: logo || null,
      employeeCount: employeeCount || null,
      revenueRange: revenueRange || null,
      businessModel: businessModel || null,
      operatingModel: operatingModel || null
    }, 'Institution saved through onboarding to persistent Cloudflare D1.');

    const response = NextResponse.json(
      { success: true, institution, storage: 'cloudflare-d1' },
      { status: 200 }
    );
    return setActiveInstitutionCookie(response, institution.id);
  } catch (error) {
    console.error('Onboarding persistence failed:', error);
    return NextResponse.json(
      { error: 'Failed to save institution to persistent database.' },
      { status: 500 }
    );
  }
}
