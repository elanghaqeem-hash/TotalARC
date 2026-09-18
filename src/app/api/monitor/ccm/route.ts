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
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ rules });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','Reviewer','Tester','ControlOwner']);
    const body = await readJson<Record<string, unknown>>(request, 128_000);
    const action = typeof body.action === 'string' ? body.action : 'RECORD_RUN';

    if (action === 'CREATE_RULE') {
      if (!['Admin','Reviewer','ControlOwner'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Monitoring rule creation permission required');
      const controlId = requireString(body.controlId, 'controlId', 100);
      const control = await prisma.controlMaster.findFirst({ where: { id: controlId, institutionId: user.institutionId } });
      if (!control) throw new ApiError(404, 'CONTROL_NOT_FOUND', 'Control not found');

      const rule = await prisma.monitoringRule.create({
        data: {
          ruleId: optionalString(body.ruleId, 80) || `CCM-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
          controlId: control.id,
          name: requireString(body.name, 'name', 300),
          description: requireString(body.description, 'description', 5000),
          dataSource: requireString(body.dataSource, 'dataSource', 500),
          queryLogic: requireString(body.queryLogic, 'queryLogic', 5000),
          frequency: requireString(body.frequency, 'frequency', 100),
          threshold: requireString(body.threshold, 'threshold', 500),
          status: 'Active',
          lastStatus: 'Not Run'
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'MonitoringRule', recordId: rule.id, newValue: rule });
      return NextResponse.json(rule, { status: 201 });
    }

    if (action !== 'RECORD_RUN') throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported CCM action');

    const ruleId = requireString(body.ruleId, 'ruleId', 100);
    const populationChecked = Number(body.populationChecked);
    if (!Number.isInteger(populationChecked) || populationChecked < 0 || populationChecked > 100_000_000) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'populationChecked must be a non-negative integer');
    }
    if (body.exceptions && !Array.isArray(body.exceptions)) throw new ApiError(400, 'VALIDATION_ERROR', 'exceptions must be an array');

    const rawExceptions = (body.exceptions as ExceptionInput[] | undefined) || [];
    if (rawExceptions.length > 10_000) throw new ApiError(413, 'TOO_MANY_EXCEPTIONS', 'Too many exceptions in one monitoring run');
    const exceptions = rawExceptions.map(item => ({
      transactionRef: requireString(item.transactionRef, 'transactionRef', 250),
      details: requireString(item.details, 'exception details', 4000)
    }));

    const rule = await prisma.monitoringRule.findFirst({ where: { id: ruleId, control: { institutionId: user.institutionId }, status: 'Active' } });
    if (!rule) throw new ApiError(404, 'RULE_NOT_FOUND', 'Active monitoring rule not found');

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
