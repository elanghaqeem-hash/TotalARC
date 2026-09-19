import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireApiUser } from '@/lib/api';
import { deriveControlHealth } from '@/lib/control-health';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const institutionId = user.institutionId;
    const now = new Date();

    const [processes, risks, controls, toeTests, issues, maps, ccmRules, retests, recentAuditLogs] = await Promise.all([
      prisma.businessProcess.findMany({ where: { institutionId }, select: { id: true, criticality: true } }),
      prisma.riskMaster.findMany({
        where: { institutionId },
        include: { controls: { include: { control: { select: { id: true, isKeyControl: true } } } } }
      }),
      prisma.controlMaster.findMany({
        where: { institutionId },
        include: {
          todTests: { where: { status: 'Approved' }, orderBy: { testedAt: 'desc' }, take: 1 },
          toeTests: { where: { status: 'Reviewed' }, orderBy: { testedAt: 'desc' }, take: 1 },
          issues: { orderBy: { createdAt: 'desc' } },
          monitoringRules: { orderBy: { createdAt: 'desc' } }
        }
      }),
      prisma.toETest.findMany({ where: { process: { institutionId } }, include: { exceptions: true } }),
      prisma.issue.findMany({ where: { institutionId }, include: { process: { select: { name: true } } } }),
      prisma.managementActionPlan.findMany({ where: { issue: { institutionId } } }),
      prisma.monitoringRule.findMany({ where: { control: { institutionId } }, include: { runs: { take: 1, orderBy: { runTimestamp: 'desc' } } } }),
      prisma.retestRecord.findMany({ where: { map: { issue: { institutionId } } } }),
      prisma.auditLog.findMany({ where: { institutionId }, take: 8, orderBy: { timestamp: 'desc' } })
    ]);

    const highCritical = risks.filter(r => ['High','Critical'].includes(r.inherentRating));
    const coveredHighCritical = highCritical.filter(r => r.controls.some(m => m.control.isKeyControl));
    const controlsWithHealth = controls.map(control => ({ control, health: deriveControlHealth(control) }));
    const unhealthyControls = controlsWithHealth.filter(c => c.health === 'Deficient');
    const attentionControls = controlsWithHealth.filter(c => c.health === 'Attention Required');
    const unassessedControls = controlsWithHealth.filter(c => c.health === 'Not Assessed');
    const healthyControls = controlsWithHealth.filter(c => c.health === 'Healthy');
    const openIssues = issues.filter(i => i.status !== 'Closed');
    const overdueMaps = maps.filter(m => !['Closed','Completed'].includes(m.status) && (m.revisedDueDate || m.originalDueDate) < now);
    const totalSamples = toeTests.reduce((n, t) => n + t.sampleSize, 0);
    const passedSamples = toeTests.reduce((n, t) => n + t.passCount, 0);
    const totalExceptions = toeTests.reduce((n, t) => n + t.exceptions.length, 0);
    const healthyRules = ccmRules.filter(r => r.lastStatus === 'Healthy').length;

    const coveragePercent = highCritical.length ? Math.round((coveredHighCritical.length / highCritical.length) * 100) : null;
    const controlTested = controls.length - unassessedControls.length;
    const controlWorking = healthyControls.length;

    const concentration = openIssues.reduce<Record<string, number>>((acc, issue) => {
      const key = issue.process.name;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topConcentration = Object.entries(concentration).sort((a,b) => b[1] - a[1])[0];

    const executiveQandA = [
      {
        question: 'Are our High & Critical risks mapped to key controls?',
        status: coveragePercent === null ? 'No Data' : `${coveragePercent}% Covered`,
        summary: highCritical.length ? `${coveredHighCritical.length} of ${highCritical.length} High/Critical risks have at least one mapped key control.` : 'No High/Critical risks are currently registered.',
        badge: coveragePercent === 100 ? 'Covered' : 'Review'
      },
      {
        question: 'Are our registered controls assessed as working?',
        status: controls.length ? `${controlWorking}/${controls.length} Healthy` : 'No Data',
        summary: controls.length ? `${controlTested} controls have assurance evidence; ${healthyControls.length} are Healthy, ${attentionControls.length} need Attention, and ${unhealthyControls.length} are Deficient.` : 'No controls are currently registered.',
        badge: unhealthyControls.length || attentionControls.length ? 'Attention' : 'Current'
      },
      {
        question: 'Where are open control issues concentrated?',
        status: topConcentration ? topConcentration[0] : 'No Open Issues',
        summary: topConcentration ? `${topConcentration[1]} open issue(s) are associated with this process, based on current database records.` : 'No open issues are recorded.',
        badge: topConcentration ? 'Open' : 'Clear'
      },
      {
        question: 'Which remediation actions are overdue?',
        status: `${overdueMaps.length} Overdue`,
        summary: maps.length ? `${overdueMaps.length} of ${maps.length} management action plan(s) are past their effective due date and not closed.` : 'No management action plans are currently registered.',
        badge: overdueMaps.length ? 'Action' : 'Current'
      }
    ];

    return NextResponse.json({
      metrics: {
        totalProcesses: processes.length,
        criticalProcesses: processes.filter(p => p.criticality === 'Critical').length,
        totalRisks: risks.length,
        criticalRisks: risks.filter(r => r.inherentRating === 'Critical').length,
        highRisks: risks.filter(r => r.inherentRating === 'High').length,
        totalControls: controls.length,
        keyControls: controls.filter(c => c.isKeyControl).length,
        failedToEs: toeTests.filter(t => ['Ineffective','Partially Effective'].includes(t.finalConclusion)).length,
        totalExceptions,
        totalSamples,
        passedSamples,
        openIssues: openIssues.length,
        closedIssues: issues.filter(i => i.status === 'Closed').length,
        overdueMAP: overdueMaps.length,
        completedMAP: maps.filter(m => ['Closed','Completed'].includes(m.status)).length,
        ccmHealthy: healthyRules,
        ccmTotal: ccmRules.length,
        totalRetests: retests.length
      },
      executiveQandA,
      recentAuditLogs
    });
  } catch (error) {
    return apiError(error);
  }
}
