import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

type ExceptionInput = { transactionRef?: unknown; details?: unknown };

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const rules = await prisma.monitoringRule.findMany({
      where: { control: { institutionId: user.institutionId } },
      include: {
        control: { include: { process: true } },
        runs: { orderBy: { runTimestamp: 'desc' }, take: 10, include: { exceptions: true } }
      }
    });
    return NextResponse.json({ rules });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','Reviewer','Tester']);
    const body = await readJson<{ ruleId?: unknown; populationChecked?: unknown; details?: unknown; exceptions?: ExceptionInput[] }>(request);
    const ruleId = requireString(body.ruleId, 'ruleId', 100);
    const populationChecked = Number(body.populationChecked);
    if (!Number.isInteger(populationChecked) || populationChecked < 0 || populationChecked > 100_000_000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'populationChecked must be a non-negative integer');
    }
    if (body.exceptions && !Array.isArray(body.exceptions)) throw new ApiError(400, 'VALIDATION_ERROR', 'exceptions must be an array');
    const exceptions = (body.exceptions || []).slice(0, 10_000).map(item => ({
      transactionRef: requireString(item.transactionRef, 'transactionRef', 250),
      details: requireString(item.details, 'exception details', 4000)
    }));

    const rule = await prisma.monitoringRule.findFirst({ where: { id: ruleId, control: { institutionId: user.institutionId } } });
    if (!rule) throw new ApiError(404, 'RULE_NOT_FOUND', 'Monitoring rule not found');

    const status = exceptions.length > 0 ? 'Exception Detected' : 'Healthy';
    const run = await prisma.$transaction(async tx => {
      const created = await tx.monitoringRun.create({
        data: {
          ruleId: rule.id,
          runTimestamp: new Date(),
          populationChecked,
          exceptionsFound: exceptions.length,
          status,
          details: optionalString(body.details, 4000)
        }
      });
      if (exceptions.length) {
        await tx.cCMException.createMany({ data: exceptions.map(e => ({ runId: created.id, ...e })) });
      }
      await tx.monitoringRule.update({ where: { id: rule.id }, data: { lastRunDate: new Date(), lastStatus: status } });
      return created;
    });

    await writeAudit(user, request, {
      action: 'CCM_RUN',
      entityType: 'MonitoringRule',
      recordId: rule.id,
      reason: 'Recorded verified monitoring execution',
      newValue: { populationChecked, exceptionsFound: exceptions.length, status }
    });

    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
