import { NextResponse } from 'next/server';
import { createControl, listBusinessProcesses, listControls } from '@/lib/d1-core';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;
  try {
    const [controls, authorizedOrgUnitIds] = await Promise.all([
      listControls(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);
    const scopedControls = controls.filter(control =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (control.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );
    return NextResponse.json({ controls: scopedControls, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 controls:', error);
    return NextResponse.json({ error: 'Failed to fetch controls from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'ControlOwner', 'ProcessOwner']);
  if (auth.response) return auth.response;
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);


  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
    const processId = typeof body.processId === 'string' ? body.processId.trim() : '';
    const riskId = typeof body.riskId === 'string' ? body.riskId.trim() : '';
    const controlOwner = typeof body.controlOwner === 'string' ? body.controlOwner.trim() : '';
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const nature = typeof body.nature === 'string' ? body.nature.trim() : '';
    const frequency = typeof body.frequency === 'string' ? body.frequency.trim() : '';

    if (!name || !description || !objective || !processId || !controlOwner || !type || !nature || !frequency) {
      return NextResponse.json(
        { error: 'Complete control definition, ownership, type, nature, and frequency are required.' },
        { status: 400 }
      );
    }

    const [{ processes }, authorizedOrgUnitIds] = await Promise.all([
      listBusinessProcesses(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);
    const selectedProcess = processes.find(process => process.id === processId);
    if (
      !selectedProcess
      || !isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        selectedProcess.orgUnitId as string | null | undefined
      )
    ) {
      return NextResponse.json(
        {
          error: 'Your account is not authorized for the selected business process organization unit.',
          code: 'CONTROL_ORGANIZATION_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      );
    }

    const control = await createControl({
      ...body,
      name,
      description,
      objective,
      processId,
      riskId: riskId || null,
      controlOwner,
      type,
      nature,
      frequency
    }, auth.user.institutionId, actor);

    return NextResponse.json(control, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Select a registered business process before creating a control.' }, { status: 400 });
    }
    if (code === 'RISK_NOT_FOUND') {
      return NextResponse.json({ error: 'Selected risk does not exist.' }, { status: 400 });
    }
    if (code === 'RISK_PROCESS_MISMATCH') {
      return NextResponse.json({ error: 'Selected risk belongs to a different business process.' }, { status: 400 });
    }
    if (code === 'CONTROL_ID_CONFLICT') {
      return NextResponse.json({ error: 'Control ID already exists for this institution.' }, { status: 409 });
    }

    console.error('Failed to create D1 control:', error);
    return NextResponse.json({ error: 'Failed to create control in persistent database.' }, { status: 500 });
  }
}
