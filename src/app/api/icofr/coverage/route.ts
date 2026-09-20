import { NextResponse } from 'next/server';
import {
  getIcofrCoverageData,
  removeControlDependency,
  saveControlDependency,
  saveGapAction
} from '@/lib/d1-icofr-coverage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getIcofrCoverageData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR coverage analytics:', error);
    return NextResponse.json(
      { error: 'Failed to load ICOFR coverage analytics from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType === 'SAVE_DEPENDENCY') {
      const record = await saveControlDependency(body);
      return NextResponse.json(record, { status: 201 });
    }

    if (actionType === 'REMOVE_DEPENDENCY') {
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      if (!id) return NextResponse.json({ error: 'Dependency ID is required.' }, { status: 400 });
      const result = await removeControlDependency(id);
      return NextResponse.json(result);
    }

    if (actionType === 'SAVE_GAP_ACTION') {
      const record = await saveGapAction(body);
      return NextResponse.json(record, { status: body.id ? 200 : 201 });
    }

    return NextResponse.json({ error: 'Unsupported ICOFR coverage action.' }, { status: 400 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before maintaining ICOFR coverage.', 409],
      DEPENDENCY_REQUIRED: ['Select both the ITAC and supporting ITGC control.', 400],
      SOURCE_NOT_ITAC: ['The source control must be an ITAC.', 400],
      DEPENDENCY_NOT_ITGC: ['The supporting control must be an ITGC.', 400],
      DEPENDENCY_NOT_FOUND: ['The ITAC-ITGC dependency was not found.', 404],
      ACTION_REQUIRED: ['Gap, action plan, owner and due date are required.', 400]
    };

    if (known[code]) {
      return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    }

    console.error('Failed to save ICOFR coverage action:', error);
    return NextResponse.json({ error: 'Failed to save ICOFR coverage action.' }, { status: 500 });
  }
}
