import { NextResponse } from 'next/server';
import { createRisk, listBusinessProcesses, listRisks } from '@/lib/d1-core';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { assertOrganizationScope, resolveOrganizationAccess } from '@/lib/organization-access';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;
  try {
    const [risks, access] = await Promise.all([
      listRisks(auth.user.institutionId),
      resolveOrganizationAccess(auth.user)
    ]);
    const visibleRisks = access.unrestricted
      ? risks
      : risks.filter(risk =>
          risk.process
          && typeof risk.process.orgUnitId === 'string'
          && access.unitIds.includes(risk.process.orgUnitId)
        );
    return NextResponse.json({
      risks: visibleRisks,
      organizationAccess: access,
      storage: 'cloudflare-d1'
    });
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

    const [{ processes }, access] = await Promise.all([
      listBusinessProcesses(auth.user.institutionId),
      resolveOrganizationAccess(auth.user)
    ]);
    const selectedProcess = processes.find(process => process.id === processId);
    if (!selectedProcess) {
      return NextResponse.json(
        { error: 'Select a registered business process before creating a risk.' },
        { status: 400 }
      );
    }
    try {
      assertOrganizationScope(access, selectedProcess.orgUnitId);
    } catch {
      return NextResponse.json(
        {
          error: 'Your organization access scope does not allow the selected business process.',
          code: 'ORGANIZATION_SCOPE_FORBIDDEN'
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
