import { NextResponse } from 'next/server';
import { resolveInstitutionAccess } from '@/lib/institution-context';
import { getComplianceDashboard } from '@/lib/d1-compliance-dashboard';

export const dynamic = 'force-dynamic';

// Readers match the governed Policy Library. Operational staff without
// Compliance permission must not obtain bank-wide compliance aggregates.
const READ_ROLES = new Set([
  'SystemAdmin', 'Admin', 'ComplianceOfficer',
  'RiskManager', 'InternalAuditor', 'Executive', 'ReadOnlyAuditor'
]);

export async function GET(request: Request) {
  try {
    const context = await resolveInstitutionAccess(request);
    if (!context) {
      return NextResponse.json({ error: 'Autentikasi diperlukan.' }, {
        status: 401, headers: { 'Cache-Control': 'no-store' }
      });
    }
    if (!READ_ROLES.has(context.profile.role)) {
      return NextResponse.json({ error: 'Akses dashboard kepatuhan tidak diizinkan.' }, {
        status: 403, headers: { 'Cache-Control': 'no-store' }
      });
    }
    if (!context.institution) {
      return NextResponse.json({ error: 'Institusi aktif belum ditetapkan.' }, {
        status: 409, headers: { 'Cache-Control': 'no-store' }
      });
    }

    // NEVER accept an institutionId from query, body, or headers.
    const report = await getComplianceDashboard(context.institution.id);
    return NextResponse.json({
      institutionId: context.institution.id,
      institutionName: context.institution.name,
      generatedAt: new Date().toISOString(),
      ...report
    }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  } catch (error) {
    console.error('Compliance dashboard failed:', error);
    return NextResponse.json(
      { error: 'Dashboard kepatuhan gagal dimuat. Silakan coba lagi.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
