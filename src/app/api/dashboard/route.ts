import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [processes, risks, controls, toeTests, issues, maps, rules, retests, recentAuditLogs] = await Promise.all([
      prisma.businessProcess.findMany(),
      prisma.riskMaster.findMany({ include: { controls: true } }),
      prisma.controlMaster.findMany({ include: { toeTests: true } }),
      prisma.toETest.findMany({ include: { exceptions: true } }),
      prisma.issue.findMany(),
      prisma.managementActionPlan.findMany(),
      prisma.monitoringRule.findMany(),
      prisma.retestRecord.findMany(),
      prisma.auditLog.findMany({ take: 8, orderBy: { timestamp: 'desc' } })
    ]);

    const highCritical = risks.filter((risk) => risk.inherentRating === 'High' || risk.inherentRating === 'Critical');
    const mappedHighCritical = highCritical.filter((risk) => risk.controls.length > 0);
    const keyControls = controls.filter((control) => control.isKeyControl);
    const testedKeyControls = keyControls.filter((control) => control.toeTests.length > 0);

    const metrics = {
      totalProcesses: processes.length,
      criticalProcesses: typedProcesses.filter((process) => process.criticality === 'Critical').length,
      totalRisks: risks.length,
      criticalRisks: typedRisks.filter((risk) => risk.inherentRating === 'Critical').length,
      highRisks: typedRisks.filter((risk) => risk.inherentRating === 'High').length,
      totalControls: controls.length,
      keyControls: keyControls.length,
      failedToEs: typedToETests.filter((test) => test.failCount > 0 || ['Partially Effective', 'Ineffective'].includes(test.finalConclusion)).length,
      totalExceptions: typedToETests.reduce((sum, test) => sum + test.exceptions.length, 0),
      openIssues: typedIssues.filter((issue) => issue.status !== 'Closed').length,
      closedIssues: typedIssues.filter((issue) => issue.status === 'Closed').length,
      overdueMAP: typedMaps.filter((map) => map.status === 'Overdue').length,
      completedMAP: typedMaps.filter((map) => ['Completed by Owner', 'Closed'].includes(map.status)).length,
      ccmHealthy: typedRules.filter((rule) => rule.lastStatus === 'Healthy').length,
      totalRetests: retests.length
    };

    const executiveQandA = [
      {
        question: 'Are High/Critical risks mapped to controls?',
        status: highCritical.length ? `${mappedHighCritical.length}/${highCritical.length} mapped` : 'No rated risks',
        summary: highCritical.length
          ? `${mappedHighCritical.length} of ${highCritical.length} High/Critical risks have at least one persisted control mapping.`
          : 'No High/Critical risks are currently registered.',
        badge: 'Database'
      },
      {
        question: 'Have key controls been tested?',
        status: keyControls.length ? `${testedKeyControls.length}/${keyControls.length} tested` : 'No key controls',
        summary: keyControls.length
          ? `${testedKeyControls.length} of ${keyControls.length} key controls have at least one persisted ToE record.`
          : 'No key controls are currently registered.',
        badge: 'Database'
      },
      {
        question: 'How many issues remain open?',
        status: `${metrics.openIssues} open`,
        summary: `${metrics.closedIssues} issues are closed and ${metrics.openIssues} remain open.`,
        badge: 'Database'
      },
      {
        question: 'Which remediation actions are overdue?',
        status: `${metrics.overdueMAP} overdue`,
        summary: `${metrics.overdueMAP} Management Action Plans are currently marked overdue.`,
        badge: 'Database'
      }
    ];

    return NextResponse.json({ metrics, executiveQandA, recentAuditLogs });
  } catch (error) {
    console.error('Failed to fetch dashboard metrics:', error);
    return NextResponse.json({ error: 'Failed to load dashboard data' }, { status: 500 });
  }
}
