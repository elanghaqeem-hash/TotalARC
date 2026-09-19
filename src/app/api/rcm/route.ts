import { NextResponse } from 'next/server';
import { listRcmRows } from '@/lib/d1-core';
import { enrichRcmWithAssurance } from '@/lib/d1-assurance';
import { getOrganizationData } from '@/lib/d1-organization';
import { filterByOrganizationScope, resolveOrganizationAccess } from '@/lib/organization-access';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [baseRows, organization, access] = await Promise.all([
      listRcmRows(auth.user.institutionId),
      getOrganizationData(auth.user.institutionId),
      resolveOrganizationAccess(auth.user)
    ]);
    const scopedBaseRows = filterByOrganizationScope(baseRows, access);
    const rcm = await enrichRcmWithAssurance(scopedBaseRows, auth.user.institutionId);
    const allowedUnitIds = access.unrestricted
      ? new Set(organization.organizationUnits.map(unit => unit.id))
      : new Set(access.unitIds);
    const visibleUnits = organization.organizationUnits.filter(unit => allowedUnitIds.has(unit.id));
    const visibleEntityIds = new Set(visibleUnits.map(unit => unit.legalEntityId).filter(Boolean));

    return NextResponse.json({
      rcm,
      total: rcm.length,
      organization: {
        legalEntities: access.unrestricted
          ? organization.legalEntities
          : organization.legalEntities.filter(entity => visibleEntityIds.has(entity.id)),
        organizationUnits: visibleUnits,
        access
      },
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to generate D1 RCM:', error);
    return NextResponse.json(
      { error: 'Failed to generate RCM from persistent database.' },
      { status: 503 }
    );
  }
}
