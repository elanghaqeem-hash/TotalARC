import { NextResponse } from 'next/server';
import { createControl, getControlDetail, listControls, listControlSummaries, listProcessLookups, listRiskLookups } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get('view');

    if (view === 'detail') {
      const id = url.searchParams.get('id')?.trim() || '';
      if (!id) {
        return NextResponse.json({ error: 'Control id is required.' }, { status: 400 });
      }
      const control = await getControlDetail(id);
      return NextResponse.json({
        control,
        storage: 'cloudflare-d1',
        view: 'detail'
      });
    }

    if (view === 'list') {
      const [controls, processes, risks] = await Promise.all([
        listControlSummaries(),
        listProcessLookups(),
        listRiskLookups()
      ]);
      return NextResponse.json({
        controls,
        processes,
        risks,
        storage: 'cloudflare-d1',
        bundledLookups: true,
        view: 'list',
        progressive: true
      });
    }

    const [controls, processes, risks] = await Promise.all([
      listControls(),
      listProcessLookups(),
      listRiskLookups()
    ]);
    return NextResponse.json({
      controls,
      processes,
      risks,
      storage: 'cloudflare-d1',
      bundledLookups: true
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'CONTROL_NOT_FOUND') {
      return NextResponse.json({ error: 'Control was not found.' }, { status: 404 });
    }
    console.error('Failed to fetch D1 controls:', error);
    return NextResponse.json({ error: 'Failed to fetch controls from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
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

    if (!name || !description || !objective || !processId || !riskId || !controlOwner || !type || !nature || !frequency) {
      return NextResponse.json(
        {
          error:
            'Complete control definition, ownership, type, nature, frequency, and a Related Risk are required. A new Control Master must persist a risk-control mapping.'
        },
        { status: 400 }
      );
    }

    const control = await createControl({
      ...body,
      name,
      description,
      objective,
      processId,
      riskId,
      controlOwner,
      type,
      nature,
      frequency
    });

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
