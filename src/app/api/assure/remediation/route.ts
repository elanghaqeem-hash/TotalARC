import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

function validDate(value: unknown, field: string) {
  const date = new Date(requireString(value, field, 60));
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', `${field} is invalid`);
  return date;
}

function boundedPercent(value: unknown, field = 'progressPercent') {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be an integer from 0 to 100`);
  }
  return number;
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const institutionId = user.institutionId;

    const [deficiencies, issues, maps, retests, unclassifiedExceptions] = await Promise.all([
      prisma.controlDeficiency.findMany({
        where: {
          OR: [
            { exception: { toeTest: { process: { institutionId } } } },
            { issues: { some: { institutionId } } }
          ]
        },
        include: {
          exception: { include: { toeTest: { include: { control: true, process: true } } } },
          rootCause: true,
          issues: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.issue.findMany({
        where: { institutionId },
        include: {
          process: true,
          risk: true,
          control: true,
          deficiency: { include: { rootCause: true, exception: true } },
          actionPlans: { include: { milestones: true, retests: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.managementActionPlan.findMany({
        where: { issue: { institutionId } },
        include: {
          issue: { include: { process: true, control: true, deficiency: true } },
          milestones: true,
          retests: { orderBy: { retestedAt: 'desc' } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.retestRecord.findMany({
        where: { map: { issue: { institutionId } } },
        include: { map: { include: { issue: true } } },
        orderBy: { retestedAt: 'desc' }
      }),
      prisma.testingException.findMany({
        where: {
          toeTest: { process: { institutionId } },
          deficiencies: { none: {} },
          status: { not: 'False Positive' }
        },
        include: { toeTest: { include: { control: true, process: true } } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return NextResponse.json({ deficiencies, issues, maps, retests, unclassifiedExceptions });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','Tester','Reviewer','ProcessOwner','ControlOwner','Executive']);
    const body = await readJson<Record<string, unknown>>(request, 64_000);
    const actionType = requireString(body.actionType, 'actionType', 60);

    if (actionType === 'CREATE_DEFICIENCY') {
      const exceptionId = requireString(body.exceptionId, 'exceptionId', 100);
      const exception = await prisma.testingException.findFirst({
        where: { id: exceptionId, toeTest: { process: { institutionId: user.institutionId } } },
        include: { toeTest: true, deficiencies: true }
      });
      if (!exception) throw new ApiError(404, 'EXCEPTION_NOT_FOUND', 'Testing exception not found');
      if (exception.deficiencies.length) throw new ApiError(409, 'DEFICIENCY_EXISTS', 'A deficiency already exists for this exception');

      const deficiency = await prisma.controlDeficiency.create({
        data: {
          exceptionId,
          deficiencyId: optionalString(body.deficiencyId, 80) || `DEF-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
          title: requireString(body.title, 'title', 300),
          description: requireString(body.description, 'description', 5000),
          classification: optionalString(body.classification, 100) || 'Control Deficiency',
          financialImpact: body.financialImpact === null || body.financialImpact === undefined || body.financialImpact === '' ? null : Number(body.financialImpact),
          regulatoryImpact: optionalString(body.regulatoryImpact, 2000),
          compensatingControls: optionalString(body.compensatingControls, 3000),
          humanApproved: false
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'ControlDeficiency', recordId: deficiency.id, newValue: deficiency });
      return NextResponse.json(deficiency, { status: 201 });
    }

    if (actionType === 'APPROVE_DEFICIENCY') {
      if (!['Admin','Reviewer'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Reviewer permission required');
      const deficiencyId = requireString(body.deficiencyId, 'deficiencyId', 100);
      const deficiency = await prisma.controlDeficiency.findFirst({
        where: {
          id: deficiencyId,
          OR: [
            { exception: { toeTest: { process: { institutionId: user.institutionId } } } },
            { issues: { some: { institutionId: user.institutionId } } }
          ]
        }
      });
      if (!deficiency) throw new ApiError(404, 'DEFICIENCY_NOT_FOUND', 'Deficiency not found');
      const updated = await prisma.controlDeficiency.update({
        where: { id: deficiency.id },
        data: { humanApproved: true, approvedBy: user.name }
      });
      await writeAudit(user, request, { action: 'APPROVE', entityType: 'ControlDeficiency', recordId: deficiency.id, oldValue: deficiency, newValue: updated });
      return NextResponse.json(updated);
    }

    if (actionType === 'CREATE_RCA') {
      const deficiencyId = requireString(body.deficiencyId, 'deficiencyId', 100);
      const deficiency = await prisma.controlDeficiency.findFirst({
        where: {
          id: deficiencyId,
          OR: [
            { exception: { toeTest: { process: { institutionId: user.institutionId } } } },
            { issues: { some: { institutionId: user.institutionId } } }
          ]
        },
        include: { rootCause: true }
      });
      if (!deficiency) throw new ApiError(404, 'DEFICIENCY_NOT_FOUND', 'Deficiency not found');
      if (deficiency.rootCause) throw new ApiError(409, 'RCA_EXISTS', 'Root-cause analysis already exists');

      const rca = await prisma.rootCauseAnalysis.create({
        data: {
          deficiencyId,
          method: optionalString(body.method, 80) || '5 Why',
          why1: optionalString(body.why1, 2000),
          why2: optionalString(body.why2, 2000),
          why3: optionalString(body.why3, 2000),
          why4: optionalString(body.why4, 2000),
          why5: optionalString(body.why5, 2000),
          category: optionalString(body.category, 80) || 'Process',
          rootCauseStatement: requireString(body.rootCauseStatement, 'rootCauseStatement', 5000)
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'RootCauseAnalysis', recordId: rca.id, newValue: rca });
      return NextResponse.json(rca, { status: 201 });
    }

    if (actionType === 'CREATE_ISSUE') {
      const deficiencyId = requireString(body.deficiencyId, 'deficiencyId', 100);
      const deficiency = await prisma.controlDeficiency.findFirst({
        where: { id: deficiencyId, exception: { toeTest: { process: { institutionId: user.institutionId } } } },
        include: { exception: { include: { toeTest: true } } }
      });
      if (!deficiency?.exception) throw new ApiError(404, 'DEFICIENCY_NOT_FOUND', 'Deficiency with testing evidence not found');
      if (!deficiency.humanApproved) throw new ApiError(400, 'DEFICIENCY_NOT_APPROVED', 'Reviewer approval is required before issue creation');

      const test = deficiency.exception.toeTest;
      const issue = await prisma.issue.create({
        data: {
          institutionId: user.institutionId,
          issueId: optionalString(body.issueId, 80) || `ISS-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
          source: 'TOE',
          processId: test.processId,
          riskId: test.riskId,
          controlId: test.controlId,
          deficiencyId: deficiency.id,
          title: requireString(body.title, 'title', 300),
          description: requireString(body.description, 'description', 5000),
          severity: optionalString(body.severity, 30) || deficiency.classification,
          ownerName: requireString(body.ownerName, 'ownerName', 250),
          targetDate: validDate(body.targetDate, 'targetDate'),
          status: 'Open'
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'Issue', recordId: issue.id, newValue: issue });
      return NextResponse.json(issue, { status: 201 });
    }

    if (actionType === 'CREATE_MAP') {
      if (!['Admin','Reviewer','ProcessOwner','ControlOwner'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'MAP creation permission required');
      const issueId = requireString(body.issueId, 'issueId', 100);
      const issue = await prisma.issue.findFirst({ where: { id: issueId, institutionId: user.institutionId } });
      if (!issue) throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Issue not found');

      const map = await prisma.managementActionPlan.create({
        data: {
          mapId: optionalString(body.mapId, 80) || `MAP-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
          issueId: issue.id,
          agreedAction: requireString(body.agreedAction, 'agreedAction', 5000),
          recommendation: optionalString(body.recommendation, 5000),
          actionOwner: requireString(body.actionOwner, 'actionOwner', 250),
          approverName: user.name,
          originalDueDate: validDate(body.originalDueDate, 'originalDueDate'),
          progressPercent: 0,
          status: 'Agreed'
        }
      });
      await writeAudit(user, request, { action: 'CREATE', entityType: 'ManagementActionPlan', recordId: map.id, newValue: map });
      return NextResponse.json(map, { status: 201 });
    }

    if (actionType === 'UPDATE_MAP') {
      const mapId = requireString(body.mapId, 'mapId', 100);
      const map = await prisma.managementActionPlan.findFirst({ where: { id: mapId, issue: { institutionId: user.institutionId } } });
      if (!map) throw new ApiError(404, 'MAP_NOT_FOUND', 'Management action plan not found');

      const progressPercent = boundedPercent(body.progressPercent);
      const requestedStatus = optionalString(body.status, 80) || (progressPercent === 100 ? 'Completed by Owner' : 'In Progress');
      const allowed = ['Agreed','In Progress','Completed by Owner','Pending Validation','Pending Retest'];
      if (!allowed.includes(requestedStatus)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid MAP status');

      const updated = await prisma.managementActionPlan.update({
        where: { id: map.id },
        data: {
          progressPercent,
          status: requestedStatus,
          completedAt: progressPercent === 100 ? new Date() : null
        }
      });
      await writeAudit(user, request, { action: 'UPDATE', entityType: 'ManagementActionPlan', recordId: map.id, oldValue: map, newValue: updated });
      return NextResponse.json(updated);
    }

    if (actionType === 'REQUEST_EXTENSION') {
      if (!['Admin','Reviewer','Executive'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Extension approval permission required');
      const mapId = requireString(body.mapId, 'mapId', 100);
      const existing = await prisma.managementActionPlan.findFirst({ where: { id: mapId, issue: { institutionId: user.institutionId } } });
      if (!existing) throw new ApiError(404, 'MAP_NOT_FOUND', 'Management action plan not found');

      const newDueDate = validDate(body.newDueDate, 'newDueDate');
      const extensionReason = requireString(body.extensionReason, 'extensionReason', 2000);
      if (newDueDate <= existing.originalDueDate) throw new ApiError(400, 'VALIDATION_ERROR', 'Revised due date must be later than the original due date');

      const updated = await prisma.managementActionPlan.update({
        where: { id: existing.id },
        data: {
          revisedDueDate: newDueDate,
          extensionCount: existing.extensionCount + 1,
          extensionReason,
          approverName: user.name
        }
      });
      await writeAudit(user, request, { action: 'APPROVE_EXTENSION', entityType: 'ManagementActionPlan', recordId: existing.id, reason: extensionReason, oldValue: existing, newValue: updated });
      return NextResponse.json(updated);
    }

    if (actionType === 'CREATE_RETEST') {
      if (!['Admin','Tester','Reviewer'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Retest permission required');
      const mapId = requireString(body.mapId, 'mapId', 100);
      const map = await prisma.managementActionPlan.findFirst({ where: { id: mapId, issue: { institutionId: user.institutionId } } });
      if (!map) throw new ApiError(404, 'MAP_NOT_FOUND', 'Management action plan not found');
      if (map.progressPercent < 100) throw new ApiError(400, 'MAP_NOT_COMPLETE', 'MAP must be 100% complete before retest');

      const sampleCount = Number(body.sampleCount);
      const passedCount = Number(body.passedCount);
      const failedCount = Number(body.failedCount);
      if (![sampleCount,passedCount,failedCount].every(Number.isInteger) || sampleCount <= 0 || passedCount < 0 || failedCount < 0 || passedCount + failedCount !== sampleCount) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Retest sample counts are invalid');
      }
      const result = failedCount === 0 ? 'Passed' : passedCount === 0 ? 'Failed' : 'Partially Passed';
      const retest = await prisma.retestRecord.create({
        data: {
          mapId: map.id,
          retestId: optionalString(body.retestId, 80) || `RET-${crypto.randomUUID().slice(0,8).toUpperCase()}`,
          sampleCount,
          passedCount,
          failedCount,
          testerName: user.name,
          reviewerName: optionalString(body.reviewerName, 250) || '',
          result,
          conclusionNotes: requireString(body.conclusionNotes, 'conclusionNotes', 5000)
        }
      });
      await prisma.managementActionPlan.update({ where: { id: map.id }, data: { status: 'Pending Validation' } });
      await writeAudit(user, request, { action: 'RETEST', entityType: 'RetestRecord', recordId: retest.id, newValue: retest });
      return NextResponse.json(retest, { status: 201 });
    }

    if (actionType === 'CLOSE_ISSUE') {
      if (!['Admin','Reviewer'].includes(user.role)) throw new ApiError(403, 'FORBIDDEN', 'Reviewer permission required');
      const issueId = requireString(body.issueId, 'issueId', 100);
      const issue = await prisma.issue.findFirst({
        where: { id: issueId, institutionId: user.institutionId },
        include: { actionPlans: { include: { retests: { orderBy: { retestedAt: 'desc' } } } } }
      });
      if (!issue) throw new ApiError(404, 'ISSUE_NOT_FOUND', 'Issue not found');
      if (!issue.actionPlans.length) throw new ApiError(400, 'NO_MAP', 'At least one MAP is required before closure');
      const allPassed = issue.actionPlans.every(map => map.retests[0]?.result === 'Passed');
      if (!allPassed) throw new ApiError(400, 'RETEST_NOT_PASSED', 'Every MAP requires a latest passing retest before issue closure');

      const [updatedIssue] = await prisma.$transaction([
        prisma.issue.update({ where: { id: issue.id }, data: { status: 'Closed' } }),
        ...issue.actionPlans.map(map => prisma.managementActionPlan.update({ where: { id: map.id }, data: { status: 'Closed', progressPercent: 100 } }))
      ]);
      await writeAudit(user, request, { action: 'CLOSE', entityType: 'Issue', recordId: issue.id, oldValue: issue, newValue: updatedIssue });
      return NextResponse.json(updatedIssue);
    }

    throw new ApiError(400, 'UNSUPPORTED_ACTION', 'Unsupported remediation action');
  } catch (error) {
    return apiError(error);
  }
}
