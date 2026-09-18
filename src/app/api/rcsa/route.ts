import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const campaigns = await prisma.assessmentCampaign.findMany({
      where: { institutionId: user.institutionId },
      include: { csaResponses: { include: { control: true }, orderBy: { assessedAt: 'desc' } } },
      orderBy: { dueDate: 'desc' }
    });
    return NextResponse.json({ campaigns });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 40);

    if (action === 'CREATE_CAMPAIGN') {
      if (!['Admin','Reviewer'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Only Admin or Reviewer can create campaigns');
      const startDate = new Date(requireString(body.startDate, 'startDate', 40));
      const dueDate = new Date(requireString(body.dueDate, 'dueDate', 40));
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime()) || dueDate < startDate) throw new ApiError(400, 'VALIDATION_ERROR', 'Campaign dates are invalid');
      const campaign = await prisma.assessmentCampaign.create({
        data: {
          institutionId: user.institutionId,
          name: requireString(body.name, 'name', 250),
          type: optionalString(body.type, 30) || 'RCSA',
          period: requireString(body.period, 'period', 50),
          startDate,
          dueDate,
          status: 'Draft',
          ownerName: user.name,
          approverName: optionalString(body.approverName, 250)
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'AssessmentCampaign', recordId: campaign.id, newValue: campaign });
      return NextResponse.json(campaign, { status: 201 });
    }

    if (action === 'SUBMIT_CSA') {
      const campaignId = requireString(body.campaignId, 'campaignId', 100);
      const controlId = requireString(body.controlId, 'controlId', 100);
      const [campaign, control] = await Promise.all([
        prisma.assessmentCampaign.findFirst({ where: { id: campaignId, institutionId: user.institutionId } }),
        prisma.controlMaster.findFirst({ where: { id: controlId, institutionId: user.institutionId } })
      ]);
      if (!campaign || !control) throw new ApiError(404, 'NOT_FOUND', 'Campaign or control not found');
      const response = await prisma.cSAResponse.create({
        data: {
          campaignId,
          controlId,
          wasPerformed: body.wasPerformed === true,
          frequencyMet: body.frequencyMet === true,
          evidenceAttached: body.evidenceAttached === true,
          exceptionsFound: body.exceptionsFound === true,
          exceptionCount: Number.isInteger(Number(body.exceptionCount)) ? Number(body.exceptionCount) : 0,
          processChanged: body.processChanged === true,
          controlChanged: body.controlChanged === true,
          csaConclusion: requireString(body.csaConclusion, 'csaConclusion', 80),
          assessorNotes: optionalString(body.assessorNotes, 4000),
          assessorName: user.name
        }
      });
      await writeAudit(user, request, { action: 'SUBMIT', entityType: 'CSAResponse', recordId: response.id, newValue: response });
      return NextResponse.json(response, { status: 201 });
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported RCSA action');
  } catch (error) { return apiError(error); }
}
