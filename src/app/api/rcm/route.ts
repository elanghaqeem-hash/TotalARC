import { NextResponse } from 'next/server';
import { listRcmRegisterPage } from '@/lib/d1-register-pagination';
import { parsePaginationRequest } from '@/lib/pagination';
import { getOrganizationData, scopeOrganizationData } from '@/lib/d1-organization';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const pagination = parsePaginationRequest(request);
    const orgUnitId = (url.searchParams.get('orgUnitId') || '').trim() || null;
    const filterType = (url.searchParams.get('filterType') || 'ALL').trim();

    const [organization, authorizedOrgUnitIds] = await Promise.all([
      getOrganizationData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    const page = await listRcmRegisterPage(
      auth.user.institutionId,
      {
        ...pagination,
        authorizedOrgUnitIds,
        orgUnitId,
        filterType
      }
    );

    const scopedOrganization = scopeOrganizationData(
      organization,
      authorizedOrgUnitIds,
      auth.user.id
    );

    return NextResponse.json({
      ...page,
      total: page.pagination.total,
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
