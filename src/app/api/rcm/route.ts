import { NextResponse } from 'next/server';
import { getRcmGovernanceData, listRcmRows } from '@/lib/d1-core';
import { enrichRcmWithAssurance } from '@/lib/d1-assurance';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [baseRows, governance] = await Promise.all([
      listRcmRows(),
      getRcmGovernanceData()
    ]);
    const rcm = await enrichRcmWithAssurance(baseRows);

    return NextResponse.json({
      rcm,
      total: rcm.length,
      summary: governance.summary,
      governance,
      storage: 'cloudflare-d1'
    });
  } catch (error) {
    console.error('Failed to generate D1 RCM:', error);
    return NextResponse.json(
      { error: 'Failed to generate RCM from persistent database.' },
      { status: 503 }
    );
  }
}
