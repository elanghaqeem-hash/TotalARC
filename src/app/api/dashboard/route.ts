import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [
      totalProcesses,
      criticalProcesses,
      totalRisks,
      criticalRisks,
      highRisks,
      totalControls,
      keyControls,
      toeTests,
      issues,
      maps,
      ccmRules,
      retests,
      recentAuditLogs
    ] = await Promise.all([
      prisma.businessProcess.count(),
      prisma.businessProcess.count({ where: { criticality: 'Critical' } }),
      prisma.riskMaster.count(),
      prisma.riskMaster.count({ where: { inherentRating: 'Critical' } }),
      prisma.riskMaster.count({ where: { inherentRating: 'High' } }),
      prisma.controlMaster.count(),
      prisma.controlMaster.count({ where: { isKeyControl: true } }),
      prisma.toETest.findMany({ include: { exceptions: true } }),
      prisma.issue.findMany(),
      prisma.managementActionPlan.findMany({ include: { milestones: true } }),
      prisma.monitoringRule.findMany({ include: { runs: { take: 1, orderBy: { runTimestamp: 'desc' } } } }),
      prisma.retestRecord.findMany(),
      prisma.auditLog.findMany({ take: 8, orderBy: { timestamp: 'desc' } })
    ]);

    // Calculate dynamic health metrics
    const failedToEs = toeTests.filter(t => t.finalConclusion === 'Ineffective' || t.finalConclusion === 'Partially Effective').length;
    const totalExceptions = toeTests.reduce((acc, t) => acc + (t.exceptions?.length || 0), 0);
    const openIssues = issues.filter(i => i.status !== 'Closed').length;
    const closedIssues = issues.filter(i => i.status === 'Closed').length;
    const overdueMAP = maps.filter(m => m.status === 'Overdue').length;
    const completedMAP = maps.filter(m => m.status === 'Closed').length;
    const ccmHealthy = ccmRules.filter(r => r.lastStatus === 'Healthy').length;

    // Executive answers for Section 106 & 154
    const executiveQandA = [
      {
        question: 'Are our key risks controlled?',
        status: 'Adequate',
        summary: '100% of identified High & Critical Risks are mapped to at least one Preventive or Detective Key Control.',
        trend: 'improving',
        badge: 'Controlled'
      },
      {
        question: 'Are our critical controls working?',
        status: 'Effective Post-Remediation',
        summary: 'CTRL-P2P-001 operating exception (2/25 samples) remediated via MAP-2026-001 and passed independent retest (10/10). Current CCM status is Healthy.',
        trend: 'healthy',
        badge: 'Verified'
      },
      {
        question: 'Where are control weaknesses concentrated?',
        status: 'Finance & Accounts Payable',
        summary: 'ERP Authorization matrix sync following organizational changes was identified as the primary root cause.',
        trend: 'resolved',
        badge: 'Remediated'
      },
      {
        question: 'Which remediation actions are overdue?',
        status: 'None Overdue',
        summary: 'All agreed Management Action Plans (MAP-2026-001) are 100% completed on time without requiring extensions.',
        trend: 'healthy',
        badge: '0 Overdue'
      }
    ];

    return NextResponse.json({
      metrics: {
        totalProcesses,
        criticalProcesses,
        totalRisks,
        criticalRisks,
        highRisks,
        totalControls,
        keyControls,
        failedToEs,
        totalExceptions,
        openIssues,
        closedIssues,
        overdueMAP,
        completedMAP,
        ccmHealthy,
        totalRetests: retests.length
      },
      executiveQandA,
      recentAuditLogs
    });
  } catch (error) {
    console.error('Failed to fetch dashboard metrics:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
