import { NextResponse } from 'next/server';
import { FRAMEWORK_REFERENCES, INDUSTRY_REFERENCES } from '@/lib/reference-data';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    industries: INDUSTRY_REFERENCES,
    frameworks: FRAMEWORK_REFERENCES,
    regulations: []
  });
}

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const body = await request.json();
    const {
      name, legalName, shortName, institutionType, country, provinceState, city,
      registeredAddress, operationalAddress, website, generalEmail, telephone,
      yearEstablished, registrationNumber, taxId, parentCompany, holdingCompany,
      stockExchange, ticker, logo, employeeCount, revenueRange, businessModel, operatingModel
    } = body;

    if (!name || !legalName || !institutionType || !country) {
      return NextResponse.json(
        { error: 'name, legalName, institutionType, and country are required.' },
        { status: 400 }
      );
    }

    const normalizedYear =
      yearEstablished === null || yearEstablished === undefined || yearEstablished === ''
        ? null
        : Number(yearEstablished);

    if (normalizedYear !== null && (!Number.isInteger(normalizedYear) || normalizedYear < 1000 || normalizedYear > 9999)) {
      return NextResponse.json({ error: 'yearEstablished must be a valid four-digit year.' }, { status: 400 });
    }

    const data = {
      name: String(name).trim(),
      legalName: String(legalName).trim(),
      shortName: String(shortName || name).trim(),
      institutionType: String(institutionType).trim(),
      country: String(country).trim(),
      provinceState: provinceState ? String(provinceState).trim() : null,
      city: city ? String(city).trim() : null,
      registeredAddress: registeredAddress ? String(registeredAddress).trim() : null,
      operationalAddress: operationalAddress ? String(operationalAddress).trim() : null,
      website: website ? String(website).trim() : null,
      generalEmail: generalEmail ? String(generalEmail).trim() : null,
      telephone: telephone ? String(telephone).trim() : null,
      yearEstablished: normalizedYear,
      registrationNumber: registrationNumber ? String(registrationNumber).trim() : null,
      taxId: taxId ? String(taxId).trim() : null,
      parentCompany: parentCompany ? String(parentCompany).trim() : null,
      holdingCompany: holdingCompany ? String(holdingCompany).trim() : null,
      stockExchange: stockExchange ? String(stockExchange).trim() : null,
      ticker: ticker ? String(ticker).trim() : null,
      logo: logo ? String(logo).trim() : null,
      employeeCount: employeeCount ? String(employeeCount).trim() : null,
      revenueRange: revenueRange ? String(revenueRange).trim() : null,
      businessModel: businessModel ? String(businessModel).trim() : null,
      operatingModel: operatingModel ? String(operatingModel).trim() : null
    };

    const existing = await prisma.institution.findFirst({
      where: { legalName: data.legalName },
      orderBy: { createdAt: 'asc' }
    });

    const institution = existing
      ? await prisma.institution.update({ where: { id: existing.id }, data })
      : await prisma.institution.create({ data });

    await prisma.auditLog.create({
      data: {
        institutionId: institution.id,
        userName: 'System',
        userRole: 'System',
        action: existing ? 'UPDATE' : 'CREATE',
        entityType: 'Institution',
        recordId: institution.id,
        oldValue: existing ? JSON.stringify(existing) : null,
        newValue: JSON.stringify(institution),
        reason: existing ? 'Institution updated through onboarding.' : 'Institution registered through onboarding.'
      }
    });

    return NextResponse.json(
      { success: true, institution, storage: 'cloudflare-d1' },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error('Onboarding persistence failed:', error);
    return NextResponse.json(
      { error: 'Failed to save institution to persistent database.' },
      { status: 500 }
    );
  }
}
