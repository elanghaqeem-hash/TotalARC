import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Dynamically query Process + Risk + Control mappings + Assessment + Testing + Issues + MAP
    const mappings = await prisma.controlRiskMapping.findMany({
      include: {
        risk: {
          include: {
            process: {
              include: {
                category: true,
                objectives: true
              }
            },
            activity: true
          }
        },
        control: {
          include: {
            todTests: true,
            toeTests: {
              include: {
                exceptions: true
              }
            },
            issues: {
              include: {
                actionPlans: {
                  include: {
                    retests: true
                  }
                }
              }
            },
            csaResponses: true
          }
        }
      }
    });

    const rcmRows = mappings.map((m, idx) => {
      const risk = m.risk;
      const control = m.control;
      const process = risk.process;
      const objective = process.objectives?.[0]?.objective || 'Process integrity and financial assurance';
      const toe = control.toeTests?.[0];
      const tod = control.todTests?.[0];
      const issue = control.issues?.[0];
      const map = issue?.actionPlans?.[0];
      const retest = map?.retests?.[0];

      return {
        id: m.id,
        rowNumber: idx + 1,
        // Process
        processId: process.processId,
        processName: process.name,
        processCategory: process.category?.name || 'General',
        activityName: risk.activity?.name || 'All Activities',
        processObjective: objective,

        // Risk
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

        // Control
        controlId: control.controlId,
        controlName: control.name,
        controlDescription: control.description,
        controlObjective: control.objective,
        controlOwner: control.controlOwner,
        controlType: control.type,
        controlNature: control.nature,
        controlFrequency: control.frequency,
        evidenceRequirement: control.evidenceRequirement || 'Standard Audit Log',
        isKeyControl: control.isKeyControl,
        isIcofrKey: control.isIcofrKey,

        // Assurance / Testing
        csaStatus: control.csaResponses?.[0]?.csaConclusion || 'Effective',
        todConclusion: tod?.conclusion || 'Effective Design',
        toeConclusion: toe?.finalConclusion || 'Effective',
        toePassRatio: toe ? `${toe.passCount}/${toe.sampleSize} Pass` : 'Not Tested',
        controlHealth: control.overallHealth,

        // Remediation & Action Plan
        issueId: issue?.issueId || null,
        issueTitle: issue?.title || null,
        issueSeverity: issue?.severity || null,
        issueStatus: issue?.status || 'No Issue',
        mapId: map?.mapId || null,
        mapAgreedAction: map?.agreedAction || null,
        mapStatus: map?.status || null,
        mapProgress: map ? `${map.progressPercent}%` : null,
        retestResult: retest?.result || null
      };
    });

    return NextResponse.json({ rcm: rcmRows, total: rcmRows.length });
  } catch (error) {
    console.error('Failed to generate dynamic RCM:', error);
    return NextResponse.json({ error: 'Failed to generate dynamic RCM' }, { status: 500 });
  }
}
