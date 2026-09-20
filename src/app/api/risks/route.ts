import { NextResponse } from 'next/server';
import { createRisk } from '@/lib/d1-core';
import { getProcessScopeById, listRiskOptions, listRiskRegisterPage } from '@/lib/d1-register-pagination';
import { parsePaginationRequest } from '@/lib/pagination';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const pagination = parsePaginationRequest(request);
    const orgUnitId = (url.searchParams.get('orgUnitId') || '').trim() || null;
    const processId = (url.searchParams.get('processId') || '').trim() || null;
    const mode = url.searchParams.get('mode') || 'register';
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (mode === 'options') {
      const risks = await listRiskOptions(
        auth.user.institutionId,
        { authorizedOrgUnitIds, orgUnitId },
        processId,
        pagination.search
      );
      return NextResponse.json({ risks, storage: 'cloudflare-d1' });
    }

    const page = await listRiskRegisterPage(
      auth.user.institutionId,
      {
        ...pagination,
        authorizedOrgUnitIds,
        orgUnitId
      }
    );
    return NextResponse.json({ ...page, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 risks:', error);
    return NextResponse.json({ error: 'Failed to fetch risks from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'ProcessOwner', 'Reviewer']);
  if (auth.response) return auth.response;
  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);


  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const cause = typeof body.cause === 'string' ? body.cause.trim() : '';
    const event = typeof body.event === 'string' ? body.event.trim() : '';
    const impact = typeof body.impact === 'string' ? body.impact.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const processId = typeof body.processId === 'string' ? body.processId.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const likelihood = Number(body.inherentLikelihood);
    const impactValue = Number(body.inherentImpact);

    if (
      !name || !cause || !event || !impact || !category || !processId || !ownerName ||
      !Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5 ||
      !Number.isInteger(impactValue) || impactValue < 1 || impactValue > 5
    ) {
      return NextResponse.json(
        { error: 'Complete risk data and a 1-5 inherent likelihood/impact assessment are required.' },
        { status: 400 }
      );
    }

    const [authorizedOrgUnitIds, selectedProcess] = await Promise.all([
      resolveAuthorizedOrgUnitIds(auth.user),
      getProcessScopeById(auth.user.institutionId, processId)
    ]);
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
          code: 'RISK_ORGANIZATION_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      );
    }

    const risk = await createRisk({
      ...body,
      name,
      cause,
      event,
      impact,
      category,
      processId,
      ownerName,
      inherentLikelihood: likelihood,
      inherentImpact: impactValue
    }, auth.user.institutionId, actor);

    return NextResponse.json(risk, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Select a registered business process before creating a risk.' }, { status: 400 });
    }
    if (code === 'RISK_ID_CONFLICT') {
      return NextResponse.json({ error: 'Risk ID already exists for this institution.' }, { status: 409 });
    }

    console.error('Failed to create D1 risk:', error);
    return NextResponse.json({ error: 'Failed to create risk in persistent database.' }, { status: 500 });
  }
}
