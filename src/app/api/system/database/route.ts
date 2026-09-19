import { NextResponse } from 'next/server';
import { ensureBankKalbarPersisted, getRecentInstitutionAuditLogs } from '@/lib/d1';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const institution = await ensureBankKalbarPersisted();
    const auditLogs = await getRecentInstitutionAuditLogs(8);

    return NextResponse.json({
      ok: true,
      database: 'cloudflare-d1',
      persistent: true,
      institution: {
        id: institution.id,
        name: institution.name,
        legalName: institution.legalName,
        shortName: institution.shortName,
        institutionType: institution.institutionType,
        country: institution.country,
        updatedAt: institution.updatedAt
      },
      auditLogs
    });
  } catch (error) {
    console.error('D1 persistence health check failed:', error);
    return NextResponse.json(
      { ok: false, database: 'cloudflare-d1', persistent: false, error: 'D1 binding or storage is unavailable.' },
      { status: 503 }
    );
  }
}
