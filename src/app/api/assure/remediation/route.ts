import { NextResponse } from 'next/server';
import {
  createControlDeficiency,
  createIssueFromDeficiency,
  createManagementActionPlan,
  createMapMilestone,
  createRetestRecord,
  listRemediationData,
  requestMapExtension
} from '@/lib/d1-assurance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listRemediationData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 remediation data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch remediation data from persistent database.' },
      { status: 503 }
    );
  }
}

function textValue(body: Record<string, unknown>, key: string) {
  return typeof body[key] === 'string' ? body[key].trim() : '';
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = textValue(body, 'actionType');

    if (actionType === 'CREATE_DEFICIENCY') {
      const exceptionId = textValue(body, 'exceptionId');
      const title = textValue(body, 'title');
      const description = textValue(body, 'description');
      const classification = textValue(body, 'classification');
      const approvedBy = textValue(body, 'approvedBy');
      const financialImpact =
        body.financialImpact === null ||
        body.financialImpact === undefined ||
        body.financialImpact === ''
          ? null
          : Number(body.financialImpact);

      if (!exceptionId || !title || !description || !classification || !approvedBy) {
        return NextResponse.json(
          {
            error:
              'exceptionId, title, description, classification, and approvedBy are required.'
          },
          { status: 400 }
        );
      }
      if (financialImpact !== null && !Number.isFinite(financialImpact)) {
        return NextResponse.json(
          { error: 'financialImpact must be numeric when provided.' },
          { status: 400 }
        );
      }

      const deficiency = await createControlDeficiency({
        exceptionId,
        title,
        description,
        classification,
        financialImpact,
        regulatoryImpact: textValue(body, 'regulatoryImpact') || null,
        compensatingControls: textValue(body, 'compensatingControls') || null,
        approvedBy
      });
      return NextResponse.json(deficiency, { status: 201 });
    }

    if (actionType === 'CREATE_ISSUE') {
      const deficiencyId = textValue(body, 'deficiencyId');
      const title = textValue(body, 'title');
      const description = textValue(body, 'description');
      const severity = textValue(body, 'severity');
      const ownerName = textValue(body, 'ownerName');
      const targetDate = textValue(body, 'targetDate');

      if (!deficiencyId || !title || !description || !severity || !ownerName || !targetDate) {
        return NextResponse.json(
          {
            error:
              'deficiencyId, title, description, severity, ownerName, and targetDate are required.'
          },
          { status: 400 }
        );
      }

      const issue = await createIssueFromDeficiency({
        deficiencyId,
        title,
        description,
        severity,
        ownerName,
        targetDate
      });
      return NextResponse.json(issue, { status: 201 });
    }

    if (actionType === 'CREATE_MAP') {
      const issueId = textValue(body, 'issueId');
      const agreedAction = textValue(body, 'agreedAction');
      const actionOwner = textValue(body, 'actionOwner');
      const approverName = textValue(body, 'approverName');
      const originalDueDate = textValue(body, 'originalDueDate');

      if (!issueId || !agreedAction || !actionOwner || !approverName || !originalDueDate) {
        return NextResponse.json(
          {
            error:
              'issueId, agreedAction, actionOwner, approverName, and originalDueDate are required.'
          },
          { status: 400 }
        );
      }

      const map = await createManagementActionPlan({
        issueId,
        agreedAction,
        recommendation: textValue(body, 'recommendation') || null,
        actionOwner,
        approverName,
        originalDueDate
      });
      return NextResponse.json(map, { status: 201 });
    }

    if (actionType === 'CREATE_MILESTONE') {
      const mapId = textValue(body, 'mapId');
      const title = textValue(body, 'title');
      const owner = textValue(body, 'owner');
      const dueDate = textValue(body, 'dueDate');

      if (!mapId || !title || !owner || !dueDate) {
        return NextResponse.json(
          { error: 'mapId, title, owner, and dueDate are required.' },
          { status: 400 }
        );
      }

      const milestone = await createMapMilestone({ mapId, title, owner, dueDate });
      return NextResponse.json(milestone, { status: 201 });
    }

    if (actionType === 'CREATE_RETEST') {
      const mapId = textValue(body, 'mapId');
      const testerName = textValue(body, 'testerName');
      const reviewerName = textValue(body, 'reviewerName');
      const sampleCount = Number(body.sampleCount);
      const passedCount = Number(body.passedCount);
      const failedCount = Number(body.failedCount);

      if (
        !mapId ||
        !testerName ||
        !reviewerName ||
        !Number.isInteger(sampleCount) ||
        !Number.isInteger(passedCount) ||
        !Number.isInteger(failedCount)
      ) {
        return NextResponse.json(
          {
            error:
              'mapId, testerName, reviewerName, and integer sample/pass/fail counts are required.'
          },
          { status: 400 }
        );
      }

      const retest = await createRetestRecord({
        mapId,
        sampleCount,
        passedCount,
        failedCount,
        testerName,
        reviewerName,
        conclusionNotes: textValue(body, 'conclusionNotes') || null
      });
      return NextResponse.json(retest, { status: 201 });
    }

    if (actionType === 'REQUEST_EXTENSION') {
      const mapId = textValue(body, 'mapId');
      const extensionReason = textValue(body, 'extensionReason');
      const newDueDate = textValue(body, 'newDueDate');
      const approverName = textValue(body, 'approverName');

      if (!mapId || !extensionReason || !newDueDate || !approverName) {
        return NextResponse.json(
          { error: 'mapId, extensionReason, newDueDate, and approverName are required.' },
          { status: 400 }
        );
      }

      const updated = await requestMapExtension({
        mapId,
        extensionReason,
        newDueDate,
        approverName
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json(
      { error: 'Unsupported remediation action.' },
      { status: 400 }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : '';

    const notFoundErrors: Record<string, string> = {
      EXCEPTION_NOT_FOUND: 'Testing exception not found.',
      DEFICIENCY_NOT_FOUND: 'Control deficiency not found.',
      ISSUE_NOT_FOUND: 'Issue not found.',
      MAP_NOT_FOUND: 'Management Action Plan not found.',
      TOE_TEST_NOT_FOUND: 'ToE test not found.',
      PROCESS_NOT_FOUND: 'Business process not found.'
    };
    if (notFoundErrors[code]) {
      return NextResponse.json({ error: notFoundErrors[code] }, { status: 404 });
    }

    const conflictErrors: Record<string, string> = {
      DEFICIENCY_ALREADY_EXISTS: 'A deficiency already exists for this testing exception.',
      DEFICIENCY_NOT_APPROVED:
        'The deficiency must be explicitly human-approved before an issue can be opened.'
    };
    if (conflictErrors[code]) {
      return NextResponse.json({ error: conflictErrors[code] }, { status: 409 });
    }

    if (code === 'INVALID_RETEST_COUNTS') {
      return NextResponse.json(
        { error: 'Retest passedCount + failedCount must equal sampleCount and all counts must be non-negative.' },
        { status: 400 }
      );
    }

    console.error('Failed to persist D1 remediation action:', error);
    return NextResponse.json(
      { error: 'Failed to process remediation action in persistent database.' },
      { status: 500 }
    );
  }
}
