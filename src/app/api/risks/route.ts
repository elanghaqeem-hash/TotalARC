import { NextResponse } from 'next/server';
import { createRisk, listProcessLookups, listRiskLookups, listRisks } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const view = new URL(request.url).searchParams.get('view');
    if (view === 'lookup') {
      const risks = await listRiskLookups();
      return NextResponse.json({ risks, storage: 'cloudflare-d1', view: 'lookup' });
    }

    const [risks, processes] = await Promise.all([
      listRisks(),
      listProcessLookups()
    ]);
    return NextResponse.json({
      risks,
      processes,
      storage: 'cloudflare-d1',
      bundledLookups: true
    });
  } catch (error) {
    console.error('Failed to fetch D1 risks:', error);
    return NextResponse.json({ error: 'Failed to fetch risks from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const cause = typeof body.cause === 'string' ? body.cause.trim() : '';
    const event = typeof body.event === 'string' ? body.event.trim() : '';
    const impact = typeof body.impact === 'string' ? body.impact.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const processId = typeof body.processId === 'string' ? body.processId.trim() : '';
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.trim() : '';
    const likelihood = Number(body.inherentLikelihood);
    const impactValue = Number(body.inherentImpact);

    const assessmentPending = likelihood === 0 && impactValue === 0;
    const assessmentComplete =
      Number.isInteger(likelihood) && likelihood >= 1 && likelihood <= 5 &&
      Number.isInteger(impactValue) && impactValue >= 1 && impactValue <= 5;

    if (
      !name || !cause || !event || !impact || !category || !processId || !ownerName ||
      (!assessmentPending && !assessmentComplete)
    ) {
      return NextResponse.json(
        {
          error:
            'Complete risk articulation and owner are required. Set both likelihood and impact to Not Assessed, or provide both on a 1-5 scale.'
        },
        { status: 400 }
      );
    }

    const risk = await createRisk({
      ...body,
      name,
      cause,
      event,
      impact,
      category,
      processId,
      ownerName,
      inherentLikelihood: likelihood,
      inherentImpact: impactValue
    });

    return NextResponse.json(risk, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'PROCESS_NOT_FOUND') {
      return NextResponse.json({ error: 'Select a registered business process before creating a risk.' }, { status: 400 });
    }
    if (code === 'RISK_ID_CONFLICT') {
      return NextResponse.json({ error: 'Risk ID already exists for this institution.' }, { status: 409 });
    }

    console.error('Failed to create D1 risk:', error);
    return NextResponse.json({ error: 'Failed to create risk in persistent database.' }, { status: 500 });
  }
}
