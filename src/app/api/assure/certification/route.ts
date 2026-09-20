import { NextResponse } from 'next/server';
import {
  createControlCertification,
  createManagementAttestation,
  listCertificationData
} from '@/lib/d1-assurance';
import { listControls, recordMutationAudit } from '@/lib/d1-core';
import { getOrganizationData } from '@/lib/d1-organization';
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
      listCertificationData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    const certifications = data.certifications.filter(certification =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (((certification.control as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId) as string | null | undefined
      )
    );
    const attestations = data.attestations.filter(attestation =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (attestation as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );

    return NextResponse.json({ certifications, attestations, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch certification data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch certification data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(
    request,
    ['Admin', 'ControlOwner', 'Reviewer', 'Executive']
  );
  if (auth.response) return auth.response;

  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (actionType === 'CREATE_CERTIFICATION') {
      const controlId = textValue(body, 'controlId');
      const period = textValue(body, 'period');
      const declarationText = textValue(body, 'declarationText');
      const certifierName = textValue(body, 'certifierName');
      const certifierRole = textValue(body, 'certifierRole') || auth.user.role;
      const status = textValue(body, 'status') || 'Pending';

      if (!controlId || !period || !declarationText || !certifierName) {
        return NextResponse.json(
          { error: 'controlId, period, declarationText, and certifierName are required.' },
          { status: 400 }
        );
      }

      const controls = await listControls(auth.user.institutionId);
      const control = controls.find(row => (row as Record<string, unknown>).id === controlId);
      const orgUnitId =
        (control?.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined;

      if (!control || !isOrgUnitAuthorized(authorizedOrgUnitIds, orgUnitId)) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected control organization unit.',
            code: 'CERTIFICATION_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: control ? 403 : 404 }
        );
      }

      const certification = await createControlCertification({
        controlId,
        period,
        declarationText,
        certifierName,
        certifierRole,
        status
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'ControlCertification',
        recordId: String(certification?.id || ''),
        newValue: certification,
        reason: 'Control certification declaration persisted.'
      }, actor);

      return NextResponse.json(certification, { status: 201 });
    }

    if (actionType === 'CREATE_ATTESTATION') {
      if (!['Admin', 'Reviewer', 'Executive'].includes(auth.user.role)) {
        return NextResponse.json({ error: 'Executive attestation access is required.' }, { status: 403 });
      }

      const period = textValue(body, 'period');
      const scopeSummary = textValue(body, 'scopeSummary');
      const overallOpinion = textValue(body, 'overallOpinion') || null;
      const orgUnitId = textValue(body, 'orgUnitId') || null;
      const legalEntityId = textValue(body, 'legalEntityId') || null;

      if (!period || !scopeSummary) {
        return NextResponse.json(
          { error: 'period and scopeSummary are required.' },
          { status: 400 }
        );
      }

      const organization = await getOrganizationData(auth.user.institutionId);
      const selectedUnit = orgUnitId
        ? organization.organizationUnits.find(unit => unit.id === orgUnitId)
        : null;

      if (orgUnitId && !selectedUnit) {
        return NextResponse.json({ error: 'Selected organization unit was not found.' }, { status: 400 });
      }
      if (
        authorizedOrgUnitIds !== null
        && !isOrgUnitAuthorized(authorizedOrgUnitIds, orgUnitId)
      ) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected attestation organization unit.',
            code: 'CERTIFICATION_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const attestation = await createManagementAttestation({
        legalEntityId: legalEntityId || selectedUnit?.legalEntityId || null,
        orgUnitId,
        period,
        scopeSummary,
        cfoSignOff: body.cfoSignOff === true,
        cfoName: textValue(body, 'cfoName') || null,
        croSignOff: body.croSignOff === true,
        croName: textValue(body, 'croName') || null,
        overallOpinion
      }, auth.user.institutionId);

      await recordMutationAudit({
        institutionId: auth.user.institutionId,
        action: 'CREATE',
        entityType: 'ManagementAttestation',
        recordId: String(attestation?.id || ''),
        newValue: attestation,
        reason: 'Management assurance attestation persisted.'
      }, actor);

      return NextResponse.json(attestation, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported certification action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CONTROL_NOT_FOUND') {
      return NextResponse.json({ error: 'Control not found.' }, { status: 404 });
    }

    console.error('Failed to persist certification action:', error);
    return NextResponse.json(
      { error: 'Failed to persist certification data.' },
      { status: 500 }
    );
  }
}
