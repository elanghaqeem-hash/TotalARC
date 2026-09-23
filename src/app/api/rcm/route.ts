import { NextResponse } from 'next/server';
import { getRcmGovernanceData, listRcmRows } from '@/lib/d1-core';
import { enrichRcmWithAssurance } from '@/lib/d1-assurance';
import {
  generateBpmDerivedRcmDrafts,
  listBpmDraftRcmRows,
  listBpmWithoutRcm,
  reviewBpmDerivedRcmDraft
} from '@/lib/d1-rcm-draft';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [baseRows, governance, draftRows, bpmCoverage] = await Promise.all([
      listRcmRows(),
      getRcmGovernanceData(),
      listBpmDraftRcmRows(),
      listBpmWithoutRcm()
    ]);
    const operationalRcm = await enrichRcmWithAssurance(baseRows);
    const rcm = [...operationalRcm, ...draftRows].map((row, index) => ({
      ...row,
      rowNumber: index + 1
    }));

    return NextResponse.json({
      rcm,
      total: rcm.length,
      operationalTotal: operationalRcm.length,
      pendingDraftTotal: draftRows.length,
      summary: governance.summary,
      governance,
      bpmCoverage,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to generate D1 RCM:', error);
    return NextResponse.json(
      { error: 'Failed to generate RCM from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType =
      typeof body.actionType === 'string' ? body.actionType.trim() : 'GENERATE_BPM_DRAFTS';

    if (actionType !== 'GENERATE_BPM_DRAFTS') {
      return NextResponse.json({ error: 'Unsupported RCM action.' }, { status: 400 });
    }

    const processIds = Array.isArray(body.processIds)
      ? body.processIds.filter((value): value is string => typeof value === 'string')
      : [];
    const requestedBy =
      typeof body.requestedBy === 'string' ? body.requestedBy.trim() : null;

    if (processIds.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one BPM without an operational RCM.' },
        { status: 400 }
      );
    }

    const result = await generateBpmDerivedRcmDrafts({ processIds, requestedBy });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_IDS_REQUIRED') {
      return NextResponse.json(
        { error: 'Select at least one BPM without an operational RCM.' },
        { status: 400 }
      );
    }

    console.error('Failed to generate BPM-derived RCM drafts:', error);
    return NextResponse.json(
      { error: 'Failed to generate BPM-derived RCM drafts in the persistent database.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const draftReferenceId =
      typeof body.draftReferenceId === 'string' ? body.draftReferenceId.trim() : '';
    const decision =
      body.decision === 'APPROVE' || body.decision === 'REJECT'
        ? body.decision
        : null;
    const reviewedBy =
      typeof body.reviewedBy === 'string' ? body.reviewedBy.trim() : null;

    if (!draftReferenceId || !decision) {
      return NextResponse.json(
        { error: 'draftReferenceId and a valid decision (APPROVE or REJECT) are required.' },
        { status: 400 }
      );
    }

    const result = await reviewBpmDerivedRcmDraft({
      draftReferenceId,
      decision,
      reviewedBy
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'DRAFT_NOT_FOUND') {
      return NextResponse.json({ error: 'RCM draft was not found.' }, { status: 404 });
    }
    if (code === 'DRAFT_ALREADY_REVIEWED') {
      return NextResponse.json(
        { error: 'This RCM draft has already been reviewed.' },
        { status: 409 }
      );
    }
    if (code === 'INVALID_DRAFT_DECISION' || code === 'INVALID_DRAFT_PAYLOAD') {
      return NextResponse.json(
        { error: 'The RCM draft review request is invalid.' },
        { status: 400 }
      );
    }
    if (
      code === 'PROCESS_NOT_FOUND' ||
      code === 'RISK_PROCESS_MISMATCH' ||
      code === 'RISK_ID_CONFLICT' ||
      code === 'CONTROL_ID_CONFLICT'
    ) {
      return NextResponse.json(
        {
          error:
            'The draft cannot be promoted because its BPM, risk, or control mapping conflicts with current persistent data. Review the mapping before validation.'
        },
        { status: 409 }
      );
    }

    console.error('Failed to review BPM-derived RCM draft:', error);
    return NextResponse.json(
      { error: 'Failed to review BPM-derived RCM draft in the persistent database.' },
      { status: 500 }
    );
  }
}
