import { NextResponse } from 'next/server';
import { getOrganizationStructure } from '@/lib/d1-organization';
import { listDesignAssessments } from '@/lib/d1-icofr-traceability';
import { listPbcTasks } from '@/lib/d1-icofr-executive-reporting';
import { listToeTests, listRemediationData, listMonitoringRules } from '@/lib/d1-assurance';
import { getCertificationData } from '@/lib/d1-icofr-certification';
import { listFinancialItems, listInformationRegister } from '@/lib/d1-icofr-domains';
import { getTestingPlanData } from '@/lib/d1-icofr-testing-plan';
import { getCurrentSecurityContext } from '@/lib/tenant-context';
import type { PermissionKey } from '@/lib/security-model';
import {
  addAssessmentScope,
  createAssessmentCampaign,
  getRcsaWorkspaceData,
  reviewAssessmentResponse,
  submitAssessmentResponse,
  updateAssessmentCampaignStatus
} from '@/lib/d1-rcsa';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const security = await getCurrentSecurityContext();
    const can = (permission: PermissionKey) => security.permissions.includes(permission);
    const [
      organization,
      todTests,
      rcsa,
      pbcTasks,
      toeTests,
      remediation,
      monitoringRules,
      certification,
      financialItems,
      informationRegister,
      testingPlan
    ] = await Promise.all([
      getOrganizationStructure(),
      listDesignAssessments(),
      getRcsaWorkspaceData(),
      listPbcTasks(),
      listToeTests(),
      listRemediationData(),
      listMonitoringRules(),
      getCertificationData(),
      listFinancialItems(),
      listInformationRegister(),
      getTestingPlanData()
    ]);

    const institution = organization.institution;
    const processById = new Map(
      (rcsa.processes || []).map((process: any) => [String(process.id), process])
    );

    const groupByControl = (items: any[], keyOf: (item: any) => unknown) => {
      const grouped = new Map<string, any[]>();
      for (const item of items || []) {
        const key = String(keyOf(item) || '');
        if (!key) continue;
        const current = grouped.get(key);
        if (current) current.push(item);
        else grouped.set(key, [item]);
      }
      return grouped;
    };

    const todByControl = groupByControl(todTests, test =>
      test.controlDomain?.sourceControlId || test.control?.id
    );
    const toeByControl = groupByControl(toeTests, test =>
      test.controlId || test.control?.id
    );
    const monitoringByControl = groupByControl(monitoringRules, rule =>
      rule.controlId || rule.control?.id
    );
    const issuesByControl = groupByControl(remediation.issues || [], issue =>
      issue.controlId || issue.control?.id
    );

    const enrichedControls = (rcsa.controls || []).map((control: any) => {
      const controlKey = String(control.id);
      const controlTodTests = todByControl.get(controlKey) || [];
      const controlToeTests = toeByControl.get(controlKey) || [];
      const controlMonitoring = monitoringByControl.get(controlKey) || [];
      const controlIssues = issuesByControl.get(controlKey) || [];

      const latestToe: any = controlToeTests[0] || null;
      const latestMonitoringRun: any =
        controlMonitoring.flatMap((rule: any) => rule.runs || [])[0] || null;
      const hasOpenIssue = controlIssues.some(
        (issue: any) => !['Closed', 'Completed', 'Cancelled'].includes(String(issue.status))
      );

      let computedHealth = String(control.overallHealth || 'Not Assessed');
      let healthBasis = 'Control Master';

      if (
        hasOpenIssue ||
        latestMonitoringRun?.status === 'Exception Detected' ||
        ['Ineffective', 'Failed'].includes(String(latestToe?.finalConclusion || ''))
      ) {
        computedHealth = 'Attention Required';
        healthBasis = hasOpenIssue
          ? 'Open issue'
          : latestMonitoringRun?.status === 'Exception Detected'
            ? 'CCM exception'
            : 'Latest ToE result';
      } else if (
        computedHealth === 'Not Assessed' &&
        ['Effective', 'Partially Effective'].includes(String(latestToe?.finalConclusion || ''))
      ) {
        computedHealth = String(latestToe.finalConclusion);
        healthBasis = 'Latest ToE result';
      }

      return {
        ...control,
        process: processById.get(String(control.processId)) || null,
        todTests: controlTodTests,
        toeTests: controlToeTests,
        monitoringRules: controlMonitoring,
        issues: controlIssues,
        computedHealth,
        healthBasis
      };
    });

    const remediationTasks = (remediation.maps || [])
      .filter((map: any) => !['Closed', 'Completed', 'Cancelled'].includes(String(map.status)))
      .map((map: any) => ({
        id: 'map-' + String(map.id),
        type: 'Remediation MAP',
        title:
          String(map.mapId || 'MAP') +
          ' · ' +
          String(map.issue?.title || map.agreedAction || 'Management action plan'),
        dueDate: map.revisedDueDate || map.originalDueDate,
        priority:
          String(map.issue?.severity || '').toLowerCase() === 'critical' ? 'Critical' : 'High',
        status: map.status,
        link: '/remediation',
        user: { name: map.actionOwner || 'Unassigned' },
        sourceId: map.id
      }));

    const testingTasks = (testingPlan.planItems || [])
      .filter((item: any) => item.derivedExecutionStatus !== 'Completed')
      .map((item: any) => ({
        id: 'test-plan-' + String(item.id),
        type: 'ICOFR ' + String(item.testType || 'Testing'),
        title:
          String(item.control?.controlCode || 'Control') +
          ' · ' +
          String(item.control?.name || 'Testing plan item'),
        dueDate: item.dueDate,
        priority: item.control?.keyControl ? 'High' : 'Medium',
        status: item.derivedExecutionStatus || item.status,
        link:
          item.testType === 'ToD'
            ? '/tod'
            : item.testType === 'ToE'
              ? '/toe'
              : '/icofr/testing-plan',
        user: { name: item.testerName || 'Unassigned' },
        sourceId: item.id
      }));

    const combinedTasks = [
      ...(rcsa.tasks || []),
      ...(can('report.view') ? pbcTasks : []),
      ...(can('remediation.view') ? remediationTasks : []),
      ...(can('icofr.view') ? testingTasks : [])
    ];

    const walkthroughs = todTests
      .filter((test: any) => Boolean(test.walkthroughComplete))
      .map((test: any) => ({
        id: 'walk-' + String(test.id),
        controlId: test.control?.controlId || test.controlDomain?.controlCode || 'Control',
        conclusion: test.conclusion,
        date: test.updatedAt || test.createdAt,
        participants: [test.testerName, test.reviewerName].filter(Boolean).join(' / '),
        observations: test.notes || 'Walkthrough completed; no separate observation note recorded.',
        process: test.process || null
      }));

    return NextResponse.json({
      institution: institution
        ? {
            ...institution,
            legalEntities: organization.legalEntities,
            organizationUnits: organization.organizationUnits,
            users: can('user.view') ? organization.users : []
          }
        : null,
      campaigns: rcsa.campaigns,
      processes: rcsa.processes,
      risks: rcsa.risks,
      controls: enrichedControls,
      tasks: combinedTasks,
      todTests: can('icofr.view') ? todTests : [],
      walkthroughs: can('icofr.view') ? walkthroughs : [],
      financialAccounts: can('icofr.view') ? financialItems.records || [] : [],
      ipeRegisters: can('icofr.view') ? informationRegister.records || [] : [],
      certifications: can('certification.view') ? certification.subCertifications || [] : [],
      attestations: can('certification.view') ? certification.attestations || [] : [],
      evidencePacks: can('certification.view') ? certification.evidencePacks || [] : [],
      toeTests: can('icofr.view') ? toeTests : [],
      actionPlans: can('remediation.view') ? remediation.maps || [] : [],
      issues: can('remediation.view') ? remediation.issues || [] : [],
      deficiencies: can('remediation.view') ? remediation.deficiencies || [] : [],
      retests: can('remediation.view') ? remediation.retests || [] : [],
      monitoringRules: can('ccm.view') ? monitoringRules : [],
      testingCycles: can('icofr.view') ? testingPlan.cycles || [] : [],
      testingPlanItems: can('icofr.view') ? testingPlan.planItems || [] : [],
      testingPlanMetrics: can('icofr.view') ? testingPlan.metrics || {} : {},
      storage: 'cloudflare-d1'
    }, {
      headers: {
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=45'
      }
    });
  } catch (error) {
    console.error('Failed to load persistent assurance data:', error);
    return NextResponse.json(
      { error: 'Persistent D1 database is not available yet.' },
      { status: 503 }
    );
  }
}

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

