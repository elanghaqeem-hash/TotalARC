import { NextResponse } from 'next/server';
import { FRAMEWORK_REFERENCES, INDUSTRY_REFERENCES } from '@/lib/reference-data';
import { getPrimaryInstitution, upsertInstitution } from '@/lib/d1';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const institution = await getPrimaryInstitution();
    return NextResponse.json({
      institution,
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

    return NextResponse.json({ success: true, institution, storage: 'cloudflare-d1' }, { status: 200 });
  } catch (error) {
    console.error('Onboarding persistence failed:', error);
    return NextResponse.json(
      { error: 'Failed to save institution to persistent database.' },
      { status: 500 }
    );
  }
}
