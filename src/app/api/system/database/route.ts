import { NextResponse } from 'next/server';
import { getD1Health } from '@/lib/d1';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const health = await getD1Health();

    return NextResponse.json(
      {
        ok: true,
        database: 'cloudflare-d1',
        persistent: true,
        readOnlyProbe: true,
        health
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  } catch (error) {
    console.error('D1 connectivity health check failed:', error);
    return NextResponse.json(
      {
        ok: false,
        database: 'cloudflare-d1',
        persistent: false,
        readOnlyProbe: true,
        error: 'D1 binding or query execution is unavailable.'
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  }
}
