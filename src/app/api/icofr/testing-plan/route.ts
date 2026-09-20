import { NextResponse } from 'next/server';
import {
  generateTestingPlanItems,
  getTestingPlanData,
  launchPlanExecution,
  removeTestingPlanItem,
  saveTestingCycle,
  saveTestingPlanItem
} from '@/lib/d1-icofr-testing-plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getTestingPlanData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR testing plan:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR testing plan from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_CYCLE') {
      const record = await saveTestingCycle(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'SAVE_PLAN_ITEM') {
      const record = await saveTestingPlanItem(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    if (actionType === 'GENERATE_KEY_CONTROLS') {
      const result = await generateTestingPlanItems(body);
      return NextResponse.json(result, { status: 201 });
    }

    if (actionType === 'LAUNCH_TOD' || actionType === 'LAUNCH_TOE') {
      const planItemId = typeof body.planItemId === 'string' ? body.planItemId.trim() : '';
      if (!planItemId) {
        return NextResponse.json({ error: 'Testing plan item is required.' }, { status: 400 });
      }
      const result = await launchPlanExecution(
        planItemId,
        actionType === 'LAUNCH_TOD' ? 'ToD' : 'ToE'
      );
      return NextResponse.json(result, { status: 201 });
    }

    if (actionType === 'REMOVE_PLAN_ITEM') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) {
        return NextResponse.json({ error: 'Testing plan item ID is required.' }, { status: 400 });
      }
      const result = await removeTestingPlanItem(id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Unsupported ICOFR testing plan action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before creating an ICOFR testing cycle.', 409],
      CYCLE_REQUIRED: ['Scope, cycle name, year, period, dates and testing strategy are required.', 400],
      INVALID_CYCLE_DATES: ['Cycle end date cannot be earlier than its start date.', 400],
      SCOPE_NOT_FOUND: ['Selected ICOFR scope was not found.', 400],
      CYCLE_CONFLICT: ['This testing cycle already exists for the selected period.', 409],
      PLAN_ITEM_REQUIRED: ['Cycle, control, test type, phase, dates and tester are required.', 400],
      INVALID_TEST_TYPE: ['Test type must be ToD, ToE or Both.', 400],
      INVALID_PLAN_DATES: ['Plan item due date cannot be earlier than its start date.', 400],
      OUTSIDE_CYCLE_DATES: ['Plan item dates must fall within the testing cycle dates.', 400],
      CYCLE_NOT_FOUND: ['Selected ICOFR testing cycle was not found.', 404],
      CONTROL_NOT_FOUND: ['Selected ICOFR control was not found.', 404],
      INVALID_SAMPLE_VALUES: ['Population and planned sample size must be non-negative whole numbers.', 400],
      SAMPLE_ABOVE_POPULATION: ['Planned sample size cannot exceed the stated population size.', 400],
      PLAN_CONTROL_CONFLICT: ['This control is already included in the selected testing cycle.', 409],
      GENERATION_REQUIRED: ['Cycle, test type, phase, dates and tester are required for bulk planning.', 400],
      PLAN_ITEM_NOT_FOUND: ['Testing plan item was not found.', 404],
      PLAN_EXECUTION_EXISTS: ['A plan item with launched ToD/ToE workpapers cannot be deleted.', 409],
      TOD_NOT_PLANNED: ['Test of Design is not included in this plan item.', 400],
      TOE_NOT_PLANNED: ['Test of Operating Effectiveness is not included in this plan item.', 400],
      TOD_ALREADY_LAUNCHED: ['Test of Design has already been launched for this plan item.', 409],
      TOE_ALREADY_LAUNCHED: ['Test of Operating Effectiveness has already been launched for this plan item.', 409],
      CONTROL_MASTER_REQUIRED: ['Link the ICOFR control to Single Control Library before launching ToE.', 409],
      TOE_PLANNING_FIELDS_REQUIRED: ['Population size, population source and sampling method are required before launching ToE.', 400],
      TOE_TEST_ID_CONFLICT: ['Generated ToE test ID conflicts with an existing test.', 409],
      PERIOD_CLOSED: ['This ICOFR period is closed. Request an approved temporary reopening before changing the testing cycle, plan, or launching testing.', 409]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to save ICOFR testing plan:', error);
    return NextResponse.json({ error: 'Failed to save ICOFR testing plan.' }, { status: 500 });
  }
}
