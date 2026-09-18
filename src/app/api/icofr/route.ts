import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const [accounts, ipe] = await Promise.all([
      prisma.financialAccount.findMany({ where: { institutionId: user.institutionId }, include: { assertions: true }, orderBy: { accountCode: 'asc' } }),
      prisma.iPERegister.findMany({ where: { institutionId: user.institutionId }, orderBy: { reportName: 'asc' } })
    ]);
    return NextResponse.json({ accounts, ipe });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','ProcessOwner','Reviewer']);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 40);

    if (action === 'CREATE_ACCOUNT') {
      const balanceAmount = Number(body.balanceAmount ?? 0);
      if (!Number.isFinite(balanceAmount)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'balanceAmount must be a finite number');
      }
      const account = await prisma.financialAccount.create({
        data: {
          institutionId: user.institutionId,
          accountCode: requireString(body.accountCode, 'accountCode', 80),
          accountName: requireString(body.accountName, 'accountName', 250),
          financialStatement: requireString(body.financialStatement, 'financialStatement', 100),
          balanceAmount,
          isSignificant: body.isSignificant === true,
          scopingRationale: optionalString(body.scopingRationale, 4000),
          fraudExposure: optionalString(body.fraudExposure, 30) || 'Low',
          complexity: optionalString(body.complexity, 30) || 'Medium',
          assertions: Array.isArray(body.assertions) ? {
            create: body.assertions.filter(x => typeof x === 'string').slice(0, 20).map(x => ({ assertion: String(x).slice(0, 100), isInScope: true }))
          } : undefined
        },
        include: { assertions: true }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'FinancialAccount', recordId: account.id, newValue: account });
      return NextResponse.json(account, { status: 201 });
    }

    if (action === 'CREATE_IPE') {
      const completenessTested = body.completenessTested === true;
      const accuracyTested = body.accuracyTested === true;
      const evidenceDoc = optionalString(body.evidenceDoc, 1000);
      if ((completenessTested || accuracyTested) && !evidenceDoc) {
        throw new ApiError(400, 'EVIDENCE_REQUIRED', 'Evidence reference is required when IPE completeness or accuracy is marked as tested');
      }
      const item = await prisma.iPERegister.create({
        data: {
          institutionId: user.institutionId,
          reportName: requireString(body.reportName, 'reportName', 250),
          systemSource: requireString(body.systemSource, 'systemSource', 250),
          reportOwner: requireString(body.reportOwner || user.name, 'reportOwner', 250),
          parameters: optionalString(body.parameters, 4000),
          logicSummary: optionalString(body.logicSummary, 4000),
          completenessTested,
          accuracyTested,
          evidenceDoc
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'IPERegister', recordId: item.id, newValue: item });
      return NextResponse.json(item, { status: 201 });
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported ICOFR action');
  } catch (error) { return apiError(error); }
}
