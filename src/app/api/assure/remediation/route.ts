import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const institutionId = user.institutionId;
    const [deficiencies, issues, maps, retests] = await Promise.all([
      prisma.controlDeficiency.findMany({ where: { issues: { some: { institutionId } } }, include: { exception: true, rootCause: true, issues: true } }),
      prisma.issue.findMany({ where: { institutionId }, include: { process: true, risk: true, control: true, deficiency: { include: { rootCause: true } }, actionPlans: { include: { milestones: true, retests: true } } } }),
      prisma.managementActionPlan.findMany({ where: { issue: { institutionId } }, include: { issue: { include: { process: true, control: true } }, milestones: true, retests: true } }),
      prisma.retestRecord.findMany({ where: { map: { issue: { institutionId } } }, include: { map: { include: { issue: true } } } })
    ]);
    return NextResponse.json({ deficiencies, issues, maps, retests });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','Reviewer','Executive']);
    const body = await readJson<Record<string, unknown>>(request);
    const actionType = requireString(body.actionType, 'actionType', 60);
    if (actionType !== 'REQUEST_EXTENSION') throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported remediation action');

    const mapId = requireString(body.mapId, 'mapId', 100);
    const existing = await prisma.managementActionPlan.findFirst({ where: { id: mapId, issue: { institutionId: user.institutionId } } });
    if (!existing) throw new ApiError(404, 'MAP_NOT_FOUND', 'Management action plan not found');

    const newDueDateRaw = requireString(body.newDueDate, 'newDueDate', 60);
    const newDueDate = new Date(newDueDateRaw);
    if (Number.isNaN(newDueDate.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', 'newDueDate is invalid');
    const extensionReason = requireString(body.extensionReason, 'extensionReason', 2000);

    const updated = await prisma.managementActionPlan.update({
      where: { id: existing.id },
      data: {
        revisedDueDate: newDueDate,
        extensionCount: existing.extensionCount + 1,
        extensionReason,
        approverName: user.name
      }
    });

    await writeAudit(user, request, { action: 'APPROVE_EXTENSION', entityType: 'ManagementActionPlan', recordId: existing.id, reason: extensionReason, oldValue: existing, newValue: updated });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error);
  }
}
