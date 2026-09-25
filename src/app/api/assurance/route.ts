import { NextResponse } from 'next/server';
import { getOrganizationStructure } from '@/lib/d1-organization';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { listDesignAssessments } from '@/lib/d1-icofr-traceability';
import { listPbcTasks } from '@/lib/d1-icofr-executive-reporting';
import {
  deleteAssuranceCalendarEvent,
  listAssuranceCalendarEvents,
  listToeTests,
  listRemediationData,
  listMonitoringRules,
  saveAssuranceCalendarEvent
} from '@/lib/d1-assurance';
import { getCertificationData } from '@/lib/d1-icofr-certification';
import { listFinancialItems, listInformationRegister } from '@/lib/d1-icofr-domains';
import { getTestingPlanData } from '@/lib/d1-icofr-testing-plan';
import { listWorkpaperReviewTasks } from '@/lib/d1-icofr-workpaper-review';
import {
  addAssessmentScope,
  createAssessmentCampaign,
  getRcsaWorkspaceData,
  reviewAssessmentResponse,
  submitAssessmentResponse,
  updateAssessmentCampaignStatus
} from '@/lib/d1-rcsa';

export const dynamic = 'force-dynamic';

type ModuleIssue = {
  module: string;
  message: string;
};

async function loadModule<T>(
  name: string,
  enabled: boolean,
  loader: () => Promise<T>,
  fallback: T
): Promise<{ value: T; issue: ModuleIssue | null }> {
  if (!enabled) return { value: fallback, issue: null };

  try {
    return { value: await loader(), issue: null };
  } catch (firstError) {
    console.error(`Assurance aggregate module ${name} failed on first attempt:`, firstError);

    try {
      return { value: await loader(), issue: null };
    } catch (retryError) {
      console.error(`Assurance aggregate module ${name} failed on retry:`, retryError);
      return {
        value: fallback,
        issue: {
          module: name,
          message: 'Persistent module data could not be loaded for this response.'
        }
      };
    }
  }
}

