import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [industries, frameworks, regulations] = await Promise.all([
      prisma.industryClassification.findMany({ orderBy: { industry: 'asc' } }),
      prisma.framework.findMany({ orderBy: { name: 'asc' } }),
      prisma.regulation.findMany({ orderBy: { regulator: 'asc' } })
    ]);
    return NextResponse.json({ industries, frameworks, regulations });
  } catch (error) {
    console.error('Failed to load onboarding references:', error);
    return NextResponse.json({ error: 'Failed to load onboarding references' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name, legalName, shortName, institutionType, country, provinceState, city,
      registeredAddress, operationalAddress, website, generalEmail, telephone,
      yearEstablished, registrationNumber, taxId, parentCompany, holdingCompany,
      stockExchange, ticker, logo, employeeCount, revenueRange, businessModel, operatingModel
    } = body;

    if (!name || !institutionType || !country) {
      return NextResponse.json({ error: 'name, institutionType, and country are required.' }, { status: 400 });
    }

    const normalizedShortName = (shortName || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'ORG').toUpperCase();
    const institution = await prisma.institution.create({
      data: {
        name,
        legalName: legalName || name,
        shortName: normalizedShortName,
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
        taxId: taxId || null,
        parentCompany: parentCompany || null,
        holdingCompany: holdingCompany || null,
        stockExchange: stockExchange || null,
        ticker: ticker || null,
        logo: logo || null,
        employeeCount: employeeCount || null,
        revenueRange: revenueRange || null,
        businessModel: businessModel || null,
        operatingModel: operatingModel || null
      }
    });

    await prisma.auditLog.create({
      data: {
        institutionId: institution.id,
        userName: 'System',
        userRole: 'System',
        action: 'CREATE',
        entityType: 'Institution',
        recordId: institution.id,
        reason: 'Institution registered through onboarding.'
      }
    });

    return NextResponse.json({ success: true, institution }, { status: 201 });
  } catch (error) {
    console.error('Onboarding failed:', error);
    return NextResponse.json({ error: 'Failed to onboard institution' }, { status: 500 });
  }
}
