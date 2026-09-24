import { NextResponse } from 'next/server';
import { getCoreDashboardData } from '@/lib/d1-core';
import { getAssuranceDashboardMetrics } from '@/lib/d1-assurance';
import { resolveInstitutionAccess } from '@/lib/institution-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context?.institution) {
      return NextResponse.json(
        { error: 'Active institution is required.' },
        { status: context ? 409 : 401 }
      );
    }
    const institutionId = context.institution.id;
    const [core, assurance] = await Promise.all([
      getCoreDashboardData(institutionId),
      getAssuranceDashboardMetrics(institutionId)
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