export async function GET(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution) {
    return NextResponse.json(
      { error: 'Active institution is required.' },
      { status: context ? 409 : 401 }
    );
  }
  const institutionId = context.institution.id;
  const params = new URL(request.url).searchParams;
  const requested = new Set(
    (params.get('sections') || '')
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
  );
  const full = requested.size === 0 || requested.has('all');
  const wants = (...names: string[]) =>
    full || names.some(name => requested.has(name.toLowerCase()));

  const needOrganization = wants('organization', 'rcsa');
  const needRcsa = wants('rcsa', 'integration', 'health', 'tasks', 'calendar', 'reports');
  const needTod = wants('tod', 'integration', 'health', 'calendar', 'reports');
  const needPbc = wants('tasks', 'calendar', 'integration', 'reports');
  const needToe = wants('toe', 'integration', 'health', 'calendar', 'reports');
  const needRemediation = wants('remediation', 'integration', 'health', 'tasks', 'calendar', 'reports');
  const needCcm = wants('ccm', 'health', 'reports');
  const needCertification = wants('certification', 'calendar', 'reports');
  const needCalendar = wants('calendar');
  const needFinancial = wants('financial', 'reports');
  const needInformation = wants('information', 'reports');
  const needTesting = wants('testing', 'integration', 'tasks', 'calendar', 'reports');
  const needWorkpaperReviewTasks = wants('workpaper-review', 'tasks', 'integration', 'reports');

  const [
    organizationResult,
    todResult,
    rcsaResult,
    pbcResult,
    toeResult,
    remediationResult,
    monitoringResult,
    certificationResult,
    calendarResult,
    financialResult,
    informationResult,
    testingResult,
    workpaperReviewTaskResult
  ] = await Promise.all([
    loadModule(
      'organization',
      needOrganization,
      () => getOrganizationStructure(institutionId),
      { institution: null, legalEntities: [], organizationUnits: [], users: [] } as any
    ),
    loadModule('tod', needTod, () => listDesignAssessments(institutionId), [] as any[]),
    loadModule(
      'rcsa',
      needRcsa,
      () => getRcsaWorkspaceData(institutionId),
      { institution: null, campaigns: [], processes: [], risks: [], controls: [], tasks: [] } as any
    ),
    loadModule('pbc-tasks', needPbc, () => listPbcTasks(institutionId), [] as any[]),
    loadModule('toe', needToe, () => listToeTests(institutionId), [] as any[]),
    loadModule(
      'remediation',
      needRemediation,
      () => listRemediationData(institutionId),
      { exceptions: [], deficiencies: [], issues: [], maps: [], retests: [] } as any
    ),
    loadModule('ccm', needCcm, () => listMonitoringRules(institutionId), [] as any[]),
    loadModule(
      'certification',
      needCertification,
      () => getCertificationData(institutionId),
      { subCertifications: [], attestations: [], evidencePacks: [] } as any
    ),
    loadModule('calendar-events', needCalendar, () => listAssuranceCalendarEvents(institutionId), [] as any[]),
    loadModule('financial-items', needFinancial, () => listFinancialItems(institutionId), { records: [] } as any),
    loadModule('information-register', needInformation, () => listInformationRegister(undefined, institutionId), { records: [] } as any),
    loadModule(
      'testing-plan',
      needTesting,
      () => getTestingPlanData(institutionId),
      { cycles: [], planItems: [], metrics: {} } as any
    ),
    loadModule(
      'workpaper-review-tasks',
      needWorkpaperReviewTasks,
      () => listWorkpaperReviewTasks(institutionId),
      [] as any[]
    )
  ]);

  const organization = organizationResult.value as any;
  const todTests = todResult.value as any[];
  const rcsa = rcsaResult.value as any;
  const pbcTasks = pbcResult.value as any[];
  const toeTests = toeResult.value as any[];
  const remediation = remediationResult.value as any;
  const monitoringRules = monitoringResult.value as any[];
  const certification = certificationResult.value as any;
  const calendarEvents = calendarResult.value as any[];
  const financialItems = financialResult.value as any;
  const informationRegister = informationResult.value as any;
  const testingPlan = testingResult.value as any;
  const workpaperReviewTasks = workpaperReviewTaskResult.value as any[];

  const issues = [
    organizationResult.issue,
    todResult.issue,
    rcsaResult.issue,
    pbcResult.issue,
    toeResult.issue,
    remediationResult.issue,
    monitoringResult.issue,
    certificationResult.issue,
    calendarResult.issue,
    financialResult.issue,
    informationResult.issue,
    testingResult.issue,
    workpaperReviewTaskResult.issue
  ].filter(Boolean) as ModuleIssue[];

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
    ...pbcTasks,
    ...remediationTasks,
    ...testingTasks,
    ...workpaperReviewTasks
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
          users: organization.users
        }
      : null,
    campaigns: rcsa.campaigns || [],
    processes: rcsa.processes || [],
    risks: rcsa.risks || [],
    controls: enrichedControls,
    tasks: combinedTasks,
    todTests,
    walkthroughs,
    financialAccounts: financialItems.records || [],
    ipeRegisters: informationRegister.records || [],
    certifications: certification.subCertifications || [],
    attestations: certification.attestations || [],
    evidencePacks: certification.evidencePacks || [],
    calendarEvents,
    toeTests,
    actionPlans: remediation.maps || [],
    issues: remediation.issues || [],
    deficiencies: remediation.deficiencies || [],
    retests: remediation.retests || [],
    monitoringRules,
    testingCycles: testingPlan.cycles || [],
    testingPlanItems: testingPlan.planItems || [],
    testingPlanMetrics: testingPlan.metrics || {},
    requestedSections: full ? ['all'] : Array.from(requested),
    dataStatus: issues.length ? 'degraded' : 'complete',
    degradedModules: issues.map(issue => issue.module),
    warnings: issues,
    storage: 'cloudflare-d1'
  }, {
    headers: {
      'Cache-Control': 'private, max-age=15, stale-while-revalidate=45',
      'X-TotalARC-Data-Status': issues.length ? 'degraded' : 'complete'
    }
  });
}

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

function textArray(body: Record<string, unknown>, key: string) {
  if (!Array.isArray(body[key])) return [];
  return Array.from(
    new Set(
      (body[key] as unknown[])
        .map(value => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)
    )
  );
}

