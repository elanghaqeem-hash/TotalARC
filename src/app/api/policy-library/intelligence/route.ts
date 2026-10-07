import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import {
  addRegulatoryWatchSource,
  createPolicyRelationship,
  getPolicyIntelligenceDashboard,
  scanAllRegulatorySources,
  scanRegulatorySource,
  seedOfficialSources
} from '@/lib/d1-policy-intelligence';

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
  const code = error instanceof Error ? error.message : 'POLICY_INTELLIGENCE_ERROR';
  const mapping: Record<string, { status: number; error: string }> = {
    POLICY_INTELLIGENCE_SOURCE_REQUIRED: {
      status: 400,
      error: 'Nama sumber dan regulator wajib diisi.'
    },
    POLICY_INTELLIGENCE_INVALID_SOURCE_URL: {
      status: 400,
      error: 'URL sumber harus berupa HTTPS publik yang valid.'
    },
    POLICY_INTELLIGENCE_DUPLICATE_SOURCE: {
      status: 409,
      error: 'Sumber pantauan tersebut sudah terdaftar.'
    },
    POLICY_INTELLIGENCE_SOURCE_NOT_FOUND: {
      status: 404,
      error: 'Sumber pantauan tidak ditemukan atau tidak aktif.'
    },
    POLICY_INTELLIGENCE_UNSUPPORTED_SOURCE_CONTENT: {
      status: 415,
      error: 'Sumber pantauan tidak mengembalikan halaman teks/HTML/XML.'
    },
    POLICY_INTELLIGENCE_SOURCE_TOO_LARGE: {
      status: 413,
      error: 'Halaman sumber terlalu besar untuk dipindai secara langsung.'
    },
    POLICY_INTELLIGENCE_TOO_MANY_REDIRECTS: {
      status: 502,
      error: 'Sumber pantauan melakukan terlalu banyak redirect.'
    },
    POLICY_RELATION_REQUIRED_FIELDS: {
      status: 400,
      error: 'Sumber, tujuan, dan jenis relasi wajib diisi.'
    },
    POLICY_RELATION_SELF_REFERENCE: {
      status: 400,
      error: 'Ketentuan tidak dapat direlasikan dengan dirinya sendiri.'
    },
    POLICY_RELATION_ENTITY_NOT_FOUND: {
      status: 404,
      error: 'Ketentuan sumber atau tujuan tidak ditemukan pada institusi aktif.'
    },
    POLICY_RELATION_DUPLICATE: {
      status: 409,
      error: 'Relasi yang sama sudah tersedia.'
    }
  };

  const mapped = mapping[code];
  if (mapped) {
    return NextResponse.json(
      { error: mapped.error, code },
      { status: mapped.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (code.startsWith('POLICY_INTELLIGENCE_SOURCE_HTTP_')) {
    return NextResponse.json(
      { error: 'Portal sumber tidak dapat diakses saat ini.', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  console.error('Policy intelligence error:', error);
  return NextResponse.json(
    { error: 'Regulatory Intelligence tidak dapat diproses.', code },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request) {
  try {
    const context = await access(request);
    if (!context) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const dashboard = await getPolicyIntelligenceDashboard(context.institutionId);
    return NextResponse.json({
      canManage: context.canManage,
      ...dashboard
    }, { headers: { 'Cache-Control': 'no-store' } });
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
        { error: 'Role ini memiliki akses baca saja pada Regulatory Intelligence.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '').trim().toUpperCase();
    const actorName = context.profile.name || context.profile.email || context.profile.id;

    if (action === 'ADD_SOURCE') {
      const keywords = Array.isArray(body.keywords)
        ? body.keywords.map(String)
        : String(body.keywords || '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);

      const record = await addRegulatoryWatchSource(context.institutionId, {
        regulator: String(body.regulator || ''),
        name: String(body.name || ''),
        sourceUrl: String(body.sourceUrl || ''),
        sourceType: typeof body.sourceType === 'string' ? body.sourceType : 'HTML',
        sector: typeof body.sector === 'string' ? body.sector : null,
        keywords
      }, actorName);

      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'SEED_OFFICIAL_SOURCES') {
      const result = await seedOfficialSources(context.institutionId, actorName);
      return NextResponse.json({ changed: result.created.length > 0, ...result }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'SCAN_SOURCE') {
      const result = await scanRegulatorySource(
        context.institutionId,
        String(body.sourceId || '')
      );
      return NextResponse.json({ changed: result.newCount > 0, result }, {
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    if (action === 'SCAN_ALL') {
      const results = await scanAllRegulatorySources(context.institutionId);
      return NextResponse.json({
        changed: results.some(item => item.ok && Number(item.newCount || 0) > 0),
        results
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (action === 'CREATE_RELATION') {
      const record = await createPolicyRelationship(context.institutionId, {
        sourceType: String(body.sourceType || ''),
        sourceId: String(body.sourceId || ''),
        targetType: String(body.targetType || ''),
        targetId: String(body.targetId || ''),
        relationType: String(body.relationType || ''),
        rationale: typeof body.rationale === 'string' ? body.rationale : null,
        effectiveDate: typeof body.effectiveDate === 'string' ? body.effectiveDate : null,
        status: typeof body.status === 'string' ? body.status : 'Aktif'
      }, actorName);

      return NextResponse.json({ changed: true, record }, {
        status: 201,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    return NextResponse.json(
      { error: 'Action Regulatory Intelligence tidak dikenali.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
