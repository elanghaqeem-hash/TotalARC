import { NextResponse } from 'next/server';
import {
  createAssessmentCampaign,
  listRcsaData,
  upsertCsaResponse
} from '@/lib/d1-assurance';
import { listControls, recordMutationAudit } from '@/lib/d1-core';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [data, authorizedOrgUnitIds] = await Promise.all([
      listRcsaData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    const campaigns = data.campaigns
      .map(campaign => {
        const responses = Array.isArray(campaign.csaResponses)
          ? (campaign.csaResponses as Array<Record<string, unknown>>).filter(response =>
              isOrgUnitAuthorized(
                authorizedOrgUnitIds,
                (((response.control as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId) as string | null | undefined
              )
            )
          : [];

        return { ...campaign, csaResponses: responses };
      })
      .filter(campaign =>
        authorizedOrgUnitIds === null
        || isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          campaign.orgUnitId as string | null | undefined
        )
        || (campaign.csaResponses as unknown[]).length > 0
      );

    return NextResponse.json({ campaigns, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch RCSA data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch RCSA data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(
    request,
    ['Admin', 'Reviewer', 'ProcessOwner', 'ControlOwner']
  );
  if (auth.response) return auth.response;

  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (actionType === 'CREATE_CAMPAIGN') {
      const name = textValue(body, 'name');
      const type = textValue(body, 'type') || 'RCSA';
      const period = textValue(body, 'period');
      const startDate = textValue(body, 'startDate');
      const dueDate = textValue(body, 'dueDate');
      const ownerName = textValue(body, 'ownerName');
      const approverName = textValue(body, 'approverName') || null;
      const orgUnitId = textValue(body, 'orgUnitId') || null;
      const legalEntityId = textValue(body, 'legalEntityId') || null;

      if (!name || !period || !startDate || !dueDate || !ownerName) {
        return NextResponse.json(
          { error: 'name, period, startDate, dueDate, and ownerName are required.' },
          { status: 400 }
        );
      }
      if (!['RCSA', 'CSA', 'ICOFR'].includes(type)) {
        return NextResponse.json({ error: 'Unsupported assessment campaign type.' }, { status: 400 });
      }
      if (
        authorizedOrgUnitIds !== null
        && !isOrgUnitAuthorized(authorizedOrgUnitIds, orgUnitId)
      ) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected campaign organization unit.',
            code: 'RCSA_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const campaign = await createAssessmentCampaign({
        name,
        type,
        period,
        startDate,
        dueDate,
        ownerName,
        approverName,
        orgUnitId,
        legalEntityId
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'AssessmentCampaign',
        recordId: String(campaign?.id || ''),
        newValue: campaign,
        reason: 'RCSA/CSA assessment campaign created.'
      }, actor);

      return NextResponse.json(campaign, { status: 201 });
    }

    if (actionType === 'UPSERT_RESPONSE') {
      const campaignId = textValue(body, 'campaignId');
      const controlId = textValue(body, 'controlId');
      const csaConclusion = textValue(body, 'csaConclusion');
      const assessorName = textValue(body, 'assessorName');
      const exceptionCount = Number(body.exceptionCount || 0);

      if (!campaignId || !controlId || !csaConclusion || !assessorName) {
        return NextResponse.json(
          { error: 'campaignId, controlId, csaConclusion, and assessorName are required.' },
          { status: 400 }
        );
      }
      if (!Number.isInteger(exceptionCount) || exceptionCount < 0) {
        return NextResponse.json({ error: 'exceptionCount must be a non-negative integer.' }, { status: 400 });
      }

      const [{ campaigns }, controls] = await Promise.all([
        listRcsaData(auth.user.institutionId),
        listControls(auth.user.institutionId)
      ]);
      const campaign = campaigns.find(row => (row as Record<string, unknown>).id === campaignId);
      const control = controls.find(row => (row as Record<string, unknown>).id === controlId);

      const controlOrgUnitId =
        (control?.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined;

      if (
        !control
        || !isOrgUnitAuthorized(authorizedOrgUnitIds, controlOrgUnitId)
        || (
          campaign?.orgUnitId
          && !isOrgUnitAuthorized(
            authorizedOrgUnitIds,
            campaign.orgUnitId as string | null | undefined
          )
        )
      ) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for this RCSA control or campaign.',
            code: 'RCSA_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const response = await upsertCsaResponse({
        campaignId,
        controlId,
        wasPerformed: body.wasPerformed === true,
        frequencyMet: body.frequencyMet === true,
        evidenceAttached: body.evidenceAttached === true,
        exceptionsFound: body.exceptionsFound === true,
        exceptionCount,
        processChanged: body.processChanged === true,
        controlChanged: body.controlChanged === true,
        csaConclusion,
        assessorNotes: textValue(body, 'assessorNotes') || null,
        assessorName
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'UPDATE',
        entityType: 'CSAResponse',
        recordId: String(response?.id || ''),
        newValue: response,
        reason: 'RCSA/CSA response persisted.'
      }, actor);

      return NextResponse.json(response);
    }

    return NextResponse.json({ error: 'Unsupported RCSA action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'RCSA_CAMPAIGN_NOT_FOUND' || code === 'CONTROL_NOT_FOUND') {
      return NextResponse.json({ error: 'Campaign or control was not found.' }, { status: 404 });
    }

    console.error('Failed to persist RCSA action:', error);
    return NextResponse.json(
      { error: 'Failed to persist RCSA data.' },
      { status: 500 }
    );
  }
}
