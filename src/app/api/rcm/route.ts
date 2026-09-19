import { NextResponse } from 'next/server';
import { listRcmRows } from '@/lib/d1-core';
import { enrichRcmWithAssurance } from '@/lib/d1-assurance';
import { getOrganizationData, scopeOrganizationData } from '@/lib/d1-organization';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [baseRows, organization, authorizedOrgUnitIds] = await Promise.all([
      listRcmRows(auth.user.institutionId),
      getOrganizationData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);
    const scopedRows = baseRows.filter(row =>
      isOrgUnitAuthorized(authorizedOrgUnitIds, row.orgUnitId as string | null | undefined)
    );
    const rcm = await enrichRcmWithAssurance(scopedRows, auth.user.institutionId);
    const scopedOrganization = scopeOrganizationData(
      organization,
      authorizedOrgUnitIds,
      auth.user.id
    );

    return NextResponse.json({
      rcm,
      total: rcm.length,
      organization: {
        legalEntities: scopedOrganization.legalEntities,
        organizationUnits: scopedOrganization.organizationUnits
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
