import { NextResponse } from 'next/server';
import { listRemediationData, requestMapExtension } from '@/lib/d1-assurance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listRemediationData();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 remediation data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch remediation data from persistent database.' },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const actionType = typeof body.actionType === 'string' ? body.actionType : '';

    if (actionType !== 'REQUEST_EXTENSION') {
      return NextResponse.json(
        { error: 'Unsupported remediation action.' },
        { status: 400 }
      );
    }

    const mapId = typeof body.mapId === 'string' ? body.mapId.trim() : '';
    const extensionReason =
      typeof body.extensionReason === 'string' ? body.extensionReason.trim() : '';
    const newDueDate = typeof body.newDueDate === 'string' ? body.newDueDate.trim() : '';
    const approverName =
      typeof body.approverName === 'string' ? body.approverName.trim() : '';

    if (!mapId || !extensionReason || !newDueDate || !approverName) {
      return NextResponse.json(
        { error: 'mapId, extensionReason, newDueDate, and approverName are required.' },
        { status: 400 }
      );
    }

    const updated = await requestMapExtension({
      mapId,
      extensionReason,
      newDueDate,
      approverName
    });
    return NextResponse.json(updated);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'MAP_NOT_FOUND') {
      return NextResponse.json({ error: 'Management Action Plan not found.' }, { status: 404 });
    }

    console.error('Failed to update D1 remediation action:', error);
    return NextResponse.json(
      { error: 'Failed to process remediation action in persistent database.' },
      { status: 500 }
    );
  }
}
