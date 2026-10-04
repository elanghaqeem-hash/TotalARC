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
    const message = error instanceof Error ? error.message : '';
    let diagnosticCode = 'ICOFR_INTEGRITY_RUNTIME_ERROR';
    let failedCheck: string | null = null;
    let missingTables: string[] = [];

    if (message.startsWith('ICOFR_INTEGRITY_SCHEMA_NOT_READY:')) {
      diagnosticCode = 'ICOFR_INTEGRITY_SCHEMA_NOT_READY';
      missingTables = message
        .slice('ICOFR_INTEGRITY_SCHEMA_NOT_READY:'.length)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    } else if (message.startsWith('ICOFR_INTEGRITY_CHECK_FAILED:')) {
      diagnosticCode = 'ICOFR_INTEGRITY_CHECK_FAILED';
      failedCheck =
        message.slice('ICOFR_INTEGRITY_CHECK_FAILED:'.length).split(':')[0] || null;
    }

    return NextResponse.json(
      {
        ok: false,
        test: 'ICOFR_END_TO_END_REFERENTIAL_INTEGRITY',
        error: 'ICOFR referential integrity verification could not be completed.',
        diagnosticCode,
        failedCheck,
        missingTables
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
