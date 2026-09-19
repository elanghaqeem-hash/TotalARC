import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','ProcessOwner','ControlOwner','Reviewer']);
    const body = await readJson<Record<string, unknown>>(request);
    const id = requireString(body.id, 'id', 100);
    const decision = requireString(body.decision, 'decision', 20);
    if (!['Accept','Reject'].includes(decision)) throw new ApiError(400, 'VALIDATION_ERROR', 'decision must be Accept or Reject');

    const existing = await prisma.aISuggestion.findFirst({ where: { id, institutionId: user.institutionId } });
    if (!existing) throw new ApiError(404, 'SUGGESTION_NOT_FOUND', 'AI suggestion not found');

    const updated = await prisma.aISuggestion.update({
      where: { id },
      data: { status: decision === 'Accept' ? 'Accepted by Human' : 'Rejected', reviewedBy: user.name, reviewedAt: new Date() }
    });

    await writeAudit(user, request, { action: decision === 'Accept' ? 'APPROVE' : 'REJECT', entityType: 'AISuggestion', recordId: id, oldValue: existing, newValue: updated });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error);
  }
}
