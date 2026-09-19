import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, requireApiUser } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const q = new URL(request.url).searchParams.get('q')?.trim() || '';
    if (q.length < 2) return NextResponse.json({ results: [] });
    if (q.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', 'Search query is too long');

    const [processes, risks, controls, issues] = await Promise.all([
      prisma.businessProcess.findMany({
        where: { institutionId: user.institutionId, OR: [{ processId: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { ownerName: { contains: q, mode: 'insensitive' } }] },
        take: 6,
        select: { id: true, processId: true, name: true }
      }),
      prisma.riskMaster.findMany({
        where: { institutionId: user.institutionId, OR: [{ riskId: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }] },
        take: 6,
        select: { id: true, riskId: true, name: true }
      }),
      prisma.controlMaster.findMany({
        where: { institutionId: user.institutionId, OR: [{ controlId: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { controlOwner: { contains: q, mode: 'insensitive' } }] },
        take: 6,
        select: { id: true, controlId: true, name: true }
      }),
      prisma.issue.findMany({
        where: { institutionId: user.institutionId, OR: [{ issueId: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] },
        take: 6,
        select: { id: true, issueId: true, title: true }
      })
    ]);

    const results = [
      ...processes.map(x => ({ id: x.id, type: 'Process', code: x.processId, title: x.name, href: '/processes' })),
      ...risks.map(x => ({ id: x.id, type: 'Risk', code: x.riskId, title: x.name, href: '/risks' })),
      ...controls.map(x => ({ id: x.id, type: 'Control', code: x.controlId, title: x.name, href: '/controls' })),
      ...issues.map(x => ({ id: x.id, type: 'Issue', code: x.issueId, title: x.title, href: '/remediation' }))
    ].slice(0, 20);

    return NextResponse.json({ results });
  } catch (error) {
    return apiError(error);
  }
}
