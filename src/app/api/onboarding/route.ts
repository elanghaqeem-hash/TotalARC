import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/auth';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    const [industries, frameworks, regulations] = await Promise.all([
      prisma.industryClassification.findMany({ orderBy: [{ industry: 'asc' }, { sector: 'asc' }, { subsector: 'asc' }] }),
      prisma.framework.findMany({ orderBy: { name: 'asc' } }),
      prisma.regulation.findMany({ orderBy: [{ regulator: 'asc' }, { code: 'asc' }] })
    ]);
    return NextResponse.json({ industries, frameworks, regulations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin']);
    if (!isPlatformAdmin(user)) throw new ApiError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator permission is required');

    const body = await readJson<Record<string, unknown>>(request);
    const name = requireString(body.name, 'name', 250);
    const legalName = optionalString(body.legalName, 250) || name;
    const shortName = requireString(body.shortName, 'shortName', 30).toUpperCase();

    const institution = await prisma.institution.create({
      data: {
        name,
        legalName,
        shortName,
        institutionType: requireString(body.institutionType || 'Corporation', 'institutionType', 100),
        country: requireString(body.country || 'Indonesia', 'country', 100),
        provinceState: optionalString(body.provinceState, 150),
        city: optionalString(body.city, 150),
        registeredAddress: optionalString(body.registeredAddress, 1000),
        operationalAddress: optionalString(body.operationalAddress, 1000),
        website: optionalString(body.website, 500),
        generalEmail: optionalString(body.generalEmail, 254),
        telephone: optionalString(body.telephone, 80),
        yearEstablished: body.yearEstablished ? Number(body.yearEstablished) : null,
        registrationNumber: optionalString(body.registrationNumber, 150),
        taxId: optionalString(body.taxId, 150),
        parentCompany: optionalString(body.parentCompany, 250),
        holdingCompany: optionalString(body.holdingCompany, 250),
        stockExchange: optionalString(body.stockExchange, 100),
        ticker: optionalString(body.ticker, 50),
        employeeCount: optionalString(body.employeeCount, 100),
        revenueRange: optionalString(body.revenueRange, 100),
        businessModel: optionalString(body.businessModel, 100),
        operatingModel: optionalString(body.operatingModel, 100)
      }
    });

    await prisma.legalEntity.create({
      data: {
        institutionId: institution.id,
        code: `ENT-${shortName}-HQ`,
        name: legalName,
        country: institution.country,
        taxId: institution.taxId
      }
    });

    await writeAudit(user, request, {
      action: 'CREATE',
      entityType: 'Institution',
      recordId: institution.id,
      institutionId: institution.id,
      reason: `Platform administrator onboarded ${institution.name}`,
      newValue: institution
    });

    return NextResponse.json({ success: true, institution }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
