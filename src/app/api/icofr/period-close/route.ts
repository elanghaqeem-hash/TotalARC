import { NextResponse } from 'next/server';
import {
  closeIcofrPeriod,
  getPeriodCloseData,
  requestPeriodReopen,
  reviewPeriodReopen
} from '@/lib/d1-icofr-period-close';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getPeriodCloseData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR period close data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR period-close data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'CLOSE_PERIOD') {
      const record = await closeIcofrPeriod(body);
      return NextResponse.json(record, { status: 201 });
    }

    if (actionType === 'REQUEST_REOPEN') {
      const record = await requestPeriodReopen(body);
      return NextResponse.json(record, { status: 201 });
    }

    if (actionType === 'REVIEW_REOPEN') {
      const record = await reviewPeriodReopen(body);
      return NextResponse.json(record);
    }

    return NextResponse.json({ error: 'Unsupported ICOFR period-close action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using ICOFR period close.', 409],
      CLOSE_REQUIRED: ['Scope, signed attestation, period, close information, maker-checker names and freeze confirmation are required.', 400],
      MAKER_CHECKER_REQUIRED: ['Preparer, reviewer and approver must be different people.', 400],
      SCOPE_NOT_FOUND: ['Selected ICOFR scope was not found.', 404],
      CYCLE_NOT_FOUND: ['Selected testing cycle does not belong to the selected scope.', 400],
      ATTESTATION_NOT_FOUND: ['Selected management attestation was not found for this scope and period.', 404],
      ATTESTATION_NOT_SIGNED: ['Both CFO and CEO sign-offs must be recorded before the period can be closed.', 409],
      PERIOD_ALREADY_CLOSED: ['This ICOFR period is already closed. Use the controlled reopen workflow before creating a new snapshot version.', 409],
      REOPEN_REQUIRED: ['Closed period, requester, reason, impact assessment and requested reopen-until time are required.', 400],
      INVALID_REOPEN_UNTIL: ['Reopen-until time must be in the future.', 400],
      CLOSE_NOT_FOUND: ['Selected ICOFR period close record was not found.', 404],
      REOPEN_CONFLICT: ['A pending or approved reopen request already exists for this closed period.', 409],
      REOPEN_REVIEW_REQUIRED: ['Reopen request, approver and decision are required.', 400],
      REOPEN_NOT_FOUND: ['Reopen request was not found.', 404],
      REOPEN_ALREADY_REVIEWED: ['This reopen request has already been reviewed.', 409],
      REOPEN_SELF_APPROVAL: ['The requester cannot approve their own reopen request.', 409],
      REOPEN_UNTIL_REQUIRED: ['Approved reopen requests require an approved reopen-until time.', 400],
      REOPEN_EXCEEDS_REQUEST: ['Approved reopen window cannot extend beyond the requested window.', 400]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to process ICOFR period close action:', error);
    return NextResponse.json(
      { error: 'Failed to process ICOFR period-close action.' },
      { status: 500 }
    );
  }
}
