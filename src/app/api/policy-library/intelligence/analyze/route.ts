import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { guardAiPost } from '@/lib/ai/http-security';
import { analyzeRegulatoryCandidate } from '@/lib/d1-policy-intelligence';

export const dynamic = 'force-dynamic';

const MANAGE_ROLES = new Set(['SystemAdmin', 'Admin', 'ComplianceOfficer']);

export async function POST(request: Request) {
  const guarded = await guardAiPost(request, 'AI_ANALYZE_RATE_LIMIT', 64 * 1024);
  if (!guarded.ok) return guarded.response;

  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || !MANAGE_ROLES.has(context.profile.role)) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const candidateId = String(guarded.body.candidateId || '').trim();
    if (!candidateId) {
      return NextResponse.json(
        { error: 'Kandidat regulasi wajib dipilih.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const result = await analyzeRegulatoryCandidate(context.institution.id, candidateId);
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'POLICY_INTELLIGENCE_AI_ERROR';
    const status =
      code === 'POLICY_INTELLIGENCE_CANDIDATE_NOT_FOUND' ? 404 :
      code === 'POLICY_INTELLIGENCE_AI_INVALID_JSON' ? 502 :
      500;
    const message =
      code === 'POLICY_INTELLIGENCE_CANDIDATE_NOT_FOUND'
        ? 'Kandidat regulasi tidak ditemukan.'
        : code === 'POLICY_INTELLIGENCE_AI_INVALID_JSON'
          ? 'AI belum mengembalikan analisis terstruktur yang dapat digunakan.'
          : 'Analisis AI terhadap regulasi belum dapat diselesaikan.';

    console.error('Regulatory intelligence AI error:', error);
    return NextResponse.json(
      { error: message, code },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
