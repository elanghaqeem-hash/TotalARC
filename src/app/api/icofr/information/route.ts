import { NextResponse } from 'next/server';
import { listInformationRegister, saveInformationRegister } from '@/lib/d1-icofr-domains';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const artifactType = new URL(request.url).searchParams.get('type') || undefined;
    const data = await listInformationRegister(artifactType);
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR information register:', error);
    return NextResponse.json({ error: 'Failed to load IPE/EUC register.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const record = await saveInformationRegister(body);
    return NextResponse.json(record, { status: body.id ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before maintaining IPE/EUC.', 409],
      INVALID_ARTIFACT_TYPE: ['Artifact type must be IPE or EUC.', 400],
      REQUIRED_FIELDS: ['Code, name, owner and purpose are required.', 400],
      CODE_CONFLICT: ['This IPE/EUC code already exists.', 409]
    };
    if (known[code]) return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    console.error('Failed to save ICOFR information register:', error);
    return NextResponse.json({ error: 'Failed to save IPE/EUC record.' }, { status: 500 });
  }
}
