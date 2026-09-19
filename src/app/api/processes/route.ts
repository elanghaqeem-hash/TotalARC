import { NextResponse } from 'next/server';
import { createBusinessProcess, listBusinessProcesses } from '@/lib/d1-core';
import { getOrganizationData } from '@/lib/d1-organization';
import {
  assertOrganizationScope,
  filterByOrganizationScope,
  resolveOrganizationAccess
} from '@/lib/organization-access';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [{ processes, categories }, organization, access] = await Promise.all([
      listBusinessProcesses(auth.user.institutionId),
      getOrganizationData(auth.user.institutionId),
      resolveOrganizationAccess(auth.user)
    ]);

    const visibleProcesses = filterByOrganizationScope(processes, access);
    const allowedUnitIds = access.unrestricted
      ? new Set(organization.organizationUnits.map(unit => unit.id))
      : new Set(access.unitIds);
    const visibleUnits = organization.organizationUnits.filter(unit => allowedUnitIds.has(unit.id));
    const visibleEntityIds = new Set(visibleUnits.map(unit => unit.legalEntityId).filter(Boolean));
    const visiblePositions = organization.positions.filter(position => allowedUnitIds.has(position.orgUnitId));
    const visibleUserIds = new Set<string>([
      auth.user.id,
      ...visibleUnits.map(unit => unit.headUserId).filter((value): value is string => Boolean(value)),
      ...visiblePositions.map(position => position.assignedUserId).filter((value): value is string => Boolean(value))
    ]);
    const visibleUsers = access.unrestricted
      ? organization.users
      : organization.users.filter(user =>
          visibleUserIds.has(user.id)
          || (typeof user.orgUnitId === 'string' && allowedUnitIds.has(user.orgUnitId))
        );

    return NextResponse.json({
      processes: visibleProcesses,
      categories,
      organization: {
        legalEntities: access.unrestricted
          ? organization.legalEntities
          : organization.legalEntities.filter(entity => visibleEntityIds.has(entity.id)),
        organizationUnits: visibleUnits,
        positions: visiblePositions,
        users: visibleUsers,
        access
      },
      storage: 'cloudflare-d1'
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    console.error('Failed to fetch D1 processes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch processes from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'ProcessOwner']);
  if (auth.response) return auth.response;

  const mutationGuard = guardMutationRequest(request);
  if (mutationGuard) return mutationGuard;

  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const categoryId = typeof body.categoryId === 'string' ? body.categoryId.trim() : '';
    const criticality = typeof body.criticality === 'string' ? body.criticality.trim() : '';
    const classification = typeof body.classification === 'string' ? body.classification.trim() : '';
    const orgUnitId = typeof body.orgUnitId === 'string' ? body.orgUnitId.trim() : '';
    const legalEntityId = typeof body.legalEntityId === 'string' ? body.legalEntityId.trim() : '';
    const ownerUserId = typeof body.ownerUserId === 'string' ? body.ownerUserId.trim() : '';
    let ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    let ownerEmail = typeof body.ownerEmail === 'string' ? body.ownerEmail.trim() : '';

    if (!name || !categoryId || !criticality || !classification) {
      return NextResponse.json(
        { error: 'name, categoryId, criticality, and classification are required.' },
        { status: 400 }
      );
    }

    const [organization, access] = await Promise.all([
      getOrganizationData(auth.user.institutionId),
      resolveOrganizationAccess(auth.user)
    ]);
    const activeUnits = organization.organizationUnits.filter(unit => unit.status === 'Active');
    const selectedUnit = orgUnitId
      ? organization.organizationUnits.find(unit => unit.id === orgUnitId)
      : null;
    const selectedEntity = legalEntityId
      ? organization.legalEntities.find(entity => entity.id === legalEntityId)
      : null;
    const selectedOwner = ownerUserId
      ? organization.users.find(user => user.id === ownerUserId && user.active)
      : null;
    const scopedUnitIds = access.unrestricted ? null : new Set(access.unitIds);
    const scopedPositions = scopedUnitIds
      ? organization.positions.filter(position => scopedUnitIds.has(position.orgUnitId))
      : organization.positions;
    const scopedUnits = scopedUnitIds
      ? organization.organizationUnits.filter(unit => scopedUnitIds.has(unit.id))
      : organization.organizationUnits;
    const scopedUserIds = new Set<string>([
      auth.user.id,
      ...scopedUnits
        .map(unit => unit.headUserId)
        .filter((value): value is string => Boolean(value)),
      ...scopedPositions
        .map(position => position.assignedUserId)
        .filter((value): value is string => Boolean(value))
    ]);

    if (activeUnits.length > 0 && !orgUnitId) {
      return NextResponse.json(
        {
          error: 'Select an organization unit for this business process.',
          code: 'PROCESS_ORGANIZATION_UNIT_REQUIRED'
        },
        { status: 400 }
      );
    }

    if (orgUnitId && !selectedUnit) {
      return NextResponse.json(
        {
          error: 'Selected organization unit does not exist in this institution.',
          code: 'PROCESS_ORGANIZATION_UNIT_INVALID'
        },
        { status: 400 }
      );
    }

    if (selectedUnit) {
      try {
        assertOrganizationScope(access, selectedUnit.id);
      } catch {
        return NextResponse.json(
          {
            error: 'Your organization access scope does not allow this organization unit.',
            code: 'ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }
    }

    if (legalEntityId && !selectedEntity) {
      return NextResponse.json(
        {
          error: 'Selected legal entity does not exist in this institution.',
          code: 'PROCESS_LEGAL_ENTITY_INVALID'
        },
        { status: 400 }
      );
    }

    if (
      selectedUnit?.legalEntityId
      && legalEntityId
      && selectedUnit.legalEntityId !== legalEntityId
    ) {
      return NextResponse.json(
        {
          error: 'The selected organization unit belongs to a different legal entity.',
          code: 'PROCESS_ORGANIZATION_ENTITY_MISMATCH'
        },
        { status: 409 }
      );
    }

    if (ownerUserId && !selectedOwner) {
      return NextResponse.json(
        {
          error: 'Selected process owner is not an active user in this institution.',
          code: 'PROCESS_OWNER_INVALID'
        },
        { status: 400 }
      );
    }

    if (
      selectedOwner
      && !access.unrestricted
      && !scopedUserIds.has(selectedOwner.id)
      && !(typeof selectedOwner.orgUnitId === 'string' && scopedUnitIds?.has(selectedOwner.orgUnitId))
    ) {
      return NextResponse.json(
        {
          error: 'Selected process owner is outside your organization access scope.',
          code: 'PROCESS_OWNER_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      );
    }

    if (
      selectedEntity
      && !access.unrestricted
      && selectedUnit?.legalEntityId !== selectedEntity.id
    ) {
      return NextResponse.json(
        {
          error: 'Selected legal entity is outside the allowed organization scope.',
          code: 'PROCESS_LEGAL_ENTITY_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      );
    }

    if (selectedOwner) {
      ownerName = selectedOwner.name;
      ownerEmail = selectedOwner.email;
    }

    if (!ownerName) {
      return NextResponse.json(
        {
          error: 'Select or enter a process owner.',
          code: 'PROCESS_OWNER_REQUIRED'
        },
        { status: 400 }
      );
    }

    const resolvedLegalEntityId = legalEntityId || selectedUnit?.legalEntityId || '';

    const process = await createBusinessProcess({
      ...body,
      name,
      categoryId,
      ownerName,
      ownerEmail,
      orgUnitId: orgUnitId || null,
      legalEntityId: resolvedLegalEntityId || null,
      criticality,
      classification
    }, auth.user.institutionId, actor);

    return NextResponse.json(process, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';

    if (code === 'INSTITUTION_REQUIRED') {
      return NextResponse.json(
        { error: 'Register an institution before creating processes.' },
        { status: 409 }
      );
    }

    if (code === 'CATEGORY_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Selected process category does not exist.' },
        { status: 400 }
      );
    }

    if (code === 'PROCESS_ID_CONFLICT') {
      return NextResponse.json(
        { error: 'Process ID already exists for this institution.' },
        { status: 409 }
      );
    }

    console.error('Failed to create D1 process:', error);
    return NextResponse.json(
      { error: 'Failed to create process in persistent database.' },
      { status: 500 }
    );
  }
}
