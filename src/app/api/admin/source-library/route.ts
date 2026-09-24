import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getAuthenticatedProfile } from '@/lib/auth';
import { AUTH_COOKIE_NAME } from '@/lib/auth-token';
import {
  getSourceLibraryMetrics,
  getSourcePrecedenceSummary,
  listEffectiveSourceDocuments,
  listSourceDocuments,
  resolveSourceInstitution,
  upsertSourceDocument
} from '@/lib/d1-source-library';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context || context.profile.role !== 'Admin' || !context.institution) return null;
  return {
    ...context.profile,
    institutionId: context.institution.id,
    institutionName: context.institution.name
  };
}

function classifyModule(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes('itgc')) return 'ICOFR_ITGC';
  if (normalized.includes('csa')) return 'CSA';
  if (normalized.includes('materialitas') || normalized.includes('scoping')) return 'ICOFR_SCOPING';
  if (normalized.includes('gap_analysis') || normalized.includes('gap analysis')) return 'ICOFR_GAP_ANALYSIS';
  if (normalized.includes('register_risiko') || normalized.includes('register risiko')) return 'RISK_REGISTER';
  if (normalized.includes('identifikasi_risiko') || normalized.includes('identifikasi risiko')) return 'ICOFR_RCM';
  if (normalized.includes('bpm') || normalized.includes('rcm')) return 'BPM_RCM';
  if (normalized.includes('walkthrough') || normalized.includes('walktrough')) return 'WALKTHROUGH';
  if (normalized.includes('metodologi')) return 'ICOFR_METHODOLOGY';
  if (normalized.includes('permintaan_data') || normalized.includes('permintaan data')) return 'PBC_DATA_REQUEST';
  if (normalized.includes('rencana_kerja') || normalized.includes('rencana kerja')) return 'PROJECT_PLAN';
  return 'SOURCE_LIBRARY';
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'SOURCE_LIBRARY_ERROR';
  const mapping: Record<string, { status: number; error: string }> = {
    SOURCE_LIBRARY_REQUIRED_FIELDS: { status: 400, error: 'Source ID dan nama dokumen wajib diisi.' },
    SOURCE_LIBRARY_FILE_TOO_LARGE: { status: 413, error: 'File sumber melebihi batas 8 MB per file.' },
    SOURCE_LIBRARY_INSTITUTION_NOT_FOUND: { status: 409, error: 'Institusi tujuan belum tersedia di database.' },
    SOURCE_LIBRARY_INSTITUTION_AMBIGUOUS: { status: 409, error: 'Institusi tujuan perlu dipilih secara eksplisit.' }
  };
  const mapped = mapping[code];
  if (mapped) {
    return NextResponse.json({ error: mapped.error, code }, {
      status: mapped.status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }
  console.error('Source library error:', error);
  return NextResponse.json(
    { error: 'Source library tidak dapat diproses.', code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const institution = admin.institutionId
      ? { id: admin.institutionId }
      : await resolveSourceInstitution('Bank Kalbar');
    const [documents, effectiveDocuments, metrics, precedence] = await Promise.all([
      listSourceDocuments(institution.id),
      listEffectiveSourceDocuments(institution.id),
      getSourceLibraryMetrics(institution.id),
      getSourcePrecedenceSummary(institution.id)
    ]);

    return NextResponse.json({
      storage: 'cloudflare-d1',
      sourceLibrary: true,
      institutionId: institution.id,
      metrics,
      precedence,
      effectiveDocuments,
      documents
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const form = await request.formData();
    const fileValue = form.get('file');
    const file = fileValue instanceof File ? fileValue : null;
    const title = String(form.get('title') || file?.name || '').trim();
    const externalId = String(form.get('externalId') || '').trim();
    const provider = String(form.get('provider') || 'UPLOAD').trim().toUpperCase();
    const sourceKind = String(form.get('sourceKind') || 'ROOT_FILE').trim().toUpperCase();
    const parentExternalId = String(form.get('parentExternalId') || '').trim() || null;
    const sourceUrl = String(form.get('sourceUrl') || '').trim() || null;
    const sourceCreatedAt = String(form.get('sourceCreatedAt') || '').trim() || null;
    const sourceModifiedAt = String(form.get('sourceModifiedAt') || '').trim() || null;
    const module = String(form.get('module') || '').trim() || classifyModule(title);
    const extractedText = String(form.get('extractedText') || '');

    if (!externalId || !title) throw new Error('SOURCE_LIBRARY_REQUIRED_FIELDS');
    if (!['GOOGLE_DRIVE', 'UPLOAD', 'MIGRATION'].includes(provider)) {
      return NextResponse.json({ error: 'Provider tidak didukung.' }, { status: 400 });
    }
    if (!['ROOT_FILE', 'ARCHIVE_MEMBER', 'DERIVED_TEXT'].includes(sourceKind)) {
      return NextResponse.json({ error: 'Jenis source tidak didukung.' }, { status: 400 });
    }

    const institution = admin.institutionId
      ? { id: admin.institutionId }
      : await resolveSourceInstitution('Bank Kalbar');

    const rawBytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
    const result = await upsertSourceDocument(institution.id, {
      provider: provider as 'GOOGLE_DRIVE' | 'UPLOAD' | 'MIGRATION',
      externalId,
      parentExternalId,
      sourceKind: sourceKind as 'ROOT_FILE' | 'ARCHIVE_MEMBER' | 'DERIVED_TEXT',
      title,
      mimeType: file?.type || String(form.get('mimeType') || '') || null,
      sourceUrl,
      sourceCreatedAt,
      sourceModifiedAt,
      module,
      sensitivity: 'Confidential',
      rawBytes,
      extractedText,
      metadata: {
        importedBy: admin.id,
        importedByRole: admin.role,
        originalFileName: file?.name || null
      }
    }, 'Source material imported by Total ARC administrator.');

    return NextResponse.json({
      storage: 'cloudflare-d1',
      sourceLibrary: true,
      changed: result.changed,
      document: result.record
    }, {
      status: result.changed ? 201 : 200,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
