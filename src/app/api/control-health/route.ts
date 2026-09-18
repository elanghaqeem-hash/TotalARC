import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireApiUser } from '@/lib/api';
import { deriveControlHealth, deriveDesignAssessment, deriveOperatingStatus } from '@/lib/control-health';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const controls = await prisma.controlMaster.findMany({
      where: { institutionId: user.institutionId },
      include: {
        process: { select: { processId: true, name: true } },
        todTests: { where: { status: 'Approved' }, orderBy: { testedAt: 'desc' }, take: 1 },
        toeTests: { where: { status: 'Reviewed' }, orderBy: { testedAt: 'desc' }, take: 1, include: { exceptions: true } },
        issues: { where: { status: { not: 'Closed' } }, orderBy: { createdAt: 'desc' } },
        monitoringRules: { include: { runs: { orderBy: { runTimestamp: 'desc' }, take: 1 } } },
        certifications: { orderBy: { certifiedAt: 'desc' }, take: 1 }
      },
      orderBy: { controlId: 'asc' }
    });

    const rows = controls.map(control => {
      const tod = control.todTests[0] || null;
      const toe = control.toeTests[0] || null;
      const derivedHealth = deriveControlHealth(control);

      return {
        id: control.id,
        controlId: control.controlId,
        name: control.name,
        owner: control.controlOwner,
        process: control.process,
        isKeyControl: control.isKeyControl,
        designAssessment: deriveDesignAssessment(control),
        operatingStatus: deriveOperatingStatus(control),
        derivedHealth,
        tod: tod ? { conclusion: tod.conclusion, testedAt: tod.testedAt, status: tod.status } : null,
        toe: toe ? { conclusion: toe.finalConclusion, testedAt: toe.testedAt, passCount: toe.passCount, failCount: toe.failCount, sampleSize: toe.sampleSize } : null,
        openIssues: control.issues.map(i => ({ id: i.id, issueId: i.issueId, severity: i.severity, title: i.title, status: i.status })),
        ccm: control.monitoringRules.map(rule => ({
          ruleId: rule.ruleId,
          name: rule.name,
          lastStatus: rule.lastStatus,
          lastRunDate: rule.lastRunDate,
          lastRun: rule.runs[0] || null
        })),
        certification: control.certifications[0] || null
      };
    });

    const metrics = {
      total: rows.length,
      healthy: rows.filter(r => r.derivedHealth === 'Healthy').length,
      attention: rows.filter(r => r.derivedHealth === 'Attention Required').length,
      deficient: rows.filter(r => r.derivedHealth === 'Deficient').length,
      notAssessed: rows.filter(r => r.derivedHealth === 'Not Assessed').length
    };

    return NextResponse.json({ metrics, controls: rows });
  } catch (error) {
    return apiError(error);
  }
}
