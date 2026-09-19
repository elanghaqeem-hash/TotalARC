import { NextResponse } from 'next/server';
import { getInstitutionById } from '@/lib/d1';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { getOrganizationData } from '@/lib/d1-organization';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [institution, organization, authorizedOrgUnitIds] = await Promise.all([
      getInstitutionById(auth.user.institutionId),
      getOrganizationData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user)
    ]);

    const scopedUnits = organization.organizationUnits.filter(unit =>
      isOrgUnitAuthorized(authorizedOrgUnitIds, unit.id)
    );
    const scopedEntityIds = new Set(
      scopedUnits
        .map(unit => unit.legalEntityId)
        .filter((id): id is string => typeof id === 'string' && Boolean(id))
    );
    const scopedEntities = authorizedOrgUnitIds === null
      ? organization.legalEntities
      : organization.legalEntities.filter(entity => scopedEntityIds.has(entity.id));

    return NextResponse.json({
      institution: institution
        ? {
            ...institution,
            legalEntities: scopedEntities,
            organizationUnits: scopedUnits,
            users: []
          }
        : null,
      campaigns: [],
      todTests: [],
      walkthroughs: [],
      financialAccounts: [],
      ipeRegisters: [],
      certifications: [],
      attestations: [],
      tasks: [],
      controls: [],
      toeTests: [],
      actionPlans: [],
      retests: [],
      organizationScope: {
        mode: auth.user.orgAccessScope,
        orgUnitId: auth.user.orgUnitId,
        authorizedUnitCount: authorizedOrgUnitIds === null ? scopedUnits.length : authorizedOrgUnitIds.length
      },
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load persistent assurance data:', error);
    return NextResponse.json(
      { error: 'Persistent D1 database is not available yet.' },
      { status: 503 }
    );
  }
}