export async function POST(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context?.institution) {
      return NextResponse.json(
        { error: 'Active institution is required.' },
        { status: context ? 409 : 401 }
      );
    }
    const institutionId = context.institution.id;
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');

    if (actionType === 'SAVE_CALENDAR_EVENT') {
      const event = await saveAssuranceCalendarEvent({
        id: textValue(body, 'id') || undefined,
        title: textValue(body, 'title'),
        type: textValue(body, 'type'),
        startDate: textValue(body, 'startDate'),
        dueDate: textValue(body, 'dueDate'),
        ownerName: textValue(body, 'ownerName'),
        reviewerName: textValue(body, 'reviewerName') || null,
        priority: textValue(body, 'priority') || 'Medium',
        status: textValue(body, 'status') || 'Planned',
        link: textValue(body, 'link') || null,
        notes: textValue(body, 'notes') || null
      }, institutionId);
      return NextResponse.json(event, { status: textValue(body, 'id') ? 200 : 201 });
    }

    if (actionType === 'DELETE_CALENDAR_EVENT') {
      const id = textValue(body, 'id');
      if (!id) {
        return NextResponse.json({ error: 'id is required.' }, { status: 400 });
      }
      const deleted = await deleteAssuranceCalendarEvent(id, institutionId);
      return NextResponse.json(deleted);
    }

    if (actionType === 'CREATE_CAMPAIGN') {
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
      const organizationUnitIds = textArray(body, 'organizationUnitIds');

      if (
        !name ||
        !type ||
        !period ||
        !frequency ||
        !startDate ||
        !dueDate ||
        !ownerName ||
        !reviewerName ||
        !approverName ||
        organizationUnitIds.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              'Nama campaign, jenis program, periode, frekuensi, tanggal, owner, reviewer, approver, dan minimal satu Unit Kerja Peserta wajib diisi.'
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
        reviewerName,
        approverName,
        methodology: methodology || 'COSO / ISO 31000 aligned',
        ratingScale: ratingScale || '5x5',
        evidenceRequired: body.evidenceRequired !== false,
        instructions: textValue(body, 'instructions') || null,
        status: status || 'Draft',
        organizationUnitIds,
        initialScope:
          processId && assessorName
            ? {
                processId,
                riskId: textValue(body, 'riskId') || null,
                controlId: textValue(body, 'controlId') || null,
                assessorName,
                dueDate: textValue(body, 'scopeDueDate') || dueDate
              }
            : null
      }, institutionId);
      return NextResponse.json(campaign, { status: 201 });
    }

    if (actionType === 'ADD_SCOPE') {
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
      }, institutionId);
      return NextResponse.json(scope, { status: 201 });
    }

    if (actionType === 'SUBMIT_ASSESSMENT') {
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
      }, institutionId);
      return NextResponse.json(response, { status: 201 });
    }

    if (actionType === 'REVIEW_ASSESSMENT') {
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
      }, institutionId);
      return NextResponse.json(response);
    }

    if (actionType === 'UPDATE_CAMPAIGN_STATUS') {
      const campaignId = textValue(body, 'campaignId');
      const status = textValue(body, 'status');
      if (!campaignId || !status) {
        return NextResponse.json(
          { error: 'campaignId and status are required.' },
          { status: 400 }
        );
      }

      const campaign = await updateAssessmentCampaignStatus({ campaignId, status }, institutionId);
      return NextResponse.json(campaign);
    }

    return NextResponse.json({ error: 'Unsupported assurance action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const notFound: Record<string, string> = {
      TENANT_RECORD_NOT_FOUND: 'Record was not found in the active institution.',
      CAMPAIGN_NOT_FOUND: 'Assessment campaign not found.',
      ASSESSMENT_SCOPE_NOT_FOUND: 'Assessment scope not found.',
      ASSESSMENT_RESPONSE_NOT_FOUND: 'Assessment response not found.',
      PROCESS_NOT_FOUND: 'Business process not found.',
      RISK_NOT_FOUND: 'Risk not found.',
      CONTROL_NOT_FOUND: 'Control not found.',
      CALENDAR_EVENT_NOT_FOUND: 'Assurance calendar event not found.'
    };
    if (notFound[code]) {
      return NextResponse.json({ error: notFound[code] }, { status: 404 });
    }

    const conflicts: Record<string, string> = {
      CAMPAIGN_CODE_CONFLICT: 'Campaign code already exists.',
      ASSESSMENT_SCOPE_CONFLICT: 'The same process/risk/control is already in this campaign.',
      CAMPAIGN_CLOSED: 'This campaign is closed and cannot be changed.',
      CALENDAR_EVENT_CONFLICT: 'Assurance calendar event code already exists.',
      CALENDAR_SOURCE_EVENT_LOCKED: 'Source-derived calendar events must be changed in their originating module.'
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
      INVALID_RESIDUAL_RATING: 'Residual likelihood and impact must be integer values from 1 to 5.',
      CALENDAR_REQUIRED: 'Title, type, start date, due date, and owner are required.',
      INVALID_CALENDAR_DATE: 'Calendar dates must use a valid YYYY-MM-DD value.',
      INVALID_CALENDAR_DATES: 'Calendar due date must be on or after the start date.',
      INVALID_CALENDAR_PRIORITY: 'Calendar priority must be Low, Medium, High, or Critical.',
      INVALID_CALENDAR_STATUS: 'Calendar status is not supported.'
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