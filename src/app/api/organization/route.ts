import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const [units, entities] = await Promise.all([
      prisma.organizationUnit.findMany({
        where: { institutionId: user.institutionId },
        include: { legalEntity: true, parent: { select: { id: true, code: true, name: true } }, _count: { select: { children: true, processes: true } } },
        orderBy: [{ type: 'asc' }, { name: 'asc' }]
      }),
      prisma.legalEntity.findMany({ where: { institutionId: user.institutionId }, orderBy: { name: 'asc' } })
    ]);
    return NextResponse.json({ units, entities });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin']);
    const body = await readJson<Record<string, unknown>>(request);
    const legalEntityId = body.legalEntityId ? requireString(body.legalEntityId, 'legalEntityId', 100) : null;
    const parentId = body.parentId ? requireString(body.parentId, 'parentId', 100) : null;
    if (legalEntityId) {
      const entity = await prisma.legalEntity.findFirst({ where: { id: legalEntityId, institutionId: user.institutionId } });
      if (!entity) throw new ApiError(404, 'ENTITY_NOT_FOUND', 'Legal entity not found');
    }
    if (parentId) {
      const parent = await prisma.organizationUnit.findFirst({ where: { id: parentId, institutionId: user.institutionId } });
      if (!parent) throw new ApiError(404, 'PARENT_NOT_FOUND', 'Parent organization unit not found');
    }
    const unit = await prisma.organizationUnit.create({
      data: {
        institutionId: user.institutionId,
        legalEntityId,
        parentId,
        type: requireString(body.type, 'type', 80),
        code: requireString(body.code, 'code', 80),
        name: requireString(body.name, 'name', 250),
        headName: optionalString(body.headName, 250),
        headEmail: optionalString(body.headEmail, 254)
      }
    });
    await writeAudit(user, request, { action: 'CREATE', entityType: 'OrganizationUnit', recordId: unit.id, newValue: unit });
    return NextResponse.json(unit, { status: 201 });
  } catch (error) { return apiError(error); }
}
