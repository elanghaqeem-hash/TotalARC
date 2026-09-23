import { NextResponse } from 'next/server';
import { ICOFR_CONTROL_CATEGORIES, listIcofrControlCandidates, listIcofrControls, saveIcofrControl, type IcofrControlCategory } from '@/lib/d1-icofr-domains';
import { listBusinessProcesses, listControls } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

function categoryFrom(value: string | null) {
  const category = String(value || '').toUpperCase() as IcofrControlCategory;
  return ICOFR_CONTROL_CATEGORIES.includes(category) ? category : null;
}

export async function GET(request: Request) {
  try {
    const category = categoryFrom(new URL(request.url).searchParams.get('category'));
    if (!category) return NextResponse.json({ error: 'Valid ICOFR control category is required.' }, { status: 400 });
    const [data, processData, sourceControls, candidates] = await Promise.all([
      listIcofrControls(category),
      listBusinessProcesses(),
      listControls(),
      listIcofrControlCandidates(category)
    ]);
    return NextResponse.json({
      ...data,
      category,
      processes: processData.processes,
      sourceControls,
      candidates,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to load ICOFR controls:', error);
    return NextResponse.json({ error: 'Failed to load ICOFR control register.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const record = await saveIcofrControl(body);
    return NextResponse.json(record, { status: body.id ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before maintaining ICOFR controls.', 409],
      INVALID_CATEGORY: ['Invalid ICOFR control category.', 400],
      REQUIRED_FIELDS: ['Complete the required control fields.', 400],
      CODE_CONFLICT: ['Control code already exists in this ICOFR domain.', 409]
    };
    if (known[code]) return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    console.error('Failed to save ICOFR control:', error);
    return NextResponse.json({ error: 'Failed to save ICOFR control.' }, { status: 500 });
  }
}
