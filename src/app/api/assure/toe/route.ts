import { NextResponse } from 'next/server';
import { listToeTests, updateToeSample } from '@/lib/d1-assurance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tests = await listToeTests();
    return NextResponse.json({ tests, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to fetch D1 ToE tests:', error);
    return NextResponse.json({ error: 'Failed to fetch ToE tests from persistent database.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const sampleId = typeof body.sampleId === 'string' ? body.sampleId.trim() : '';
    const result = typeof body.result === 'string' ? body.result.trim() : '';
    const failureReason =
      typeof body.failureReason === 'string' ? body.failureReason.trim() : null;

    if (!sampleId || !result) {
      return NextResponse.json(
        { error: 'sampleId and result are required for a persisted ToE sample update.' },
        { status: 400 }
      );
    }

    const updated = await updateToeSample({ sampleId, result, failureReason });
    return NextResponse.json(updated);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'SAMPLE_NOT_FOUND') {
      return NextResponse.json({ error: 'ToE sample not found.' }, { status: 404 });
    }
    if (code === 'INVALID_SAMPLE_RESULT') {
      return NextResponse.json({ error: 'Invalid ToE sample result.' }, { status: 400 });
    }

    console.error('Failed to update D1 ToE sample:', error);
    return NextResponse.json({ error: 'Failed to update ToE sample in persistent database.' }, { status: 500 });
  }
}
