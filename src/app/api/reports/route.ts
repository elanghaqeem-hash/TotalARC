import { NextResponse } from 'next/server';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';
import { isOrgUnitAuthorized, resolveAuthorizedOrgUnitIds } from '@/lib/auth';
import { getOrganizationData } from '@/lib/d1-organization';
import {
  createRegulatoryReport,
  getRegulatoryReport,
  listRegulatoryReports,
  updateRegulatoryReport,
  updateRegulatoryReportSection
} from '@/lib/d1-reporting';
import { REGULATORY_REPORT_TEMPLATES } from '@/lib/regulatory-report-templates';
import { guardMutationRequest, mutationActorFromRequest } from '@/lib/mutation-security';

export const dynamic = 'force-dynamic';

const WRITE_ROLES = ['Admin', 'Reviewer', 'Executive', 'Auditor'] as const;
const REPORT_STATUSES = ['Draft', 'In Review', 'Approved', 'Final'] as const;
const SECTION_STATUSES = [
  'Draft',
  'AI Draft — Human Review Required',
  'Reviewed',
  'Approved',
  'Needs Update'
] as const;

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

function nullableText(body: Record<string, unknown>, key: string) {
  const value = textValue(body, key);
  return value || null;
}

async function authorizeReportScope(
  reportId: string,
  institutionId: string,
  authorizedOrgUnitIds: string[] | null
) {
  const report = await getRegulatoryReport(reportId, institutionId);
  if (!report) return { report: null, response: NextResponse.json({ error: 'Report not found.' }, { status: 404 }) };

  if (
    !isOrgUnitAuthorized(
      authorizedOrgUnitIds,
      typeof report.orgUnitId === 'string' ? report.orgUnitId : null
    )
  ) {
    return {
      report: null,
      response: NextResponse.json(
        {
          error: 'Your account is not authorized for this report organization scope.',
          code: 'REPORT_ORGANIZATION_SCOPE_FORBIDDEN'
        },
        { status: 403 }
      )
    };
  }

  return { report, response: null };
}

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const url = new URL(request.url);
    const reportId = (url.searchParams.get('id') || '').trim();
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (reportId) {
      const scoped = await authorizeReportScope(
        reportId,
        auth.user.institutionId,
        authorizedOrgUnitIds
      );
      if (scoped.response) return scoped.response;

      return NextResponse.json({
        report: scoped.report,
        templates: REGULATORY_REPORT_TEMPLATES,
        storage: 'cloudflare-d1'
      });
    }

    const [reports, organization] = await Promise.all([
      listRegulatoryReports(auth.user.institutionId, authorizedOrgUnitIds),
      getOrganizationData(auth.user.institutionId)
    ]);

    const allowedUnits =
      authorizedOrgUnitIds === null
        ? organization.organizationUnits
        : organization.organizationUnits.filter(unit =>
            authorizedOrgUnitIds.includes(unit.id)
          );

    const allowedEntityIds = new Set(
      allowedUnits
        .map(unit => unit.legalEntityId)
        .filter((value): value is string => typeof value === 'string' && Boolean(value))
    );

    return NextResponse.json({
      templates: REGULATORY_REPORT_TEMPLATES,
      reports,
      organization: {
        legalEntities:
          authorizedOrgUnitIds === null
            ? organization.legalEntities
            : organization.legalEntities.filter(entity => allowedEntityIds.has(entity.id)),
        organizationUnits: allowedUnits
      },
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load regulatory reports:', error);
    return NextResponse.json(
      { error: 'Failed to load regulatory report workspace from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, WRITE_ROLES);
  if (auth.response) return auth.response;

  const guard = guardMutationRequest(request);
  if (guard) return guard;
  const actor = mutationActorFromRequest(request, auth.user);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');
    const authorizedOrgUnitIds = await resolveAuthorizedOrgUnitIds(auth.user);

    if (actionType === 'CREATE_REPORT') {
      const templateCode = textValue(body, 'templateCode');
      const period = textValue(body, 'period');
      const reportingDate = textValue(body, 'reportingDate');
      const reportOwner = textValue(body, 'reportOwner') || auth.user.name;
      const orgUnitId = nullableText(body, 'orgUnitId');
      const requestedLegalEntityId = nullableText(body, 'legalEntityId');

      if (!templateCode || !period || !reportingDate || !reportOwner) {
        return NextResponse.json(
          { error: 'templateCode, period, reportingDate, and reportOwner are required.' },
          { status: 400 }
        );
      }

      const template = REGULATORY_REPORT_TEMPLATES.find(item => item.code === templateCode);
      if (!template) {
        return NextResponse.json({ error: 'Report template not found.' }, { status: 404 });
      }

      const organization = await getOrganizationData(auth.user.institutionId);
      const selectedUnit = orgUnitId
        ? organization.organizationUnits.find(unit => unit.id === orgUnitId)
        : null;

      if (orgUnitId && !selectedUnit) {
        return NextResponse.json({ error: 'Selected organization unit was not found.' }, { status: 400 });
      }

      if (authorizedOrgUnitIds !== null && !orgUnitId) {
        return NextResponse.json(
          {
            error: 'A report organization unit is required for scoped users.',
            code: 'REPORT_ORGANIZATION_SCOPE_REQUIRED'
          },
          { status: 400 }
        );
      }

      if (!isOrgUnitAuthorized(authorizedOrgUnitIds, orgUnitId)) {
        return NextResponse.json(
          {
            error: 'Your account is not authorized for the selected report organization unit.',
            code: 'REPORT_ORGANIZATION_SCOPE_FORBIDDEN'
          },
          { status: 403 }
        );
      }

      const legalEntityId =
        selectedUnit?.legalEntityId ||
        requestedLegalEntityId ||
        null;

      if (
        legalEntityId
        && !organization.legalEntities.some(entity => entity.id === legalEntityId)
      ) {
        return NextResponse.json({ error: 'Selected legal entity was not found.' }, { status: 400 });
      }

      const report = await createRegulatoryReport(
        {
          templateCode,
          title: nullableText(body, 'title'),
          period,
          reportingDate,
          legalEntityId,
          orgUnitId,
          reportOwner,
          reviewerName: nullableText(body, 'reviewerName')
        },
        auth.user.institutionId,
        actor
      );

      return NextResponse.json(report, { status: 201 });
    }

    const reportId = textValue(body, 'reportId');
    if (!reportId) {
      return NextResponse.json({ error: 'reportId is required.' }, { status: 400 });
    }

    const scoped = await authorizeReportScope(
      reportId,
      auth.user.institutionId,
      authorizedOrgUnitIds
    );
    if (scoped.response) return scoped.response;

    if (actionType === 'UPDATE_REPORT') {
      const status = nullableText(body, 'status');
      if (status && !REPORT_STATUSES.includes(status as (typeof REPORT_STATUSES)[number])) {
        return NextResponse.json({ error: 'Invalid report status.' }, { status: 400 });
      }

      const updated = await updateRegulatoryReport(
        reportId,
        auth.user.institutionId,
        {
          title: textValue(body, 'title') || undefined,
          period: textValue(body, 'period') || undefined,
          reportingDate: textValue(body, 'reportingDate') || undefined,
          reportOwner: textValue(body, 'reportOwner') || undefined,
          reviewerName:
            body.reviewerName === undefined ? undefined : nullableText(body, 'reviewerName'),
          status: status || undefined,
          overallRating:
            body.overallRating === undefined ? undefined : nullableText(body, 'overallRating'),
          executiveSummary:
            body.executiveSummary === undefined ? undefined : nullableText(body, 'executiveSummary'),
          conclusion:
            body.conclusion === undefined ? undefined : nullableText(body, 'conclusion')
        },
        actor
      );

      return NextResponse.json(updated);
    }

    if (actionType === 'UPDATE_SECTION') {
      const sectionId = textValue(body, 'sectionId');
      if (!sectionId) {
        return NextResponse.json({ error: 'sectionId is required.' }, { status: 400 });
      }

      const reviewStatus = nullableText(body, 'reviewStatus');
      if (
        reviewStatus
        && !SECTION_STATUSES.includes(reviewStatus as (typeof SECTION_STATUSES)[number])
      ) {
        return NextResponse.json({ error: 'Invalid section review status.' }, { status: 400 });
      }

      const updated = await updateRegulatoryReportSection(
        reportId,
        sectionId,
        auth.user.institutionId,
        {
          content: body.content === undefined ? undefined : nullableText(body, 'content'),
          analysisSummary:
            body.analysisSummary === undefined ? undefined : nullableText(body, 'analysisSummary'),
          keyFindings:
            body.keyFindings === undefined ? undefined : nullableText(body, 'keyFindings'),
          rootCause:
            body.rootCause === undefined ? undefined : nullableText(body, 'rootCause'),
          impactAnalysis:
            body.impactAnalysis === undefined ? undefined : nullableText(body, 'impactAnalysis'),
          recommendation:
            body.recommendation === undefined ? undefined : nullableText(body, 'recommendation'),
          managementResponse:
            body.managementResponse === undefined ? undefined : nullableText(body, 'managementResponse'),
          actionPlan:
            body.actionPlan === undefined ? undefined : nullableText(body, 'actionPlan'),
          ownerName:
            body.ownerName === undefined ? undefined : nullableText(body, 'ownerName'),
          targetDate:
            body.targetDate === undefined ? undefined : nullableText(body, 'targetDate'),
          rating:
            body.rating === undefined ? undefined : nullableText(body, 'rating'),
          evidenceReference:
            body.evidenceReference === undefined ? undefined : nullableText(body, 'evidenceReference'),
          reviewStatus: reviewStatus || undefined
        },
        actor
      );

      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Unsupported report action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'REPORT_TEMPLATE_NOT_FOUND' || code === 'REPORT_NOT_FOUND') {
      return NextResponse.json({ error: 'Report or template not found.' }, { status: 404 });
    }
    if (code === 'REPORT_SECTION_NOT_FOUND') {
      return NextResponse.json({ error: 'Report section not found.' }, { status: 404 });
    }

    console.error('Failed to persist regulatory report action:', error);
    return NextResponse.json(
      { error: 'Failed to persist regulatory report changes.' },
      { status: 500 }
    );
  }
}
