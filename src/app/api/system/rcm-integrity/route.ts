import { NextResponse } from 'next/server';
import { getRcmGovernanceData } from '@/lib/d1-core';

export const dynamic = 'force-dynamic';

const EXPECTED = {
  controls: 132,
  uusControls: 42,
  itgcControls: 10,
  ckpnRequirements: 9,
  reverseRepoRequirements: 1,
  elcDraftReferences: 63,
  integrity: 'PASS'
} as const;

export async function GET() {
  try {
    const governance = await getRcmGovernanceData();
    const summary = governance.summary;
    const ok =
      // 132 controls is the immutable, source-validated 2026 baseline.
      // Extra live controls are permitted ONLY when they are separately
      // user-validated and explicitly disclosed; totals remain truthful.
      summary.baselineControls === EXPECTED.controls &&
      summary.controls >= summary.baselineControls &&
      summary.validatedSupplementaryControls === summary.controls - summary.baselineControls &&
      summary.uusControls === EXPECTED.uusControls &&
      summary.itgcControls === EXPECTED.itgcControls &&
      summary.ckpnRequirements === EXPECTED.ckpnRequirements &&
      summary.reverseRepoRequirements === EXPECTED.reverseRepoRequirements &&
      summary.elcDraftReferences === EXPECTED.elcDraftReferences &&
      summary.integrity === EXPECTED.integrity;

    return NextResponse.json(
      {
        ok,
        test: 'RCM_PRODUCTION_INTEGRITY',
        storage: 'cloudflare-d1',
        checkedAt: new Date().toISOString(),
        summary,
        acceptanceBasis: '2026_SOURCE_VALIDATED_BASELINE_PLUS_USER_VALIDATED_CONTROLS',
        expected: EXPECTED
      },
      {
        status: ok ? 200 : 409,
        headers: { 'Cache-Control': 'no-store' }
      }
    );
  } catch (error) {
    console.error('RCM production integrity verification failed:', error);
    return NextResponse.json(
      {
        ok: false,
        test: 'RCM_PRODUCTION_INTEGRITY',
        error: 'RCM production integrity verification could not be completed.'
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
