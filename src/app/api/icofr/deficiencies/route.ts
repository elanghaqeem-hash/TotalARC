import { NextResponse } from 'next/server';
import { listDeficiencies, saveDeficiency } from '@/lib/d1-icofr-domains';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listDeficiencies();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR deficiencies:', error);
    return NextResponse.json({ error: 'Failed to load ICOFR deficiency register.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const record = await saveDeficiency(body);
    return NextResponse.json(record, { status: body.id ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before maintaining ICOFR deficiencies.', 409],
      REQUIRED_FIELDS: ['Code, title, description, severity and owner are required.', 400],
      CODE_CONFLICT: ['This deficiency code already exists.', 409]
    };
    if (known[code]) return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    console.error('Failed to save ICOFR deficiency:', error);
    return NextResponse.json({ error: 'Failed to save ICOFR deficiency.' }, { status: 500 });
  }
}
