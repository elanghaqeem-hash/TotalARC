import { NextResponse } from 'next/server';
import {
  applySmartTestingRun,
  approveSmartTestingRun,
  generateSmartTestingStrategy,
  getSmartTestingStrategyData,
  reviewSmartTestingDecision
} from '@/lib/d1-icofr-smart-testing';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getSmartTestingStrategyData();
    return NextResponse.json(
      { ...data, storage: 'cloudflare-d1' },
      { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=45' } }
    );
  } catch (error) {
    console.error('Failed to load ICOFR smart testing strategy:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR smart testing strategy from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'GENERATE_STRATEGY') {
      const result = await generateSmartTestingStrategy(body);
      return NextResponse.json(result, { status: 201 });
    }
    if (actionType === 'REVIEW_DECISION') {
      const result = await reviewSmartTestingDecision(body);
      return NextResponse.json(result);
    }
    if (actionType === 'APPROVE_RUN') {
      const result = await approveSmartTestingRun(body);
      return NextResponse.json(result);
    }
    if (actionType === 'APPLY_RUN') {
      const result = await applySmartTestingRun(body);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported smart-testing action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before using smart testing strategy.', 409],
      STRATEGY_RUN_REQUIRED: ['Testing cycle, policy, scope mode, default dates, tester and preparer are required.', 400],
      STRATEGY_DATES_INVALID: ['Default strategy due date cannot be earlier than the planned start date.', 400],
      CYCLE_NOT_FOUND: ['Selected testing cycle was not found.', 404],
      PERIOD_CLOSED: ['This ICOFR period is closed. Request an approved temporary reopening before changing the testing strategy.', 409],
      STRATEGY_OUTSIDE_CYCLE: ['Default testing dates must fall within the selected testing cycle.', 400],
      ROLL_FORWARD_NOT_FOUND: ['Selected ICOFR roll-forward record was not found.', 404],
      ROLL_FORWARD_CYCLE_MISMATCH: ['Selected roll-forward does not belong to the testing cycle/scope.', 400],
      NO_ELIGIBLE_CONTROLS: ['No eligible active ICOFR controls were found for the selected scope mode.', 409],
      STRATEGY_REVIEW_REQUIRED: ['Strategy decision, independent reviewer and review decision are required.', 400],
      STRATEGY_OVERRIDE_REQUIRED: ['Select a valid override strategy.', 400],
      STRATEGY_REVIEW_NOTES_REQUIRED: ['Reviewer notes are required when overriding or deferring a recommendation.', 400],
      STRATEGY_DECISION_NOT_FOUND: ['Testing-strategy decision was not found.', 404],
      STRATEGY_RUN_LOCKED: ['This strategy run is already approved/applied and cannot be edited.', 409],
      STRATEGY_SELF_REVIEW: ['The strategy preparer cannot independently review a testing recommendation.', 409],
      STRATEGY_APPROVAL_REQUIRED: ['Strategy run and approver are required.', 400],
      STRATEGY_RUN_NOT_FOUND: ['Testing-strategy run was not found.', 404],
      STRATEGY_SELF_APPROVAL: ['The strategy preparer cannot approve their own strategy run.', 409],
      STRATEGY_DECISIONS_PENDING: ['Resolve all Pending or Deferred testing-strategy decisions before approval.', 409],
      STRATEGY_APPLY_REQUIRED: ['Strategy run is required before applying to the testing plan.', 400],
      STRATEGY_NOT_APPROVED: ['Approve the testing-strategy run before applying it to the Testing Plan.', 409],
      PLAN_CONTROL_CONFLICT: ['A testing-plan item already exists for this control in the selected cycle.', 409],
      PLAN_ITEM_REQUIRED: ['Testing-plan fields required by the approved strategy are incomplete.', 400],
      OUTSIDE_CYCLE_DATES: ['Testing dates must fall within the selected testing cycle.', 400]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to process ICOFR smart-testing action:', error);
    return NextResponse.json(
      { error: 'Failed to process ICOFR smart-testing action.' },
      { status: 500 }
    );
  }
}
