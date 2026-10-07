import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  createRegulatoryObligation,
  createRegulatoryObligationLink,
  deleteRegulatoryObligationLink,
  getRegulatoryComplianceUniverse,
  recordRegulatoryObligationAssessment,
  updateRegulatoryObligation
} from '@/lib/d1-regulatory-obligations';

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

async function requireAccess(request: Request) {
  const context = await resolveInstitutionAccess(request);
  if (!context?.institution || !READ_ROLES.has(context.profile.role)) return null;
  return {
    institutionId: context.institution.id,
    profile: context.profile,
    canManage: MANAGE_ROLES.has(context.profile.role)
  };
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'REG_OBLIGATION_ERROR';
  const mapping: Record<string, [string, number]> = {
    REG_OBLIGATION_REQUIRED: ['Regulasi, kode kewajiban, dan uraian kewajiban wajib diisi.', 400],
    REG_OBLIGATION_REGULATION_NOT_FOUND: ['Regulasi eksternal tidak ditemukan pada institusi aktif.', 404],
    REG_OBLIGATION_OWNER_UNIT_NOT_FOUND: ['Unit pemilik tidak ditemukan pada institusi aktif.', 404],
    REG_OBLIGATION_DUPLICATE_CODE: ['Kode kewajiban sudah digunakan pada institusi ini.', 409],
    REG_OBLIGATION_NOT_FOUND: ['Kewajiban regulasi tidak ditemukan pada institusi aktif.', 404],
    REG_OBLIGATION_LINK_REQUIRED: ['Kewajiban, jenis target, dan target relasi wajib diisi.', 400],
    REG_OBLIGATION_TARGET_NOT_FOUND: ['Target relasi tidak ditemukan pada institusi aktif.', 404],
    REG_OBLIGATION_LINK_DUPLICATE: ['Relasi yang sama sudah tersedia.', 409],
    REG_OBLIGATION_LINK_NOT_FOUND: ['Relasi kewajiban tidak ditemukan.', 404],
    REG_OBLIGATION_ASSESSMENT_REQUIRED: ['Status, tanggal, dan assessor kepatuhan wajib diisi.', 400],
    REG_OBLIGATION_ACTION_OWNER_REQUIRED: ['PIC tindak lanjut wajib diisi untuk gap kepatuhan.', 400]
  };

  const mapped = mapping[code];
  if (mapped) {
    return NextResponse.json(
      { error: mapped[0], code },
      { status: mapped[1], headers: { 'Cache-Control': 'no-store' } }
    );
  }

  console.error('Regulatory obligation error:', error);
  return NextResponse.json(
    { error: 'Compliance Universe tidak dapat diproses.', code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const universe = await getRegulatoryComplianceUniverse(context.institutionId);
    return NextResponse.json(
      { canManage: context.canManage, ...universe },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAccess(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!context.canManage) {
      return NextResponse.json(
        { error: 'Role ini memiliki akses baca saja pada Compliance Universe.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '').trim().toUpperCase();
    const actorName = context.profile.name || context.profile.email || context.profile.id;

    if (action === 'CREATE_OBLIGATION') {
      const record = await createRegulatoryObligation(
        context.institutionId,
        {
          regulationId: String(body.regulationId || ''),
          obligationCode: String(body.obligationCode || ''),
          sourceArticle: typeof body.sourceArticle === 'string' ? body.sourceArticle : null,
          requirementText: String(body.requirementText || ''),
          requirementType: typeof body.requirementType === 'string' ? body.requirementType : null,
          applicability: typeof body.applicability === 'string' ? body.applicability : null,
          frequency: typeof body.frequency === 'string' ? body.frequency : null,
          ownerUnitId: typeof body.ownerUnitId === 'string' ? body.ownerUnitId : null,
          ownerName: typeof body.ownerName === 'string' ? body.ownerName : null,
          criticality: typeof body.criticality === 'string' ? body.criticality : null,
          effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : null,
          dueDate: typeof body.dueDate === 'string' ? body.dueDate : null,
          reviewDate: typeof body.reviewDate === 'string' ? body.reviewDate : null,
          status: typeof body.status === 'string' ? body.status : null,
          notes: typeof body.notes === 'string' ? body.notes : null
        },
        actorName
      );
      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'UPDATE_OBLIGATION') {
      const obligationId = String(body.obligationId || '').trim();
      const record = await updateRegulatoryObligation(
        context.institutionId,
        obligationId,
        {
          sourceArticle: body.sourceArticle === undefined ? undefined : String(body.sourceArticle || ''),
          requirementText: body.requirementText === undefined ? undefined : String(body.requirementText || ''),
          requirementType: body.requirementType === undefined ? undefined : String(body.requirementType || ''),
          applicability: body.applicability === undefined ? undefined : String(body.applicability || ''),
          frequency: body.frequency === undefined ? undefined : String(body.frequency || ''),
          ownerUnitId: body.ownerUnitId === undefined ? undefined : String(body.ownerUnitId || ''),
          ownerName: body.ownerName === undefined ? undefined : String(body.ownerName || ''),
          criticality: body.criticality === undefined ? undefined : String(body.criticality || ''),
          effectiveDate: body.effectiveDate === undefined ? undefined : String(body.effectiveDate || ''),
          dueDate: body.dueDate === undefined ? undefined : String(body.dueDate || ''),
          reviewDate: body.reviewDate === undefined ? undefined : String(body.reviewDate || ''),
          status: body.status === undefined ? undefined : String(body.status || ''),
          notes: body.notes === undefined ? undefined : String(body.notes || '')
        }
      );
      return NextResponse.json({ changed: true, record }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'LINK_TARGET') {
      const record = await createRegulatoryObligationLink(
        context.institutionId,
        {
          obligationId: String(body.obligationId || ''),
          targetType: String(body.targetType || ''),
          targetId: String(body.targetId || ''),
          relationship: typeof body.relationship === 'string' ? body.relationship : null,
          rationale: typeof body.rationale === 'string' ? body.rationale : null
        },
        actorName
      );
      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'UNLINK_TARGET') {
      const result = await deleteRegulatoryObligationLink(
        context.institutionId,
        String(body.linkId || '')
      );
      return NextResponse.json({ changed: true, ...result }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'RECORD_ASSESSMENT') {
      const record = await recordRegulatoryObligationAssessment(
        context.institutionId,
        {
          obligationId: String(body.obligationId || ''),
          complianceStatus: String(body.complianceStatus || ''),
          assessmentDate: typeof body.assessmentDate === 'string' ? body.assessmentDate : null,
          assessedBy: actorName,
          conclusion: typeof body.conclusion === 'string' ? body.conclusion : null,
          gapSummary: typeof body.gapSummary === 'string' ? body.gapSummary : null,
          remediationRequired: body.remediationRequired === true,
          actionOwner: typeof body.actionOwner === 'string' ? body.actionOwner : null,
          dueDate: typeof body.dueDate === 'string' ? body.dueDate : null,
          nextAssessmentDate: typeof body.nextAssessmentDate === 'string' ? body.nextAssessmentDate : null
        }
      );
      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    return NextResponse.json(
      { error: 'Action Compliance Universe tidak dikenali.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
