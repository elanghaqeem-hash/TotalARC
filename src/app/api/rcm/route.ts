import { NextResponse } from 'next/server';
import { listRcmRows } from '@/lib/d1-core';
import { enrichRcmWithAssurance } from '@/lib/d1-assurance';
import { authorizeApi, READ_ROLES } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeApi(request, READ_ROLES);
  if (auth.response) return auth.response;

  try {
    const baseRows = await listRcmRows();
    const rcm = await enrichRcmWithAssurance(baseRows);

    return NextResponse.json({
      rcm,
      total: rcm.length,
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
