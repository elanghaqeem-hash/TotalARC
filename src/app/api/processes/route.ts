import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';

export async function GET() {
  try {
    const prisma = getPrisma();
    const processes = await prisma.businessProcess.findMany({
      include: {
        category: true, orgUnit: true, objectives: true, sipoc: true,
        activities: { orderBy: { orderIndex: 'asc' } }, risks: true, controls: true
      },
      orderBy: { processId: 'asc' }
    });
    const categories = await prisma.processCategory.findMany({ orderBy: { orderIndex: 'asc' } });
    return NextResponse.json({ processes, categories });
  } catch (error) {
    console.error('Failed to fetch processes:', error);
    return NextResponse.json({ error: 'Failed to fetch processes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const prisma = getPrisma();
    const body = await request.json();
    const { name, processId, categoryId, ownerName, criticality, classification, isIcofrRelevant, description } = body;

    if (!name || !categoryId || !ownerName || !criticality || !classification) {
      return NextResponse.json(
        { error: 'name, categoryId, ownerName, criticality, and classification are required.' },
        { status: 400 }
      );
    }

    const institution = await prisma.institution.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!institution) return NextResponse.json({ error: 'Register an institution before creating processes.' }, { status: 409 });

    const process = await prisma.businessProcess.create({
      data: {
        institutionId: institution.id,
        processId: processId || `PRC-${Date.now().toString(36).toUpperCase()}`,
        name,
        categoryId,
        ownerName,
        criticality,
        classification,
        isIcofrRelevant: Boolean(isIcofrRelevant),
        description: description || null,
        status: 'Draft',
        version: '1.0'
      }
    });

    await prisma.auditLog.create({
      data: {
        institutionId: institution.id,
        userName: 'System',
        userRole: 'System',
        action: 'CREATE',
        entityType: 'Process',
        recordId: process.id,
        reason: 'Business process registered.'
      }
    });

    return NextResponse.json(process, { status: 201 });
  } catch (error) {
    console.error('Failed to create process:', error);
    return NextResponse.json({ error: 'Failed to create process' }, { status: 500 });
  }
}
