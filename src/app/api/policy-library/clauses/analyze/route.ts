import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { guardAiPost } from '@/lib/ai/http-security';
import { analyzeRegulatoryClauses } from '@/lib/d1-regulatory-clause-intelligence';

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
    const regulationId = String(guarded.body.regulationId || '').trim();
    const sourceVersionId = String(guarded.body.sourceVersionId || '').trim();
    if (!regulationId || !sourceVersionId) {
      return NextResponse.json(
        { error: 'Regulasi dan versi sumber wajib dipilih.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const actorName = context.profile.name || context.profile.email || context.profile.id;
    const result = await analyzeRegulatoryClauses(
      context.institution.id,
      { regulationId, sourceVersionId },
      actorName
    );
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'REG_CLAUSE_AI_ERROR';
    const status =
      code === 'REG_CLAUSE_SOURCE_VERSION_NOT_FOUND' ? 404 :
      code === 'REG_CLAUSE_ARTICLES_NOT_FOUND' ? 422 :
      code === 'REG_CLAUSE_AI_INVALID_JSON' ? 502 :
      500;

    const message =
      code === 'REG_CLAUSE_SOURCE_VERSION_NOT_FOUND'
        ? 'Versi sumber regulasi tidak ditemukan.'
        : code === 'REG_CLAUSE_ARTICLES_NOT_FOUND'
          ? 'Pasal tidak dapat dikenali dari teks sumber.'
          : code === 'REG_CLAUSE_AI_INVALID_JSON'
            ? 'AI belum mengembalikan draft obligation terstruktur.'
            : 'Analisis klausul regulasi belum dapat diselesaikan.';

    console.error('Regulatory clause AI error:', error);
    return NextResponse.json(
      { error: message, code },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
