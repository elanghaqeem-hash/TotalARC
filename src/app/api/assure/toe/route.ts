import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

function nonNegativeInteger(value: unknown, field: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a non-negative integer`);
  return number;
}

function optionalNumber(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a valid number`);
  return number;
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const tests = await prisma.toETest.findMany({
      where: { process: { institutionId: user.institutionId } },
      include: {
        control: true,
        process: true,
        risk: true,
        samples: { orderBy: { sampleNumber: 'asc' } },
        exceptions: {
          include: {
            deficiencies: {
              include: {
                rootCause: true,
                issues: { include: { actionPlans: { include: { retests: true } } } }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { testedAt: 'desc' }
    });
    return NextResponse.json({ tests });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','Tester','Reviewer']);
    const body = await readJson<Record<string, unknown>>(request, 64_000);
    const action = typeof body.action === 'string' ? body.action : 'UPDATE_SAMPLE';

    if (action === 'CREATE_TEST') {
      const controlId = requireString(body.controlId, 'controlId', 100);
      const control = await prisma.controlMaster.findFirst({
        where: { id: controlId, institutionId: user.institutionId },
        include: { process: true }
      });
      if (!control) throw new ApiError(404, 'CONTROL_NOT_FOUND', 'Control not found in your institution');

      let riskId: string | null = null;
      if (body.riskId) {
        riskId = requireString(body.riskId, 'riskId', 100);
        const risk = await prisma.riskMaster.findFirst({ where: { id: riskId, institutionId: user.institutionId } });
        if (!risk) throw new ApiError(404, 'RISK_NOT_FOUND', 'Risk not found in your institution');
      }

      const populationSize = nonNegativeInteger(body.populationSize, 'populationSize');
      const test = await prisma.toETest.create({
        data: {
          testId: optionalString(body.testId, 80) || `TOE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          controlId: control.id,
          processId: control.processId,
          riskId,
          testerName: user.name,
          reviewerName: optionalString(body.reviewerName, 250),
          period: requireString(body.period, 'period', 80),
          populationSize,
          populationSource: requireString(body.populationSource, 'populationSource', 1000),
          samplingMethod: requireString(body.samplingMethod, 'samplingMethod', 100),
          sampleSize: 0,
          passCount: 0,
          failCount: 0,
          testerConclusion: 'Not Assessed',
          finalConclusion: 'Not Assessed',
          status: 'Planned',
          notes: optionalString(body.notes, 4000)
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'ToETest', recordId: test.id, newValue: test });
      return NextResponse.json(test, { status: 201 });
    }

    if (action === 'ADD_SAMPLE') {
      const testId = requireString(body.testId, 'testId', 100);
      const test = await prisma.toETest.findFirst({ where: { id: testId, process: { institutionId: user.institutionId } } });
      if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'ToE test not found');

      const transactionDate = new Date(requireString(body.transactionDate, 'transactionDate', 60));
      if (Number.isNaN(transactionDate.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'transactionDate is invalid');
      const last = await prisma.testSample.aggregate({ where: { toeTestId: test.id }, _max: { sampleNumber: true } });

      const sample = await prisma.testSample.create({
        data: {
          toeTestId: test.id,
          sampleNumber: (last._max.sampleNumber || 0) + 1,
          transactionRef: requireString(body.transactionRef, 'transactionRef', 250),
          transactionDate,
          amount: optionalNumber(body.amount, 'amount'),
          attributesTested: optionalString(body.attributesTested, 4000),
          result: 'Not Tested',
          evidenceRef: optionalString(body.evidenceRef, 1000)
        }
      });
      const sampleSize = await prisma.testSample.count({ where: { toeTestId: test.id } });
      await prisma.toETest.update({ where: { id: test.id }, data: { sampleSize, status: 'In Progress' } });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'ToESample', recordId: sample.id, newValue: sample });
      return NextResponse.json(sample, { status: 201 });
    }

    if (action === 'UPDATE_SAMPLE') {
      const sampleId = requireString(body.sampleId, 'sampleId', 100);
      const result = requireString(body.result, 'result', 20);
      if (!['Pass','Fail','N/A'].includes(result)) throw new ApiError(400, 'VALIDATION_ERROR', 'result must be Pass, Fail, or N/A');
      const failureReason = result === 'Fail' ? requireString(body.failureReason, 'failureReason', 2000) : null;

      const sample = await prisma.testSample.findFirst({
        where: { id: sampleId, toeTest: { process: { institutionId: user.institutionId } } },
        include: { toeTest: true }
      });
      if (!sample) throw new ApiError(404, 'SAMPLE_NOT_FOUND', 'Test sample not found');

      const updatedSample = await prisma.testSample.update({
        where: { id: sampleId },
        data: { result, failureReason }
      });
      const all = await prisma.testSample.findMany({ where: { toeTestId: sample.toeTestId }, select: { result: true } });
      const passCount = all.filter(s => s.result === 'Pass').length;
      const failCount = all.filter(s => s.result === 'Fail').length;
      await prisma.toETest.update({
        where: { id: sample.toeTestId },
        data: { passCount, failCount, sampleSize: all.length, status: 'In Progress' }
      });

      await writeAudit(user, request, {
        action: 'UPDATE',
        entityType: 'ToESample',
        recordId: sampleId,
        reason: 'Updated sample test result',
        oldValue: { result: sample.result, failureReason: sample.failureReason },
        newValue: updatedSample
      });
      return NextResponse.json(updatedSample);
    }

    if (action === 'REGISTER_EXCEPTION') {
      const sampleId = requireString(body.sampleId, 'sampleId', 100);
      const sample = await prisma.testSample.findFirst({
        where: { id: sampleId, result: 'Fail', toeTest: { process: { institutionId: user.institutionId } } },
        include: { toeTest: true }
      });
      if (!sample) throw new ApiError(404, 'FAILED_SAMPLE_NOT_FOUND', 'A failed sample is required to register an exception');

      const existing = await prisma.testingException.findFirst({
        where: { toeTestId: sample.toeTestId, sampleRef: sample.transactionRef, status: { not: 'False Positive' } }
      });
      if (existing) throw new ApiError(409, 'EXCEPTION_EXISTS', 'An exception is already registered for this sample');

      const count = await prisma.testingException.count({ where: { toeTestId: sample.toeTestId } });
      const exception = await prisma.testingException.create({
        data: {
          toeTestId: sample.toeTestId,
          exceptionNumber: optionalString(body.exceptionNumber, 80) || `EXP-${String(count + 1).padStart(3, '0')}`,
          sampleRef: sample.transactionRef,
          description: requireString(body.description || sample.failureReason, 'description', 4000),
          severity: optionalString(body.severity, 30) || 'Medium',
          status: 'Open'
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'TestingException', recordId: exception.id, newValue: exception });
      return NextResponse.json(exception, { status: 201 });
    }

    if (action === 'FINALIZE_TEST') {
      if (!['Admin','Tester'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Tester permission required');
      const testId = requireString(body.testId, 'testId', 100);
      const test = await prisma.toETest.findFirst({
        where: { id: testId, process: { institutionId: user.institutionId } },
        include: { samples: true }
      });
      if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'ToE test not found');
      if (!test.samples.length) throw new ApiError(400, 'NO_SAMPLES', 'At least one sample must be recorded before finalizing');
      if (test.samples.some(sample => sample.result === 'Not Tested')) throw new ApiError(400, 'INCOMPLETE_TESTING', 'All samples must be tested before finalizing');

      const testerConclusion = requireString(body.testerConclusion, 'testerConclusion', 100);
      const updated = await prisma.toETest.update({
        where: { id: test.id },
        data: {
          testerConclusion,
          finalConclusion: testerConclusion,
          status: 'Completed',
          notes: optionalString(body.notes, 4000) ?? test.notes
        }
      });
      await writeAudit(user, request, { action: 'FINALIZE', entityType: 'ToETest', recordId: test.id, oldValue: test, newValue: updated });
      return NextResponse.json(updated);
    }

    if (action === 'REVIEW_TEST') {
      if (!['Admin','Reviewer'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Reviewer permission required');
      const testId = requireString(body.testId, 'testId', 100);
      const test = await prisma.toETest.findFirst({ where: { id: testId, process: { institutionId: user.institutionId } } });
      if (!test) throw new ApiError(404, 'TEST_NOT_FOUND', 'ToE test not found');
      if (test.status !== 'Completed' && test.status !== 'Reviewed') throw new ApiError(400, 'TEST_NOT_FINALIZED', 'Tester must finalize the test before review');

      const finalConclusion = requireString(body.finalConclusion, 'finalConclusion', 100);
      const updated = await prisma.toETest.update({
        where: { id: test.id },
        data: {
          reviewerName: user.name,
          finalConclusion,
          status: 'Reviewed',
          notes: optionalString(body.notes, 4000) ?? test.notes
        }
      });
      await writeAudit(user, request, { action: 'REVIEW', entityType: 'ToETest', recordId: test.id, oldValue: test, newValue: updated });
      return NextResponse.json(updated);
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported ToE action');
  } catch (error) {
    return apiError(error);
  }
}
