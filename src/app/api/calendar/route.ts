import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, requireApiUser } from '@/lib/api';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const institutionId = user.institutionId;
    const [campaigns, tasks, tests, maps, attestations] = await Promise.all([
      prisma.assessmentCampaign.findMany({ where: { institutionId }, select: { id: true, name: true, type: true, startDate: true, dueDate: true, status: true, ownerName: true } }),
      prisma.task.findMany({ where: { institutionId }, include: { user: { select: { name: true } } } }),
      prisma.toETest.findMany({ where: { process: { institutionId } }, include: { process: { select: { name: true } } } }),
      prisma.managementActionPlan.findMany({ where: { issue: { institutionId } }, include: { issue: { select: { title: true } } } }),
      prisma.managementAttestation.findMany({ where: { institutionId } })
    ]);

    const events = [
      ...campaigns.map(x => ({ id: `campaign-${x.id}`, title: x.name, type: x.type, start: x.startDate, end: x.dueDate, status: x.status, owner: x.ownerName, href: '/rcsa' })),
      ...tasks.map(x => ({ id: `task-${x.id}`, title: x.title, type: x.type, start: x.dueDate, end: x.dueDate, status: x.status, owner: x.user?.name || 'Unassigned', href: x.link || '/tasks' })),
      ...tests.map(x => ({ id: `toe-${x.id}`, title: `${x.testId} — ${x.process.name}`, type: 'ToE', start: x.testedAt, end: x.testedAt, status: x.status, owner: x.testerName, href: '/toe' })),
      ...maps.map(x => ({ id: `map-${x.id}`, title: `${x.mapId} — ${x.issue.title}`, type: 'MAP', start: x.revisedDueDate || x.originalDueDate, end: x.revisedDueDate || x.originalDueDate, status: x.status, owner: x.actionOwner, href: '/remediation' })),
      ...attestations.filter(x => x.attestedAt).map(x => ({ id: `att-${x.id}`, title: `Management Attestation — ${x.period}`, type: 'Attestation', start: x.attestedAt!, end: x.attestedAt!, status: x.cfoSignOff || x.croSignOff ? 'Attested' : 'Draft', owner: [x.cfoName,x.croName].filter(Boolean).join(' / '), href: '/certification' }))
    ].sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    return NextResponse.json({ events });
  } catch (error) { return apiError(error); }
}
