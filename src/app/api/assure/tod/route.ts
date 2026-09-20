import { NextResponse } from 'next/server';
import {
  createTodTest,
  createWalkthrough,
  listTodData
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
      listTodData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    const todTests = data.todTests.filter(test =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (test.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );
    const walkthroughs = data.walkthroughs.filter(walkthrough =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (walkthrough.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );

    return NextResponse.json({ todTests, walkthroughs, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch ToD data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ToD data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'Tester', 'Reviewer']);
  if (auth.response) return auth.response;

  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');
    const controlId = textValue(body, 'controlId');
    const [authorizedOrgUnitIds, controls] = await Promise.all([
      resolveAuthorizedOrgUnitIds(auth.user),
      listControls(auth.user.institutionId)
    ]);

    const control = controls.find(row => (row as Record<string, unknown>).id === controlId);
    const controlOrgUnitId =
      (control?.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined;

    if (
      !controlId
      || !control
      || !isOrgUnitAuthorized(authorizedOrgUnitIds, controlOrgUnitId)
    ) {
      return NextResponse.json(
        {
          error: 'Your account is not authorized for the selected control organization unit.',
          code: 'TOD_ORGANIZATION_SCOPE_FORBIDDEN'
        },
        { status: controlId && control ? 403 : 404 }
      );
    }

    if (actionType === 'CREATE_TEST') {
      const testerName = textValue(body, 'testerName');
      const period = textValue(body, 'period');
      const testObjective = textValue(body, 'testObjective');
      const conclusion = textValue(body, 'conclusion') || 'Not Assessed';

      if (!testerName || !period || !testObjective) {
        return NextResponse.json(
          { error: 'testerName, period, and testObjective are required.' },
          { status: 400 }
        );
      }

      const test = await createTodTest({
        testId: textValue(body, 'testId') || undefined,
        controlId,
        riskId: textValue(body, 'riskId') || null,
        testerName,
        reviewerName: textValue(body, 'reviewerName') || null,
        period,
        testObjective,
        objectiveAlignment: body.objectiveAlignment === true,
        riskCoverage: body.riskCoverage === true,
        precisionAdequate: body.precisionAdequate === true,
        segregationDuties: body.segregationDuties === true,
        evidenceSufficiency: body.evidenceSufficiency === true,
        observations: textValue(body, 'observations') || null,
        conclusion,
        status: textValue(body, 'status') || 'Draft'
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'ToDTest',
        recordId: String(test?.id || test?.testId || ''),
        newValue: test,
        reason: 'Test of Design workpaper created.'
      }, actor);

      return NextResponse.json(test, { status: 201 });
    }

    if (actionType === 'CREATE_WALKTHROUGH') {
      const date = textValue(body, 'date');
      const conclusion = textValue(body, 'conclusion') || 'Not Assessed';

      if (!date) {
        return NextResponse.json({ error: 'date is required.' }, { status: 400 });
      }

      const walkthrough = await createWalkthrough({
        controlId,
        date,
        participants: textValue(body, 'participants') || null,
        transactionRef: textValue(body, 'transactionRef') || null,
        systemsInspected: textValue(body, 'systemsInspected') || null,
        observations: textValue(body, 'observations') || null,
        processChanged: body.processChanged === true,
        conclusion
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'Walkthrough',
        recordId: String(walkthrough?.id || ''),
        newValue: walkthrough,
        reason: 'Control walkthrough record created.'
      }, actor);

      return NextResponse.json(walkthrough, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported ToD action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CONTROL_NOT_FOUND' || code === 'RISK_NOT_FOUND') {
      return NextResponse.json({ error: 'Control or risk was not found.' }, { status: 404 });
    }
    if (code === 'TOD_TEST_ID_CONFLICT') {
      return NextResponse.json({ error: 'ToD Test ID already exists.' }, { status: 409 });
    }

    console.error('Failed to persist ToD action:', error);
    return NextResponse.json(
      { error: 'Failed to persist ToD data.' },
      { status: 500 }
    );
  }
}
