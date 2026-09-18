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
      name,
      legalName,
      shortName,
      institutionType,
      country,
      city,
      website,
      generalEmail,
      telephone,
      yearEstablished,
      taxId,
      stockExchange,
      ticker,
      businessModel,
      operatingModel,
      employeeCount,
      revenueRange
    } = body;

    const newInst = await prisma.institution.create({
      data: {
        name,
        legalName: legalName || name,
        shortName: shortName || name.slice(0, 4).toUpperCase(),
        institutionType: institutionType || 'Corporation',
        country: country || 'Indonesia',
        city: city || 'Jakarta',
        website,
        generalEmail,
        telephone,
        yearEstablished: yearEstablished ? parseInt(yearEstablished) : 2026,
        taxId,
        stockExchange,
        ticker,
        businessModel: businessModel || 'B2B',
        operatingModel: operatingModel || 'Centralized',
        employeeCount: employeeCount || '500 - 1,000 Employees',
        revenueRange: revenueRange || 'IDR 500 Billion - IDR 1 Trillion'
      }
    });

    // Create default HQ legal entity
    const legalEntity = await prisma.legalEntity.create({
      data: {
        institutionId: newInst.id,
        code: `ENT-${newInst.shortName}-HQ`,
        name: `${newInst.name} (Headquarters)`,
        country: newInst.country,
        taxId: newInst.taxId
      }
    });

    // Create default top-level organization unit
    await prisma.organizationUnit.create({
      data: {
        institutionId: newInst.id,
        legalEntityId: legalEntity.id,
        type: 'Directorate',
        code: 'DIR-OPS',
        name: 'Directorate of Operations & Risk',
        headName: 'Director of Risk'
      }
    });

    await prisma.auditLog.create({
      data: {
        institutionId: newInst.id,
        userName: 'System Onboarding',
        userRole: 'Admin',
        action: 'CREATE',
        entityType: 'Institution',
        recordId: newInst.id,
        reason: `Onboarded new institution: ${newInst.name}`
      }
    });

    return NextResponse.json({ success: true, institution: newInst });
  } catch (error) {
    console.error('Onboarding failed:', error);
    return NextResponse.json({ error: 'Failed to onboard institution' }, { status: 500 });
  }
}
