import { NextResponse } from 'next/server';
import { getOrganizationStructure } from '@/lib/d1-organization';
import { listDesignAssessments } from '@/lib/d1-icofr-traceability';
import { listPbcTasks } from '@/lib/d1-icofr-executive-reporting';
import {
  addAssessmentScope,
  createAssessmentCampaign,
  getRcsaWorkspaceData,
  reviewAssessmentResponse,
  submitAssessmentResponse,
  updateAssessmentCampaignStatus
} from '@/lib/d1-rcsa';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const organization = await getOrganizationStructure();
    const [todTests, rcsa, pbcTasks] = await Promise.all([
      listDesignAssessments(),
      getRcsaWorkspaceData(),
      listPbcTasks()
    ]);
    const institution = organization.institution;

    return NextResponse.json({
      institution: institution
        ? {
            ...institution,
            legalEntities: organization.legalEntities,
            organizationUnits: organization.organizationUnits,
            users: organization.users
          }
        : null,
      campaigns: rcsa.campaigns,
      processes: rcsa.processes,
      risks: rcsa.risks,
      controls: rcsa.controls,
      tasks: [...rcsa.tasks, ...pbcTasks],
      todTests,
      walkthroughs: [],
      financialAccounts: [],
      ipeRegisters: [],
      certifications: [],
      attestations: [],
      toeTests: [],
      actionPlans: [],
      retests: [],
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load persistent assurance data:', error);
    return NextResponse.json(
      { error: 'Persistent D1 database is not available yet.' },
      { status: 503 }
    );
  }
}

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');

    if (actionType === 'CREATE_CAMPAIGN') {
      const name = textValue(body, 'name');
      const type = textValue(body, 'type');
      const period = textValue(body, 'period');
      const frequency = textValue(body, 'frequency');
      const startDate = textValue(body, 'startDate');
      const dueDate = textValue(body, 'dueDate');
      const ownerName = textValue(body, 'ownerName');
      const reviewerName = textValue(body, 'reviewerName');
      const approverName = textValue(body, 'approverName');
      const methodology = textValue(body, 'methodology');
      const ratingScale = textValue(body, 'ratingScale');
      const status = textValue(body, 'status');
      const processId = textValue(body, 'processId');
      const assessorName = textValue(body, 'assessorName');

      if (
        !name ||
        !type ||
        !period ||
        !frequency ||
        !startDate ||
        !dueDate ||
        !ownerName ||
        !reviewerName ||
        !approverName
      ) {
        return NextResponse.json(
          {
            error:
              'name, type, period, frequency, startDate, dueDate, ownerName, reviewerName, and approverName are required.'
          },
          { status: 400 }
        );
      }

      const campaign = await createAssessmentCampaign({
        campaignCode: textValue(body, 'campaignCode') || null,
        name,
        type,
        period,
        frequency,
        startDate,
        dueDate,
        ownerName,
        reviewerName,
        approverName,
        methodology: methodology || 'COSO / ISO 31000 aligned',
        ratingScale: ratingScale || '5x5',
        evidenceRequired: body.evidenceRequired !== false,
        instructions: textValue(body, 'instructions') || null,
        status: status || 'Draft',
        initialScope:
          processId && assessorName
            ? {
                processId,
                riskId: textValue(body, 'riskId') || null,
                controlId: textValue(body, 'controlId') || null,
                assessorName,
                dueDate: textValue(body, 'scopeDueDate') || dueDate
              }
            : null
      });
      return NextResponse.json(campaign, { status: 201 });
    }

    if (actionType === 'ADD_SCOPE') {
      const campaignId = textValue(body, 'campaignId');
      const processId = textValue(body, 'processId');
      const assessorName = textValue(body, 'assessorName');

      if (!campaignId || !processId || !assessorName) {
        return NextResponse.json(
          { error: 'campaignId, processId, and assessorName are required.' },
          { status: 400 }
        );
      }

      const scope = await addAssessmentScope({
        campaignId,
        processId,
        riskId: textValue(body, 'riskId') || null,
        controlId: textValue(body, 'controlId') || null,
        assessorName,
        dueDate: textValue(body, 'dueDate') || null
      });
      return NextResponse.json(scope, { status: 201 });
    }

    if (actionType === 'SUBMIT_ASSESSMENT') {
      const scopeId = textValue(body, 'scopeId');
      const assessorName = textValue(body, 'assessorName');
      const designEffectiveness = textValue(body, 'designEffectiveness');
      const operatingEffectiveness = textValue(body, 'operatingEffectiveness');
      const evidenceQuality = textValue(body, 'evidenceQuality');
      const csaConclusion = textValue(body, 'csaConclusion');
      const confidenceLevel = textValue(body, 'confidenceLevel');
      const residualLikelihood = Number(body.residualLikelihood);
      const residualImpact = Number(body.residualImpact);

      if (
        !scopeId ||
        !assessorName ||
        !designEffectiveness ||
        !operatingEffectiveness ||
        !evidenceQuality ||
        !csaConclusion ||
        !confidenceLevel ||
        !Number.isInteger(residualLikelihood) ||
        !Number.isInteger(residualImpact)
      ) {
        return NextResponse.json(
          {
            error:
              'scopeId, assessorName, effectiveness ratings, evidenceQuality, conclusion, confidenceLevel, and integer residual ratings are required.'
          },
          { status: 400 }
        );
      }

      const response = await submitAssessmentResponse({
        scopeId,
        assessorName,
        designEffectiveness,
        operatingEffectiveness,
        evidenceQuality,
        residualLikelihood,
        residualImpact,
        csaConclusion,
        confidenceLevel,
        controlPerformed: body.controlPerformed !== false,
        exceptionIdentified: body.exceptionIdentified === true,
        evidenceRef: textValue(body, 'evidenceRef') || null,
        comments: textValue(body, 'comments') || null,
        actionRequired: body.actionRequired === true,
        actionOwner: textValue(body, 'actionOwner') || null,
        actionDueDate: textValue(body, 'actionDueDate') || null
      });
      return NextResponse.json(response, { status: 201 });
    }

    if (actionType === 'REVIEW_ASSESSMENT') {
      const responseId = textValue(body, 'responseId');
      const reviewerName = textValue(body, 'reviewerName');
      const reviewStatus = textValue(body, 'reviewStatus');

      if (!responseId || !reviewerName || !reviewStatus) {
        return NextResponse.json(
          { error: 'responseId, reviewerName, and reviewStatus are required.' },
          { status: 400 }
        );
      }

      const response = await reviewAssessmentResponse({
        responseId,
        reviewerName,
        reviewStatus,
        reviewNotes: textValue(body, 'reviewNotes') || null
      });
      return NextResponse.json(response);
    }

    if (actionType === 'UPDATE_CAMPAIGN_STATUS') {
      const campaignId = textValue(body, 'campaignId');
      const status = textValue(body, 'status');
      if (!campaignId || !status) {
        return NextResponse.json(
          { error: 'campaignId and status are required.' },
          { status: 400 }
        );
      }

      const campaign = await updateAssessmentCampaignStatus({ campaignId, status });
      return NextResponse.json(campaign);
    }

    return NextResponse.json({ error: 'Unsupported assurance action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const notFound: Record<string, string> = {
      CAMPAIGN_NOT_FOUND: 'Assessment campaign not found.',
      ASSESSMENT_SCOPE_NOT_FOUND: 'Assessment scope not found.',
      ASSESSMENT_RESPONSE_NOT_FOUND: 'Assessment response not found.',
      PROCESS_NOT_FOUND: 'Business process not found.',
      RISK_NOT_FOUND: 'Risk not found.',
      CONTROL_NOT_FOUND: 'Control not found.'
    };
    if (notFound[code]) {
      return NextResponse.json({ error: notFound[code] }, { status: 404 });
    }

    const conflicts: Record<string, string> = {
      CAMPAIGN_CODE_CONFLICT: 'Campaign code already exists.',
      ASSESSMENT_SCOPE_CONFLICT: 'The same process/risk/control is already in this campaign.',
      CAMPAIGN_CLOSED: 'This campaign is closed and cannot be changed.'
    };
    if (conflicts[code]) {
      return NextResponse.json({ error: conflicts[code] }, { status: 409 });
    }

    const badRequest: Record<string, string> = {
      INVALID_CAMPAIGN_DATES: 'Campaign due date must be on or after the start date.',
      RISK_PROCESS_MISMATCH: 'Selected risk does not belong to the selected process.',
      CONTROL_PROCESS_MISMATCH: 'Selected control does not belong to the selected process.',
      EVIDENCE_REQUIRED: 'Evidence reference is required by this campaign.',
      ACTION_FIELDS_REQUIRED: 'Action owner and action due date are required when remediation is needed.',
      INVALID_RESIDUAL_RATING: 'Residual likelihood and impact must be integer values from 1 to 5.'
    };
    if (badRequest[code]) {
      return NextResponse.json({ error: badRequest[code] }, { status: 400 });
    }

    console.error('Failed to persist assurance action:', error);
    return NextResponse.json(
      { error: 'Failed to process assurance action in persistent database.' },
      { status: 500 }
    );
  }
}