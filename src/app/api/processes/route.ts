import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const processes = await prisma.businessProcess.findMany({
      include: {
        category: true,
        orgUnit: true,
        objectives: true,
        sipoc: true,
        activities: {
          orderBy: { orderIndex: 'asc' }
        },
        risks: true,
        controls: true
      },
      orderBy: { processId: 'asc' }
    });

    const categories = await prisma.processCategory.findMany({
      orderBy: { orderIndex: 'asc' }
    });

    return NextResponse.json({ processes, categories });
  } catch (error) {
    console.error('Failed to fetch processes:', error);
    return NextResponse.json({ error: 'Failed to fetch processes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      processId,
      categoryId,
      ownerName,
      criticality,
      classification,
      isIcofrRelevant,
      description
    } = body;

    const defaultInst = await prisma.institution.findFirst();
    if (!defaultInst) throw new Error('No institution found');

    const newProcess = await prisma.businessProcess.create({
      data: {
        institutionId: defaultInst.id,
        processId: processId || `PRC-${Date.now().toString().slice(-4)}`,
        name,
        categoryId,
        ownerName,
        criticality: criticality || 'Medium',
        classification: classification || 'Core',
        isIcofrRelevant: Boolean(isIcofrRelevant),
        description: description || '',
        status: 'Approved',
        version: '1.0'
      }
    });

    await prisma.auditLog.create({
      data: {
        institutionId: defaultInst.id,
        userName: 'Admin User',
        userRole: 'Admin',
        action: 'CREATE',
        entityType: 'Process',
        recordId: newProcess.id,
        reason: `Registered new process: ${name}`
      }
    });

    return NextResponse.json(newProcess);
  } catch (error) {
    console.error('Failed to create process:', error);
    return NextResponse.json({ error: 'Failed to create process' }, { status: 500 });
  }
}
