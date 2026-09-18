import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

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
        exceptions: { include: { deficiencies: { include: { rootCause: true, issues: { include: { actionPlans: { include: { retests: true } } } } } } } }
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
    const body = await readJson<Record<string, unknown>>(request);
    const sampleId = requireString(body.sampleId, 'sampleId', 100);
    const result = requireString(body.result, 'result', 20);
    if (!['Pass','Fail','N/A'].includes(result)) throw new ApiError(400, 'VALIDATION_ERROR', 'result must be Pass, Fail, or N/A');

    const sample = await prisma.testSample.findFirst({
      where: { id: sampleId, toeTest: { process: { institutionId: user.institutionId } } },
      include: { toeTest: true }
    });
    if (!sample) throw new ApiError(404, 'SAMPLE_NOT_FOUND', 'Test sample not found');

    const updatedSample = await prisma.testSample.update({
      where: { id: sampleId },
      data: { result, failureReason: result === 'Fail' ? optionalString(body.failureReason, 2000) : null }
    });

    const all = await prisma.testSample.findMany({ where: { toeTestId: sample.toeTestId }, select: { result: true } });
    const passCount = all.filter(s => s.result === 'Pass').length;
    const failCount = all.filter(s => s.result === 'Fail').length;
    await prisma.toETest.update({ where: { id: sample.toeTestId }, data: { passCount, failCount, sampleSize: all.length } });

    await writeAudit(user, request, { action: 'UPDATE', entityType: 'ToESample', recordId: sampleId, reason: 'Updated sample result', oldValue: { result: sample.result }, newValue: updatedSample });
    return NextResponse.json(updatedSample);
  } catch (error) {
    return apiError(error);
  }
}
