import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  getEnterpriseAnalysisSnapshot,
  reviewEnterpriseAnalysisSnapshot
} from '@/lib/d1-enterprise-analysis';

export const dynamic = 'force-dynamic';

function text(value: unknown, max = 5000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function normalizeAnalysis(value: unknown) {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};

  const recommendations = Array.isArray(source.recommendations)
    ? source.recommendations
        .filter(item => typeof item === 'string' && item.trim())
        .slice(0, 8)
        .map(item => String(item).trim().slice(0, 1200))
    : [];

  return {
    headline: text(source.headline, 500),
    executiveSummary: text(source.executiveSummary, 5000),
    icofrInsight: text(source.icofrInsight, 3000),
    riskInsight: text(source.riskInsight, 3000),
    complianceInsight: text(source.complianceInsight, 3000),
    priorityInsight: text(source.priorityInsight, 3000),
    recommendations,
    caution: text(source.caution, 3000)
  };
}

export async function GET(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context?.institution) {
      return NextResponse.json({ error: 'Institusi aktif diperlukan.' }, { status: 409 });
    }

    const id = new URL(request.url).searchParams.get('analysisId') || '';
    if (!id) return NextResponse.json({ error: 'analysisId wajib diisi.' }, { status: 400 });

    const snapshot = await getEnterpriseAnalysisSnapshot(id, context.institution.id);
    return NextResponse.json({ snapshot }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ENTERPRISE_ANALYSIS_NOT_FOUND') {
      return NextResponse.json({ error: 'Hasil analisis tidak ditemukan.' }, { status: 404 });
    }
    console.error('Failed to load enterprise analysis review:', error);
    return NextResponse.json({ error: 'Gagal memuat status reviu analisis.' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context?.institution) {
      return NextResponse.json({ error: 'Institusi aktif diperlukan.' }, { status: 409 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const analysisId = text(body.analysisId, 120);
    const action = String(body.action || '').toUpperCase();

    if (!analysisId || !['ACCEPT', 'UPDATE'].includes(action)) {
      return NextResponse.json(
        { error: 'analysisId dan action ACCEPT/UPDATE wajib diisi.' },
        { status: 400 }
      );
    }

    const actor = context.profile.name || context.profile.email;
    const analysis =
      action === 'UPDATE'
        ? normalizeAnalysis(body.analysis)
        : undefined;

    if (action === 'UPDATE') {
      if (!analysis?.headline || !analysis?.executiveSummary) {
        return NextResponse.json(
          { error: 'Headline dan ringkasan eksekutif wajib diisi sebelum menyimpan update.' },
          { status: 400 }
        );
      }
    }

    const snapshot = await reviewEnterpriseAnalysisSnapshot({
      id: analysisId,
      institutionId: context.institution.id,
      actor,
      action: action as 'ACCEPT' | 'UPDATE',
      analysis
    });

    return NextResponse.json({
      snapshot,
      downloadAllowed: ['ACCEPTED', 'UPDATED'].includes(snapshot.status),
      message:
        snapshot.status === 'UPDATED'
          ? 'Hasil analisis telah diperbarui dan dikunci sebagai versi tervalidasi pengguna. Download PDF sekarang tersedia.'
          : 'Hasil analisis telah diaksep pengguna. Download PDF sekarang tersedia.'
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ENTERPRISE_ANALYSIS_NOT_FOUND') {
      return NextResponse.json({ error: 'Hasil analisis tidak ditemukan.' }, { status: 404 });
    }
    console.error('Failed to review enterprise analysis:', error);
    return NextResponse.json({ error: 'Gagal menyimpan reviu analisis.' }, { status: 500 });
  }
}
