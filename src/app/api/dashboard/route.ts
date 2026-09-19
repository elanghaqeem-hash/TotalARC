import { NextResponse } from 'next/server';
import { getCoreDashboardData } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getCoreDashboardData());
  } catch (error) {
    console.error('Failed to fetch D1 dashboard metrics:', error);
    return NextResponse.json({ error: 'Failed to load dashboard data from persistent database.' }, { status: 503 });
  }
}