export async function POST(request: Request) {
  try {
    const security = await getCurrentSecurityContext();
    const requirePermission = (permission: PermissionKey) => {
      if (!security.permissions.includes(permission)) throw new Error('ACCESS_DENIED');
    };
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');

    if (actionType === 'CREATE_CAMPAIGN') {
      requirePermission('rcsa.review');
      const name = textValue(body, 'name');
      const type = textValue(body, 'type');
      const period = textValue(body, 'period');
      const frequency = textValue(body, 'frequency');
      const startDate = textValue(body, 'startDate');
      const dueDate = textValue(body, 'dueDate');
      const ownerName = textValue(body, 'ownerName');
      const reviewerName = textValue(body, 'reviewerName');
      const approverName = textValue(body, 'approverName');
      const methodology = textValue(body, 'methodology');
      const ratingScale = textValue(body, 'ratingScale');
      const status = textValue(body, 'status');
      const processId = textValue(body, 'processId');
      const assessorName = textValue(body, 'assessorName');

      if (
        !name ||
        !type ||
        !period ||
        !frequency ||
        !startDate ||
        !dueDate ||
        !ownerName ||
        !reviewerName ||
        !approverName
      ) {
        return NextResponse.json(
          {
            error:
              'name, type, period, frequency, startDate, dueDate, ownerName, reviewerName, and approverName are required.'
          },
          { status: 400 }
        );
      }

      const campaign = await createAssessmentCampaign({
        campaignCode: textValue(body, 'campaignCode') || null,
        name,
        type,
        period,
        frequency,
        startDate,
        dueDate,
        ownerName,
        reviewerName: security.displayName,
        approverName,
        methodology: methodology || 'COSO / ISO 31000 aligned',
        ratingScale: ratingScale || '5x5',
        evidenceRequired: body.evidenceRequired !== false,
        instructions: textValue(body, 'instructions') || null,
        status: status || 'Draft',
        initialScope:
          processId && assessorName
            ? {
                processId,
                riskId: textValue(body, 'riskId') || null,
                controlId: textValue(body, 'controlId') || null,
                assessorName: security.displayName,
                dueDate: textValue(body, 'scopeDueDate') || dueDate
              }
            : null
      });
      return NextResponse.json(campaign, { status: 201 });
    }

    if (actionType === 'ADD_SCOPE') {
      requirePermission('rcsa.review');
      const campaignId = textValue(body, 'campaignId');
      const processId = textValue(body, 'processId');
      const assessorName = textValue(body, 'assessorName');

      if (!campaignId || !processId || !assessorName) {
        return NextResponse.json(
          { error: 'campaignId, processId, and assessorName are required.' },
          { status: 400 }
        );
      }

      const scope = await addAssessmentScope({
        campaignId,
        processId,
        riskId: textValue(body, 'riskId') || null,
        controlId: textValue(body, 'controlId') || null,
        assessorName,
        dueDate: textValue(body, 'dueDate') || null
      });
      return NextResponse.json(scope, { status: 201 });
    }

    if (actionType === 'SUBMIT_ASSESSMENT') {
      requirePermission('rcsa.assess');
      const scopeId = textValue(body, 'scopeId');
      const assessorName = textValue(body, 'assessorName');
      const designEffectiveness = textValue(body, 'designEffectiveness');
      const operatingEffectiveness = textValue(body, 'operatingEffectiveness');
      const evidenceQuality = textValue(body, 'evidenceQuality');
      const csaConclusion = textValue(body, 'csaConclusion');
      const confidenceLevel = textValue(body, 'confidenceLevel');
      const residualLikelihood = Number(body.residualLikelihood);
      const residualImpact = Number(body.residualImpact);

      if (
        !scopeId ||
        !assessorName ||
        !designEffectiveness ||
        !operatingEffectiveness ||
        !evidenceQuality ||
        !csaConclusion ||
        !confidenceLevel ||
        !Number.isInteger(residualLikelihood) ||
        !Number.isInteger(residualImpact)
      ) {
        return NextResponse.json(
          {
            error:
              'scopeId, assessorName, effectiveness ratings, evidenceQuality, conclusion, confidenceLevel, and integer residual ratings are required.'
          },
          { status: 400 }
        );
      }

      const response = await submitAssessmentResponse({
        scopeId,
        assessorName,
        designEffectiveness,
        operatingEffectiveness,
        evidenceQuality,
        residualLikelihood,
        residualImpact,
        csaConclusion,
        confidenceLevel,
        controlPerformed: body.controlPerformed !== false,
        exceptionIdentified: body.exceptionIdentified === true,
        evidenceRef: textValue(body, 'evidenceRef') || null,
        comments: textValue(body, 'comments') || null,
        actionRequired: body.actionRequired === true,
        actionOwner: textValue(body, 'actionOwner') || null,
        actionDueDate: textValue(body, 'actionDueDate') || null
      });
      return NextResponse.json(response, { status: 201 });
    }

    if (actionType === 'REVIEW_ASSESSMENT') {
      requirePermission('rcsa.review');
      const responseId = textValue(body, 'responseId');
      const reviewerName = textValue(body, 'reviewerName');
      const reviewStatus = textValue(body, 'reviewStatus');

      if (!responseId || !reviewerName || !reviewStatus) {
        return NextResponse.json(
          { error: 'responseId, reviewerName, and reviewStatus are required.' },
          { status: 400 }
        );
      }

      const response = await reviewAssessmentResponse({
        responseId,
        reviewerName,
        reviewStatus,
        reviewNotes: textValue(body, 'reviewNotes') || null
      });
      return NextResponse.json(response);
    }

    if (actionType === 'UPDATE_CAMPAIGN_STATUS') {
      requirePermission('rcsa.approve');
      const campaignId = textValue(body, 'campaignId');
      const status = textValue(body, 'status');
      if (!campaignId || !status) {
        return NextResponse.json(
          { error: 'campaignId and status are required.' },
          { status: 400 }
        );
      }

      const campaign = await updateAssessmentCampaignStatus({ campaignId, status });
      return NextResponse.json(campaign);
    }

    return NextResponse.json({ error: 'Unsupported assurance action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ACCESS_DENIED') {
      return NextResponse.json({ error: 'Your role is not authorized for this assurance action.' }, { status: 403 });
    }
    if (code === 'UNIT_SCOPE_ACCESS_DENIED') {
      return NextResponse.json({ error: 'The selected record is outside your assigned organizational-unit scope.' }, { status: 403 });
    }
    const notFound: Record<string, string> = {
      CAMPAIGN_NOT_FOUND: 'Assessment campaign not found.',
      ASSESSMENT_SCOPE_NOT_FOUND: 'Assessment scope not found.',
      ASSESSMENT_RESPONSE_NOT_FOUND: 'Assessment response not found.',
      PROCESS_NOT_FOUND: 'Business process not found.',
      RISK_NOT_FOUND: 'Risk not found.',
      CONTROL_NOT_FOUND: 'Control not found.'
    };
    if (notFound[code]) {
      return NextResponse.json({ error: notFound[code] }, { status: 404 });
    }

    const conflicts: Record<string, string> = {
      CAMPAIGN_CODE_CONFLICT: 'Campaign code already exists.',
      ASSESSMENT_SCOPE_CONFLICT: 'The same process/risk/control is already in this campaign.',
      CAMPAIGN_CLOSED: 'This campaign is closed and cannot be changed.'
    };
    if (conflicts[code]) {
      return NextResponse.json({ error: conflicts[code] }, { status: 409 });
    }

    const badRequest: Record<string, string> = {
      INVALID_CAMPAIGN_DATES: 'Campaign due date must be on or after the start date.',
      RISK_PROCESS_MISMATCH: 'Selected risk does not belong to the selected process.',
      CONTROL_PROCESS_MISMATCH: 'Selected control does not belong to the selected process.',
      EVIDENCE_REQUIRED: 'Evidence reference is required by this campaign.',
      ACTION_FIELDS_REQUIRED: 'Action owner and action due date are required when remediation is needed.',
      INVALID_RESIDUAL_RATING: 'Residual likelihood and impact must be integer values from 1 to 5.'
    };
    if (badRequest[code]) {
      return NextResponse.json({ error: badRequest[code] }, { status: 400 });
    }

    console.error('Failed to persist assurance action:', error);
    return NextResponse.json(
      { error: 'Failed to process assurance action in persistent database.' },
      { status: 500 }
    );
  }
}