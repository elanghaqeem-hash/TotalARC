import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { listEffectiveSourceDocuments } from '@/lib/d1-source-library';
import {
  createExternalRegulation,
  createPolicyDocument,
  listPolicyLibraryOverview,
  listPolicyLibraryRegulatoryData,
  recordPolicyReview,
  upsertPolicyRegulationImpact
} from '@/lib/d1-policy-library';
import {
  getPolicyRegistrySummary,
  syncPolicyRegistryFromDatabase
} from '@/lib/d1-policy-registry';

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

async function getContext(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || !READ_ROLES.has(context.profile.role)) return null;
  return {
    profile: context.profile,
    institution: context.institution,
    canManage: MANAGE_ROLES.has(context.profile.role)
  };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'POLICY_LIBRARY_ERROR';
  const mapping: Record<string, { status: number; error: string }> = {
    POLICY_LIBRARY_DOCUMENT_CODE_REQUIRED: { status: 400, error: 'Kode ketentuan wajib diisi.' },
    POLICY_LIBRARY_DOCUMENT_TYPE_REQUIRED: { status: 400, error: 'Jenis ketentuan wajib dipilih.' },
    POLICY_LIBRARY_TITLE_REQUIRED: { status: 400, error: 'Judul ketentuan wajib diisi.' },
    POLICY_LIBRARY_DUPLICATE_CODE: { status: 409, error: 'Kode ketentuan sudah digunakan pada institusi ini.' },
    POLICY_LIBRARY_REGULATOR_REQUIRED: { status: 400, error: 'Nama regulator wajib diisi.' },
    POLICY_LIBRARY_REGULATION_CODE_REQUIRED: { status: 400, error: 'Nomor/kode regulasi wajib diisi.' },
    POLICY_LIBRARY_REGULATION_TITLE_REQUIRED: { status: 400, error: 'Judul regulasi wajib diisi.' },
    POLICY_LIBRARY_DUPLICATE_REGULATION: { status: 409, error: 'Regulasi tersebut sudah ada pada daftar pantauan.' },
    POLICY_LIBRARY_POLICY_REQUIRED: { status: 400, error: 'Ketentuan internal wajib dipilih.' },
    POLICY_LIBRARY_REGULATION_REQUIRED: { status: 400, error: 'Regulasi eksternal wajib dipilih.' },
    POLICY_LIBRARY_POLICY_NOT_FOUND: { status: 404, error: 'Ketentuan internal tidak ditemukan untuk institusi aktif.' },
    POLICY_LIBRARY_REGULATION_NOT_FOUND: { status: 404, error: 'Regulasi eksternal tidak ditemukan untuk institusi aktif.' },
    POLICY_LIBRARY_REVIEWER_REQUIRED: { status: 400, error: 'Nama reviewer wajib diisi.' },
    POLICY_LIBRARY_REVIEW_OUTCOME_REQUIRED: { status: 400, error: 'Hasil review wajib dipilih.' },
    POLICY_LIBRARY_SOURCE_NOT_FOUND: { status: 404, error: 'File sumber tidak ditemukan atau bukan milik institusi aktif.' },
    POLICY_REGISTRY_DATABASE_UNAVAILABLE: { status: 503, error: 'Database registry ketentuan belum tersedia.' }
  };

  const mapped = mapping[code];
  if (mapped) {
    return NextResponse.json({ error: mapped.error, code }, {
      status: mapped.status,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  console.error('Policy library error:', error);
  return NextResponse.json(
    { error: 'Policy & Regulatory Library tidak dapat diproses.', code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  try {
    const context = await getContext(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const url = new URL(request.url);
    const mode = String(url.searchParams.get('mode') || 'summary').toLowerCase();

    if (mode === 'sources') {
      const sourceDocuments = await listEffectiveSourceDocuments(context.institution.id);
      return NextResponse.json({
        institutionId: context.institution.id,
        canManage: context.canManage,
        uploadedSources: sourceDocuments.map(item => ({
          id: item.id,
          title: item.title,
          provider: item.provider,
          sourceKind: item.sourceKind,
          mimeType: item.mimeType,
          sourceCreatedAt: item.sourceCreatedAt,
          sourceModifiedAt: item.sourceModifiedAt,
          module: item.module,
          rawSizeBytes: item.rawSizeBytes,
          importedAt: item.importedAt,
          updatedAt: item.updatedAt
        }))
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (mode === 'regulatory') {
      const regulatory = await listPolicyLibraryRegulatoryData(context.institution.id);
      return NextResponse.json({
        institutionId: context.institution.id,
        canManage: context.canManage,
        ...regulatory
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const [registry, dashboard] = await Promise.all([
      getPolicyRegistrySummary(context.institution.id),
      listPolicyLibraryOverview(context.institution.id)
    ]);

    return NextResponse.json({
      institutionId: context.institution.id,
      institutionName: context.institution.name,
      canManage: context.canManage,
      ...dashboard,
      registry,
      uploadedSources: []
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getContext(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!context.canManage) {
      return NextResponse.json(
        { error: 'Role ini memiliki akses baca saja pada Policy & Regulatory Library.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '').trim().toUpperCase();
    const actorName = context.profile.name || context.profile.email || context.profile.id;

    if (action === 'SYNC_REGISTRY') {
      const result = await syncPolicyRegistryFromDatabase(
        context.institution.id,
        actorName
      );
      return NextResponse.json({ changed: true, result }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'CREATE_POLICY') {
      const record = await createPolicyDocument(context.institution.id, {
        sourceDocumentId: typeof body.sourceDocumentId === 'string' ? body.sourceDocumentId : null,
        documentCode: String(body.documentCode || ''),
        documentType: String(body.documentType || ''),
        title: String(body.title || ''),
        ownerUnit: typeof body.ownerUnit === 'string' ? body.ownerUnit : null,
        ownerName: typeof body.ownerName === 'string' ? body.ownerName : null,
        status: typeof body.status === 'string' ? body.status : null,
        version: typeof body.version === 'string' ? body.version : null,
        issueDate: typeof body.issueDate === 'string' ? body.issueDate : null,
        effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : null,
        lastReviewDate: typeof body.lastReviewDate === 'string' ? body.lastReviewDate : null,
        nextReviewDate: typeof body.nextReviewDate === 'string' ? body.nextReviewDate : null,
        reviewCycleMonths: typeof body.reviewCycleMonths === 'number'
          ? body.reviewCycleMonths
          : Number(body.reviewCycleMonths || 12),
        expiryDate: typeof body.expiryDate === 'string' ? body.expiryDate : null,
        scope: typeof body.scope === 'string' ? body.scope : null,
        summary: typeof body.summary === 'string' ? body.summary : null
      }, actorName);

      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'REGISTER_FROM_SOURCE') {
      const sourceDocumentId = String(body.sourceDocumentId || '').trim();
      const sourceDocuments = await listEffectiveSourceDocuments(context.institution.id);
      const source = sourceDocuments.find(item => item.id === sourceDocumentId);
      if (!source) throw new Error('POLICY_LIBRARY_SOURCE_NOT_FOUND');

      const record = await createPolicyDocument(context.institution.id, {
        sourceDocumentId,
        documentCode: String(body.documentCode || ''),
        documentType: String(body.documentType || ''),
        title: String(body.title || source.title || ''),
        ownerUnit: typeof body.ownerUnit === 'string' ? body.ownerUnit : null,
        ownerName: typeof body.ownerName === 'string' ? body.ownerName : null,
        status: typeof body.status === 'string' ? body.status : 'Berlaku',
        version: typeof body.version === 'string' ? body.version : '1.0',
        issueDate: typeof body.issueDate === 'string' ? body.issueDate : source.sourceCreatedAt,
        effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : null,
        lastReviewDate: typeof body.lastReviewDate === 'string' ? body.lastReviewDate : null,
        nextReviewDate: typeof body.nextReviewDate === 'string' ? body.nextReviewDate : null,
        reviewCycleMonths: typeof body.reviewCycleMonths === 'number'
          ? body.reviewCycleMonths
          : Number(body.reviewCycleMonths || 12),
        scope: typeof body.scope === 'string' ? body.scope : null,
        summary: typeof body.summary === 'string' ? body.summary : null
      }, actorName);

      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'CREATE_REGULATION') {
      const record = await createExternalRegulation(context.institution.id, {
        regulator: String(body.regulator || ''),
        regulationCode: String(body.regulationCode || ''),
        title: String(body.title || ''),
        category: typeof body.category === 'string' ? body.category : null,
        issueDate: typeof body.issueDate === 'string' ? body.issueDate : null,
        effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : null,
        sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
        status: typeof body.status === 'string' ? body.status : null,
        summary: typeof body.summary === 'string' ? body.summary : null
      }, actorName);

      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'LINK_IMPACT') {
      const record = await upsertPolicyRegulationImpact(context.institution.id, {
        policyDocumentId: String(body.policyDocumentId || ''),
        regulationId: String(body.regulationId || ''),
        impactLevel: typeof body.impactLevel === 'string' ? body.impactLevel : null,
        changeRequired: typeof body.changeRequired === 'boolean'
          ? body.changeRequired
          : Number(body.changeRequired ?? 1),
        impactSummary: typeof body.impactSummary === 'string' ? body.impactSummary : null,
        actionOwner: typeof body.actionOwner === 'string' ? body.actionOwner : null,
        dueDate: typeof body.dueDate === 'string' ? body.dueDate : null,
        actionStatus: typeof body.actionStatus === 'string' ? body.actionStatus : null
      }, actorName);

      return NextResponse.json({ changed: true, record }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'RECORD_REVIEW') {
      const record = await recordPolicyReview(context.institution.id, {
        policyDocumentId: String(body.policyDocumentId || ''),
        reviewDate: typeof body.reviewDate === 'string' ? body.reviewDate : null,
        reviewerName: String(body.reviewerName || actorName),
        outcome: String(body.outcome || ''),
        notes: typeof body.notes === 'string' ? body.notes : null,
        resultingVersion: typeof body.resultingVersion === 'string' ? body.resultingVersion : null,
        nextReviewDate: typeof body.nextReviewDate === 'string' ? body.nextReviewDate : null
      });

      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    return NextResponse.json(
      { error: 'Action Policy & Regulatory Library tidak dikenali.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
