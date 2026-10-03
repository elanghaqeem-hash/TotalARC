import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getEnterpriseAnalysisSnapshot } from '@/lib/d1-enterprise-analysis';
import { buildEnterpriseAnalysisPdf } from '@/lib/enterprise-analysis-pdf';

export const dynamic = 'force-dynamic';

function safeFileName(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'Total-ARC-Analysis';
}

export async function GET(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context?.institution) {
      return new Response('Institusi aktif diperlukan.', { status: 409 });
    }

    const analysisId = new URL(request.url).searchParams.get('analysisId') || '';
    if (!analysisId) return new Response('analysisId wajib diisi.', { status: 400 });

    const snapshot = await getEnterpriseAnalysisSnapshot(analysisId, context.institution.id);
    if (!['ACCEPTED', 'UPDATED'].includes(snapshot.status)) {
      return new Response(
        'Download PDF belum tersedia. Aksep atau perbarui hasil analisis terlebih dahulu.',
        { status: 409 }
      );
    }

    const bytes = buildEnterpriseAnalysisPdf(snapshot);
    const date = new Date(snapshot.reviewedAt || snapshot.generatedAt).toISOString().slice(0, 10);
    const fileName = safeFileName(
      'Total-ARC-Analisis-' + (snapshot.institutionName || context.institution.name || 'Bank') + '-' + date
    ) + '.pdf';

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + fileName + '"',
        'Cache-Control': 'private, no-store, max-age=0'
      }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ENTERPRISE_ANALYSIS_NOT_FOUND') {
      return new Response('Hasil analisis tidak ditemukan.', { status: 404 });
    }
    console.error('Failed to generate enterprise analysis PDF:', error);
    return new Response('Gagal membuat PDF analisis.', { status: 500 });
  }
}
