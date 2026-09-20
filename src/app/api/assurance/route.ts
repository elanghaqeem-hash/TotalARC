import { NextResponse } from 'next/server';
import { getInstitutionById } from '@/lib/d1';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { getOrganizationData, scopeOrganizationData } from '@/lib/d1-organization';
import { listControls } from '@/lib/d1-core';
import {
  listCalendarData,
  listCertificationData,
  listIcofrData,
  listRcsaData,
  listRemediationData,
  listTasksData,
  listTodData,
  listToeTests
} from '@/lib/d1-assurance';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { performanceNow, recordApiPerformance } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const DEFAULT_MODULES = [
  'institution',
  'organization',
  'controls',
  'rcsa',
  'tod',
  'icofr',
  'toe',
  'remediation',
  'certification',
  'tasks'
] as const;

type AssuranceModule =
  | (typeof DEFAULT_MODULES)[number]
  | 'calendar';

function requestedModules(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('modules')?.trim();
  if (!raw) return { modules: new Set<AssuranceModule>(DEFAULT_MODULES), focused: false };

  const allowed = new Set<AssuranceModule>([...DEFAULT_MODULES, 'calendar']);
  const modules = new Set<AssuranceModule>();
  for (const value of raw.split(',')) {
    const moduleName = value.trim() as AssuranceModule;
    if (allowed.has(moduleName)) modules.add(moduleName);
  }

  if (modules.size === 0) {
    modules.add('institution');
  }

  return { modules, focused: true };
}

export async function GET(request: Request) {
  const startedAt = performanceNow();
  const selection = requestedModules(request);

  try {
    const auth = await authorizeTenantApi(request, READ_ROLES);
    if (auth.response) return auth.response;

    const wants = (moduleName: AssuranceModule) => selection.modules.has(moduleName);
    const institutionId = auth.user.institutionId;

    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (wants('calendar')) {
      const calendar = await listCalendarData(institutionId);
      const allowed = (orgUnitId: unknown) =>
        isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          typeof orgUnitId === 'string' ? orgUnitId : null
        );

      return NextResponse.json({
        campaigns: calendar.campaigns.filter(row =>
          allowed((row as Record<string, unknown>).orgUnitId)
        ),
        toeTests: calendar.toeTests.filter(row =>
          allowed((row as Record<string, unknown>).orgUnitId)
        ),
        actionPlans: calendar.actionPlans.filter(row =>
          allowed((row as Record<string, unknown>).orgUnitId)
        ),
        retests: calendar.retests.filter(row =>
          allowed((row as Record<string, unknown>).orgUnitId)
        ),
        certifications: calendar.certifications.filter(row =>
          allowed((row as Record<string, unknown>).orgUnitId)
        ),
        attestations: calendar.attestations.filter(row =>
          allowed((row as Record<string, unknown>).orgUnitId)
        ),
        tasks: calendar.tasks.filter(row =>
          allowed((row as Record<string, unknown>).orgUnitId)
        ),
        loadedModules: ['calendar'],
        storage: 'cloudflare-d1'
      });
    }

    const [
      institution,
      organization,
      rcsa,
      tod,
      icofr,
      controls,
      toeTests,
      remediation,
      certification,
      tasks
    ] = await Promise.all([
      wants('institution') || wants('organization')
        ? getInstitutionById(institutionId)
        : Promise.resolve(null),
      wants('organization')
        ? getOrganizationData(institutionId)
        : Promise.resolve(null),
      wants('rcsa')
        ? listRcsaData(institutionId)
        : Promise.resolve({ campaigns: [] }),
      wants('tod')
        ? listTodData(institutionId)
        : Promise.resolve({ todTests: [], walkthroughs: [] }),
      wants('icofr')
        ? listIcofrData(institutionId)
        : Promise.resolve({ financialAccounts: [], ipeRegisters: [] }),
      wants('controls')
        ? listControls(institutionId)
        : Promise.resolve([]),
      wants('toe')
        ? listToeTests(institutionId)
        : Promise.resolve([]),
      wants('remediation')
        ? listRemediationData(institutionId)
        : Promise.resolve({ issues: [], maps: [], retests: [] }),
      wants('certification')
        ? listCertificationData(institutionId)
        : Promise.resolve({ certifications: [], attestations: [] }),
      wants('tasks')
        ? listTasksData(institutionId)
        : Promise.resolve([])
    ]);

    const scopedOrganization = organization
      ? scopeOrganizationData(organization, authorizedOrgUnitIds, auth.user.id)
      : null;

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
    const scopedCertifications = certification.certifications.filter(certificationRow =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (((certificationRow.control as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId) as string | null | undefined
      )
    );
    const scopedAttestations = certification.attestations.filter(attestation =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (attestation as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );
    const scopedTasks = tasks.filter(task =>
      isOrgUnitAuthorized(
        authorizedOrgUnitIds,
        (task as Record<string, unknown>).orgUnitId as string | null | undefined
      )
    );

    return NextResponse.json({
      institution: institution
        ? scopedOrganization
          ? {
              ...institution,
              legalEntities: scopedOrganization.legalEntities,
              organizationUnits: scopedOrganization.organizationUnits,
              users: scopedOrganization.users
            }
          : institution
        : null,
      campaigns,
      todTests: scopedTodTests,
      walkthroughs: scopedWalkthroughs,
      financialAccounts: scopedFinancialAccounts,
      ipeRegisters: scopedIpe,
      certifications: scopedCertifications,
      attestations: scopedAttestations,
      tasks: scopedTasks,
      controls: scopedControls,
      toeTests: scopedToe,
      actionPlans: scopedMaps,
      retests: scopedRetests,
      organizationScope: {
        mode: auth.user.orgAccessScope,
        orgUnitId: auth.user.orgUnitId,
        authorizedUnitCount:
          authorizedOrgUnitIds === null
            ? scopedOrganization?.organizationUnits.length || 0
            : authorizedOrgUnitIds.length
      },
      loadedModules: Array.from(selection.modules),
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load persistent assurance data:', error);
    return NextResponse.json(
      { error: 'Persistent D1 database is not available yet.' },
      { status: 503 }
    );
  } finally {
    recordApiPerformance(
      'GET /api/assurance',
      startedAt,
      selection.focused ? 'focused-read' : 'aggregate-read'
    );
  }
}
