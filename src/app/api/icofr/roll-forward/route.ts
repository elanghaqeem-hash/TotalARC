import { NextResponse } from 'next/server';
import {
  createIcofrRollForward,
  finalizeIcofrRollForward,
  getIcofrRollForwardData,
  refreshIcofrRollForward,
  reviewRollForwardItem
} from '@/lib/d1-icofr-roll-forward';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getIcofrRollForwardData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR roll-forward data:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR roll-forward data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'CREATE_ROLL_FORWARD') {
      const record = await createIcofrRollForward(body);
      return NextResponse.json(record, { status: 201 });
    }

    if (actionType === 'REFRESH_DELTAS') {
      const rollForwardId =
        typeof body.rollForwardId === 'string' ? body.rollForwardId.trim() : '';
      if (!rollForwardId) {
        return NextResponse.json({ error: 'Roll-forward ID is required.' }, { status: 400 });
      }
      const result = await refreshIcofrRollForward(rollForwardId);
      return NextResponse.json(result);
    }

    if (actionType === 'REVIEW_ITEM') {
      const result = await reviewRollForwardItem(body);
      return NextResponse.json(result);
    }

    if (actionType === 'FINALIZE_ROLL_FORWARD') {
      const result = await finalizeIcofrRollForward(body);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported ICOFR roll-forward action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using ICOFR roll-forward.', 409],
      ROLL_FORWARD_REQUIRED: ['Source closed period, snapshot version, target period, scope name, roll-forward name and preparer are required.', 400],
      ROLL_FORWARD_CONFLICT: ['A roll-forward from this source snapshot to the selected target period already exists.', 409],
      SOURCE_CLOSE_NOT_FOUND: ['Selected source period close was not found.', 404],
      SOURCE_SNAPSHOT_NOT_FOUND: ['Selected immutable snapshot version was not found.', 404],
      SOURCE_SNAPSHOT_INVALID: ['Selected source snapshot cannot be read.', 409],
      SOURCE_SCOPE_NOT_FOUND: ['The selected snapshot does not contain an ICOFR scope.', 409],
      TARGET_SCOPE_CONFLICT: ['A target ICOFR scope with the same name, year and reporting period already exists.', 409],
      TARGET_CYCLE_REQUIRED: ['Cycle name, start date, end date and testing strategy are required when creating a target testing cycle.', 400],
      TARGET_CYCLE_DATES: ['Target testing cycle end date cannot be earlier than its start date.', 400],
      TARGET_CYCLE_CONFLICT: ['The requested target testing cycle already exists.', 409],
      ROLL_FORWARD_NOT_FOUND: ['ICOFR roll-forward record was not found.', 404],
      ROLL_FORWARD_FINALIZED: ['This ICOFR roll-forward has already been finalized and is read-only.', 409],
      ITEM_REVIEW_REQUIRED: ['Roll-forward item, reviewer and a valid decision are required.', 400],
      ITEM_REVIEW_NOTES_REQUIRED: ['Reviewer notes are required for revalidation, replacement or exclusion decisions.', 400],
      ROLL_FORWARD_ITEM_NOT_FOUND: ['Roll-forward item was not found.', 404],
      FINALIZE_REQUIRED: ['Reviewer and confirmations for materiality, scope and prior-period deficiency follow-up are required.', 400],
      ROLL_FORWARD_SELF_REVIEW: ['The roll-forward preparer cannot perform the independent final review.', 409],
      ROLL_FORWARD_ITEMS_PENDING: ['Resolve all pending/revalidation items before finalizing the roll-forward.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to process ICOFR roll-forward action:', error);
    return NextResponse.json(
      { error: 'Failed to process ICOFR roll-forward action.' },
      { status: 500 }
    );
  }
}
