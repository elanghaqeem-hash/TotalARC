import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const controls = await prisma.controlMaster.findMany({ where: { institutionId: user.institutionId }, select: { id: true } });
    const controlIds = controls.map(c => c.id);
    const [tests, walkthroughs] = await Promise.all([
      prisma.toDTest.findMany({
        where: { process: { institutionId: user.institutionId } },
        include: { control: true, process: true, risk: true },
        orderBy: { testedAt: 'desc' }
      }),
      prisma.walkthrough.findMany({ where: { controlId: { in: controlIds } }, orderBy: { date: 'desc' } })
    ]);
    return NextResponse.json({ tests, walkthroughs });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','Tester','Reviewer']);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 40);
    const controlId = requireString(body.controlId, 'controlId', 100);
    const control = await prisma.controlMaster.findFirst({ where: { id: controlId, institutionId: user.institutionId }, include: { process: true } });
    if (!control) throw new ApiError(404, 'CONTROL_NOT_FOUND', 'Control not found');

    if (action === 'CREATE_WALKTHROUGH') {
      const walkthrough = await prisma.walkthrough.create({
        data: {
          controlId,
          date: body.date ? new Date(requireString(body.date, 'date', 40)) : new Date(),
          participants: optionalString(body.participants, 2000),
          transactionRef: optionalString(body.transactionRef, 250),
          systemsInspected: optionalString(body.systemsInspected, 2000),
          observations: optionalString(body.observations, 4000),
          processChanged: body.processChanged === true,
          conclusion: optionalString(body.conclusion, 250) || 'Pending Reviewer Conclusion'
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'Walkthrough', recordId: walkthrough.id, newValue: walkthrough });
      return NextResponse.json(walkthrough, { status: 201 });
    }

    if (action === 'CREATE_TOD') {
      let riskId: string | null = null;
      if (body.riskId) {
        riskId = requireString(body.riskId, 'riskId', 100);
        const risk = await prisma.riskMaster.findFirst({ where: { id: riskId, institutionId: user.institutionId } });
        if (!risk) throw new ApiError(404, 'RISK_NOT_FOUND', 'Risk not found');
      }
      const test = await prisma.toDTest.create({
        data: {
          testId: optionalString(body.testId, 80) || `TOD-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
          controlId,
          processId: control.processId,
          riskId,
          testerName: user.name,
          reviewerName: optionalString(body.reviewerName, 250),
          period: requireString(body.period, 'period', 80),
          testObjective: requireString(body.testObjective, 'testObjective', 3000),
          objectiveAlignment: body.objectiveAlignment === true,
          riskCoverage: body.riskCoverage === true,
          precisionAdequate: body.precisionAdequate === true,
          segregationDuties: body.segregationDuties === true,
          evidenceSufficiency: body.evidenceSufficiency === true,
          observations: optionalString(body.observations, 4000),
          conclusion: optionalString(body.conclusion, 100) || 'Not Assessed',
          status: 'Draft'
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'ToDTest', recordId: test.id, newValue: test });
      return NextResponse.json(test, { status: 201 });
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported ToD action');
  } catch (error) { return apiError(error); }
}
