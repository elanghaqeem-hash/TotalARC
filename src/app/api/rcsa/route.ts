import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

const CONCLUSIONS = ['Effective','Partially Effective','Ineffective','Not Performed'];
const CAMPAIGN_TRANSITIONS: Record<string, string[]> = {
  Draft: ['In Progress'],
  'In Progress': ['Review'],
  Review: ['In Progress','Completed'],
  Completed: []
};

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const campaigns = await prisma.assessmentCampaign.findMany({
      where: { institutionId: user.institutionId },
      include: {
        csaResponses: {
          include: { control: true },
          orderBy: { assessedAt: 'desc' }
        }
      },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }]
    });
    return NextResponse.json({ campaigns });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const body = await readJson<Record<string, unknown>>(request);
    const action = requireString(body.action, 'action', 40);

    if (action === 'CREATE_CAMPAIGN') {
      if (!['Admin','Reviewer'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'Only Admin or Reviewer can create campaigns');
      }
      const startDate = new Date(requireString(body.startDate, 'startDate', 40));
      const dueDate = new Date(requireString(body.dueDate, 'dueDate', 40));
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime()) || dueDate < startDate) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Campaign dates are invalid');
      }

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

      await writeAudit(user, request, {
        action: 'CREATE',
        entityType: 'AssessmentCampaign',
        recordId: campaign.id,
        newValue: campaign
      });
      return NextResponse.json(campaign, { status: 201 });
    }

    if (action === 'SET_CAMPAIGN_STATUS') {
      if (!['Admin','Reviewer'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'Only Admin or Reviewer can change campaign status');
      }
      const campaignId = requireString(body.campaignId, 'campaignId', 100);
      const targetStatus = requireString(body.status, 'status', 40);
      const campaign = await prisma.assessmentCampaign.findFirst({
        where: { id: campaignId, institutionId: user.institutionId },
        include: { csaResponses: { select: { id: true } } }
      });
      if (!campaign) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
      if (!(CAMPAIGN_TRANSITIONS[campaign.status] || []).includes(targetStatus)) {
        throw new ApiError(400, 'INVALID_STATUS_TRANSITION', `Cannot change campaign from ${campaign.status} to ${targetStatus}`);
      }
      if (targetStatus === 'Completed' && campaign.csaResponses.length === 0) {
        throw new ApiError(400, 'EMPTY_CAMPAIGN', 'A campaign cannot be completed without at least one CSA response');
      }

      const updated = await prisma.assessmentCampaign.update({
        where: { id: campaign.id },
        data: { status: targetStatus }
      });
      await writeAudit(user, request, {
        action: 'STATUS_CHANGE',
        entityType: 'AssessmentCampaign',
        recordId: campaign.id,
        oldValue: { status: campaign.status },
        newValue: { status: updated.status }
      });
      return NextResponse.json(updated);
    }

    if (action === 'SUBMIT_CSA') {
      if (!['Admin','ControlOwner','ProcessOwner'].includes(user.role)) {
        throw new ApiError(403, 'FORBIDDEN', 'CSA submission requires Admin, Control Owner, or Process Owner role');
      }
      const campaignId = requireString(body.campaignId, 'campaignId', 100);
      const controlId = requireString(body.controlId, 'controlId', 100);

      const [campaign, control] = await Promise.all([
        prisma.assessmentCampaign.findFirst({ where: { id: campaignId, institutionId: user.institutionId } }),
        prisma.controlMaster.findFirst({ where: { id: controlId, institutionId: user.institutionId } })
      ]);
      if (!campaign || !control) throw new ApiError(404, 'NOT_FOUND', 'Campaign or control not found');
      if (campaign.status !== 'In Progress') {
        throw new ApiError(400, 'CAMPAIGN_NOT_OPEN', 'CSA responses can only be submitted while a campaign is In Progress');
      }

      const wasPerformed = body.wasPerformed === true;
      const rawCount = Number(body.exceptionCount ?? 0);
      if (!Number.isInteger(rawCount) || rawCount < 0) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'exceptionCount must be a non-negative integer');
      }
      let csaConclusion = requireString(body.csaConclusion, 'csaConclusion', 80);
      if (!CONCLUSIONS.includes(csaConclusion)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid CSA conclusion');
      }
      if (!wasPerformed) csaConclusion = 'Not Performed';

      const existing = await prisma.cSAResponse.findUnique({
        where: { campaignId_controlId: { campaignId, controlId } }
      });

      const response = await prisma.cSAResponse.upsert({
        where: { campaignId_controlId: { campaignId, controlId } },
        update: {
          wasPerformed,
          frequencyMet: body.frequencyMet === true,
          evidenceAttached: body.evidenceAttached === true,
          exceptionsFound: rawCount > 0,
          exceptionCount: rawCount,
          processChanged: body.processChanged === true,
          controlChanged: body.controlChanged === true,
          csaConclusion,
          assessorNotes: optionalString(body.assessorNotes, 4000),
          assessorName: user.name,
          assessedAt: new Date()
        },
        create: {
          campaignId,
          controlId,
          wasPerformed,
          frequencyMet: body.frequencyMet === true,
          evidenceAttached: body.evidenceAttached === true,
          exceptionsFound: rawCount > 0,
          exceptionCount: rawCount,
          processChanged: body.processChanged === true,
          controlChanged: body.controlChanged === true,
          csaConclusion,
          assessorNotes: optionalString(body.assessorNotes, 4000),
          assessorName: user.name
        }
      });

      await writeAudit(user, request, {
        action: existing ? 'UPDATE' : 'SUBMIT',
        entityType: 'CSAResponse',
        recordId: response.id,
        oldValue: existing || undefined,
        newValue: response
      });
      return NextResponse.json(response, { status: existing ? 200 : 201 });
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported RCSA action');
  } catch (error) {
    return apiError(error);
  }
}
