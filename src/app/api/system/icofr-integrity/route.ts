import { NextResponse } from 'next/server';
import { getIcofrReferentialIntegrityReport } from '@/lib/d1-icofr-integrity';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const report = await getIcofrReferentialIntegrityReport();
    return NextResponse.json(report, {
      status: report.ok ? 200 : 409,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.error('ICOFR referential integrity verification failed:', error);
    return NextResponse.json(
      {
        ok: false,
        test: 'ICOFR_END_TO_END_REFERENTIAL_INTEGRITY',
        error: 'ICOFR referential integrity verification could not be completed.'
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
