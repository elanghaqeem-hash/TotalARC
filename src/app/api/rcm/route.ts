import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireApiUser } from '@/lib/api';
import { deriveControlHealth } from '@/lib/control-health';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const mappings = await prisma.controlRiskMapping.findMany({
      where: { control: { institutionId: user.institutionId } },
      include: {
        risk: { include: { process: { include: { category: true, objectives: true } }, activity: true } },
        control: {
          include: {
            todTests: { where: { status: 'Approved' }, orderBy: { testedAt: 'desc' }, take: 1 },
            toeTests: { where: { status: 'Reviewed' }, orderBy: { testedAt: 'desc' }, take: 1, include: { exceptions: true } },
            issues: {
              orderBy: { createdAt: 'desc' },
              include: {
                actionPlans: {
                  orderBy: { createdAt: 'desc' },
                  include: { retests: { orderBy: { retestedAt: 'desc' } } }
                }
              }
            },
            monitoringRules: { orderBy: { createdAt: 'desc' } },
            csaResponses: { orderBy: { assessedAt: 'desc' }, take: 1 }
          }
        }
      }
    });

    const rcmRows = mappings.map((m, idx) => {
      const risk = m.risk;
      const control = m.control;
      const process = risk.process;
      const toe = control.toeTests[0];
      const tod = control.todTests[0];
      const issue = control.issues.find(i => i.status !== 'Closed') || control.issues[0];
      const map = issue?.actionPlans?.[0];
      const retest = map?.retests?.[0];
      const controlHealth = deriveControlHealth(control);
      return {
        id: m.id,
        rowNumber: idx + 1,
        processId: process.processId,
        processName: process.name,
        processCategory: process.category?.name || null,
        activityName: risk.activity?.name || null,
        processObjective: process.objectives?.[0]?.objective || null,
        riskId: risk.riskId,
        riskName: risk.name,
        riskCause: risk.cause,
        riskEvent: risk.event,
        riskImpact: risk.impact,
        riskCategory: risk.category,
        inherentScore: risk.inherentScore,
        inherentRating: risk.inherentRating,
        residualScore: risk.residualScore,
        residualRating: risk.residualRating,
        controlId: control.controlId,
        controlName: control.name,
        controlDescription: control.description,
        controlObjective: control.objective,
        controlOwner: control.controlOwner,
        controlType: control.type,
        controlNature: control.nature,
        controlFrequency: control.frequency,
        evidenceRequirement: control.evidenceRequirement,
        isKeyControl: control.isKeyControl,
        isIcofrKey: control.isIcofrKey,
        csaStatus: control.csaResponses[0]?.csaConclusion || 'Not Assessed',
        todConclusion: tod?.conclusion || 'Not Assessed',
        toeConclusion: toe?.finalConclusion || 'Not Tested',
        toePassRatio: toe ? `${toe.passCount}/${toe.sampleSize} Pass` : null,
        controlHealth,
        issueId: issue?.issueId || null,
        issueTitle: issue?.title || null,
        issueSeverity: issue?.severity || null,
        issueStatus: issue?.status || null,
        mapId: map?.mapId || null,
        mapAgreedAction: map?.agreedAction || null,
        mapStatus: map?.status || null,
        mapProgress: map ? `${map.progressPercent}%` : null,
        retestResult: retest?.result || null
      };
    });

    return NextResponse.json({ rcm: rcmRows, total: rcmRows.length });
  } catch (error) {
    return apiError(error);
  }
}
