import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  buildRegulatoryClauseSnapshot,
  compareRegulationSourceVersions,
  getRegulatoryClauseWorkspace,
  linkRegulationSourceVersion,
  reviewClauseImpactDraft,
  reviewRegulatoryClauseDraft
} from '@/lib/d1-regulatory-clause-intelligence';

export const dynamic = 'force-dynamic';

const READ_ROLES = new Set([
  'SystemAdmin',
  'Admin',
  'ComplianceOfficer',
  'RiskManager',
  'InternalAuditor',
  'Executive',
  'ReadOnlyAuditor'
]);

const MANAGE_ROLES = new Set(['SystemAdmin', 'Admin', 'ComplianceOfficer']);

async function access(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || !READ_ROLES.has(context.profile.role)) return null;
  return {
    institutionId: context.institution.id,
    profile: context.profile,
    canManage: MANAGE_ROLES.has(context.profile.role)
  };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'REG_CLAUSE_ERROR';
  const mapping: Record<string, [string, number]> = {
    REG_CLAUSE_SOURCE_REQUIRED: ['Regulasi, dokumen sumber, dan label versi wajib diisi.', 400],
    REG_CLAUSE_REGULATION_NOT_FOUND: ['Regulasi tidak ditemukan pada institusi aktif.', 404],
    REG_CLAUSE_SOURCE_NOT_FOUND: ['Dokumen sumber tidak ditemukan pada institusi aktif.', 404],
    REG_CLAUSE_SOURCE_TEXT_REQUIRED: ['Dokumen belum memiliki teks terindeks/OCR yang dapat dianalisis.', 409],
    REG_CLAUSE_SOURCE_VERSION_NOT_FOUND: ['Versi dokumen regulasi tidak ditemukan.', 404],
    REG_CLAUSE_VERSION_REGULATION_MISMATCH: ['Kedua versi harus berasal dari regulasi yang sama.', 400],
    REG_CLAUSE_ARTICLES_NOT_FOUND: ['Pasal tidak dapat dikenali dari teks. Periksa hasil OCR/text extraction terlebih dahulu.', 422],
    REG_CLAUSE_DRAFT_NOT_FOUND: ['Draft obligation tidak ditemukan.', 404],
    REG_CLAUSE_DRAFT_NOT_PENDING: ['Draft obligation sudah pernah direview.', 409],
    REG_CLAUSE_IMPACT_NOT_FOUND: ['Usulan dampak tidak ditemukan.', 404],
    REG_CLAUSE_IMPACT_NOT_PENDING: ['Usulan dampak sudah pernah direview.', 409],
    REG_CLAUSE_SOURCE_CONTEXT_MISSING: ['Konteks sumber draft tidak lengkap.', 409]
  };
  const mapped = mapping[code];
  if (mapped) {
    return NextResponse.json(
      { error: mapped[0], code },
      { status: mapped[1], headers: { 'Cache-Control': 'no-store' } }
    );
  }
  console.error('Regulatory clause intelligence error:', error);
  return NextResponse.json(
    { error: 'Regulatory Clause Intelligence tidak dapat diproses.', code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  try {
    const context = await access(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const workspace = await getRegulatoryClauseWorkspace(context.institutionId);
    return NextResponse.json(
      { canManage: context.canManage, ...workspace },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await access(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!context.canManage) {
      return NextResponse.json(
        { error: 'Role ini memiliki akses baca saja pada Regulatory Clause Intelligence.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '').trim().toUpperCase();
    const actorName = context.profile.name || context.profile.email || context.profile.id;

    if (action === 'LINK_SOURCE_VERSION') {
      const record = await linkRegulationSourceVersion(
        context.institutionId,
        {
          regulationId: String(body.regulationId || ''),
          sourceDocumentId: String(body.sourceDocumentId || ''),
          versionLabel: String(body.versionLabel || ''),
          sourceDate: typeof body.sourceDate === 'string' ? body.sourceDate : null,
          effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : null,
          isCurrent: body.isCurrent !== false
        },
        actorName
      );
      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'BUILD_SNAPSHOT') {
      const clauses = await buildRegulatoryClauseSnapshot(
        context.institutionId,
        String(body.sourceVersionId || '')
      );
      return NextResponse.json(
        { changed: true, clauses, clauseCount: clauses.length },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (action === 'COMPARE_VERSIONS') {
      const result = await compareRegulationSourceVersions(
        context.institutionId,
        String(body.olderSourceVersionId || ''),
        String(body.newerSourceVersionId || '')
      );
      return NextResponse.json(
        { changed: false, result },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (action === 'REVIEW_IMPACT') {
      const decision = String(body.decision || '').toUpperCase();
      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        return NextResponse.json(
          { error: 'Decision harus APPROVE atau REJECT.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const result = await reviewClauseImpactDraft(
        context.institutionId,
        String(body.impactId || ''),
        decision,
        actorName
      );
      return NextResponse.json({ changed: true, result }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'REVIEW_DRAFT') {
      const decision = String(body.decision || '').toUpperCase();
      if (decision !== 'ACCEPT' && decision !== 'REJECT') {
        return NextResponse.json(
          { error: 'Decision harus ACCEPT atau REJECT.' },
          { status: 400, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      const result = await reviewRegulatoryClauseDraft(
        context.institutionId,
        String(body.draftId || ''),
        decision,
        actorName
      );
      return NextResponse.json({ changed: true, result }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    return NextResponse.json(
      { error: 'Action Regulatory Clause Intelligence tidak dikenali.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
