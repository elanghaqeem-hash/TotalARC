import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError, optionalString, readJson, requireApiUser, requireString } from '@/lib/api';
import { writeAudit } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const [processes, categories] = await Promise.all([
      prisma.businessProcess.findMany({
        where: { institutionId: user.institutionId },
        include: {
          category: true,
          orgUnit: true,
          objectives: true,
          sipoc: true,
          activities: { orderBy: { orderIndex: 'asc' } },
          risks: true,
          controls: true
        },
        orderBy: { processId: 'asc' }
      }),
      prisma.processCategory.findMany({ orderBy: { orderIndex: 'asc' } })
    ]);
    return NextResponse.json({ processes, categories });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request, ['Admin','ProcessOwner','Reviewer']);
    const body = await readJson<Record<string, unknown>>(request);
    const name = requireString(body.name, 'name', 250);
    const categoryId = requireString(body.categoryId, 'categoryId', 100);
    const ownerName = requireString(body.ownerName || user.name, 'ownerName', 250);
    const requestedId = optionalString(body.processId, 80);

    const category = await prisma.processCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new Error('Process category not found');

    const process = await prisma.businessProcess.create({
      data: {
        institutionId: user.institutionId,
        processId: requestedId || `PRC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name,
        categoryId,
        ownerName,
        criticality: optionalString(body.criticality, 30) || 'Medium',
        classification: optionalString(body.classification, 30) || 'Core',
        isIcofrRelevant: body.isIcofrRelevant === true,
        description: optionalString(body.description, 4000),
        status: 'Draft',
        version: '1.0'
      }
    });

    await writeAudit(user, request, {
      action: 'CREATE',
      entityType: 'Process',
      recordId: process.id,
      reason: `Registered business process ${process.processId}`,
      newValue: process
    });

    return NextResponse.json(process, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
