import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

const TOD_CONCLUSIONS = ['Effective Design','Partially Effective Design','Ineffective Design'];

function parsedDate(value: unknown, field: string) {
  const date = value ? new Date(requireString(value, field, 40)) : new Date();
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', `${field} is invalid`);
  return date;
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const controls = await prisma.controlMaster.findMany({
      where: { institutionId: user.institutionId },
      select: { id: true }
    });
    const controlIds = controls.map(c => c.id);

    const [tests, walkthroughs] = await Promise.all([
      prisma.toDTest.findMany({
        where: { process: { institutionId: user.institutionId } },
        include: { control: true, process: true, risk: true },
        orderBy: { testedAt: 'desc' }
      }),
      prisma.walkthrough.findMany({
        where: { controlId: { in: controlIds } },
        orderBy: { date: 'desc' }
      })
    ]);

    return NextResponse.json({ tests, walkthroughs });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 40);

    if (action === 'CREATE_WALKTHROUGH') {
      if (!['Admin','Tester','Reviewer','ProcessOwner','ControlOwner'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'Walkthrough permission required');
      }
      const controlId = requireString(body.controlId, 'controlId', 100);
      const control = await prisma.controlMaster.findFirst({
        where: { id: controlId, institutionId: user.institutionId }
      });
      if (!control) throw new ApiError(404, 'CONTROL_NOT_FOUND', 'Control not found');

      const walkthrough = await prisma.walkthrough.create({
        data: {
          controlId,
          date: parsedDate(body.date, 'date'),
          participants: optionalString(body.participants, 2000),
          transactionRef: optionalString(body.transactionRef, 250),
          systemsInspected: optionalString(body.systemsInspected, 2000),
          observations: requireString(body.observations, 'observations', 4000),
          processChanged: body.processChanged === true,
          conclusion: optionalString(body.conclusion, 250) || 'Pending Review'
        }
      });

      await writeAudit(user, request, {
        action: 'CREATE',
        entityType: 'Walkthrough',
        recordId: walkthrough.id,
        newValue: walkthrough
      });
      return NextResponse.json(walkthrough, { status: 201 });
    }

    if (action === 'CREATE_TOD') {
      if (!['Admin','Tester'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'ToD testing requires Tester permission');
      }

      const controlId = requireString(body.controlId, 'controlId', 100);
      const control = await prisma.controlMaster.findFirst({
        where: { id: controlId, institutionId: user.institutionId }
      });
      if (!control) throw new ApiError(404, 'CONTROL_NOT_FOUND', 'Control not found');

      let riskId: string | null = null;
      if (body.riskId) {
        riskId = requireString(body.riskId, 'riskId', 100);
        const risk = await prisma.riskMaster.findFirst({
          where: { id: riskId, institutionId: user.institutionId, processId: control.processId }
        });
        if (!risk) throw new ApiError(404, 'RISK_NOT_FOUND', 'Risk not found for this control process');
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
          conclusion: 'Not Assessed',
          status: 'Draft'
        }
      });

      await writeAudit(user, request, {
        action: 'CREATE',
        entityType: 'ToDTest',
        recordId: test.id,
        reason: 'Created ToD draft without final conclusion',
        newValue: test
      });
      return NextResponse.json(test, { status: 201 });
    }

    if (action === 'UPDATE_TOD_DRAFT') {
      if (!['Admin','Tester'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'ToD testing requires Tester permission');
      }
      const testId = requireString(body.testId, 'testId', 100);
      const test = await prisma.toDTest.findFirst({
        where: { id: testId, process: { institutionId: user.institutionId } }
      });
      if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'ToD test not found');
      if (test.status !== 'Draft') throw new ApiError(400, 'TEST_LOCKED', 'Only Draft ToD tests can be edited');

      const updated = await prisma.toDTest.update({
        where: { id: test.id },
        data: {
          testObjective: body.testObjective ? requireString(body.testObjective, 'testObjective', 3000) : test.testObjective,
          objectiveAlignment: body.objectiveAlignment === undefined ? test.objectiveAlignment : body.objectiveAlignment === true,
          riskCoverage: body.riskCoverage === undefined ? test.riskCoverage : body.riskCoverage === true,
          precisionAdequate: body.precisionAdequate === undefined ? test.precisionAdequate : body.precisionAdequate === true,
          segregationDuties: body.segregationDuties === undefined ? test.segregationDuties : body.segregationDuties === true,
          evidenceSufficiency: body.evidenceSufficiency === undefined ? test.evidenceSufficiency : body.evidenceSufficiency === true,
          observations: body.observations === undefined ? test.observations : optionalString(body.observations, 4000)
        }
      });

      await writeAudit(user, request, {
        action: 'UPDATE',
        entityType: 'ToDTest',
        recordId: test.id,
        oldValue: test,
        newValue: updated
      });
      return NextResponse.json(updated);
    }

    if (action === 'SUBMIT_TOD') {
      if (!['Admin','Tester'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'ToD submission requires Tester permission');
      }
      const testId = requireString(body.testId, 'testId', 100);
      const conclusion = requireString(body.conclusion, 'conclusion', 100);
      if (!TOD_CONCLUSIONS.includes(conclusion)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ToD conclusion');
      }

      const test = await prisma.toDTest.findFirst({
        where: { id: testId, process: { institutionId: user.institutionId } }
      });
      if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'ToD test not found');
      if (test.status !== 'Draft') throw new ApiError(400, 'INVALID_STATUS', 'Only Draft ToD tests can be submitted');
      if (!test.observations?.trim()) throw new ApiError(400, 'MISSING_EVIDENCE', 'Testing observations are required before submission');

      const updated = await prisma.toDTest.update({
        where: { id: test.id },
        data: { conclusion, status: 'Submitted' }
      });

      await writeAudit(user, request, {
        action: 'SUBMIT',
        entityType: 'ToDTest',
        recordId: test.id,
        oldValue: test,
        newValue: updated
      });
      return NextResponse.json(updated);
    }

    if (action === 'REVIEW_TOD') {
      if (!['Admin','Reviewer'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'ToD review requires Reviewer permission');
      }
      const testId = requireString(body.testId, 'testId', 100);
      const conclusion = requireString(body.conclusion, 'conclusion', 100);
      if (!TOD_CONCLUSIONS.includes(conclusion)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid ToD conclusion');
      }

      const test = await prisma.toDTest.findFirst({
        where: { id: testId, process: { institutionId: user.institutionId } }
      });
      if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'ToD test not found');
      if (test.status !== 'Submitted') throw new ApiError(400, 'INVALID_STATUS', 'Only Submitted ToD tests can be reviewed');

      const updated = await prisma.toDTest.update({
        where: { id: test.id },
        data: {
          conclusion,
          reviewerName: user.name,
          status: 'Approved'
        }
      });

      await writeAudit(user, request, {
        action: 'APPROVE',
        entityType: 'ToDTest',
        recordId: test.id,
        oldValue: test,
        newValue: updated
      });
      return NextResponse.json(updated);
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported ToD action');
  } catch (error) {
    return apiError(error);
  }
}
