import { NextResponse } from 'next/server';
import { createControl, listControls } from '@/lib/d1-core';
import { authorizeTenantApi, READ_ROLES } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeTenantApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const controls = await listControls(auth.user.institutionId);
    return NextResponse.json({ controls, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 controls:', error);
    return NextResponse.json({ error: 'Failed to fetch controls from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorizeTenantApi(request, ['Admin', 'ControlOwner', 'ProcessOwner']);
  if (auth.response) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const objective = typeof body.objective === 'string' ? body.objective.trim() : '';
    const processId = typeof body.processId === 'string' ? body.processId.trim() : '';
    const riskId = typeof body.riskId === 'string' ? body.riskId.trim() : '';
    const controlOwner = typeof body.controlOwner === 'string' ? body.controlOwner.trim() : '';
    const type = typeof body.type === 'string' ? body.type.trim() : '';
    const nature = typeof body.nature === 'string' ? body.nature.trim() : '';
    const frequency = typeof body.frequency === 'string' ? body.frequency.trim() : '';

    if (!name || !description || !objective || !processId || !controlOwner || !type || !nature || !frequency) {
      return NextResponse.json(
        { error: 'Complete control definition, ownership, type, nature, and frequency are required.' },
        { status: 400 }
      );
    }

    const control = await createControl({
      ...body,
      name,
      description,
      objective,
      processId,
      riskId: riskId || null,
      controlOwner,
      type,
      nature,
      frequency
    }, auth.user.institutionId);

    return NextResponse.json(control, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Select a registered business process before creating a control.' }, { status: 400 });
    }
    if (code === 'RISK_NOT_FOUND') {
      return NextResponse.json({ error: 'Selected risk does not exist.' }, { status: 400 });
    }
    if (code === 'RISK_PROCESS_MISMATCH') {
      return NextResponse.json({ error: 'Selected risk belongs to a different business process.' }, { status: 400 });
    }
    if (code === 'CONTROL_ID_CONFLICT') {
      return NextResponse.json({ error: 'Control ID already exists for this institution.' }, { status: 409 });
    }

    console.error('Failed to create D1 control:', error);
    return NextResponse.json({ error: 'Failed to create control in persistent database.' }, { status: 500 });
  }
}
