import { NextResponse } from 'next/server';
import { getInstitutionById } from '@/lib/d1';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { getOrganizationData, scopeOrganizationData } from '@/lib/d1-organization';
import { listControls } from '@/lib/d1-core';
import {
  listIcofrData,
  listRcsaData,
  listRemediationData,
  listTodData,
  listToeTests
} from '@/lib/d1-assurance';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const [
      institution,
      organization,
      authorizedOrgUnitIds,
      rcsa,
      tod,
      icofr,
      controls,
      toeTests,
      remediation
    ] = await Promise.all([
      getInstitutionById(auth.user.institutionId),
      getOrganizationData(auth.user.institutionId),
      resolveAuthorizedOrgUnitIds(auth.user),
      listRcsaData(auth.user.institutionId),
      listTodData(auth.user.institutionId),
      listIcofrData(auth.user.institutionId),
      listControls(auth.user.institutionId),
      listToeTests(auth.user.institutionId),
      listRemediationData(auth.user.institutionId)
    ]);

    const scopedOrganization = scopeOrganizationData(
      organization,
      authorizedOrgUnitIds,
      auth.user.id
    );

    const scopedControls = controls.filter(control =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (control.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );

    const campaigns = rcsa.campaigns
      .map(campaign => {
        const csaResponses = Array.isArray(campaign.csaResponses)
          ? (campaign.csaResponses as Array<Record<string, unknown>>).filter(response =>
              isOrgUnitAuthorized(
                authorizedOrgUnitIds,
                (((response.control as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId) as string | null | undefined
              )
            )
          : [];
        return { ...campaign, csaResponses };
      })
      .filter(campaign =>
        authorizedOrgUnitIds === null
        || isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          (campaign as Record<string, unknown>).orgUnitId as string | null | undefined
        )
        || (campaign.csaResponses as unknown[]).length > 0
      );

    const scopedTodTests = tod.todTests.filter(test =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (test.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );
    const scopedWalkthroughs = tod.walkthroughs.filter(walkthrough =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (walkthrough.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );
    const scopedFinancialAccounts = icofr.financialAccounts.filter(account =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (account as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );
    const scopedIpe = icofr.ipeRegisters.filter(ipe =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (ipe as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );
    const scopedToe = toeTests.filter(test =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (test.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );
    const scopedMaps = remediation.maps.filter(map =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (((map.issue as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId) as string | null | undefined
      )
    );
    const scopedRetests = remediation.retests.filter(retest =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (retest.process as Record<string, unknown> | null)?.orgUnitId as string | null | undefined
      )
    );

    return NextResponse.json({
      institution: institution
        ? {
            ...institution,
            legalEntities: scopedOrganization.legalEntities,
            organizationUnits: scopedOrganization.organizationUnits,
            users: scopedOrganization.users
          }
        : null,
      campaigns,
      todTests: scopedTodTests,
      walkthroughs: scopedWalkthroughs,
      financialAccounts: scopedFinancialAccounts,
      ipeRegisters: scopedIpe,
      certifications: [],
      attestations: [],
      tasks: [],
      controls: scopedControls,
      toeTests: scopedToe,
      actionPlans: scopedMaps,
      retests: scopedRetests,
      organizationScope: {
        mode: auth.user.orgAccessScope,
        orgUnitId: auth.user.orgUnitId,
        authorizedUnitCount:
          authorizedOrgUnitIds === null
            ? scopedOrganization.organizationUnits.length
            : authorizedOrgUnitIds.length
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
