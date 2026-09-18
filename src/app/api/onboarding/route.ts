import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPlatformAdmin } from '@/lib/auth';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { generateTemporaryPassword, hashPassword } from '@/lib/password';
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
    const actor = await requireApiUser(request, ['Admin']);
    if (!isPlatformAdmin(actor)) throw new ApiError(403, 'PLATFORM_ADMIN_REQUIRED', 'Platform administrator permission is required');

    const body = await readJson<Record<string, unknown>>(request, 64_000);
    const name = requireString(body.name, 'name', 250);
    const legalName = optionalString(body.legalName, 250) || name;
    const shortName = requireString(body.shortName, 'shortName', 30).toUpperCase();
    const adminName = requireString(body.adminName, 'adminName', 250);
    const adminEmail = requireString(body.adminEmail, 'adminEmail', 254).toLowerCase();
    const industryClassificationId = body.industryId ? requireString(body.industryId, 'industryId', 100) : null;

    if (industryClassificationId) {
      const industry = await prisma.industryClassification.findUnique({ where: { id: industryClassificationId } });
      if (!industry) throw new ApiError(404, 'INDUSTRY_NOT_FOUND', 'Industry classification not found');
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existingEmail) throw new ApiError(409, 'EMAIL_EXISTS', 'Initial administrator email is already registered');

    const year = body.yearEstablished === null || body.yearEstablished === undefined || body.yearEstablished === ''
      ? null
      : Number(body.yearEstablished);
    if (year !== null && (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear())) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'yearEstablished is invalid');
    }

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const result = await prisma.$transaction(async tx => {
      const institution = await tx.institution.create({
        data: {
          name,
          legalName,
          shortName,
          industryClassificationId,
          institutionType: requireString(body.institutionType || 'Corporation', 'institutionType', 100),
          country: requireString(body.country || 'Indonesia', 'country', 100),
          provinceState: optionalString(body.provinceState, 150),
          city: optionalString(body.city, 150),
          registeredAddress: optionalString(body.registeredAddress, 1000),
          operationalAddress: optionalString(body.operationalAddress, 1000),
          website: optionalString(body.website, 500),
          generalEmail: optionalString(body.generalEmail, 254),
          telephone: optionalString(body.telephone, 80),
          yearEstablished: year,
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

      const legalEntity = await tx.legalEntity.create({
        data: {
          institutionId: institution.id,
          code: `ENT-${shortName}-HQ`,
          name: legalName,
          country: institution.country,
          taxId: institution.taxId
        }
      });

      const admin = await tx.user.create({
        data: {
          institutionId: institution.id,
          name: adminName,
          email: adminEmail,
          role: 'Admin',
          department: optionalString(body.adminDepartment, 250) || 'Administration',
          active: true,
          passwordHash,
          mustChangePassword: true
        },
        select: { id: true, name: true, email: true, role: true }
      });

      return { institution, legalEntity, admin };
    });

    await writeAudit(actor, request, {
      action: 'CREATE',
      entityType: 'Institution',
      recordId: result.institution.id,
      institutionId: result.institution.id,
      reason: `Platform administrator onboarded ${result.institution.name} with an initial tenant administrator`,
      newValue: { institution: result.institution, admin: result.admin }
    });

    return NextResponse.json({
      success: true,
      institution: result.institution,
      admin: result.admin,
      temporaryPassword
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
