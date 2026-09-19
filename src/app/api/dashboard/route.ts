import { NextResponse } from 'next/server';
import {
  getCoreDashboardData,
  listBusinessProcesses,
  listControls,
  listRisks
} from '@/lib/d1-core';
import {
  getAssuranceDashboardMetrics,
  listMonitoringRules,
  listRemediationData,
  listToeTests
} from '@/lib/d1-assurance';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (authorizedOrgUnitIds !== null) {
      const [
        processData,
        risks,
        controls,
        toeTests,
        remediation,
        monitoringRules
      ] = await Promise.all([
        listBusinessProcesses(auth.user.institutionId),
        listRisks(auth.user.institutionId),
        listControls(auth.user.institutionId),
        listToeTests(auth.user.institutionId),
        listRemediationData(auth.user.institutionId),
        listMonitoringRules(auth.user.institutionId)
      ]);

      const allowed = (orgUnitId: unknown) =>
        isOrgUnitAuthorized(
          authorizedOrgUnitIds,
          typeof orgUnitId === 'string' ? orgUnitId : null
        );

      const scopedProcesses = processData.processes.filter(process => allowed(process.orgUnitId));
      const scopedRisks = risks.filter(risk =>
        allowed((risk.process as Record<string, unknown> | null)?.orgUnitId)
      );
      const scopedControls = controls.filter(control =>
        allowed((control.process as Record<string, unknown> | null)?.orgUnitId)
      );
      const scopedToeTests = toeTests.filter(test =>
        allowed((test.process as Record<string, unknown> | null)?.orgUnitId)
      );
      const scopedIssues = remediation.issues.filter(issue =>
        allowed((issue.process as Record<string, unknown> | null)?.orgUnitId)
      );
      const scopedMaps = remediation.maps.filter(map =>
        allowed(
          ((map.issue as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId
        )
      );
      const scopedRetests = remediation.retests.filter(retest =>
        allowed((retest.process as Record<string, unknown> | null)?.orgUnitId)
      );
      const scopedRules = monitoringRules.filter(rule =>
        allowed(
          ((rule.control as Record<string, unknown> | null)?.process as Record<string, unknown> | null)?.orgUnitId
        )
      );

      const highCriticalRisks = scopedRisks.filter(risk =>
        ['High', 'Critical'].includes(String(risk.inherentRating || ''))
      );
      const mappedHighCritical = highCriticalRisks.filter(
        risk => Array.isArray(risk.controls) && risk.controls.length > 0
      ).length;
      const keyControls = scopedControls.filter(control => Boolean(control.isKeyControl));
      const testedKeyControlIds = new Set(
        scopedToeTests
          .filter(test => keyControls.some(control => control.id === test.controlId))
          .map(test => String(test.controlId))
      );

      const assurance = {
        failedToEs: scopedToeTests.filter(
          test =>
            Number(test.failCount || 0) > 0
            || ['Partially Effective', 'Ineffective'].includes(String(test.finalConclusion || ''))
        ).length,
        totalExceptions: scopedToeTests.reduce(
          (sum, test) => sum + (Array.isArray(test.exceptions) ? test.exceptions.length : 0),
          0
        ),
        openIssues: scopedIssues.filter(issue => issue.status !== 'Closed').length,
        closedIssues: scopedIssues.filter(issue => issue.status === 'Closed').length,
        overdueMAP: scopedMaps.filter(map => map.status === 'Overdue').length,
        completedMAP: scopedMaps.filter(map =>
          ['Completed by Owner', 'Closed'].includes(String(map.status || ''))
        ).length,
        ccmHealthy: scopedRules.filter(rule => rule.lastStatus === 'Healthy').length,
        totalRetests: scopedRetests.length,
        testedKeyControls: testedKeyControlIds.size
      };

      const metrics = {
        totalProcesses: scopedProcesses.length,
        criticalProcesses: scopedProcesses.filter(process => process.criticality === 'Critical').length,
        totalRisks: scopedRisks.length,
        criticalRisks: scopedRisks.filter(risk => risk.inherentRating === 'Critical').length,
        highRisks: scopedRisks.filter(risk => risk.inherentRating === 'High').length,
        totalControls: scopedControls.length,
        keyControls: keyControls.length,
        ...assurance
      };

      const highCritical = highCriticalRisks.length;
      const executiveQandA = [
        {
          question: 'Are High/Critical risks mapped to controls?',
          status: highCritical ? `${mappedHighCritical}/${highCritical} mapped` : 'No rated risks',
          summary: highCritical
            ? `${mappedHighCritical} of ${highCritical} High/Critical risks in your organization scope have at least one persisted control mapping.`
            : 'No High/Critical risks are currently registered in your organization scope.',
          badge: 'Organization scoped'
        },
        {
          question: 'Have key controls been tested?',
          status: metrics.keyControls
            ? `${assurance.testedKeyControls}/${metrics.keyControls} tested`
            : 'No key controls',
          summary: metrics.keyControls
            ? `${assurance.testedKeyControls} of ${metrics.keyControls} key controls in your organization scope have at least one persisted ToE record.`
            : 'No key controls are currently registered in your organization scope.',
          badge: 'Organization scoped'
        },
        {
          question: 'How many issues remain open?',
          status: `${assurance.openIssues} open`,
          summary: `${assurance.closedIssues} issues are closed and ${assurance.openIssues} remain open in your organization scope.`,
          badge: 'Organization scoped'
        },
        {
          question: 'Which remediation actions are overdue?',
          status: `${assurance.overdueMAP} overdue`,
          summary: `${assurance.overdueMAP} Management Action Plans are overdue in your organization scope.`,
          badge: 'Organization scoped'
        }
      ];

      return NextResponse.json({
        metrics,
        executiveQandA,
        recentAuditLogs: [],
        storage: 'cloudflare-d1',
        persistenceScope: 'organization-scoped-bpm-risk-control-assurance-remediation-ccm',
        organizationScope: {
          mode: auth.user.orgAccessScope,
          orgUnitId: auth.user.orgUnitId,
          authorizedUnitCount: authorizedOrgUnitIds.length
        }
      });
    }

    const [core, assurance] = await Promise.all([
      getCoreDashboardData(auth.user.institutionId),
      getAssuranceDashboardMetrics(auth.user.institutionId)
    ]);

    const metrics = {
      ...core.metrics,
      ...assurance
    };

    const riskCoverage = core.executiveQandA[0];
    const executiveQandA = [
      riskCoverage,
      {
        question: 'Have key controls been tested?',
        status: metrics.keyControls
          ? `${assurance.testedKeyControls}/${metrics.keyControls} tested`
          : 'No key controls',
        summary: metrics.keyControls
          ? `${assurance.testedKeyControls} of ${metrics.keyControls} persisted key controls have at least one persisted ToE record.`
          : 'No key controls are currently registered.',
        badge: 'Cloudflare D1'
      },
      {
        question: 'How many issues remain open?',
        status: `${assurance.openIssues} open`,
        summary: `${assurance.closedIssues} persisted issues are closed and ${assurance.openIssues} remain open.`,
        badge: 'Cloudflare D1'
      },
      {
        question: 'Which remediation actions are overdue?',
        status: `${assurance.overdueMAP} overdue`,
        summary: `${assurance.overdueMAP} persisted Management Action Plans are marked overdue.`,
        badge: 'Cloudflare D1'
      }
    ];

    return NextResponse.json({
      ...core,
      metrics,
      executiveQandA,
      persistenceScope: 'bpm-risk-control-assurance-remediation-ccm'
    });
  } catch (error) {
    console.error('Failed to fetch D1 dashboard metrics:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard data from persistent database.' },
      { status: 503 }
    );
  }
}
