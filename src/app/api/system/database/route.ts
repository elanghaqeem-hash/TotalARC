import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const prisma = getPrisma();

    const [institutionCount, processCount, riskCount, controlCount, auditLogCount, latestAudit] =
      await Promise.all([
        prisma.institution.count(),
        prisma.businessProcess.count(),
        prisma.riskMaster.count(),
        prisma.controlMaster.count(),
        prisma.auditLog.count(),
        prisma.auditLog.findFirst({ orderBy: { timestamp: 'desc' }, select: { timestamp: true } })
      ]);

    return NextResponse.json({
      ok: true,
      database: 'cloudflare-d1',
      persistent: true,
      mutationPerformed: false,
      counts: {
        institutions: institutionCount,
        processes: processCount,
        risks: riskCount,
        controls: controlCount,
        auditLogs: auditLogCount
      },
      latestAuditTimestamp: latestAudit?.timestamp || null
    });
  } catch (error) {
    console.error('D1 persistence health check failed:', error);
    return NextResponse.json(
      {
        ok: false,
        database: 'cloudflare-d1',
        persistent: false,
        mutationPerformed: false,
        error: 'D1 binding, schema, or storage is unavailable.'
      },
      { status: 503 }
    );
  }
}
