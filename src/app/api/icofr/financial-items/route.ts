import { NextResponse } from 'next/server';
import { listFinancialItems, saveFinancialItem } from '@/lib/d1-icofr-domains';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listFinancialItems();
    return NextResponse.json({ ...data, storage: 'cloudflare-d1' });
  } catch (error) {
    console.error('Failed to load ICOFR financial items:', error);
    return NextResponse.json({ error: 'Failed to load accounts and disclosures.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const record = await saveFinancialItem(body);
    return NextResponse.json(record, { status: body.id ? 200 : 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known: Record<string, [string, number]> = {
      INSTITUTION_REQUIRED: ['Register an institution before maintaining ICOFR financial items.', 409],
      INVALID_RECORD_TYPE: ['Record type must be Account or Disclosure.', 400],
      REQUIRED_FIELDS: ['Item code and name are required.', 400],
      INVALID_AMOUNT: ['Balance amount must be numeric.', 400],
      CODE_CONFLICT: ['This account/disclosure code already exists.', 409]
    };
    if (known[code]) return NextResponse.json({ error: known[code][0] }, { status: known[code][1] });
    console.error('Failed to save ICOFR financial item:', error);
    return NextResponse.json({ error: 'Failed to save account/disclosure.' }, { status: 500 });
  }
}
