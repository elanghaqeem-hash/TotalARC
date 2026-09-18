import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

function rating(score: number) {
  if (score >= 15) return 'Critical';
  if (score >= 10) return 'High';
  if (score >= 5) return 'Medium';
  return 'Low';
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const risks = await prisma.riskMaster.findMany({
      where: { institutionId: user.institutionId },
      include: {
        process: true,
        activity: true,
        controls: { include: { control: true } },
        issues: true
      },
      orderBy: { riskId: 'asc' }
    });
    return NextResponse.json({ risks });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','ProcessOwner','Reviewer']);
    const body = await readJson<Record<string, unknown>>(request);
    const processId = requireString(body.processId, 'processId', 100);
    const process = await prisma.businessProcess.findFirst({ where: { id: processId, institutionId: user.institutionId } });
    if (!process) throw new ApiError(404, 'PROCESS_NOT_FOUND', 'Process not found in your institution');

    const name = requireString(body.name, 'name', 250);
    const cause = optionalString(body.cause, 2000) || '';
    const event = optionalString(body.event, 2000) || '';
    const impact = optionalString(body.impact, 2000) || '';
    const likelihood = Number(body.inherentLikelihood ?? 3);
    const impactScore = Number(body.inherentImpact ?? 3);
    if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5 || !Number.isInteger(impactScore) || impactScore < 1 || impactScore > 5) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Risk likelihood and impact must be integers from 1 to 5');
    }
    const inherentScore = likelihood * impactScore;

    const risk = await prisma.riskMaster.create({
      data: {
        institutionId: user.institutionId,
        riskId: optionalString(body.riskId, 80) || `RSK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name,
        description: optionalString(body.description, 4000) || [cause, event, impact].filter(Boolean).join(' | '),
        cause,
        event,
        impact,
        category: optionalString(body.category, 100) || 'Operational',
        processId,
        ownerName: optionalString(body.ownerName, 250) || user.name,
        inherentLikelihood: likelihood,
        inherentImpact: impactScore,
        inherentScore,
        inherentRating: rating(inherentScore),
        residualLikelihood: likelihood,
        residualImpact: impactScore,
        residualScore: inherentScore,
        residualRating: rating(inherentScore),
        riskTreatment: 'Reduce'
      }
    });

    await writeAudit(user, request, { action: 'CREATE', entityType: 'Risk', recordId: risk.id, reason: `Registered risk ${risk.riskId}`, newValue: risk });
    return NextResponse.json(risk, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
